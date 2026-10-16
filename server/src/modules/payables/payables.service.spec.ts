import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { normalizeAndValidateJournalLines, type JournalLineInput } from '../accounting/journal-validation';
import { PayablesService } from './payables.service';

const ACCOUNTS = [
  { id: 'beban', code: '6000', name: 'Beban Operasional', type: 'expense' },
  { id: 'aset', code: '1500', name: 'Perlengkapan', type: 'asset' },
  { id: 'hutang-x', code: '2999', name: 'Hutang Lain', type: 'liability' },
  { id: 'pendapatan', code: '4000', name: 'Pendapatan', type: 'revenue' },
];
const AP = { id: 'ap', code: '2000', name: 'Hutang Usaha', type: 'liability' };
const SUPPLIER = { id: 's1', code: 'SUP-1', name: 'CV Maju', isActive: true, paymentTermDays: 14 };

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
}

function setup(opts: { supplier?: typeof SUPPLIER | null } = {}) {
  const state = {
    journals: [] as Array<{ lines: JournalLineInput[]; entryDate: Date; sourceRefId?: string | null }>,
    bills: [] as Array<Record<string, any>>,
    claims: new Set<string>(),
    taxCalls: [] as Array<{ billId: string; net: number }>,
    createdHookCalls: 0,
  };

  const tx = {
    documentSequence: {
      create: async ({ data }: { data: { kind: string } }) => {
        // Meniru unique (tenant, company, kind): klaim kedua melempar P2002.
        if (state.claims.has(data.kind)) throw p2002();
        state.claims.add(data.kind);
        return data;
      },
      upsert: async () => ({ nextValue: 2 }),
    },
    vendorBill: {
      findFirst: async (args: { where: { supplierId?: string; note?: { startsWith: string }; number?: string } }) => {
        const w = args.where;
        if (w.note) {
          return state.bills.find((b) => b.supplierId === w.supplierId && String(b.note).startsWith(w.note!.startsWith)) ?? null;
        }
        return null;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        state.bills.push(data);
        return data;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const b = state.bills.find((x) => x.id === where.id)!;
        return { ...b, total: Number(b.total), paidAmount: 0, supplier: SUPPLIER };
      },
    },
  };

  const prisma = {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    company: { findFirst: async () => ({ id: 'c1' }) },
    supplier: { findFirst: async () => (opts.supplier === undefined ? SUPPLIER : opts.supplier) },
    chartOfAccount: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        ACCOUNTS.filter((a) => args.where.id.in.includes(a.id)),
      findFirst: async (args: { where: { code: string } }) => (args.where.code === '2000' ? AP : null),
    },
  };

  const journals = {
    post: async (_tx: unknown, input: { lines: JournalLineInput[]; entryDate: Date; sourceRefId?: string | null }) => {
      // Memakai validator GL asli: jurnal tak seimbang harus meledak di sini juga.
      normalizeAndValidateJournalLines(input.lines);
      state.journals.push(input);
      return { id: `j${state.journals.length}` };
    },
  };

  const tax = {
    applyToBill: async (_tx: unknown, p: { billId: string; net: number }) => {
      state.taxCalls.push({ billId: p.billId, net: p.net });
      return { taxAmount: 0, taxTotal: p.net, journalId: null };
    },
  };

  const service = new PayablesService(prisma as never, journals as never, tax as never);
  return { service, state };
}

const baseDto = {
  supplierId: 's1',
  billDate: '2026-10-05T00:00:00.000Z',
  lines: [
    { accountId: 'beban', amount: 700_000, description: 'Listrik' },
    { accountId: 'aset', amount: 300_000 },
  ],
};

