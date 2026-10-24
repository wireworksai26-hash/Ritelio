import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SuperadminService } from './superadmin.service';

describe('SuperadminService', () => {
  const createMocks = () => {
    const prisma = {
      tenant: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Newsem', industryTemplate: 'manufacturing', subscriptionPlan: 'plus_ai', settings: {} }),
        update: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Newsem Updated', industryTemplate: 'manufacturing', subscriptionPlan: 'custom', settings: {} }),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      refreshSession: {
        count: vi.fn().mockResolvedValue(2),
      },
      aiUsageCounter: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      subscription: {
        findFirst: vi.fn().mockResolvedValue({ id: 'sub-1' }),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
      moduleCatalog: {
        findUnique: vi.fn().mockResolvedValue({ key: 'pos' }),
      },
      moduleConfig: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(prisma)),
    };
    const sessions = {
      revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    };
    const oneSignal = {
      getAdminConfig: vi.fn().mockReturnValue({ configured: false, history: [], devices: [] }),
      getPublicConfig: vi.fn().mockReturnValue({ configured: false }),
      updateConfig: vi.fn().mockResolvedValue({ configured: true }),
    };
    return { prisma, sessions, oneSignal, service: new SuperadminService(prisma as any, sessions as any, oneSignal as any) };
  };

  it('menolak non-superadmin mengubah tenant milik institusi lain (404 isolasi tenant)', async () => {
    const { service } = createMocks();
    await expect(
      service.updateTenant(
        'tenant-own',
        'tenant-foreign',
        { sub: 'u-owner', tenantId: 'tenant-own', role: 'owner', email: 'o@test.id' },
        { name: 'Hack' },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('mengizinkan superadmin mengubah paket langganan & mereset kuota AI lintas tenant', async () => {
    const { service, prisma } = createMocks();
    const res = await service.updateTenant(
      'tenant-global',
      'tenant-1',
      { sub: 'u-super', tenantId: 'tenant-global', role: 'superadmin', email: 'superadmin@retalio.id' },
      { subscriptionPlan: 'custom', resetAiQuota: true, status: 'active' },
    );
    expect(res.ok).toBe(true);
    expect(prisma.aiUsageCounter.upsert).toHaveBeenCalledTimes(1);
  });

  describe('pembatasan kolom paket, status, dan kuota (hanya superadmin platform)', () => {
    const owner = { sub: 'u-owner', tenantId: 'tenant-1', role: 'owner', email: 'o@test.id' };
    const admin = { sub: 'u-admin', tenantId: 'tenant-1', role: 'admin', email: 'a@test.id' };

    it.each([
      ['subscriptionPlan', { subscriptionPlan: 'custom' }],
      ['status', { status: 'active' }],
      ['aiQuotaLimit', { aiQuotaLimit: 999999 }],
      ['monthlyRevenue', { monthlyRevenue: 1 }],
      ['resetAiQuota', { resetAiQuota: true }],
    ])('menolak owner dan admin mengubah %s tenant sendiri', async (field, dto) => {
      for (const actor of [owner, admin]) {
        const { service, prisma } = createMocks();
        await expect(service.updateTenant('tenant-1', 'tenant-1', actor as any, dto as any)).rejects.toThrow(
          ForbiddenException,
        );
        await expect(service.updateTenant('tenant-1', 'tenant-1', actor as any, dto as any)).rejects.toThrow(
          new RegExp(field),
        );
        expect(prisma.tenant.update).not.toHaveBeenCalled();
      }
    });

    it('tetap mengizinkan owner mengubah nama dan template usaha tenant sendiri', async () => {
      const { service, prisma } = createMocks();
      const res = await service.updateTenant('tenant-1', 'tenant-1', owner as any, {
        name: 'Nama Baru',
        industryTemplate: 'retail',
      });
      expect(res.ok).toBe(true);
      expect(prisma.tenant.update).toHaveBeenCalledTimes(1);
    });

    it('menolak owner dan admin membuat tenant baru (hanya superadmin)', async () => {
      for (const actor of [owner, admin]) {
        const { service, prisma } = createMocks();
        await expect(
          service.createTenant('tenant-1', actor as any, { name: 'Tenant Siluman', industryTemplate: 'retail', subscriptionPlan: 'custom' } as any),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      }
    });
  });

  describe('sinkron baris langganan saat superadmin mengubah tenant', () => {
    const superadmin = { sub: 'u-super', tenantId: 'tenant-global', role: 'superadmin', email: 'superadmin@retalio.id' };

    it('status active mengaktifkan langganan terbaru dan menghapus tanggal berakhir (membuka kunci trial)', async () => {
      const { service, prisma } = createMocks();
      await service.updateTenant('tenant-global', 'tenant-1', superadmin as any, { status: 'active' });
      expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1' }, orderBy: { startedAt: 'desc' } }),
      );
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'active', endsAt: null },
      });
    });

    it('ganti paket dan kuota ikut ditulis ke langganan (kuota AI memakai baris ini, bukan JSON settings)', async () => {
      const { service, prisma } = createMocks();
      await service.updateTenant('tenant-global', 'tenant-1', superadmin as any, {
        subscriptionPlan: 'custom',
        aiQuotaLimit: 4000,
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { plan: 'custom', aiQuota: 4000 },
      });
    });

    it('membuat baris langganan bila tenant belum punya', async () => {
      const { service, prisma } = createMocks();
      prisma.subscription.findFirst.mockResolvedValue(null);
      await service.updateTenant('tenant-global', 'tenant-1', superadmin as any, { status: 'active' });
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: 'tenant-1', status: 'active', endsAt: null }),
      });
    });

    it('status suspended dan perubahan nama tidak menyentuh langganan', async () => {
      const { service, prisma } = createMocks();
      await service.updateTenant('tenant-global', 'tenant-1', superadmin as any, { status: 'suspended' });
      await service.updateTenant('tenant-global', 'tenant-1', superadmin as any, { name: 'Nama Baru' });
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });
  });

  describe('overview membaca langganan yang sebenarnya dipakai login dan AI', () => {
    const superadmin = { sub: 'u-super', tenantId: 'tenant-global', role: 'superadmin', email: 'superadmin@retalio.id' };
    const row = (over: Record<string, unknown>) => ({
      id: 't1',
      name: 'Tenant',
      industryTemplate: 'retail',
      subscriptionPlan: 'plus_ai',
      settings: {},
      createdAt: new Date('2026-10-01T00:00:00Z'),
      _count: { outlets: 1, users: 1 },
      usageCounters: [],
      modulesConfig: [],
      subscriptions: [],
      ...over,
    });
    const run = async (tenant: Record<string, unknown>) => {
      const { service, prisma } = createMocks();
      prisma.tenant.findMany.mockResolvedValue([tenant]);
      const res: any = await service.overview('tenant-global', superadmin as any);
      return res.tenants[0];
    };

    it('tenant trial: status trial, kuota dari langganan (bukan 3000 bawaan panel), tanggal berakhir tampil', async () => {
      const ends = new Date(Date.now() + 5 * 86_400_000);
      const t = await run(row({ subscriptions: [{ status: 'trialing', endsAt: ends, aiQuota: 1000 }] }));
      expect(t).toMatchObject({ status: 'trial', ai_quota_limit: 1000, access_mode: 'full', subscription_status: 'trialing' });
      expect(t.trial_ends_at).toBe(ends.toISOString());
    });

    it('trial habis: tetap berstatus trial tetapi access_mode read_only agar panel bisa menandainya', async () => {
      const t = await run(row({ subscriptions: [{ status: 'trialing', endsAt: new Date(Date.now() - 86_400_000), aiQuota: 1000 }] }));
      expect(t).toMatchObject({ status: 'trial', access_mode: 'read_only', access_reason: 'trial_expired' });
    });

    it('langganan aktif memakai kuota dari langganan walau JSON settings berkata lain', async () => {
      const t = await run(row({ settings: { status: 'trial', aiQuotaLimit: 99999 }, subscriptions: [{ status: 'active', endsAt: null, aiQuota: 2500 }] }));
      expect(t).toMatchObject({ status: 'active', ai_quota_limit: 2500, trial_ends_at: null, access_mode: 'full' });
    });

    it('tenant ditangguhkan: status suspended dan access_mode suspended', async () => {
      const t = await run(row({ settings: { status: 'suspended' }, subscriptions: [{ status: 'active', endsAt: null, aiQuota: 1000 }] }));
      expect(t).toMatchObject({ status: 'suspended', access_mode: 'suspended' });
    });

    it('paket custom ditandai tanpa batas kuota AI', async () => {
      const t = await run(row({ subscriptionPlan: 'custom', subscriptions: [{ status: 'active', endsAt: null, aiQuota: 25000 }] }));
      expect(t.ai_quota_unlimited).toBe(true);
    });

    it('tanpa baris langganan memakai cadangan dari settings dan kuota bawaan paket', async () => {
      const t = await run(row({ settings: { status: 'trial' }, subscriptions: [] }));
      expect(t).toMatchObject({ status: 'trial', ai_quota_limit: 3000, subscription_status: null });
    });
  });

  describe('membuka penangguhan tidak mengubah langganan', () => {
    const superadmin = { sub: 'u-super', tenantId: 'tenant-global', role: 'superadmin', email: 'superadmin@retalio.id' };

    it('tenant ditangguhkan lalu diaktifkan kembali: baris langganan tidak disentuh (trial tetap trial)', async () => {
      const { service, prisma } = createMocks();
      prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', name: 'N', industryTemplate: 'retail', subscriptionPlan: 'plus_ai', settings: { status: 'suspended' } });
      await service.updateTenant('tenant-global', 'tenant-1', superadmin as any, { status: 'active' });
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });

    it('tenant tidak ditangguhkan lalu diberi status active: langganan diaktifkan (membuka kunci)', async () => {
      const { service, prisma } = createMocks();
      await service.updateTenant('tenant-global', 'tenant-1', superadmin as any, { status: 'active' });
      expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { status: 'active', endsAt: null } });
    });
  });

  it('mencabut seluruh sesi refresh token saat revokeUserSessions dipanggil superadmin', async () => {
    const { service, prisma, sessions } = createMocks();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u-target',
      tenantId: 'tenant-1',
      role: 'owner',
      email: 'owner@newsembakery.id',
    });

    const res = await service.revokeUserSessions(
      'tenant-global',
      'u-target',
      { sub: 'u-super', tenantId: 'tenant-global', role: 'superadmin', email: 'superadmin@retalio.id' },
    );
    expect(res.ok).toBe(true);
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u-target', 'superadmin_force_logout');
  });

  it('menolak admin mencabut sesi akun owner di tenant yang sama', async () => {
    const { service, prisma } = createMocks();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u-owner',
      tenantId: 'tenant-1',
      role: 'owner',
      email: 'owner@newsembakery.id',
    });

    await expect(
      service.revokeUserSessions(
        'tenant-1',
        'u-owner',
        { sub: 'u-admin', tenantId: 'tenant-1', role: 'admin', email: 'admin@newsembakery.id' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
