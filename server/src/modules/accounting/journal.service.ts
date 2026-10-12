import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { roundMoney } from '../../common/utils/money';
import { normalizeAndValidateJournalLines, type JournalLineInput } from './journal-validation';

export interface PostJournalInput {
  tenantId: string;
  companyId: string;
  entryDate: Date;
  sourceModule: string;
  sourceRefId?: string | null;
  memo?: string;
  actorId?: string;
  /** Diisi jurnal pembalik; null untuk jurnal biasa. */
  reversalOfId?: string | null;
  lines: JournalLineInput[];
}

export interface ManualJournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string;
  partnerId?: string | null;
  projectId?: string | null;
}

export interface PostManualJournalInput {
  tenantId: string;
  companyId: string;
  entryDate: Date;
  memo: string;
  actorId?: string;
  lines: ManualJournalLineInput[];
}

export interface ReverseJournalInput {
  tenantId: string;
  companyId: string;
  journalId: string;
  entryDate: Date;
  memo?: string;
  actorId?: string;
}

/** Posting path untuk GL. Wajib dipanggil di dalam transaksi Prisma pemanggil. */
@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  async post(tx: Prisma.TransactionClient, input: PostJournalInput) {
    const lines = normalizeAndValidateJournalLines(input.lines);

    const period = await tx.fiscalPeriod.findFirst({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        startDate: { lte: input.entryDate },
        endDate: { gt: input.entryDate },
        status: 'open',
      },
      select: { id: true },
    });
    if (!period) {
      throw new BadRequestException('Tanggal jurnal tidak berada dalam periode fiskal yang terbuka.');
    }

    const periodKey = periodKeyOf(input.entryDate);

    // Seed the counter row safely, then use one atomic increment so concurrent
    // journal posts receive distinct sequence numbers for this company/month.
    await tx.journalSequence.createMany({
      data: [{
        tenantId: input.tenantId,
        companyId: input.companyId,
        periodKey,
        lastNumber: 0,
      }],
      skipDuplicates: true,
    });
    const sequence = await tx.journalSequence.update({
      where: {
        tenantId_companyId_periodKey: {
          tenantId: input.tenantId,
          companyId: input.companyId,
          periodKey,
        },
      },
      data: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
    const number = `JRN-${periodKey}-${String(sequence.lastNumber).padStart(6, '0')}`;
    const postedAt = new Date();

    const journal = await tx.journalHeader.create({
      data: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        number,
        entryDate: input.entryDate,
        periodId: period.id,
        status: 'posted',
        memo: input.memo ?? '',
        sourceModule: input.sourceModule,
        sourceRefId: input.sourceRefId ?? null,
        reversalOfId: input.reversalOfId ?? null,
        postedAt,
        postedById: input.actorId,
        createdById: input.actorId,
      },
    });
    await tx.journalLine.createMany({
      data: lines.map((line, index) => ({
        tenantId: input.tenantId,
        companyId: input.companyId,
        journalId: journal.id,
        accountId: line.accountId,
        lineNo: index + 1,
        direction: line.direction,
        amount: line.amount,
        memo: line.memo ?? '',
        partnerId: line.partnerId ?? null,
        projectId: line.projectId ?? null,
      })),
    });
    return tx.journalHeader.findUniqueOrThrow({
      where: { id: journal.id },
      include: { lines: true },
    });
  }

  /**
   * Jurnal manual (penyesuaian, koreksi, akrual). Hanya menambah validasi
   * khusus input manusia di atas `post`: balance, period-lock, dan penomoran
   * tetap satu jalur dengan jurnal otomatis.
   */
  async postManual(tx: Prisma.TransactionClient, input: PostManualJournalInput) {
    const lines = input.lines.map((line, index) => {
      const debit = roundMoney(line.debit ?? 0);
      const credit = roundMoney(line.credit ?? 0);
      if (debit > 0 === credit > 0) {
        throw new BadRequestException(
          `Baris ${index + 1}: isi debit atau kredit saja, tidak boleh keduanya atau kosong.`,
        );
      }
      return {
        accountId: line.accountId,
        direction: debit > 0 ? ('debit' as const) : ('credit' as const),
        amount: debit > 0 ? debit : credit,
        memo: line.memo?.trim() ?? '',
        partnerId: line.partnerId || null,
        projectId: line.projectId || null,
      };
    });
    // Seimbang/tidaknya dicek di post() lewat normalizeAndValidateJournalLines;
    // dipanggil lebih awal supaya pesan balance muncul sebelum query lain.
    normalizeAndValidateJournalLines(lines);

    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await tx.chartOfAccount.findMany({
      where: { tenantId: input.tenantId, companyId: input.companyId, id: { in: accountIds } },
      select: { id: true, code: true, _count: { select: { children: true } } },
    });
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException('Ada akun yang tidak ditemukan pada perusahaan ini.');
    }
    const header = accounts.find((a) => a._count.children > 0);
    if (header) {
      throw new BadRequestException(`Akun ${header.code} adalah akun induk; pilih akun detail.`);
    }

    const partnerIds = [...new Set(lines.map((l) => l.partnerId).filter((v): v is string => Boolean(v)))];
    if (partnerIds.length > 0) {
      const [suppliers, customers] = await Promise.all([
        tx.supplier.findMany({ where: { tenantId: input.tenantId, id: { in: partnerIds } }, select: { id: true } }),
        tx.customer.findMany({ where: { tenantId: input.tenantId, id: { in: partnerIds } }, select: { id: true } }),
      ]);
      if (suppliers.length + customers.length !== partnerIds.length) {
        throw new BadRequestException('Ada mitra (pemasok/pelanggan) yang tidak ditemukan.');
      }
    }
    const projectIds = [...new Set(lines.map((l) => l.projectId).filter((v): v is string => Boolean(v)))];
    if (projectIds.length > 0) {
      const projects = await tx.project.findMany({
        where: { tenantId: input.tenantId, id: { in: projectIds } },
        select: { id: true },
      });
      if (projects.length !== projectIds.length) {
        throw new BadRequestException('Ada proyek yang tidak ditemukan.');
      }
    }

    return this.post(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      entryDate: input.entryDate,
      sourceModule: 'manual',
      memo: input.memo,
      actorId: input.actorId,
      lines,
    });
  }

  /**
   * Membalik jurnal posted dengan membuat jurnal kebalikan — bukan menghapus
   * dan bukan mengubah baris asal. Prinsip §3 PRD: posted tidak dapat diedit,
   * hanya dibalik.
   *
   * Jurnal asal ditandai `voided` dan ditautkan dua arah lewat `reversalOfId`
   * supaya jejaknya tetap bisa ditelusuri dari kedua sisi.
   */
  async reverse(tx: Prisma.TransactionClient, input: ReverseJournalInput) {
    const original = await tx.journalHeader.findFirst({
      where: {
        id: input.journalId,
        tenantId: input.tenantId,
        companyId: input.companyId,
      },
      include: { lines: { orderBy: { lineNo: 'asc' } }, reversedBy: { select: { id: true, number: true } } },
    });
    if (!original) throw new NotFoundException('Jurnal tidak ditemukan.');

    if (original.status !== 'posted') {
      throw new ConflictException(
        `Jurnal ${original.number} berstatus ${original.status} sehingga tidak bisa dibalik.`,
      );
    }
    if (original.reversedBy.length > 0) {
      throw new ConflictException(
        `Jurnal ${original.number} sudah pernah dibalik oleh ${original.reversedBy[0].number}.`,
      );
    }
    if (original.reversalOfId) {
      throw new ConflictException(
        `Jurnal ${original.number} sendiri merupakan jurnal pembalik sehingga tidak bisa dibalik lagi.`,
      );
    }
    if (original.lines.length < 2) {
      throw new BadRequestException('Jurnal asal tidak memiliki baris yang valid untuk dibalik.');
    }

    const lines: JournalLineInput[] = original.lines.map((line) => ({
      accountId: line.accountId,
      direction: line.direction === 'debit' ? 'credit' : 'debit',
      amount: Number(line.amount),
      memo: `Pembalik: ${line.memo}`.trim(),
    }));

    const reversal = await this.post(tx, {
      tenantId: input.tenantId,
      companyId: input.companyId,
      entryDate: input.entryDate,
      sourceModule: `${original.sourceModule}:reversal`,
      sourceRefId: original.id,
      memo: input.memo ?? `Pembalik jurnal ${original.number}`,
      actorId: input.actorId,
      reversalOfId: original.id,
      lines,
    });

    await tx.journalHeader.update({
      where: { id: original.id },
      data: { status: 'voided' },
    });

    return tx.journalHeader.findUniqueOrThrow({
      where: { id: reversal.id },
      include: { lines: true, reversalOf: { select: { id: true, number: true } } },
    });
  }

  /** Daftar jurnal posted beserta status pembalikannya, untuk audit trail GL. */
  async listJournals(tenantId: string, companyId: string, filter: JournalFilter) {
    return this.prisma.journalHeader.findMany({
      where: {
        tenantId,
        companyId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.sourceModule ? { sourceModule: filter.sourceModule } : {}),
        ...(filter.from || filter.to
          ? {
              entryDate: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lt: filter.to } : {}),
              },
            }
          : {}),
      },
      include: {
        lines: { orderBy: { lineNo: 'asc' } },
        reversalOf: { select: { id: true, number: true } },
        reversedBy: { select: { id: true, number: true, entryDate: true } },
      },
      orderBy: [{ entryDate: 'desc' }, { number: 'desc' }],
      take: filter.take ?? 50,
      ...(filter.cursor ? { skip: 1, cursor: { id: filter.cursor } } : {}),
    });
  }
}

export interface JournalFilter {
  status?: 'draft' | 'posted' | 'voided';
  sourceModule?: string;
  from?: Date;
  to?: Date;
  take?: number;
  cursor?: string;
}

function periodKeyOf(entryDate: Date): string {
  return `${entryDate.getUTCFullYear()}${String(entryDate.getUTCMonth() + 1).padStart(2, '0')}`;
}