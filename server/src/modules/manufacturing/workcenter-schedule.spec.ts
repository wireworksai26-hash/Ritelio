import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WorkCenterService } from './workcenter.service';

type Row = Record<string, any>;

function setup(existing: Array<{ startMinutes: number; durationMinutes: number; number?: string }> = [], wcOver: Row = {}) {
  const created: Row[] = [];
  const tx: Row = {
    $executeRaw: vi.fn(async () => 1),
    productionSchedule: {
      findMany: vi.fn(async () =>
        existing.map((e) => ({ ...e, productionOrder: { number: e.number ?? 'MO-1' } })),
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        created.push(data);
        return { id: 's-new', ...data };
      }),
    },
  };
  const prisma: Row = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    workCenter: { findFirst: async () => ({ id: 'wc1', name: 'Oven', capacityMinutes: 480, ...wcOver }) },
    productionOrder: { findFirst: async () => ({ id: 'mo-2', number: 'MO-2', status: 'planned' }) },
    $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  };
  return { service: new WorkCenterService(prisma as never), created, tx };
}

const dto = (over: Row = {}) => ({
  workCenterId: 'wc1',
  productionOrderId: 'mo-2',
  scheduledDate: '2026-12-01',
  startMinutes: 0,
  durationMinutes: 60,
  ...over,
});

describe('WorkCenterService.schedule — jadwal bentrok & kapasitas', () => {
  it('menolak jadwal yang jamnya beririsan dengan jadwal lain di work center & hari yang sama', async () => {
    const { service, created } = setup([{ startMinutes: 0, durationMinutes: 300, number: 'MO-1' }]);
    await expect(service.schedule('t1', dto({ startMinutes: 100, durationMinutes: 100 }) as never)).rejects.toThrow(/bentrok dengan MO-1/);
    expect(created).toHaveLength(0);
  });

  it('lembur (allowOverCapacity) tetap tidak boleh menumpuk jam yang sama', async () => {
    const { service } = setup([{ startMinutes: 0, durationMinutes: 300 }]);
    await expect(
      service.schedule('t1', dto({ startMinutes: 100, durationMinutes: 100, allowOverCapacity: true }) as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('jadwal berdampingan (tanpa irisan) diterima', async () => {
    const { service, created } = setup([{ startMinutes: 0, durationMinutes: 300 }]);
    await service.schedule('t1', dto({ startMinutes: 300, durationMinutes: 100 }) as never);
    expect(created).toHaveLength(1);
  });

  it('menolak total kapasitas harian terlampaui (409)', async () => {
    const { service } = setup([{ startMinutes: 0, durationMinutes: 300 }]);
    await expect(service.schedule('t1', dto({ startMinutes: 300, durationMinutes: 200 }) as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('lembur di luar jam normal tanpa irisan diterima bila allowOverCapacity', async () => {
    const { service, created } = setup([{ startMinutes: 0, durationMinutes: 300 }]);
    await service.schedule('t1', dto({ startMinutes: 450, durationMinutes: 200, allowOverCapacity: true }) as never);
    expect(created).toHaveLength(1);
  });

  it('durasi 0 ditolak: jadwal tanpa durasi tidak punya makna kapasitas', async () => {
    const { service } = setup();
    await expect(service.schedule('t1', dto({ durationMinutes: 0 }) as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pemeriksaan & insert dikunci per work center + hari (dua permintaan bersamaan tidak sama-sama lolos)', async () => {
    const { service, tx } = setup();
    await service.schedule('t1', dto() as never);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
