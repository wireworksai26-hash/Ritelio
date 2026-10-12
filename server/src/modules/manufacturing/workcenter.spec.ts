import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { WorkCenterService } from './workcenter.service';

function mockPrisma(opts: {
  order?: Record<string, unknown> | null;
  configs?: Array<Record<string, unknown>>;
  checks?: Array<Record<string, unknown>>;
}) {
  const upserts: Record<string, unknown>[] = [];
  return {
    upserts,
    prisma: {
      company: { findFirst: async () => ({ id: 'c1' }) },
      productionOrder: {
        // Service memuat order dengan `include: { qualityChecks: true }`,
        // jadi mock harus menyatukan daftar pemeriksaan ke dalam order.
        findFirst: async () => (opts.order ? { ...opts.order, qualityChecks: opts.checks ?? [] } : null),
      },
      qcStageConfig: { findMany: async () => opts.configs ?? [] },
      qualityCheck: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          upserts.push(create);
          return create;
        },
      },
    },
  };
}

const order = { id: 'mo-1', tenantId: 't1', companyId: 'c1', productId: 'p1', status: 'released' };

const twoStages = [
  { stage: 'in_process', sortOrder: 1, isRequired: true, minPassPct: 100 },
  { stage: 'final', sortOrder: 2, isRequired: true, minPassPct: 100 },
];

describe('WorkCenterService.recordQc', () => {
  it('menolak tahap yang akan melewati tahap wajib sebelumnya', async () => {
    const { prisma } = mockPrisma({ order, configs: twoStages, checks: [] });
    const svc = new WorkCenterService(prisma as never);

    await expect(svc.recordQc('t1', 'mo-1', { stage: 'final', checkedQty: 10 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('menerima tahap berikutnya setelah tahap pertama lulus', async () => {
    const { prisma, upserts } = mockPrisma({
      order,
      configs: twoStages,
      checks: [{ stage: 'in_process', result: 'passed' }],
    });
    const svc = new WorkCenterService(prisma as never);

    const result = await svc.recordQc('t1', 'mo-1', { stage: 'final', checkedQty: 10, defectQty: 0 });
    expect(result.result).toBe('passed');
    expect(upserts).toHaveLength(1);
  });

  it('menolak tahap lanjutan kalau tahap sebelumnya gagal', async () => {
    const { prisma } = mockPrisma({
      order,
      configs: twoStages,
      checks: [{ stage: 'in_process', result: 'failed' }],
    });
    const svc = new WorkCenterService(prisma as never);

    await expect(
      svc.recordQc('t1', 'mo-1', { stage: 'final', checkedQty: 10 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('menolak tahap yang tidak ada di konfigurasi', async () => {
    const { prisma } = mockPrisma({ order, configs: twoStages, checks: [] });
    const svc = new WorkCenterService(prisma as never);

    await expect(
      svc.recordQc('t1', 'mo-1', { stage: 'incoming', checkedQty: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('mengizinkan pemeriksaan bebas bila produk belum punya konfigurasi', async () => {
    const { prisma, upserts } = mockPrisma({ order, configs: [] });
    const svc = new WorkCenterService(prisma as never);

    await svc.recordQc('t1', 'mo-1', { stage: 'final', checkedQty: 3 });
    expect(upserts).toHaveLength(1);
  });

  it('menandai gagal bila ada cacat', async () => {
    const { prisma, upserts } = mockPrisma({ order, configs: [] });
    const svc = new WorkCenterService(prisma as never);

    await svc.recordQc('t1', 'mo-1', { stage: 'final', checkedQty: 10, defectQty: 1 });
    expect(upserts[0].result).toBe('failed');
  });

  it('menolak jumlah cacat melebihi yang diperiksa', async () => {
    const { prisma } = mockPrisma({ order, configs: [] });
    const svc = new WorkCenterService(prisma as never);

    await expect(
      svc.recordQc('t1', 'mo-1', { stage: 'final', checkedQty: 5, defectQty: 9 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('menolak QC pada order yang sudah selesai', async () => {
    const { prisma } = mockPrisma({ order: { ...order, status: 'completed' }, configs: [] });
    const svc = new WorkCenterService(prisma as never);

    await expect(svc.recordQc('t1', 'mo-1', { stage: 'final', checkedQty: 5 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('WorkCenterService.qcProgress', () => {
  it('menandai siap selesai hanya bila semua tahap lulus', async () => {
    const { prisma } = mockPrisma({
      order,
      configs: twoStages,
      checks: [
        { stage: 'in_process', result: 'passed' },
        { stage: 'final', result: 'passed' },
      ],
    });
    const svc = new WorkCenterService(prisma as never);

    const progress = await svc.qcProgress('t1', 'mo-1');
    expect(progress.readyToComplete).toBe(true);
    expect(progress.pending).toBe(0);
  });

  it('menandai belum siap selama masih ada tahap pending', async () => {
    const { prisma } = mockPrisma({
      order,
      configs: twoStages,
      checks: [{ stage: 'in_process', result: 'passed' }],
    });
    const svc = new WorkCenterService(prisma as never);

    const progress = await svc.qcProgress('t1', 'mo-1');
    expect(progress.readyToComplete).toBe(false);
    expect(progress.pending).toBe(1);
  });
});