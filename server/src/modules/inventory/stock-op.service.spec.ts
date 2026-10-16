import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { StockOpService } from './stock-op.service';

type Row = Record<string, any>;

/**
 * Prisma palsu stateful untuk penutupan stock op. `trace` mencatat urutan
 * operasi supaya terlihat bahwa penyesuaian stok, movement, dan jurnal berada
 * dalam transaksi yang SAMA (objek tx yang sama).
 */
function setup(opts: {
  status?: string;
  lines: Array<{ productId: string; systemQty: number; countedQty: number | null }>;
  stock: Record<string, { quantity: number; avgCost: number; costPrice?: number }>;
  postImpl?: (tx: unknown, input: any) => Promise<unknown>;
  claimCount?: number;
}) {
  const state = {
    stock: Object.fromEntries(Object.entries(opts.stock).map(([k, v]) => [k, { ...v }])) as Record<string, any>,
    movements: [] as Row[],
    trace: [] as string[],
    journalTx: undefined as unknown,
    journalInput: undefined as any,
    status: opts.status ?? 'open',
  };
  const op = { id: 'op-1', tenantId: 't1', companyId: 'c1', warehouseId: 'w1', code: 'SOP-1', status: state.status, note: '' };
  const tx: Row = {
    stockOp: {
      updateMany: vi.fn(async () => {
        state.trace.push('claim');
        return { count: opts.claimCount ?? 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({ ...op, status: 'closed', lines: [] })),
    },
    stockOpLine: {
      findMany: vi.fn(async () =>
        opts.lines.map((l) => ({
          productId: l.productId,
          systemQty: new Prisma.Decimal(l.systemQty),
          countedQty: l.countedQty === null ? null : new Prisma.Decimal(l.countedQty),
        })),
      ),
    },
    inventoryStock: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const k = where.tenantId_companyId_productId_warehouseId.productId;
        const s = state.stock[k];
        return s
          ? { quantity: new Prisma.Decimal(s.quantity), avgCost: new Prisma.Decimal(s.avgCost), product: { costPrice: new Prisma.Decimal(s.costPrice ?? 0) } }
          : null;
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const k = where.tenantId_companyId_productId_warehouseId.productId;
        state.stock[k].quantity = Number(data.quantity);
        if (data.avgCost !== undefined) state.stock[k].avgCost = Number(data.avgCost);
        state.trace.push(`stock:${k}`);
      }),
      create: vi.fn(),
    },
    stockMovement: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        state.movements.push({ ...data, quantity: Number(data.quantity) });
        state.trace.push(`movement:${data.productId}`);
      }),
    },
    chartOfAccount: {
      findFirst: vi.fn(async ({ where }: { where: { code: string } }) => ({ id: `acc-${where.code}`, code: where.code })),
      findFirstOrThrow: vi.fn(async ({ where }: { where: { code: string } }) => ({ id: `acc-${where.code}`, code: where.code })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const prisma: Row = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    stockOp: { findFirst: async () => ({ ...op, status: state.status }) },
    $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  };
  const post = vi.fn(async (t: unknown, input: any) => {
    state.trace.push('journal');
    state.journalTx = t;
    state.journalInput = input;
    return opts.postImpl ? opts.postImpl(t, input) : { id: 'j-1' };
  });
  const service = new StockOpService(prisma as never, { post } as never);
  return { service, state, tx, post };
}

