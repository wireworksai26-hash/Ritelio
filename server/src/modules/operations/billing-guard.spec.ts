import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OperationsService } from './operations.service';

const COMPANY = { id: 'c1' };

type Sheet = {
  id: string;
  hours: number;
  hourlyRate: number;
  status: string;
  billable: boolean;
  billedAt: Date | null;
  billedInvoiceId?: string | null;
};

function mockDeps(sheets: Sheet[]) {
  const state = {
    sheets: sheets.map((s) => ({ ...s })),
    invoiceCalls: 0,
    journalCalls: 0,
    claimed: [] as string[],
  };

  const tx = {
    timesheet: {
      updateMany: async (args: { where: { id: string; billedAt?: null }; data: { billedAt?: Date } }) => {
        const row = state.sheets.find((s) => s.id === args.where.id);
        if (!row) return { count: 0 };
        if (args.where.billedAt === null && row.billedAt !== null) return { count: 0 };
        if (args.data.billedAt) row.billedAt = args.data.billedAt;
        state.claimed.push(row.id);
        return { count: 1 };
      },
    },
    project: { update: async () => ({}) },
  };

// Mock ini SENGAJA tidak menyaring sendiri: ia memakai filter `billedAt`
  // yang dikirim service. Kalau mock yang menyaring, penghapusan filter di
  // service tidak akan terlihat dan regression guard-nya jadi bohong.
  const prisma = {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    company: { findFirst: async () => COMPANY },
    project: {
      findFirst: async (args?: {
        where?: Record<string, unknown>;
        include?: { timesheets?: { where?: { billedAt?: null } } };
      }) => {
        const filter = args?.include?.timesheets?.where;
        const candidates = state.sheets.filter(
          (s) => s.status === 'approved' && s.billable && (filter?.billedAt === null ? s.billedAt === null : true),
        );
        return {
          id: 'p1',
          code: 'PRJ-1',
          tenantId: 't1',
          companyId: 'c1',
          budget: 1_000_000,
          customerId: 'cust-1',
          customer: { id: 'cust-1', name: 'Klien', paymentTermDays: 30 },
          timesheets: candidates,
        };
      },
    },
    chartOfAccount: {
      findFirst: async (args: { where: { code: string } }) => ({
        id: `acc-${args.where.code}`,
        code: args.where.code,
        name: args.where.code,
      }),
    },
    timesheet: {
      count: async () => state.sheets.filter((s) => s.billedAt === null).length,
    },
  };

  const journals = {
    post: async () => {
      state.journalCalls += 1;
      return { id: `jrn-${state.journalCalls}` };
    },
  };

  const receivables = {
    createInvoiceForSale: async (_tx: unknown, args: { total: number }) => {
      state.invoiceCalls += 1;
      return { id: `inv-${state.invoiceCalls}`, number: `INV-${state.invoiceCalls}`, total: args.total };
    },
  };

  return { svc: new OperationsService(prisma as never, journals as never, receivables as never, { submit: async () => undefined } as never), state, tx };
}

const unbilled = (overrides: Partial<Sheet> = {}): Sheet => ({
  id: 'ts-1',
  hours: 6,
  hourlyRate: 100_000,
  status: 'approved',
  billable: true,
  billedAt: null,
  ...overrides,
});

