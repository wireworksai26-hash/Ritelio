import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from './permissions.guard';

const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 5 * 86_400_000);

function setup(opts: {
  role?: string;
  tenantSettings?: unknown;
  subscription?: { status: string; endsAt: Date | null } | null;
  required?: string[];
  method?: string;
  url?: string;
}) {
  const dbUser = {
    permissions: {},
    isActive: true,
    role: opts.role ?? 'owner',
    tokensValidAfter: null,
    databaseRole: { permissions: [{ permissionKey: 'pos:write', effect: 'allow' }] },
    tenant: {
      settings: opts.tenantSettings ?? {},
      subscriptions: opts.subscription === undefined ? [{ status: 'active', endsAt: null }] : opts.subscription ? [opts.subscription] : [],
    },
  };
  const prisma = { user: { findFirst: vi.fn().mockResolvedValue(dbUser) } };
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(opts.required) };
  const req: any = {
    method: opts.method ?? 'GET',
    originalUrl: opts.url ?? '/v1/inventory/products',
    user: { sub: 'u1', tenantId: 't1', role: opts.role ?? 'owner', iat: Math.floor(Date.now() / 1000) },
  };
  const ctx: any = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  };
  return { guard: new PermissionsGuard(reflector as any, prisma as any), ctx, prisma };
}

describe('PermissionsGuard: keadaan akun (baca saja dan ditangguhkan)', () => {
  it('akun trial berjalan: tulis dan baca diizinkan', async () => {
    const { guard, ctx } = setup({ subscription: { status: 'trialing', endsAt: FUTURE }, method: 'POST', url: '/v1/sales/transactions' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('trial habis: membaca tetap boleh', async () => {
    const { guard, ctx } = setup({ subscription: { status: 'trialing', endsAt: PAST }, method: 'GET' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('trial habis: %s ditolak 403 dengan kode SUBSCRIPTION_READ_ONLY', async (method) => {
    const { guard, ctx } = setup({ subscription: { status: 'trialing', endsAt: PAST }, method, url: '/v1/sales/transactions' });
    const err = await guard.canActivate(ctx).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_READ_ONLY' });
    expect(String(err.getResponse().message)).toMatch(/trial.*berakhir.*dibaca/);
  });

  it('trial habis: permintaan ke AI (POST) juga ditolak, supaya akun yang berakhir tidak memakai kuota', async () => {
    const { guard, ctx } = setup({ subscription: { status: 'trialing', endsAt: PAST }, method: 'POST', url: '/v1/ai/chat' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('trial habis: rute /v1/auth/ (keluar dari semua perangkat, 2FA) tetap boleh ditulis', async () => {
    const { guard, ctx } = setup({ subscription: { status: 'trialing', endsAt: PAST }, method: 'POST', url: '/v1/auth/logout-all' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('langganan dibatalkan: baca saja, dan pesannya khusus', async () => {
    const { guard, ctx } = setup({ subscription: { status: 'cancelled', endsAt: null }, method: 'PATCH', url: '/v1/inventory/products/1' });
    const err = await guard.canActivate(ctx).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_READ_ONLY' });
    expect(String(err.getResponse().message)).toMatch(/dihentikan/);
  });

  it('tenant ditangguhkan: semua permintaan ditolak termasuk GET, dengan kode TENANT_SUSPENDED', async () => {
    for (const method of ['GET', 'POST']) {
      const { guard, ctx } = setup({ tenantSettings: { status: 'suspended' }, method });
      const err = await guard.canActivate(ctx).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ code: 'TENANT_SUSPENDED' });
    }
  });

  it('superadmin platform tidak pernah terkunci oleh status tenant atau langganan', async () => {
    const { guard, ctx } = setup({
      role: 'superadmin',
      tenantSettings: { status: 'suspended' },
      subscription: { status: 'cancelled', endsAt: PAST },
      method: 'PATCH',
      url: '/v1/superadmin/tenants/x',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('tenant tanpa baris langganan tidak dikunci', async () => {
    const { guard, ctx } = setup({ subscription: null, method: 'POST', url: '/v1/sales/transactions' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('pemeriksaan akses berlaku juga di rute tanpa @RequirePermissions', async () => {
    const { guard, ctx } = setup({ subscription: { status: 'trialing', endsAt: PAST }, method: 'POST', required: undefined, url: '/v1/notifications/x' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('izin peran tetap dicek lebih lanjut untuk akun yang aksesnya penuh', async () => {
    const { guard, ctx } = setup({ required: ['finance:write'], method: 'POST', url: '/v1/finance/x', role: 'cashier' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Akses ditolak/);
  });
});
