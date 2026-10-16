import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CrmService } from './crm.service';

type Row = Record<string, any>;

function setup(state: { so?: Row; opp?: Row; claimCount?: number; lead?: Row | null; customer?: Row | null } = {}) {
  const so = { id: 'so-1', status: 'confirmed', ...state.so };
  const opp = { id: 'op-1', stage: 'prospecting', probability: 10, notes: '', ...state.opp };
  const prisma: Row = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    salesOrder: {
      findFirst: async () => so,
      updateMany: vi.fn(async () => ({ count: state.claimCount ?? 1 })),
      findUniqueOrThrow: async () => ({ ...so, status: 'cancelled' }),
    },
    opportunity: {
      findFirst: async () => opp,
      updateMany: vi.fn(async ({ data }: { data: Row }) => ({ count: state.claimCount ?? 1, data })),
      findUniqueOrThrow: async () => opp,
    },
    lead: { findFirst: async () => (state.lead === undefined ? { id: 'l1' } : state.lead) },
    customer: { findFirst: async () => (state.customer === undefined ? { id: 'cu1' } : state.customer) },
    customerInteraction: { create: vi.fn(async () => ({ id: 'i1' })) },
  };
  return { service: new CrmService(prisma as never, {} as never, {} as never), prisma };
}

describe('CrmService.cancel — klaim bersyarat', () => {
  it('SO yang sudah fulfilled tidak bisa dibatalkan', async () => {
    const { service, prisma } = setup({ so: { status: 'fulfilled' } });
    await expect(service.cancel('t1', 'so-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.salesOrder.updateMany).not.toHaveBeenCalled();
  });

  it('cancel yang berpapasan dengan fulfil kalah (count 0) -> 409, tidak menimpa status fulfilled', async () => {
    const { service, prisma } = setup({ claimCount: 0 });
    await expect(service.cancel('t1', 'so-1')).rejects.toBeInstanceOf(ConflictException);
    const where = (prisma.salesOrder.updateMany as any).mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['draft', 'confirmed'] });
  });

  it('SO yang sudah cancelled ditolak', async () => {
    const { service } = setup({ so: { status: 'cancelled' } });
    await expect(service.cancel('t1', 'so-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CrmService.moveOpportunity', () => {
  it('closed_lost bisa dicapai dari tahap terbuka mana pun (dulu mustahil karena aturan urutan)', async () => {
    for (const stage of ['prospecting', 'qualification', 'proposal', 'negotiation']) {
      const { service } = setup({ opp: { stage } });
      await expect(service.moveOpportunity('t1', 'op-1', { stage: 'closed_lost' } as never)).resolves.toBeTruthy();
    }
  });

  it('closed_won tetap harus berurutan (tidak boleh melompat dari prospecting)', async () => {
    const { service } = setup({ opp: { stage: 'prospecting' } });
    await expect(service.moveOpportunity('t1', 'op-1', { stage: 'closed_won' } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deal tertutup tidak bisa diubah lagi', async () => {
    const { service } = setup({ opp: { stage: 'closed_lost' } });
    await expect(service.moveOpportunity('t1', 'op-1', { stage: 'prospecting' } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('pemindahan bersamaan: yang kalah di klaim tahap asal mendapat 409', async () => {
    const { service } = setup({ claimCount: 0 });
    await expect(service.moveOpportunity('t1', 'op-1', { stage: 'qualification' } as never)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CrmService — referensi lintas tenant', () => {
  it('interaksi pada pelanggan yang bukan milik tenant ditolak 404 dan tidak ditulis', async () => {
    const { service, prisma } = setup({ customer: null });
    await expect(service.createInteraction('t1', 'cu-asing', 'u1', { summary: 'catatan' } as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customerInteraction.create).not.toHaveBeenCalled();
  });

  it('opportunity dengan lead asing ditolak 404', async () => {
    const { service } = setup({ lead: null });
    await expect(service.createOpportunity('t1', { title: 'Opp', leadId: 'lead-asing' } as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});
