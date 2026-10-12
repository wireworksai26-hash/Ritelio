import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PurchasingService } from './purchasing.service';

type PoStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

function setup(initial: PoStatus, opts: { supplierActive?: boolean; items?: number; raceLost?: boolean } = {}) {
  const state = { status: initial, claims: 0 };
  const items = Array.from({ length: opts.items ?? 1 }, (_, i) => ({
    id: `i${i}`,
    qty: 2,
    price: 50_000,
    product: { id: `p${i}`, name: `Barang ${i}`, unit: 'pcs' },
  }));

  const prisma = {
    company: {
      // dipakai defaultCompanyId() dan pencarian nama perusahaan
      findFirst: async () => ({ id: 'c1', name: 'Newsem Bakery' }),
    },
    purchaseOrder: {
      findFirst: async () => ({
        id: 'po1',
        code: 'PO-2026-001',
        status: state.status,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        supplier: {
          code: 'SUP-1',
          name: 'CV Maju',
          email: 'a@b.id',
          phone: '0812345',
          isActive: opts.supplierActive ?? true,
        },
        warehouse: { name: 'Gudang Pusat' },
        items,
      }),
      // Sengaja menghormati filter `status` dari service: kalau service lupa
      // memfilter, klaim ganda akan lolos dan test ini gagal.
      updateMany: async (args: { where: { status: string }; data: { status: PoStatus } }) => {
        state.claims++;
        if (opts.raceLost) {
          state.status = 'ordered';
          return { count: 0 };
        }
        if (state.status !== args.where.status) return { count: 0 };
        state.status = args.data.status;
        return { count: 1 };
      },
    },
  };

  const service = new PurchasingService(prisma as never, {} as never, {} as never);
  return { service, state };
}

describe('PurchasingService.sendOrder', () => {
  it('PO draft ditandai ordered dan mengembalikan bahan bagikan', async () => {
    const { service, state } = setup('draft');
    const res = await service.sendOrder('t1', 'po1');
    expect(state.status).toBe('ordered');
    expect(res.alreadySent).toBe(false);
    expect(res.share.total).toBe(100_000);
    expect(res.share.whatsappUrl).toContain('wa.me/62812345');
    expect(res.print.items[0]).toMatchObject({ qty: 2, price: 50_000, subtotal: 100_000 });
    expect(res.print.companyName).toBe('Newsem Bakery');
  });

  it('PO yang sudah ordered boleh dibagikan ulang tanpa klaim baru', async () => {
    const { service, state } = setup('ordered');
    const res = await service.sendOrder('t1', 'po1');
    expect(res.alreadySent).toBe(true);
    expect(state.claims).toBe(0);
    expect(state.status).toBe('ordered');
  });

  it('kalah balapan dari request lain: tidak error, ditandai alreadySent', async () => {
    const { service } = setup('draft', { raceLost: true });
    const res = await service.sendOrder('t1', 'po1');
    expect(res.alreadySent).toBe(true);
  });

  it('PO received/cancelled ditolak', async () => {
    for (const status of ['received', 'cancelled'] as const) {
      const { service, state } = setup(status);
      await expect(service.sendOrder('t1', 'po1')).rejects.toThrow(ConflictException);
      expect(state.claims).toBe(0);
    }
  });

  it('pemasok nonaktif atau PO tanpa item ditolak sebelum status berubah', async () => {
    const inactive = setup('draft', { supplierActive: false });
    await expect(inactive.service.sendOrder('t1', 'po1')).rejects.toThrow(BadRequestException);
    expect(inactive.state.status).toBe('draft');

    const empty = setup('draft', { items: 0 });
    await expect(empty.service.sendOrder('t1', 'po1')).rejects.toThrow(BadRequestException);
    expect(empty.state.status).toBe('draft');
  });

  it('PO tidak ditemukan', async () => {
    const prisma = {
      company: { findFirst: async () => ({ id: 'c1' }) },
      purchaseOrder: { findFirst: async () => null },
    };
    const service = new PurchasingService(prisma as never, {} as never, {} as never);
    await expect(service.sendOrder('t1', 'nope')).rejects.toThrow(NotFoundException);
  });
});