describe('StockOpService.close — jurnal selisih persediaan', () => {
  it('menjurnal selisih bernilai (qty x moving-average) dalam transaksi yang sama dengan penyesuaian stok', async () => {
    const { service, state, tx, post } = setup({
      lines: [
        { productId: 'pa', systemQty: 10, countedQty: 8 },   // -2 x 1000 = rugi 2000
        { productId: 'pb', systemQty: 10, countedQty: 13 },  // +3 x 2000 = laba 6000
        { productId: 'pc', systemQty: 10, countedQty: 10 },  // tanpa selisih
      ],
      stock: { pa: { quantity: 10, avgCost: 1000 }, pb: { quantity: 10, avgCost: 2000 }, pc: { quantity: 10, avgCost: 500 } },
    });
    const res = await service.close('t1', 'op-1', {}, 'user-1');

    expect(state.stock.pa.quantity).toBe(8);
    expect(state.stock.pb.quantity).toBe(13);
    expect(state.stock.pc.quantity).toBe(10);
    expect(state.movements.map((m) => [m.productId, m.quantity, m.refId])).toEqual([['pa', -2, 'op-1'], ['pb', 3, 'op-1']]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(state.journalTx).toBe(tx); // bukan prisma global: satu transaksi
    expect(state.journalInput).toMatchObject({ sourceModule: 'stock-opname', sourceRefId: 'op-1', actorId: 'user-1' });
    const lines = state.journalInput.lines as Array<{ accountId: string; direction: string; amount: number }>;
    const sum = (dir: string, acc: string) => lines.filter((l) => l.direction === dir && l.accountId === acc).reduce((s, l) => s + l.amount, 0);
    expect(sum('debit', 'acc-1100')).toBe(6000);
    expect(sum('credit', 'acc-1100')).toBe(2000);
    expect(sum('debit', 'acc-6500')).toBe(2000);
    expect(sum('credit', 'acc-6500')).toBe(6000);
    expect(res.adjustmentsApplied).toBe(2);
    expect(res.journalId).toBe('j-1');
    // urutan: klaim status dulu, jurnal paling akhir
    expect(state.trace[0]).toBe('claim');
    expect(state.trace[state.trace.length - 1]).toBe('journal');
  });

  it('tanpa selisih tidak membuat jurnal', async () => {
    const { service, post } = setup({
      lines: [{ productId: 'pa', systemQty: 5, countedQty: 5 }],
      stock: { pa: { quantity: 5, avgCost: 100 } },
    });
    const res = await service.close('t1', 'op-1', {});
    expect(post).not.toHaveBeenCalled();
    expect(res.journalId).toBeNull();
    expect(res.adjustmentsApplied).toBe(0);
  });

  it('selisih dihitung terhadap stok SAAT INI, bukan snapshot pembukaan (tidak menggandakan pergerakan)', async () => {
    // snapshot 10, tetapi sejak dibuka ada pengurangan 4 (stok kini 6); hitung fisik 6 => tidak ada selisih
    const { service, state, post } = setup({
      lines: [{ productId: 'pa', systemQty: 10, countedQty: 6 }],
      stock: { pa: { quantity: 6, avgCost: 1000 } },
    });
    await service.close('t1', 'op-1', {});
    expect(state.movements).toHaveLength(0);
    expect(post).not.toHaveBeenCalled();
    expect(state.stock.pa.quantity).toBe(6);
  });

  it('stok tanpa biaya moving-average memakai harga pokok master untuk valuasi', async () => {
    const { service, state } = setup({
      lines: [{ productId: 'pa', systemQty: 0, countedQty: 4 }],
      stock: { pa: { quantity: 0, avgCost: 0, costPrice: 250 } },
    });
    await service.close('t1', 'op-1', {});
    expect(state.stock.pa.avgCost).toBe(250);
    const lines = state.journalInput.lines as Array<{ direction: string; amount: number }>;
    expect(lines.find((l) => l.direction === 'debit')?.amount).toBe(1000);
  });

  it('period lock: error JournalService membatalkan penutupan (tidak ada hasil sukses)', async () => {
    const { service } = setup({
      lines: [{ productId: 'pa', systemQty: 10, countedQty: 8 }],
      stock: { pa: { quantity: 10, avgCost: 1000 } },
      postImpl: async () => {
        throw new BadRequestException('Tanggal jurnal tidak berada dalam periode fiskal yang terbuka.');
      },
    });
    await expect(service.close('t1', 'op-1', {})).rejects.toThrow(/periode fiskal/);
  });

  it('penutupan ganda/paralel: klaim status kalah -> 409 dan tidak ada penyesuaian/jurnal', async () => {
    const { service, state, post } = setup({
      lines: [{ productId: 'pa', systemQty: 10, countedQty: 8 }],
      stock: { pa: { quantity: 10, avgCost: 1000 } },
      claimCount: 0,
    });
    await expect(service.close('t1', 'op-1', {})).rejects.toBeInstanceOf(ConflictException);
    expect(state.movements).toHaveLength(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('produk yang belum dihitung menahan penutupan kecuali force', async () => {
    const { service } = setup({
      lines: [{ productId: 'pa', systemQty: 10, countedQty: null }],
      stock: { pa: { quantity: 10, avgCost: 1000 } },
    });
    await expect(service.close('t1', 'op-1', {})).rejects.toBeInstanceOf(BadRequestException);
    const forced = setup({
      lines: [{ productId: 'pa', systemQty: 10, countedQty: null }],
      stock: { pa: { quantity: 10, avgCost: 1000 } },
    });
    await expect(forced.service.close('t1', 'op-1', { force: true })).resolves.toMatchObject({ adjustmentsApplied: 0 });
  });

  it('sesi yang sudah tertutup ditolak sebelum menyentuh stok', async () => {
    const { service, state } = setup({ status: 'closed', lines: [], stock: {} });
    await expect(service.close('t1', 'op-1', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(state.trace).toHaveLength(0);
  });
});