describe('OperationsService.billProject — proteksi double-billing', () => {
  it('menagih timesheet yang belum ditagihkan', async () => {
    const { svc, state } = mockDeps([unbilled()]);
    const result = await svc.billProject('t1', 'p1');

    expect(result.amount).toBe(600_000);
    expect(result.billedSheets).toBe(1);
    expect(state.claimed).toEqual(['ts-1']);
  });

  it('menolak ketika tidak ada timesheet tersisa', async () => {
    const { svc } = mockDeps([unbilled({ billedAt: new Date('2026-01-01') })]);
    await expect(svc.billProject('t1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('panggilan kedua atas timesheet yang sama tidak menerbitkan faktur lagi', async () => {
    const { svc, state, tx } = mockDeps([unbilled()]);
    await svc.billProject('t1', 'p1');

    // Setara dengan request kedua: baris sudah claimed sehingga tidak lagi
    // muncul di kandidat, jadi jumlah tagihan harus tetap.
    expect(state.invoiceCalls).toBe(1);
    expect(state.journalCalls).toBe(1);

    // Klaim ulang baris yang sama harus ditolak oleh guard `billedAt: null`.
    const requeue = await tx.timesheet.updateMany({
      where: { id: 'ts-1', billedAt: null },
      data: { billedAt: new Date() },
    });
    expect(requeue.count).toBe(0);
  });

  it('guard klaim menolak baris yang sudah ditagihkan request sebelumnya', async () => {
    // Race: kandidat diambil sebelum request lain menandai billedAt, sehingga
    // updateMany mengembalikan count 0 dan jurnal tidak boleh terbit.
    const { svc, state, tx } = mockDeps([unbilled(), unbilled({ id: 'ts-2', hours: 4 })]);
    await svc.billProject('t1', 'p1');
    expect(state.claimed).toEqual(['ts-1', 'ts-2']);

    const second = await tx.timesheet.updateMany({
      where: { id: 'ts-1', billedAt: null },
      data: { billedAt: new Date() },
    });
    expect(second.count).toBe(0);
  });

  it('menolak proyek yang tidak ditemukan', async () => {
    const { svc } = mockDeps([unbilled()]);
    const prisma = (svc as unknown as { prisma: Record<string, { findFirst: () => Promise<null> }> }).prisma;
    prisma.project.findFirst = async () => null;
    await expect(svc.billProject('t1', 'hilang')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('menolak proyek yang tidak punya pelanggan', async () => {
    const { svc } = mockDeps([unbilled()]);
    const prisma = (svc as unknown as { prisma: Record<string, { findFirst: () => Promise<unknown> }> }).prisma;
    prisma.project.findFirst = async () => ({
      id: 'p1', code: 'PRJ-1', tenantId: 't1', companyId: 'c1',
      budget: 0, customerId: null, customer: null, timesheets: [],
    });
    await expect(svc.billProject('t1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('OperationsService.projectCosting — pemisahan sudah-tertagih', () => {
  it('memisahkan jumlah yang akan ditagihkan dari total billable', async () => {
    const { svc } = mockDeps([unbilled()]);
    const prisma = (svc as unknown as {
      prisma: Record<string, { findFirst: () => Promise<unknown>; findMany: () => Promise<unknown> }>;
    }).prisma;
    prisma.project.findFirst = async () => ({
      id: 'p1',
      code: 'PRJ-1',
      name: 'Proyek',
      tenantId: 't1',
      companyId: 'c1',
      budget: 1_000_000,
    });
    prisma.timesheet.findMany = async () => [
      {
        id: 'ts-1',
        hours: 6,
        hourlyRate: 100_000,
        status: 'approved',
        billable: true,
        billedAt: null,
        workDate: new Date('2026-01-05'),
        employee: { employeeNo: 'E1', fullName: 'Budi' },
      },
      {
        id: 'ts-2',
        hours: 4,
        hourlyRate: 100_000,
        status: 'approved',
        billable: true,
        billedAt: new Date('2026-02-01'),
        workDate: new Date('2026-01-06'),
        employee: { employeeNo: 'E1', fullName: 'Budi' },
      },
    ];

    const costing = await svc.projectCosting('t1', 'p1');
    expect(costing.billableAmount).toBe(1_000_000);
    expect(costing.unbilledAmount).toBe(600_000);
    expect(costing.unbilledSheets).toBe(1);
    expect(costing.entries[0].billed).toBe(false);
    expect(costing.entries[1].billed).toBe(true);
  });
});
