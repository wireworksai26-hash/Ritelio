import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HrmService } from './hrm.service';

type Row = Record<string, any>;
const D = (n: number) => new Prisma.Decimal(n);

function payrollSetup(over: { status?: string; claimCount?: number; accounts?: string[] } = {}) {
  const run = {
    id: 'run-1', tenantId: 't1', companyId: 'c1', period: '2026-10', status: over.status ?? 'draft',
    totalGross: D(10500000), totalEmployerCost: D(945000), totalNet: D(8825000),
    items: [
      { pph21Amount: D(1050000), bpjsKesehatan: D(105000), bpjsKetenagakerjaan: D(420000), otherDeduction: D(100000) },
    ],
  };
  const accounts = new Set(over.accounts ?? ['6300', '2160', '2200']);
  const created: Row[] = [];
  const tx: Row = {
    payrollRun: {
      updateMany: vi.fn(async () => ({ count: over.claimCount ?? 1 })),
      update: vi.fn(async ({ data }: { data: Row }) => ({ ...run, ...data })),
    },
    chartOfAccount: {
      findFirst: vi.fn(async ({ where }: { where: { code: string } }) =>
        accounts.has(where.code) ? { id: `acc-${where.code}`, code: where.code } : null),
      findFirstOrThrow: vi.fn(async ({ where }: { where: { code: string } }) => ({ id: `acc-${where.code}`, code: where.code })),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => { created.push(...data); accounts.add(data[0].code); return { count: 1 }; }),
    },
  };
  const prisma: Row = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    payrollRun: { findFirst: async () => run },
    $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  };
  const post = vi.fn(async (_tx: unknown, input: Row) => ({ id: 'j1', input }));
  return { service: new HrmService(prisma as never, { post } as never), post, tx, created };
}

