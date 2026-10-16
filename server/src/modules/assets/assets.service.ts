import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { JournalService } from '../accounting/journal.service';
import { withSerializableRetry } from '../accounting/serializable-retry';
import type {
  CreateAssetDto,
  DisposeAssetDto,
  RunDepreciationDto,
} from './dto/asset.dto';

/** Kode akun default untuk aset tetap & akumulasinya. */
const ASSET_ACCOUNT = '1300';
const ACCUMULATED_ACCOUNT = '1390';
const DEPRECIATION_EXPENSE = '6200';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
  ) {}

  async list(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const assets = await this.prisma.fixedAsset.findMany({
      where: { tenantId, companyId },
      orderBy: { code: 'asc' },
    });
    return assets.map((a) => this.withBookValue(a));
  }

  async get(tenantId: string, id: string) {
    const { asset } = await this.assertAsset(tenantId, id);
    const schedules = await this.prisma.depreciationSchedule.findMany({
      where: { tenantId: asset.tenantId, companyId: asset.companyId, assetId: id },
      orderBy: { createdAt: 'asc' },
    });
    return { ...this.withBookValue(asset), schedules };
  }

  /** Perolehan aset: Dr Aset Tetap / Cr Kas. */
  async create(tenantId: string, dto: CreateAssetDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if ((dto.salvageValue ?? 0) >= dto.acquisitionCost) {
      throw new BadRequestException('Nilai sisa harus lebih kecil dari nilai perolehan.');
    }
    if (dto.usefulLifeMonths < 1 || dto.usefulLifeMonths > 600) {
      throw new BadRequestException('Masa manfaat harus antara 1 sampai 600 bulan.');
    }
    if (dto.depreciationMethod === 'declining_balance' && !dto.decliningRate) {
      throw new BadRequestException(
        'Metode saldo menurun membutuhkan tingkat penyusutan (mis. 0.25 untuk 25%).',
      );
    }

    const [assetAccount, cashAccount] = await Promise.all([
      this.requireAccount(tenantId, companyId, ASSET_ACCOUNT),
      this.requireAccount(tenantId, companyId, '1000'),
    ]);

    return this.prisma.$transaction(async (tx) => {
      const journal = await this.journals.post(tx, {
        tenantId,
        companyId,
        entryDate: new Date(dto.acquisitionDate),
        sourceModule: 'assets',
        sourceRefId: dto.code,
        memo: `Perolehan aset tetap ${dto.code}`,
        lines: [
          { accountId: assetAccount.id, direction: 'debit', amount: dto.acquisitionCost, memo: `Aset ${dto.name}` },
          { accountId: cashAccount.id, direction: 'credit', amount: dto.acquisitionCost, memo: 'Pembayaran aset tetap' },
        ],
      });

      return tx.fixedAsset.create({
        data: {
          tenantId,
          companyId,
          code: dto.code,
          name: dto.name,
          category: dto.category ?? '',
          location: dto.location ?? '',
          acquisitionDate: new Date(dto.acquisitionDate),
          acquisitionCost: new Prisma.Decimal(dto.acquisitionCost),
          salvageValue: new Prisma.Decimal(dto.salvageValue ?? 0),
          usefulLifeMonths: dto.usefulLifeMonths,
          depreciationMethod: dto.depreciationMethod ?? 'straight_line',
          decliningRate: dto.decliningRate != null ? new Prisma.Decimal(dto.decliningRate) : null,
          journalId: journal.id,
        },
      });
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Kode aset "${dto.code}" sudah dipakai.`);
      }
      throw error;
    });
  }

  /**
   * Jalankan penyusutan untuk satu periode.
   *
   * Aturan:
   * - Periode wajib ditentukan (periodId atau periodCode); tanpa itu 400.
   * - Aset ikut disusutkan bila tanggal perolehannya sebelum akhir periode
   *   (bulan perolehan disusutkan penuh) dan statusnya masih active. Aset yang
   *   dibeli setelah periode berakhir atau sudah dihapusbukukan tidak ikut.
   * - Periode yang belum dimulai ditolak (tidak ada penyusutan di masa depan).
   * - Jurnal bertanggal di dalam periode (hari terakhir periode, dibatasi hari ini).
   *
   * Idempoten dan aman paralel: tiap aset diproses di transaksi sendiri yang
   * mengunci baris aset (FOR UPDATE), membaca ulang akumulasi di bawah kunci,
   * dan memakai unique (assetId, periodId) sebagai klaim. Request kedua yang
   * menunggu kunci melihat jadwal yang sudah ada dan melewatinya.
   */
  async runDepreciation(tenantId: string, dto: RunDepreciationDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (!dto.periodId && !dto.periodCode) {
      throw new BadRequestException('Periode wajib diisi (periodId atau periodCode).');
    }

    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { tenantId, companyId, ...(dto.periodId ? { id: dto.periodId } : { code: dto.periodCode }) },
      select: { id: true, code: true, status: true, startDate: true, endDate: true },
    });
    if (!period) throw new NotFoundException('Periode fiskal tidak ditemukan.');
    if (period.status !== 'open') {
      throw new BadRequestException(`Periode ${period.code} sudah ditutup.`);
    }
    const now = new Date();
    if (period.startDate > now) {
      throw new BadRequestException(`Periode ${period.code} belum dimulai; penyusutan tidak bisa dijalankan lebih awal.`);
    }

    const assets = await this.prisma.fixedAsset.findMany({
      where: { tenantId, companyId, status: 'active', acquisitionDate: { lt: period.endDate } },
      orderBy: { code: 'asc' },
      select: { id: true, code: true },
    });
    if (assets.length === 0) throw new BadRequestException('Belum ada aset aktif untuk disusutkan pada periode ini.');

    const [expenseAccount, accumulatedAccount] = await Promise.all([
      this.requireAccount(tenantId, companyId, DEPRECIATION_EXPENSE),
      this.requireAccount(tenantId, companyId, ACCUMULATED_ACCOUNT),
    ]);
    const entryDate = depreciationEntryDate(period.startDate, period.endDate, now);

    let totalDepreciation = 0;
    let skipped = 0;
    const results: Array<{ code: string; depreciation: number; bookValue: number; status: string }> = [];

    for (const candidate of assets) {
      const outcome = await withSerializableRetry(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM fixed_assets WHERE id = ${candidate.id} AND tenant_id = ${tenantId} FOR UPDATE`;
          const asset = await tx.fixedAsset.findFirst({ where: { id: candidate.id, tenantId, companyId } });
          if (!asset || asset.status !== 'active') return null;

          const existing = await tx.depreciationSchedule.findUnique({
            where: { assetId_periodId: { assetId: asset.id, periodId: period.id } },
            select: { id: true },
          });
          if (existing) return null;

          const depreciation = computeDepreciation(asset, Number(asset.accumulatedDepreciation));
          if (depreciation <= 0) {
            return { code: asset.code, depreciation: 0, bookValue: bookValueOf(asset), status: asset.status as string };
          }
          const newAccumulated = roundMoney(Number(asset.accumulatedDepreciation) + depreciation);
          const newBookValue = roundMoney(Number(asset.acquisitionCost) - newAccumulated);
          const status = newBookValue <= Number(asset.salvageValue) ? 'fully_depreciated' : 'active';

          const journal = await this.journals.post(tx, {
            tenantId,
            companyId,
            entryDate,
            sourceModule: 'assets',
            sourceRefId: asset.id,
            memo: `Penyusutan ${asset.code} periode ${period.code}`,
            lines: [
              { accountId: expenseAccount.id, direction: 'debit', amount: depreciation, memo: `Beban penyusutan ${asset.code}` },
              { accountId: accumulatedAccount.id, direction: 'credit', amount: depreciation, memo: `Akumulasi penyusutan ${asset.code}` },
            ],
          });
          await tx.depreciationSchedule.create({
            data: {
              tenantId,
              companyId,
              assetId: asset.id,
              periodId: period.id,
              depreciation: new Prisma.Decimal(depreciation),
              accumulated: new Prisma.Decimal(newAccumulated),
              bookValue: new Prisma.Decimal(newBookValue),
              journalId: journal.id,
            },
          });
          await tx.fixedAsset.update({
            where: { id: asset.id },
            data: { accumulatedDepreciation: new Prisma.Decimal(newAccumulated), status },
          });
          return { code: asset.code, depreciation, bookValue: newBookValue, status };
        }),
      );
      if (!outcome) {
        skipped += 1;
        continue;
      }
      totalDepreciation += outcome.depreciation;
      results.push(outcome);
    }

    if (results.length === 0) {
      return { period: period.code, processed: 0, skipped, message: 'Semua aset sudah disusutkan pada periode ini.' };
    }
    return {
      period: period.code,
      processed: results.length,
      skipped,
      totalDepreciation: roundMoney(totalDepreciation),
      data: results,
    };
  }

  /**
   * Penghapusan aset: Dr Kas (hasil jual) + Dr Akumulasi / Cr Aset Tetap, selisih
   * hasil jual terhadap nilai buku diakui laba (Cr 4000) atau rugi (Dr 5000);
   * COA bawaan belum punya akun pendapatan/beban lain-lain.
   *
   * Baris aset dikunci (FOR UPDATE) dan status dibaca ulang di bawah kunci, jadi
   * dua request dispose paralel tidak bisa sama-sama berhasil.
   */
  async dispose(tenantId: string, id: string, dto: DisposeAssetDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertAsset(tenantId, id);
    const proceeds = dto.proceeds ?? 0;
    const disposalDate = dto.disposalDate ? new Date(dto.disposalDate) : new Date();
    const [assetAccount, cashAccount, accumulatedAccount] = await Promise.all([
      this.requireAccount(tenantId, companyId, ASSET_ACCOUNT),
      this.requireAccount(tenantId, companyId, '1000'),
      this.requireAccount(tenantId, companyId, ACCUMULATED_ACCOUNT),
    ]);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fixed_assets WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE`;
      const asset = await tx.fixedAsset.findFirst({ where: { id, tenantId, companyId } });
      if (!asset) throw new NotFoundException('Aset tetap tidak ditemukan.');
      if (asset.status === 'disposed') {
        throw new BadRequestException(`Aset ${asset.code} sudah dihapusbukukan.`);
      }
      if (disposalDate < asset.acquisitionDate) {
        throw new BadRequestException('Tanggal penghapusan tidak boleh sebelum tanggal perolehan.');
      }

      const bookValue = bookValueOf(asset);
      const accumulated = Number(asset.accumulatedDepreciation);
      const lines: Array<{ accountId: string; direction: 'debit' | 'credit'; amount: number; memo: string }> = [];
      if (proceeds > 0) {
        lines.push({ accountId: cashAccount.id, direction: 'debit', amount: proceeds, memo: 'Hasil jual aset tetap' });
      }
      if (accumulated > 0) {
        lines.push({ accountId: accumulatedAccount.id, direction: 'debit', amount: accumulated, memo: 'Akumulasi penyusutan dihapus' });
      }
      lines.push({ accountId: assetAccount.id, direction: 'credit', amount: Number(asset.acquisitionCost), memo: `Aset tetap ${asset.code}` });

      const gainLoss = roundMoney(proceeds - bookValue);
      if (gainLoss > 0) {
        const revenue = await this.requireAccount(tenantId, companyId, '4000');
        lines.push({ accountId: revenue.id, direction: 'credit', amount: gainLoss, memo: 'Laba Penjualan Aset Tetap' });
      } else if (gainLoss < 0) {
        const expense = await this.requireAccount(tenantId, companyId, '5000');
        lines.push({ accountId: expense.id, direction: 'debit', amount: -gainLoss, memo: 'Kerugian Penjualan Aset Tetap' });
      }

      const journal = await this.journals.post(tx, {
        tenantId,
        companyId,
        entryDate: disposalDate,
        sourceModule: 'assets',
        sourceRefId: asset.id,
        memo: `Penghapusan aset tetap ${asset.code}`,
        lines,
      });

      // journalId tetap menunjuk jurnal perolehan; jurnal penghapusan dicari lewat sourceRefId.
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          status: 'disposed',
          disposedAt: disposalDate,
          disposalProceeds: new Prisma.Decimal(proceeds),
        },
      });
      return { disposed: true, code: asset.code, bookValue, gainLoss, journalId: journal.id };
    });
  }

  private async assertAsset(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, tenantId, companyId } });
    if (!asset) throw new NotFoundException('Aset tetap tidak ditemukan.');
    return { companyId, asset };
  }

  private async requireAccount(tenantId: string, companyId: string, code: string) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, companyId, code },
    });
    if (!account) {
      throw new NotFoundException(
        `Akun ${code} belum ada pada COA perusahaan. Tambahkan dulu sebelum memakai modul aset tetap.`,
      );
    }
    return account;
  }

  private withBookValue<T extends { acquisitionCost: unknown; accumulatedDepreciation: unknown }>(asset: T) {
    return {
      ...asset,
      bookValue: roundMoney(Number(asset.acquisitionCost) - Number(asset.accumulatedDepreciation)),
    };
  }
}

/**
 * Penyusutan satu periode (bulanan).
 * - Garis lurus: (harga perolehan - nilai sisa) / masa manfaat.
 * - Saldo menurun: tingkat adalah TAHUNAN (0.25 = 25% per tahun, sesuai DTO), jadi
 *   per bulan = (nilai buku awal - nilai sisa) x tingkat / 12, dibatasi agar tidak
 *   turun di bawah nilai sisa.
 */
export function computeDepreciation(
  asset: {
    acquisitionCost: unknown;
    salvageValue: unknown;
    usefulLifeMonths: number;
    depreciationMethod: string;
    decliningRate?: unknown;
  },
  accumulated: number,
): number {
  const cost = Number(asset.acquisitionCost);
  const salvage = Number(asset.salvageValue);
  const depreciableBase = cost - salvage;
  if (depreciableBase <= 0) return 0;

  if (asset.depreciationMethod === 'declining_balance') {
    const rate = Number(asset.decliningRate ?? 0);
    if (rate <= 0) return 0;
    const bookValue = cost - accumulated;
    const monthly = ((bookValue - salvage) * rate) / 12;
    return roundMoney(Math.max(0, Math.min(monthly, depreciableBase - accumulated)));
  }

  const monthly = depreciableBase / asset.usefulLifeMonths;
  return roundMoney(Math.max(0, Math.min(monthly, depreciableBase - accumulated)));
}

function bookValueOf(asset: { acquisitionCost: unknown; accumulatedDepreciation: unknown }): number {
  return roundMoney(Number(asset.acquisitionCost) - Number(asset.accumulatedDepreciation));
}

/**
 * Tanggal jurnal penyusutan: hari terakhir periode, dibatasi hari ini (periode
 * berjalan). Selalu jatuh di dalam [start, end) selama periode sudah dimulai.
 */
export function depreciationEntryDate(start: Date, end: Date, now: Date): Date {
  const lastDay = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const d = lastDay > now ? new Date(now) : lastDay;
  return d < start ? new Date(start) : d;
}
