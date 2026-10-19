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
