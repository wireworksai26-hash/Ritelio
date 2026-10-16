import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { cashDirectionFor, matchWindow, pickClosestByDate } from './bank-match';
import { BankingService } from './banking.service';

const TENANT = 't1';
const COMPANY = 'c1';

function statement(amount: number, overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    tenantId: TENANT,
    companyId: COMPANY,
    bankAccountId: 'b1',
    amount,
    isReconciled: false,
    ...overrides,
  };
}

function build(opts: { stmt: ReturnType<typeof statement>; lines?: unknown[]; claimCount?: number }) {
  const prisma = {
    company: { findFirst: vi.fn().mockResolvedValue({ id: COMPANY }) },
    bankStatement: {
      findFirst: vi.fn().mockResolvedValue(opts.stmt),
      updateMany: vi.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
    },
    bankAccount: {
      // Kode rekening sengaja berbeda dari kode akun COA: pencarian lewat `code` harus gagal.
      findFirst: vi.fn().mockResolvedValue({ id: 'b1', code: 'BCA-01', accountId: 'coa-kas-bca' }),
    },
    chartOfAccount: { findFirst: vi.fn().mockResolvedValue(null) },
    journalLine: { findMany: vi.fn().mockResolvedValue(opts.lines ?? []) },
  };
  const service = new BankingService(prisma as never, {} as never);
  return { service, prisma };
}

const line = (date: string, number = 'JRN-1') => ({
  journalId: `j-${number}`,
  journal: { number, entryDate: new Date(date) },
});

