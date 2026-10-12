import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProcurementService } from './procurement.service';
import { planRequisitionPos, type RequisitionLineSource } from './requisition-po';

const line = (over: Partial<RequisitionLineSource> & { lineId: string }): RequisitionLineSource => ({
  productId: `p-${over.lineId}`,
  sku: `SKU-${over.lineId}`,
  requestedQty: 10,
  preferredSupplierId: 's1',
  costPrice: 1_000,
  ...over,
});

describe('planRequisitionPos', () => {
  it('mengelompokkan baris per pemasok utama dan menghitung total', () => {
    const plans = planRequisitionPos(
      [
        line({ lineId: 'a', preferredSupplierId: 's1', requestedQty: 10, costPrice: 1_000 }),
        line({ lineId: 'b', preferredSupplierId: 's2', requestedQty: 2, costPrice: 5_000 }),
        line({ lineId: 'c', preferredSupplierId: 's1', requestedQty: 3, costPrice: 2_000 }),
      ],
      {},
    );
    expect(plans).toHaveLength(2);
    const s1 = plans.find((p) => p.supplierId === 's1')!;
    expect(s1.lines.map((l) => l.lineId)).toEqual(['a', 'c']);
    expect(s1.total).toBe(16_000);
    expect(plans.find((p) => p.supplierId === 's2')!.total).toBe(10_000);
  });

  it('prioritas pemasok: override > pemasok utama > default form', () => {
    const plans = planRequisitionPos(
      [
        line({ lineId: 'a', preferredSupplierId: 's1' }),
        line({ lineId: 'b', preferredSupplierId: null }),
      ],
      { defaultSupplierId: 'sDefault', overrides: [{ productId: 'p-a', supplierId: 'sOverride' }] },
    );
    expect(plans.map((p) => p.supplierId).sort()).toEqual(['sDefault', 'sOverride']);
  });

  it('override harga menggantikan harga pokok', () => {
    const [plan] = planRequisitionPos([line({ lineId: 'a', costPrice: 1_000, requestedQty: 4 })], {
      overrides: [{ productId: 'p-a', price: 2_500 }],
    });
    expect(plan.lines[0].price).toBe(2_500);
    expect(plan.total).toBe(10_000);
  });

  it('menolak sekaligus semua baris tanpa pemasok atau harga, menyebut SKU-nya', () => {
    try {
      planRequisitionPos(
        [
          line({ lineId: 'a', preferredSupplierId: null }),
          line({ lineId: 'b', costPrice: 0 }),
          line({ lineId: 'c' }),
        ],
        {},
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const msg = (err as BadRequestException).message;
      expect(msg).toContain('SKU-a');
      expect(msg).toContain('SKU-b');
      expect(msg).not.toContain('SKU-c');
    }
  });
});

// ── Konversi di level service ────────────────────────────────────────────

type ReqStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'converted';

function setup(initial: ReqStatus, opts: { lines?: Array<{ id: string; productId: string; supplier: string | null; cost: number; qty: number }> } = {}) {
  const lines = opts.lines ?? [{ id: 'l1', productId: 'p1', supplier: 's1', cost: 1_000, qty: 10 }];
  const state = {
    status: initial,
    pos: [] as Array<{ code: string; supplierId: string; status: string; items: unknown[] }>,
    reqUpdate: null as null | Record<string, unknown>,
    orderedQty: new Map<string, unknown>(),
    seq: 1,
  };

  const tx = {
    purchaseRequisition: {
      // Menghormati filter status: inilah mutex antar request.
      updateMany: async (args: { where: { status: string }; data: { status: ReqStatus } }) => {
        if (state.status !== args.where.status) return { count: 0 };
        state.status = args.data.status;
        return { count: 1 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.reqUpdate = data;
        return { id: 'r1', status: state.status, lines: [], purchaseOrder: null };
      },
    },
    purchaseOrder: {
      findFirst: async () => null,
      create: async ({ data }: { data: { code: string; supplierId: string; status: string; items: { create: unknown[] } } }) => {
        state.pos.push({ code: data.code, supplierId: data.supplierId, status: data.status, items: data.items.create });
        return { id: `po${state.pos.length}`, code: data.code };
      },
    },
    purchaseRequisitionLine: {
      update: async ({ where, data }: { where: { id: string }; data: { orderedQty: unknown } }) => {
        state.orderedQty.set(where.id, data.orderedQty);
        return {};
      },
    },
    documentSequence: {
      upsert: async () => ({ nextValue: ++state.seq }),
    },
  };

  const prisma = {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    company: { findFirst: async () => ({ id: 'c1' }) },
    purchaseRequisition: {
      findFirst: async () => ({
        id: 'r1',
        status: state.status,
        reason: 'stok tipis',
        lines: lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          requestedQty: l.qty,
          product: { sku: `SKU-${l.productId}`, preferredSupplierId: l.supplier, costPrice: l.cost },
        })),
      }),
    },
    warehouse: { findFirst: async (a: { where: { id: string } }) => (a.where.id === 'w1' ? { id: 'w1' } : null) },
    supplier: {
      findMany: async (a: { where: { id: { in: string[] } } }) =>
        a.where.id.in.map((id) => ({ id, code: id.toUpperCase(), name: `Pemasok ${id}`, isActive: true })),
    },
  };

  return { service: new ProcurementService(prisma as never), state };
}

