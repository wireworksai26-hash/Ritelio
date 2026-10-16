import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ManufacturingService } from './manufacturing.service';

type Row = Record<string, any>;

function setup(opts: {
  order?: Row;
  checks?: Row[];
  required?: Array<{ stage: string }>;
  bom?: Row;
  stock?: Record<string, { quantity: number; avgCost: number }>;
}) {
  const order = {
    id: 'mo-1', tenantId: 't1', companyId: 'c1', number: 'MO-1', productId: 'fg', warehouseId: 'w1', bomId: 'b1',
    status: 'released', qtyPlanned: new Prisma.Decimal(2), materialCost: new Prisma.Decimal(1300), consumptions: [], ...opts.order,
  };
  const state = { order: { ...order } as Row, journals: 0, decrements: [] as Row[], movements: [] as Row[] };
  const tx: Row = {
    productionOrder: {
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const allowed = where.status?.in ?? [where.status];
        if (!allowed.includes(state.order.status)) return { count: 0 };
        state.order = { ...state.order, ...data };
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: { data: Row }) => { state.order = { ...state.order, ...data }; return state.order; }),
    },
    chartOfAccount: { findFirst: vi.fn(async () => ({ id: 'acc-1100' })) },
    inventoryStock: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const s = opts.stock?.[where.tenantId_companyId_productId_warehouseId.productId];
        return s ? { quantity: new Prisma.Decimal(s.quantity), avgCost: new Prisma.Decimal(s.avgCost), product: { name: 'Bahan' } } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const s = opts.stock?.[where.productId];
        const need = Number(where.quantity.gte);
        if (!s || s.quantity < need) return { count: 0 };
        s.quantity -= need;
        state.decrements.push({ productId: where.productId, qty: Number(data.quantity.decrement) });
        return { count: 1 };
      }),
      upsert: vi.fn(async () => ({})),
    },
    stockMovement: { create: vi.fn(async ({ data }: { data: Row }) => { state.movements.push(data); }) },
    productionConsumption: { create: vi.fn(async () => ({})) },
    product: { findUnique: vi.fn(async () => ({ name: 'Bahan' })) },
  };
  const prisma: Row = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    productionOrder: {
      findFirst: async () => ({ ...state.order, consumptions: [] }),
      updateMany: tx.productionOrder.updateMany,
      findUniqueOrThrow: async () => state.order,
    },
    qualityCheck: { findMany: async () => opts.checks ?? [] },
    qcStageConfig: { findMany: async () => opts.required ?? [] },
    billOfMaterials: {
      findFirst: async () =>
        opts.bom ?? { id: 'b1', outputQty: new Prisma.Decimal(1), lines: [{ productId: 'raw1', qtyRequired: new Prisma.Decimal(3), scrapPercent: new Prisma.Decimal(0) }] },
    },
    chartOfAccount: tx.chartOfAccount,
    $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  };
  const journals = { post: vi.fn(async () => { state.journals += 1; return { id: 'j1' }; }) };
  return { service: new ManufacturingService(prisma as never, journals as never), state, journals, tx };
}

describe('ManufacturingService.complete — gerbang QC', () => {
  it('menolak bila tahap QC wajib belum diperiksa (bukan hanya bila ada yang gagal)', async () => {
    const { service, journals } = setup({
      required: [{ stage: 'in_process' }, { stage: 'final' }],
      checks: [{ stage: 'in_process', result: 'passed' }],
    });
    await expect(service.complete('t1', 'mo-1')).rejects.toThrow(/QC wajib belum lulus.*final/);
    expect(journals.post).not.toHaveBeenCalled();
  });

  it('menolak bila ada tahap QC gagal', async () => {
    const { service } = setup({ required: [{ stage: 'final' }], checks: [{ stage: 'final', result: 'failed' }] });
    await expect(service.complete('t1', 'mo-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('menyelesaikan bila semua tahap wajib lulus, dan jurnal produksi seimbang di transaksi', async () => {
    const { service, state, journals } = setup({
      required: [{ stage: 'in_process' }, { stage: 'final' }],
      checks: [{ stage: 'in_process', result: 'passed' }, { stage: 'final', result: 'passed' }],
    });
    const res = await service.complete('t1', 'mo-1');
    expect(res.unitCost).toBe(650);
    expect(state.order.status).toBe('completed');
    expect(journals.post).toHaveBeenCalledTimes(1);
    const input = (journals.post.mock.calls[0] as any[])[1];
    const dr = input.lines.filter((l: Row) => l.direction === 'debit').reduce((s: number, l: Row) => s + l.amount, 0);
    const cr = input.lines.filter((l: Row) => l.direction === 'credit').reduce((s: number, l: Row) => s + l.amount, 0);
    expect(dr).toBe(1300);
    expect(cr).toBe(1300);
  });

  it('produk tanpa konfigurasi QC tetap bisa diselesaikan (kompatibel dengan produk sederhana)', async () => {
    const { service } = setup({ required: [], checks: [] });
    await expect(service.complete('t1', 'mo-1')).resolves.toMatchObject({ completed: true });
  });

  it('complete kedua kali / paralel: klaim status kalah -> 409, tidak ada jurnal ganda', async () => {
    const { service, state, journals } = setup({});
    await service.complete('t1', 'mo-1');
    state.order.status = 'completed';
    await expect(service.complete('t1', 'mo-1')).rejects.toBeInstanceOf(ConflictException);
    expect(journals.post).toHaveBeenCalledTimes(1);
  });
});

describe('ManufacturingService.cancel', () => {
  it.each(['released', 'in_progress'])('order %s tidak bisa dibatalkan (bahan sudah keluar dari gudang)', async (status) => {
    const { service } = setup({ order: { status } });
    await expect(service.cancel('t1', 'mo-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('order completed dan cancelled ditolak', async () => {
    await expect(setup({ order: { status: 'completed' } }).service.cancel('t1', 'mo-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ order: { status: 'cancelled' } }).service.cancel('t1', 'mo-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('order planned dibatalkan lewat klaim bersyarat', async () => {
    const { service, state } = setup({ order: { status: 'planned' } });
    await service.cancel('t1', 'mo-1');
    expect(state.order.status).toBe('cancelled');
  });
});

describe('ManufacturingService.release — bahan ditarik dengan pengurangan bersyarat', () => {
  it('stok berkurang tepat sebesar kebutuhan dan tercatat di kartu stok', async () => {
    const { service, state } = setup({
      order: { status: 'planned' },
      stock: { raw1: { quantity: 10, avgCost: 100 } },
    });
    const res = await service.release('t1', 'mo-1');
    expect(res.materialCost).toBe(600); // 2 x 3 x 100
    expect(state.decrements).toEqual([{ productId: 'raw1', qty: 6 }]);
    expect(state.movements[0]).toMatchObject({ type: 'production', refId: 'mo-1' });
  });

  it('bahan kurang saat pengurangan bersyarat -> 400 dan status order tidak berubah permanen', async () => {
    const { service } = setup({ order: { status: 'planned' }, stock: { raw1: { quantity: 4, avgCost: 100 } } });
    await expect(service.release('t1', 'mo-1')).rejects.toThrow(/tidak cukup/);
  });
});