describe('bank-match helpers', () => {
  it('uang masuk = debit kas, uang keluar = kredit kas', () => {
    expect(cashDirectionFor(150_000)).toBe('debit');
    expect(cashDirectionFor(-150_000)).toBe('credit');
  });

  it('jendela toleransi mencakup hari penuh di kedua sisi', () => {
    const { from, to } = matchWindow(new Date('2026-10-10T15:00:00Z'), 3);
    expect(from.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });

  it('memilih jurnal dengan tanggal terdekat', () => {
    const picked = pickClosestByDate(
      [line('2026-10-07', 'A'), line('2026-10-10', 'B'), line('2026-10-13', 'C')],
      new Date('2026-10-10'),
    );
    expect(picked?.journal.number).toBe('B');
  });
});

describe('BankingService.reconcile', () => {
  it('mutasi masuk dicari di baris DEBIT akun kas yang tertaut rekening', async () => {
    const { service, prisma } = build({ stmt: statement(250_000), lines: [line('2026-10-10')] });

    const result = await service.reconcile(TENANT, { statementId: 's1', amount: 250_000, entryDate: '2026-10-10' });

    const where = prisma.journalLine.findMany.mock.calls[0][0].where;
    expect(where.direction).toBe('debit');
    expect(where.accountId).toBe('coa-kas-bca');
    expect(prisma.chartOfAccount.findFirst).not.toHaveBeenCalled();
    expect(result.matchedJournal).toEqual({ id: 'j-JRN-1', number: 'JRN-1' });
  });

  it('mutasi keluar dicari di baris KREDIT akun kas', async () => {
    const { service, prisma } = build({ stmt: statement(-80_000), lines: [line('2026-10-10')] });

    await service.reconcile(TENANT, { statementId: 's1', amount: -80_000, entryDate: '2026-10-10' });

    const where = prisma.journalLine.findMany.mock.calls[0][0].where;
    expect(where.direction).toBe('credit');
    expect(Number(where.amount)).toBe(80_000);
  });

  it('membatasi pencarian pada jendela tanggal, bukan semua jurnal setelah tanggal', async () => {
    const { service, prisma } = build({ stmt: statement(10_000), lines: [line('2026-10-10')] });

    await service.reconcile(TENANT, { statementId: 's1', amount: 10_000, entryDate: '2026-10-10' });

    const { gte, lt } = prisma.journalLine.findMany.mock.calls[0][0].where.journal.entryDate;
    expect(gte.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });

  it('menolak bila tidak ada jurnal yang cocok dan tidak menandai baris', async () => {
    const { service, prisma } = build({ stmt: statement(10_000), lines: [] });

    await expect(
      service.reconcile(TENANT, { statementId: 's1', amount: 10_000, entryDate: '2026-10-10' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bankStatement.updateMany).not.toHaveBeenCalled();
  });

  it('menolak nominal yang tidak sama dengan nominal mutasi', async () => {
    const { service, prisma } = build({ stmt: statement(10_000), lines: [line('2026-10-10')] });

    await expect(
      service.reconcile(TENANT, { statementId: 's1', amount: 5, entryDate: '2026-10-10' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.journalLine.findMany).not.toHaveBeenCalled();
  });

  it('klaim bersyarat: permintaan kedua yang kalah balapan ditolak', async () => {
    const { service, prisma } = build({ stmt: statement(10_000), lines: [line('2026-10-10')], claimCount: 0 });

    await expect(
      service.reconcile(TENANT, { statementId: 's1', amount: 10_000, entryDate: '2026-10-10' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.bankStatement.updateMany.mock.calls[0][0].where.isReconciled).toBe(false);
  });

  it('baris yang sudah direkonsiliasi ditolak sejak awal', async () => {
    const { service } = build({ stmt: statement(10_000, { isReconciled: true }) });

    await expect(
      service.reconcile(TENANT, { statementId: 's1', amount: 10_000, entryDate: '2026-10-10' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tanda manual (match=false) tidak mencari jurnal', async () => {
    const { service, prisma } = build({ stmt: statement(10_000) });

    const result = await service.reconcile(TENANT, { statementId: 's1', match: false });

    expect(prisma.journalLine.findMany).not.toHaveBeenCalled();
    expect(result.matchedJournal).toBeNull();
  });
});

describe('BankingService.reconcile — tautan jurnal', () => {
  it('menyimpan jurnal yang dicocokkan pada baris mutasi', async () => {
    const { service, prisma } = build({ stmt: statement(250_000), lines: [line('2026-10-10')] });

    await service.reconcile(TENANT, { statementId: 's1', amount: 250_000, entryDate: '2026-10-10' });

    expect(prisma.bankStatement.updateMany.mock.calls[0][0].data.matchedJournalId).toBe('j-JRN-1');
  });

  it('tidak menawarkan jurnal yang sudah dicocokkan ke mutasi lain', async () => {
    const { service, prisma } = build({ stmt: statement(250_000), lines: [line('2026-10-10')] });

    await service.reconcile(TENANT, { statementId: 's1', amount: 250_000, entryDate: '2026-10-10' });

    expect(prisma.journalLine.findMany.mock.calls[0][0].where.journal.bankStatements).toEqual({ none: {} });
  });

  it('dua mutasi berebut satu jurnal: pelanggaran UNIQUE jadi Conflict, bukan data ganda', async () => {
    const { service, prisma } = build({ stmt: statement(250_000), lines: [line('2026-10-10')] });
    prisma.bankStatement.updateMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(
      service.reconcile(TENANT, { statementId: 's1', amount: 250_000, entryDate: '2026-10-10' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('tanda manual tidak menulis tautan jurnal', async () => {
    const { service, prisma } = build({ stmt: statement(10_000) });

    await service.reconcile(TENANT, { statementId: 's1', match: false });

    expect(prisma.bankStatement.updateMany.mock.calls[0][0].data).not.toHaveProperty('matchedJournalId');
  });
});

describe('BankingService.createAccount validasi akun kas/bank', () => {
  function make(account: { id: string; code: string; type: string } | null, children = 0) {
    const prisma = {
      company: { findFirst: vi.fn().mockResolvedValue({ id: COMPANY }) },
      chartOfAccount: {
        findFirst: vi.fn().mockResolvedValue(account),
        count: vi.fn().mockResolvedValue(children),
      },
      bankAccount: { create: vi.fn().mockResolvedValue({ id: 'b1' }) },
    };
    return { service: new BankingService(prisma as never, {} as never), prisma };
  }

  it('menolak rekening yang ditautkan ke akun pendapatan', async () => {
    const { service, prisma } = make({ id: 'a', code: '4000', type: 'revenue' });
    await expect(service.createAccount(TENANT, { code: 'BCA', name: 'BCA', accountCode: '4000' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  it('menolak akun induk', async () => {
    const { service } = make({ id: 'a', code: '1000', type: 'asset' }, 2);
    await expect(service.createAccount(TENANT, { code: 'BCA', name: 'BCA' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('menerima akun aset detail', async () => {
    const { service, prisma } = make({ id: 'a', code: '1000', type: 'asset' });
    await service.createAccount(TENANT, { code: 'BCA', name: 'BCA' });
    expect(prisma.bankAccount.create).toHaveBeenCalled();
  });
});