describe('ProcurementService.convertRequisitionToPo', () => {
  it('requisition approved menjadi PO draf, berstatus converted, dan tertaut', async () => {
    const { service, state } = setup('approved');
    const res = await service.convertRequisitionToPo('t1', 'r1', { warehouseId: 'w1' });
    expect(state.status).toBe('converted');
    expect(state.pos).toHaveLength(1);
    expect(state.pos[0]).toMatchObject({ supplierId: 's1', status: 'draft' });
    expect(state.reqUpdate).toMatchObject({ purchaseOrderId: 'po1' });
    expect(res.purchaseOrders[0]).toMatchObject({ total: 10_000, lines: 1 });
    expect(state.orderedQty.get('l1')).toBe(10);
  });

  it('klik ganda: request kedua ditolak dan tidak membuat PO tambahan', async () => {
    const { service, state } = setup('approved');
    await service.convertRequisitionToPo('t1', 'r1', { warehouseId: 'w1' });
    await expect(service.convertRequisitionToPo('t1', 'r1', { warehouseId: 'w1' })).rejects.toThrow(ConflictException);
    expect(state.pos).toHaveLength(1);
  });

  it('kalah balapan di klaim atomik: PO tidak dibuat', async () => {
    // Pemeriksaan awal melihat "approved", tapi request lain sudah mengklaim.
    const { service, state } = setup('approved');
    const original = (service as unknown as { prisma: { purchaseRequisition: { findFirst: () => Promise<unknown> } } }).prisma
      .purchaseRequisition.findFirst;
    (service as unknown as { prisma: { purchaseRequisition: { findFirst: () => Promise<unknown> } } }).prisma
      .purchaseRequisition.findFirst = async () => {
      const row = (await original()) as Record<string, unknown>;
      state.status = 'converted'; // request lain menang tepat setelah pembacaan
      return { ...row, status: 'approved' };
    };
    await expect(service.convertRequisitionToPo('t1', 'r1', { warehouseId: 'w1' })).rejects.toThrow(ConflictException);
    expect(state.pos).toHaveLength(0);
  });

  it('hanya requisition approved yang bisa dikonversi', async () => {
    for (const status of ['draft', 'submitted', 'rejected'] as const) {
      const { service, state } = setup(status);
      await expect(service.convertRequisitionToPo('t1', 'r1', { warehouseId: 'w1' })).rejects.toThrow(BadRequestException);
      expect(state.pos).toHaveLength(0);
    }
  });

  it('gudang tidak ada ditolak', async () => {
    const { service } = setup('approved');
    await expect(service.convertRequisitionToPo('t1', 'r1', { warehouseId: 'nope' })).rejects.toThrow(NotFoundException);
  });

  it('item beda pemasok menjadi beberapa PO; PO pertama tertaut, sisanya dicatat di reason', async () => {
    const { service, state } = setup('approved', {
      lines: [
        { id: 'l1', productId: 'p1', supplier: 's1', cost: 1_000, qty: 10 },
        { id: 'l2', productId: 'p2', supplier: 's2', cost: 2_000, qty: 5 },
      ],
    });
    const res = await service.convertRequisitionToPo('t1', 'r1', { warehouseId: 'w1' });
    expect(state.pos.map((p) => p.supplierId).sort()).toEqual(['s1', 's2']);
    expect(res.purchaseOrders).toHaveLength(2);
    expect(state.reqUpdate?.purchaseOrderId).toBe('po1');
    expect(String(state.reqUpdate?.reason)).toContain(res.purchaseOrders[1].code);
    expect(String(state.reqUpdate?.reason)).toContain('stok tipis');
  });

  it('baris tanpa pemasok/harga membatalkan semuanya sebelum ada perubahan', async () => {
    const { service, state } = setup('approved', {
      lines: [{ id: 'l1', productId: 'p1', supplier: null, cost: 1_000, qty: 1 }],
    });
    await expect(service.convertRequisitionToPo('t1', 'r1', { warehouseId: 'w1' })).rejects.toThrow(BadRequestException);
    expect(state.status).toBe('approved');
    expect(state.pos).toHaveLength(0);
  });
});