describe('PayablesService.createBill', () => {
  it('memposting satu jurnal seimbang (Dr beban/aset, Cr hutang) dan menautkannya ke tagihan', async () => {
    const { service, state } = setup();
    const bill = await service.createBill('t1', baseDto, { actorId: 'u1' });

    expect(state.journals).toHaveLength(1);
    const lines = state.journals[0].lines;
    expect(lines.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amount, 0)).toBe(1_000_000);
    expect(lines.find((l) => l.direction === 'credit')).toMatchObject({ accountId: 'ap', amount: 1_000_000 });

    expect(state.bills).toHaveLength(1);
    expect(state.bills[0]).toMatchObject({ journalId: 'j1', supplierId: 's1' });
    expect(state.journals[0].sourceRefId).toBe(state.bills[0].id);
    expect(bill.outstanding).toBe(1_000_000);
  });

  it('jatuh tempo default = tanggal tagihan + termin pemasok', async () => {
    const { service, state } = setup();
    await service.createBill('t1', baseDto);
    expect((state.bills[0].dueDate as Date).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  it('PPN masukan dihitung atas DPP; applyTax=false melewatinya', async () => {
    const withTax = setup();
    await withTax.service.createBill('t1', baseDto);
    expect(withTax.state.taxCalls).toEqual([{ billId: withTax.state.bills[0].id, net: 1_000_000 }]);

    const noTax = setup();
    await noTax.service.createBill('t1', { ...baseDto, applyTax: false });
    expect(noTax.state.taxCalls).toHaveLength(0);
  });

  it('menolak akun utang/pendapatan di baris tagihan dan tidak memposting apa pun', async () => {
    for (const accountId of ['hutang-x', 'pendapatan']) {
      const { service, state } = setup();
      await expect(
        service.createBill('t1', { ...baseDto, lines: [{ accountId, amount: 10_000 }] }),
      ).rejects.toThrow(BadRequestException);
      expect(state.journals).toHaveLength(0);
      expect(state.bills).toHaveLength(0);
    }
  });

  it('menolak akun yang tidak ada', async () => {
    const { service } = setup();
    await expect(
      service.createBill('t1', { ...baseDto, lines: [{ accountId: 'nope', amount: 1 }] }),
    ).rejects.toThrow(NotFoundException);
  });

  it('menolak pemasok nonaktif atau tidak ditemukan', async () => {
    const inactive = setup({ supplier: { ...SUPPLIER, isActive: false } });
    await expect(inactive.service.createBill('t1', baseDto)).rejects.toThrow(BadRequestException);
    expect(inactive.state.journals).toHaveLength(0);

    const missing = setup({ supplier: null });
    await expect(missing.service.createBill('t1', baseDto)).rejects.toThrow(NotFoundException);
  });

  it('nomor faktur pemasok yang sama ditolak (tidak ada jurnal kedua)', async () => {
    const { service, state } = setup();
    const dto = { ...baseDto, supplierInvoiceNumber: 'INV-001' };
    await service.createBill('t1', dto);
    await expect(service.createBill('t1', dto)).rejects.toThrow(ConflictException);
    expect(state.journals).toHaveLength(1);
    expect(state.bills).toHaveLength(1);
  });

  it('kunci idempotensi: dokumen sumber yang sama hanya jadi satu tagihan', async () => {
    const { service, state } = setup();
    const opts = { idempotencyKey: 'ocr-bill:abc' };
    await service.createBill('t1', baseDto, opts);
    await expect(service.createBill('t1', baseDto, opts)).rejects.toThrow(ConflictException);
    // Klaim dilakukan SEBELUM jurnal, jadi percobaan kedua tidak meninggalkan jurnal yatim.
    expect(state.journals).toHaveLength(1);
    expect(state.bills).toHaveLength(1);
  });

  it('hook onCreated dijalankan di transaksi yang sama dengan id & nomor tagihan', async () => {
    const { service, state } = setup();
    let seen: { id: string; number: string } | null = null;
    await service.createBill('t1', baseDto, {
      onCreated: async (_tx, b) => {
        seen = b;
        state.createdHookCalls++;
      },
    });
    expect(state.createdHookCalls).toBe(1);
    expect(seen).toMatchObject({ id: state.bills[0].id, number: state.bills[0].number });
  });
});

describe('PayablesService.payBill status', () => {
  // Regresi: status dulu dibandingkan dengan SISA tagihan, bukan total.
  // Tagihan 100 yang sudah dibayar 40, lalu dibayar 30, ditandai "paid"
  // padahal masih tersisa 30.
  // Meniru Postgres: SELECT ... FOR UPDATE membuat transaksi lain menunggu sampai commit,
  // dan baris dibaca ulang setelah kunci didapat.
  function payDeps(bill: { total: number; paidAmount: number; taxTotal?: number }) {
    const row: Record<string, any> = { id: 'b1', number: 'AP-1', supplierId: 's1', status: bill.paidAmount > 0 ? 'partial' : 'open', taxTotal: 0, ...bill };
    const updates: Array<{ paidAmount: unknown; status: string }> = [];
    let chain: Promise<void> = Promise.resolve();
    const prisma: Record<string, any> = {
      company: { findFirst: async () => ({ id: 'c1' }) },
      chartOfAccount: {
        findFirst: async (args: { where: { code: string } }) => ({ id: `acc-${args.where.code}` }),
      },
    };
    prisma['$transaction'] = async (fn: (t: unknown) => Promise<unknown>) => {
      let release!: () => void;
      const done = new Promise<void>((r) => (release = r));
      const prev = chain;
      chain = prev.then(() => done);
      let locked = false;
      const tx = {
        $queryRaw: async (strings: TemplateStringsArray) => {
          expect(strings.join('?')).toContain('FOR UPDATE');
          await prev;
          locked = true;
        },
        documentSequence: { upsert: async () => ({ nextValue: 2 }) },
        vendorPayment: { findFirst: async () => null, create: async ({ data }: { data: unknown }) => data },
        vendorBill: {
          findFirst: async () => {
            if (!locked) throw new Error('faktur dibaca tanpa kunci');
            return { ...row };
          },
          update: async ({ data }: { data: { paidAmount: unknown; status: string } }) => {
            updates.push(data);
            row.paidAmount = Number(data.paidAmount);
            row.status = data.status;
            return data;
          },
        },
      };
      try {
        return await fn(tx);
      } finally {
        release();
      }
    };
    const journals = { post: async () => ({ id: 'j1' }) };
    return { service: new PayablesService(prisma as never, journals as never, {} as never), updates, row };
  }

  it('bayar sebagian pada tagihan yang sudah sebagian lunas tetap "partial"', async () => {
    const { service, updates } = payDeps({ total: 100, paidAmount: 40 });
    const res = await service.payBill('t1', 'b1', { amount: 30 });
    expect(res.billStatus).toBe('partial');
    expect(updates[0].status).toBe('partial');
  });

  it('melunasi sisa menjadikan "paid"', async () => {
    const { service } = payDeps({ total: 100, paidAmount: 40 });
    const res = await service.payBill('t1', 'b1', { amount: 60 });
    expect(res.billStatus).toBe('paid');
  });

  it('menolak pembayaran melebihi sisa', async () => {
    const { service } = payDeps({ total: 100, paidAmount: 40 });
    await expect(service.payBill('t1', 'b1', { amount: 61 })).rejects.toThrow(BadRequestException);
  });

  it('nilai yang dilunasi adalah gross (DPP + PPN): taxTotal 111 -> sisa 111, bukan 100', async () => {
    const { service, row } = payDeps({ total: 100, paidAmount: 0, taxTotal: 111 });
    await expect(service.payBill('t1', 'b1', { amount: 111.01 })).rejects.toThrow(BadRequestException);
    const res = await service.payBill('t1', 'b1', { amount: 111 });
    expect(res.billStatus).toBe('paid');
    expect(row.paidAmount).toBe(111);
  });

  it('pembayaran paralel pada sisa yang cukup untuk satu saja: hanya satu berhasil', async () => {
    const { service, row } = payDeps({ total: 100, paidAmount: 50 });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.payBill('t1', 'b1', { amount: 50 })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(9);
    expect(row.paidAmount).toBe(100);
    expect(row.status).toBe('paid');
  });
});
