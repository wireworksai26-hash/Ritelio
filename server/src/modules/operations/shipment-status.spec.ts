import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OperationsService } from './operations.service';
import { assertTransition, canTransition, claimShipmentStatus } from './shipment-status';

type Row = Record<string, unknown>;

/**
 * Fake Prisma stateful: menyimpan satu shipment, satu daftar event, dan satu daftar
 * pemanggilan stok/jurnal supaya test bisa membuktikan pengiriman TIDAK menyentuh keduanya.
 * `beforeClaim` memungkinkan menyisipkan "proses lain" tepat di antara baca dan klaim.
 */
function fakePrisma(initial: Row, hooks: { beforeClaim?: (s: { row: Row }) => void } = {}) {
  const shipmentState = { row: { id: 'sh-1', tenantId: 't1', companyId: 'c1', shippedAt: null, deliveredAt: null, receiverName: '', ...initial } as Row };
  const events: Row[] = [];
  const sideEffects: string[] = [];

  const prisma: Record<string, unknown> = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    shipment: {
      findFirst: async () => ({ ...shipmentState.row }),
      findFirstOrThrow: async () => ({ ...shipmentState.row }),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        hooks.beforeClaim?.(shipmentState);
        if (shipmentState.row.status !== where.status) return { count: 0 };
        shipmentState.row = { ...shipmentState.row, ...data };
        return { count: 1 };
      },
    },
    shipmentEvent: { create: async ({ data }: { data: Row }) => events.push(data) },
    inventoryStock: { update: async () => sideEffects.push('stock.update') },
    stockMovement: { create: async () => sideEffects.push('stock.movement') },
    journalHeader: { create: async () => sideEffects.push('journal') },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma, shipmentState, events, sideEffects };
}

const makeService = (prisma: unknown) =>
  new OperationsService(prisma as never, {} as never, {} as never, { submit: async () => undefined } as never);

describe('transisi status pengiriman', () => {
  it('mengizinkan alur normal dan panggilan ulang status yang sama', () => {
    expect(canTransition('pending', 'in_transit')).toBe(true);
    expect(canTransition('in_transit', 'delivered')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('delivered', 'delivered')).toBe(true);
  });

  it('menolak mundur dan keluar dari status akhir', () => {
    expect(canTransition('in_transit', 'pending')).toBe(false);
    expect(() => assertTransition('delivered', 'in_transit')).toThrow(ConflictException);
    expect(() => assertTransition('cancelled', 'delivered')).toThrow(ConflictException);
  });
});

describe('updateShipmentStatus', () => {
  it('mencatat shippedAt dan satu event timeline saat berangkat', async () => {
    const { prisma, events } = fakePrisma({ status: 'pending' });
    const result = await makeService(prisma).updateShipmentStatus('t1', 'sh-1', 'in_transit');
    expect(result.status).toBe('in_transit');
    expect(result.shippedAt).toBeInstanceOf(Date);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: 'in_transit', source: 'manual' });
  });

  it('idempotent: delivered kedua kali tidak menimpa deliveredAt dan tidak menambah event', async () => {
    const { prisma, shipmentState, events } = fakePrisma({ status: 'in_transit', shippedAt: new Date('2026-01-01') });
    const service = makeService(prisma);

    await service.updateShipmentStatus('t1', 'sh-1', 'delivered', 'Budi');
    const firstDeliveredAt = shipmentState.row.deliveredAt as Date;
    expect(firstDeliveredAt).toBeInstanceOf(Date);

    await new Promise((r) => setTimeout(r, 5));
    await service.updateShipmentStatus('t1', 'sh-1', 'delivered', 'Budi');
    expect((shipmentState.row.deliveredAt as Date).getTime()).toBe(firstDeliveredAt.getTime());
    expect(events).toHaveLength(1);
  });

  it('menolak shipment terkirim dikembalikan ke in_transit', async () => {
    const { prisma } = fakePrisma({ status: 'delivered' });
    await expect(makeService(prisma).updateShipmentStatus('t1', 'sh-1', 'in_transit')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('klaim atomik: proses lain mengubah status di antara baca dan tulis → Conflict, bukan timpa', async () => {
    let calls = 0;
    const { prisma, shipmentState, events } = fakePrisma(
      { status: 'pending' },
      {
        beforeClaim: (s) => {
          // Webhook kurir membatalkan tepat sebelum UI mengklaim in_transit.
          if (calls++ === 0) s.row = { ...s.row, status: 'cancelled' };
        },
      },
    );
    await expect(makeService(prisma).updateShipmentStatus('t1', 'sh-1', 'in_transit')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(shipmentState.row.status).toBe('cancelled');
    expect(events).toHaveLength(0);
  });

  it('TIDAK mengurangi stok dan TIDAK menjurnal (stok keluar sudah dicatat saat SO di-fulfil)', async () => {
    const { prisma, sideEffects } = fakePrisma({ status: 'pending' });
    const service = makeService(prisma);
    await service.updateShipmentStatus('t1', 'sh-1', 'in_transit');
    await service.updateShipmentStatus('t1', 'sh-1', 'delivered', 'Siti');
    expect(sideEffects).toEqual([]);
  });

  it('shipment lintas tenant tidak ditemukan', async () => {
    const { prisma } = fakePrisma({ status: 'pending' });
    (prisma.shipment as Record<string, unknown>).findFirst = async () => null;
    await expect(makeService(prisma).updateShipmentStatus('t1', 'sh-x', 'delivered')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('claimShipmentStatus', () => {
  it('delivered langsung dari pending mengisi shippedAt sekaligus', async () => {
    const { prisma, shipmentState } = fakePrisma({ status: 'pending' });
    const at = new Date('2026-03-03T10:00:00Z');
    const res = await claimShipmentStatus(prisma as never, {
      tenantId: 't1',
      companyId: 'c1',
      shipmentId: 'sh-1',
      to: 'delivered',
      at,
    });
    expect(res.changed).toBe(true);
    expect(shipmentState.row.shippedAt).toEqual(at);
    expect(shipmentState.row.deliveredAt).toEqual(at);
  });
});

describe('createMaintenancePlan', () => {
  function planPrisma(vehicle: Row | null) {
    const created: Row[] = [];
    const prisma = {
      company: { findFirst: async () => ({ id: 'c1' }) },
      vehicle: { findFirst: async () => vehicle },
      maintenancePlan: { create: async ({ data }: { data: Row }) => (created.push(data), data) },
    };
    return { prisma, created };
  }
  const base = { assetRef: 'GENSET-1', description: 'Ganti oli', intervalDays: 30 };

  it('memakai jatuh tempo pertama bila diberikan', async () => {
    const { prisma, created } = planPrisma(null);
    await makeService(prisma).createMaintenancePlan('t1', { ...base, firstDueAt: '2026-12-01' });
    expect((created[0].nextDueAt as Date).toISOString().slice(0, 10)).toBe('2026-12-01');
  });

  it('tanpa jatuh tempo pertama: hari ini + interval', async () => {
    const { prisma, created } = planPrisma(null);
    await makeService(prisma).createMaintenancePlan('t1', base);
    const days = Math.round(((created[0].nextDueAt as Date).getTime() - Date.now()) / 86400000);
    expect(days).toBe(30);
  });

  it('menolak kendaraan yang bukan milik tenant/perusahaan', async () => {
    const { prisma, created } = planPrisma(null);
    await expect(
      makeService(prisma).createMaintenancePlan('t1', { ...base, vehicleRefId: 'veh-lain' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(created).toHaveLength(0);
  });
});
