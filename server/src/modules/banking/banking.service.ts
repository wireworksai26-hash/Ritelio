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
import { MATCH_DATE_TOLERANCE_DAYS, cashDirectionFor, matchWindow, pickClosestByDate } from './bank-match';
import type {
  CreateBankAccountDto,
  CreateStatementDto,
  ReconcileDto,
} from './dto/banking.dto';

const CASH_CODE = '1000';

/**
 * Bank & rekonsiliasi.
 *
 * Rekonsiliasi di sini sengaja konservatif: sistem hanya mencocokkan nominal
 * dan tanggal dengan entri kas, dan tidak pernah membuat jurnal otomatis dari
 * mutasi rekening. Mutasi yang belum ter-match harus ditinjau manusia dulu —
 * menjadwalkannya otomatis berisiko menghilangkan pengeluaran nyata.
 */
@Injectable()
export class BankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
  ) {}

  async listAccounts(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.bankAccount.findMany({
      where: { tenantId, companyId },
      include: { account: { select: { code: true, name: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createAccount(tenantId: string, dto: CreateBankAccountDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const ledgerAccount = dto.accountCode
      ? await this.prisma.chartOfAccount.findFirst({
          where: { tenantId, companyId, code: dto.accountCode },
        })
      : await this.prisma.chartOfAccount.findFirst({
          where: { tenantId, companyId, code: CASH_CODE },
        });
    if (!ledgerAccount) {
      throw new NotFoundException(
        `Akun kas di COA tidak ditemukan. Buat akun ${CASH_CODE} terlebih dahulu.`,
      );
    }

    try {
      return await this.prisma.bankAccount.create({
        data: {
          tenantId,
          companyId,
          code: dto.code,
          name: dto.name,
          bankName: dto.bankName ?? '',
          accountNumber: dto.accountNumber ?? '',
          accountId: ledgerAccount.id,
          currencyCode: dto.currencyCode ?? 'IDR',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(`Kode bank "${dto.code}" sudah dipakai.`);
      }
      throw error;
    }
  }

  async listStatements(tenantId: string, bankAccountId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const bank = await this.assertBank(tenantId, companyId, bankAccountId);
    return this.prisma.bankStatement.findMany({
      where: { tenantId, companyId, bankAccountId: bank.id },
      orderBy: [{ statementDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Input mutasi rekening dari mutasi bank (CSV impor / manual). */
  async importStatement(tenantId: string, dto: CreateStatementDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const bank = await this.assertBank(tenantId, companyId, dto.bankAccountId);
    return this.prisma.bankStatement.create({
      data: {
        tenantId,
        companyId,
        bankAccountId: bank.id,
        statementDate: new Date(dto.statementDate),
        description: dto.description,
        reference: dto.reference ?? '',
        amount: new Prisma.Decimal(dto.amount),
      },
    });
  }

  /**
   * Rekonsiliasi: tandai baris statement sebagai sudah cocok dengan jurnal kas.
   * Baris yang tidak dicocokkan tetap `isReconciled = false` supaya terlihat
   * di daftar pekerjaan yang tersisa.
   *
   * Klaim baris dilakukan dengan satu UPDATE bersyarat (`isReconciled = false`)
   * sehingga dua permintaan bersamaan tidak bisa sama-sama berhasil.
   */
  async reconcile(tenantId: string, dto: ReconcileDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const statement = await this.prisma.bankStatement.findFirst({
      where: { id: dto.statementId, tenantId, companyId },
    });
    if (!statement) throw new NotFoundException('Baris mutasi bank tidak ditemukan.');
    if (statement.isReconciled) {
      throw new BadRequestException('Baris ini sudah direkonsiliasi.');
    }

    if (dto.match === false) {
      await this.claimStatement(statement.id, tenantId, companyId);
      return { ...statement, isReconciled: true, matchedJournal: null };
    }

    if (dto.amount === undefined || !dto.entryDate) {
      throw new BadRequestException('Nominal dan tanggal entri wajib diisi untuk pencocokan.');
    }
    const statementAmount = Number(statement.amount);
    if (roundMoney(Math.abs(dto.amount)) !== roundMoney(Math.abs(statementAmount))) {
      throw new BadRequestException(
        `Nominal pencocokan (${Math.abs(dto.amount)}) harus sama dengan nominal mutasi (${Math.abs(statementAmount)}).`,
      );
    }

    // Pencocokan dilakukan ke jurnal GL pada akun kas yang ditautkan rekening
    // ini (`bankAccount.accountId`), bukan ke `financial_entries` dan bukan
    // berdasarkan kode rekening — kode bank dan kode akun COA adalah dua hal berbeda.
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: statement.bankAccountId, tenantId, companyId },
      select: { id: true, accountId: true },
    });
    if (!bankAccount) throw new NotFoundException('Rekening bank tidak ditemukan.');

    const on = new Date(dto.entryDate);
    const { from, to } = matchWindow(on);
    const candidates = await this.prisma.journalLine.findMany({
      where: {
        tenantId,
        companyId,
        accountId: bankAccount.accountId,
        direction: cashDirectionFor(statementAmount),
        amount: new Prisma.Decimal(Math.abs(statementAmount)),
        // jurnal yang sudah dicocokkan ke mutasi lain tidak boleh dipakai lagi
        journal: { status: 'posted', entryDate: { gte: from, lt: to }, bankStatements: { none: {} } },
      },
      select: { journalId: true, journal: { select: { number: true, entryDate: true } } },
      take: 20,
    });
    const entry = pickClosestByDate(candidates, on);
    if (!entry) {
      throw new NotFoundException(
        `Tidak ada jurnal kas ${statementAmount >= 0 ? 'masuk' : 'keluar'} sejumlah ${Math.abs(statementAmount)} ` +
          `dalam ${MATCH_DATE_TOLERANCE_DAYS} hari dari ${dto.entryDate}.`,
      );
    }

    await this.claimStatement(statement.id, tenantId, companyId, entry.journalId);
    return {
      ...statement,
      isReconciled: true,
      matchedJournal: { id: entry.journalId, number: entry.journal.number },
    };
  }

  /**
   * Klaim atomik satu baris mutasi. `matchedJournalId` UNIQUE di database, jadi bila dua
   * mutasi berebut jurnal yang sama, yang kalah mendapat P2002 -> Conflict (bukan data ganda).
   */
  private async claimStatement(statementId: string, tenantId: string, companyId: string, journalId?: string) {
    let claimed: { count: number };
    try {
      claimed = await this.prisma.bankStatement.updateMany({
        where: { id: statementId, tenantId, companyId, isReconciled: false },
        data: { isReconciled: true, matchedAt: new Date(), ...(journalId ? { matchedJournalId: journalId } : {}) },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Jurnal ini sudah dicocokkan dengan mutasi bank lain.');
      }
      throw err;
    }
    if (claimed.count === 0) {
      throw new ConflictException('Baris ini baru saja direkonsiliasi oleh permintaan lain.');
    }
  }

  /** Ringkasan rekonsiliasi per rekening bank. */
  async summary(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const accounts = await this.prisma.bankAccount.findMany({
      where: { tenantId, companyId },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });

    const result = [];
    for (const bank of accounts) {
      const [total, reconciled, outstanding] = await Promise.all([
        this.prisma.bankStatement.aggregate({
          where: { tenantId, companyId, bankAccountId: bank.id },
          _sum: { amount: true },
        }),
        this.prisma.bankStatement.aggregate({
          where: { tenantId, companyId, bankAccountId: bank.id, isReconciled: true },
          _sum: { amount: true },
        }),
        this.prisma.bankStatement.count({
          where: { tenantId, companyId, bankAccountId: bank.id, isReconciled: false },
        }),
      ]);
      result.push({
        bankAccountId: bank.id,
        code: bank.code,
        name: bank.name,
        totalStatements: roundMoney(Number(total._sum.amount ?? 0)),
        reconciledAmount: roundMoney(Number(reconciled._sum.amount ?? 0)),
        unreconciledCount: outstanding,
      });
    }
    return result;
  }

  private async assertBank(tenantId: string, companyId: string, bankAccountId: string) {
    const bank = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, tenantId, companyId },
    });
    if (!bank) throw new NotFoundException('Rekening bank tidak ditemukan.');
    return bank;
  }
}