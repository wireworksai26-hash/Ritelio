import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { JournalService } from '../accounting/journal.service';
import { LEDGER_STATUSES } from '../accounting/ledger';
import type { CreateOpeningBalanceDto } from './dto/opening-balance.dto';

@Injectable()
export class FiscalCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
  ) {}

  async list(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.fiscalPeriod.findMany({
      where: { tenantId, companyId },
      include: { fiscalYear: { select: { name: true, isClosed: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  async close(tenantId: string, periodId: string, actor: AuthUser) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { id: periodId, tenantId, companyId },
    });
    if (!period) throw new NotFoundException('Periode fiskal tidak ditemukan.');
    if (period.status !== 'open') throw new ConflictException('Periode fiskal sudah ditutup.');

    return this.prisma.$transaction(async (tx) => {
      const drafts = await tx.journalHeader.count({
        where: { tenantId, companyId, periodId, status: 'draft' },
      });
      if (drafts > 0) {
        throw new ConflictException('Periode memiliki jurnal draft yang belum diposting.');
      }

      const lines = await tx.journalLine.findMany({
        where: { tenantId, companyId, journal: { periodId, status: { in: LEDGER_STATUSES } } },
        select: { direction: true, amount: true },
      });
      let debitCents = 0;
      let creditCents = 0;
      for (const line of lines) {
        const cents = Math.round(Number(line.amount) * 100);
        if (line.direction === 'debit') debitCents += cents;
        else creditCents += cents;
      }
      if (debitCents !== creditCents) {
        throw new ConflictException('Periode tidak seimbang: total debit harus sama dengan total kredit.');
      }

      const updated = await tx.fiscalPeriod.updateMany({
        where: { id: periodId, tenantId, companyId, status: 'open' },
        data: { status: 'closed', closedAt: new Date(), closedById: actor.sub },
      });
      if (updated.count !== 1) throw new ConflictException('Periode sudah ditutup oleh request lain.');

      await tx.fiscalYear.updateMany({
        where: { id: period.fiscalYearId, tenantId, companyId },
        data: { isClosed: !(await tx.fiscalPeriod.count({
          where: { tenantId, companyId, fiscalYearId: period.fiscalYearId, status: 'open' },
        })) },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.sub,
          action: 'close',
          entity: 'fiscal_periods',
          entityId: period.id,
          before: { status: 'open' },
          after: { status: 'closed', debitCents, creditCents },
        },
      });
      return { id: period.id, status: 'closed', debit: debitCents / 100, credit: creditCents / 100 };
    });
  }

  async createOpeningBalance(tenantId: string, dto: CreateOpeningBalanceDto, actor: AuthUser) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { id: dto.periodId, tenantId, companyId, status: 'open', code: { endsWith: '-01' } },
    });
    if (!period) {
      throw new BadRequestException('Saldo awal harus dimasukkan pada periode Januari yang masih terbuka.');
    }
    const accountCodes = dto.lines.map((line) => line.accountCode);
    if (new Set(accountCodes).size !== accountCodes.length) {
      throw new BadRequestException('Setiap akun hanya boleh muncul satu kali pada saldo awal.');
    }

    const debitCents = dto.lines
      .filter((line) => line.direction === 'debit')
      .reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
    const creditCents = dto.lines
      .filter((line) => line.direction === 'credit')
      .reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
    if (debitCents === 0 || debitCents !== creditCents) {
      throw new BadRequestException('Saldo awal harus seimbang: total debit harus sama dengan total kredit.');
    }

    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, companyId, code: { in: [...new Set(dto.lines.map((line) => line.accountCode))] } },
      select: { id: true, code: true },
    });
    const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));
    if (accountByCode.size !== new Set(dto.lines.map((line) => line.accountCode)).size) {
      throw new NotFoundException('Ada akun saldo awal yang tidak ditemukan pada perusahaan ini.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.openingBalance.count({ where: { tenantId, companyId, periodId: period.id } });
      if (existing > 0) throw new ConflictException('Saldo awal untuk periode ini sudah pernah dicatat.');
      const posted = await tx.journalHeader.count({
        where: {
          tenantId,
          companyId,
          entryDate: { gte: period.startDate },
          status: 'posted',
        },
      });
      if (posted > 0) {
        throw new ConflictException('Saldo awal harus dicatat sebelum jurnal periode ini diposting.');
      }

      const sourceRefId = `opening-balance:${period.id}`;
      const journal = await this.journals.post(tx, {
        tenantId,
        companyId,
        entryDate: period.startDate,
        sourceModule: 'opening_balance',
        sourceRefId,
        memo: dto.note ?? `Saldo awal ${period.code}`,
        actorId: actor.sub,
        lines: dto.lines.map((line) => ({
          accountId: accountByCode.get(line.accountCode)!,
          direction: line.direction,
          amount: line.amount,
          memo: dto.note ?? '',
        })),
      });

      await tx.openingBalance.createMany({
        data: dto.lines.map((line) => ({
          tenantId,
          companyId,
          periodId: period.id,
          accountId: accountByCode.get(line.accountCode)!,
          direction: line.direction,
          amount: new Prisma.Decimal(line.amount),
        })),
      });
      return { journalId: journal.id, periodId: period.id, lines: dto.lines.length };
    });
  }
}