describe('HrmService.postPayroll', () => {
  it('kredit gaji masuk akun kewajiban Utang Gaji (2300), BUKAN akun Beban Gaji yang didebet', async () => {
    const { service, post } = payrollSetup();
    await service.postPayroll('t1', 'run-1');
    const input = post.mock.calls[0][1] as { lines: Array<{ accountId: string; direction: string; amount: number }> };
    const credit = (acc: string) => input.lines.filter((l) => l.direction === 'credit' && l.accountId === acc).reduce((s, l) => s + l.amount, 0);
    const debit = input.lines.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amount, 0);

    expect(credit('acc-6300')).toBe(0);                 // beban gaji tidak dikreditkan
    expect(credit('acc-2300')).toBe(8925000);           // net 8.825.000 + potongan lain 100.000
    expect(credit('acc-2160')).toBe(1050000);           // PPh 21
    expect(credit('acc-2200')).toBe(525000 + 945000);   // iuran karyawan + beban perusahaan
    expect(debit).toBe(10500000 + 945000);
    const totalCredit = input.lines.filter((l) => l.direction === 'credit').reduce((s, l) => s + l.amount, 0);
    expect(totalCredit).toBe(debit);
  });

  it('membuat akun Utang Gaji (liability) bila COA belum punya', async () => {
    const { service, created } = payrollSetup();
    await service.postPayroll('t1', 'run-1');
    expect(created).toEqual([expect.objectContaining({ code: '2300', type: 'liability' })]);
  });

  it('COA bawaan pendaftaran tidak punya 6300/2160/2200: akun dibuat saat posting, bukan 404', async () => {
    const { service, created, post } = payrollSetup({ accounts: [] });
    await service.postPayroll('t1', 'run-1');
    expect(created.map((a) => [a.code, a.type])).toEqual(
      expect.arrayContaining([['6300', 'expense'], ['2160', 'liability'], ['2200', 'liability'], ['2300', 'liability']]),
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('post paralel: klaim draft->approved kalah -> 409 dan jurnal TIDAK diterbitkan dua kali', async () => {
    const { service, post } = payrollSetup({ claimCount: 0 });
    await expect(service.postPayroll('t1', 'run-1')).rejects.toBeInstanceOf(ConflictException);
    expect(post).not.toHaveBeenCalled();
  });

  it('payroll yang sudah approved ditolak', async () => {
    const { service, post } = payrollSetup({ status: 'approved' });
    await expect(service.postPayroll('t1', 'run-1')).rejects.toBeInstanceOf(ConflictException);
    expect(post).not.toHaveBeenCalled();
  });

  it('jurnal dan klaim status berada di transaksi yang sama (tx diteruskan ke JournalService)', async () => {
    const { service, post, tx } = payrollSetup();
    await service.postPayroll('t1', 'run-1');
    expect(post.mock.calls[0][0]).toBe(tx);
  });
});

describe('HrmService.decideLeave', () => {
  function leaveSetup(opts: { userId?: string | null; claimCount?: number } = {}) {
    const prisma: Row = {
      company: { findFirst: async () => ({ id: 'c1' }) },
      leaveRequest: {
        findFirst: async () => ({ id: 'l1', status: 'pending', employee: { userId: opts.userId ?? null } }),
        updateMany: vi.fn(async () => ({ count: opts.claimCount ?? 1 })),
        findUniqueOrThrow: async () => ({ id: 'l1', status: 'approved' }),
      },
    };
    return { service: new HrmService(prisma as never, {} as never), prisma };
  }

  it('pemohon tidak boleh memutuskan cutinya sendiri (403)', async () => {
    const { service, prisma } = leaveSetup({ userId: 'u-1' });
    await expect(service.decideLeave('t1', 'l1', 'u-1', { approve: true })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it('putusan paralel: yang kalah di klaim bersyarat mendapat 409', async () => {
    const { service } = leaveSetup({ claimCount: 0 });
    await expect(service.decideLeave('t1', 'l1', 'u-2', { approve: true })).rejects.toBeInstanceOf(ConflictException);
  });

  it('pihak lain boleh memutuskan', async () => {
    const { service } = leaveSetup({ userId: 'u-1' });
    await expect(service.decideLeave('t1', 'l1', 'u-2', { approve: true })).resolves.toMatchObject({ status: 'approved' });
  });
});

describe('HrmService.requestLeave — saldo cuti', () => {
  function reqSetup(existing: Array<{ status: string; startDate: Date; endDate: Date }> = []) {
    const prisma: Row = {
      company: { findFirst: async () => ({ id: 'c1' }) },
      employee: { findFirst: async () => ({ id: 'e1', isActive: true }) },
      leaveRequest: {
        findFirst: async () => null,
        findMany: async () => existing,
        create: vi.fn(async ({ data }: { data: Row }) => ({ id: 'l-new', ...data })),
      },
    };
    return { service: new HrmService(prisma as never, {} as never), prisma };
  }

  it('hari akhir pekan tidak memotong jatah: Senin-Jumat = 5 hari', async () => {
    const { service } = reqSetup();
    const r = await service.requestLeave('t1', 'e1', { startDate: '2026-11-02', endDate: '2026-11-08' });
    expect((r as Row).days).toBe(5);
  });

  it('menolak rentang yang hanya akhir pekan', async () => {
    const { service } = reqSetup();
    await expect(service.requestLeave('t1', 'e1', { startDate: '2026-11-07', endDate: '2026-11-08' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('menolak melebihi saldo tahunan 12 hari (terpakai + menunggu dihitung)', async () => {
    const { service, prisma } = reqSetup([
      { status: 'approved', startDate: new Date('2026-03-02'), endDate: new Date('2026-03-06') }, // 5
      { status: 'pending', startDate: new Date('2026-04-06'), endDate: new Date('2026-04-10') },  // 5 -> sisa 2
    ]);
    await expect(service.requestLeave('t1', 'e1', { startDate: '2026-11-02', endDate: '2026-11-04' })).rejects.toThrow(/Saldo cuti 2026 tidak cukup/);
    expect(prisma.leaveRequest.create).not.toHaveBeenCalled();
    await expect(service.requestLeave('t1', 'e1', { startDate: '2026-11-02', endDate: '2026-11-03' })).resolves.toBeTruthy();
  });
});
