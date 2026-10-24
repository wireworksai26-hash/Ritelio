import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, isUsablePasswordHash } from './auth.service';

const PASSWORD = 'Sandi-Valid-2026';

function make(user: Record<string, unknown> | null, subscription: { status: string; endsAt: Date | null } | null = null) {
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue(user) },
    subscription: { findFirst: vi.fn().mockResolvedValue(subscription) },
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue('jwt') };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const sessions = { start: vi.fn().mockResolvedValue({ token: 'rt', familyId: 'f1' }) };
  const throttle = {
    loginKeys: vi.fn().mockReturnValue([]),
    assertNotLocked: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AuthService(prisma as never, jwt as never, audit as never, sessions as never, throttle as never);
  return { service, sessions, throttle };
}

const baseUser = (passwordHash: string) => ({
  id: 'u1',
  tenantId: 't1',
  email: 'a@b.co',
  name: 'A',
  role: 'staff',
  isActive: true,
  twoFactorEnabled: false,
  passwordHash,
  tenant: { name: 'T', subscriptionPlan: 'basic' },
});

describe('login dengan hash tidak valid', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['!pending-invite', '', '!', 'x'.repeat(60), '$2a$12$short'])(
    'akun dengan passwordHash %j tidak pernah bisa login (apa pun kata sandinya)',
    async (hash) => {
      const { service, sessions, throttle } = make(baseUser(hash));
      for (const attempt of [hash, PASSWORD, '!pending-invite']) {
        await expect(service.login({ email: 'a@b.co', password: attempt || 'x' })).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }
      expect(sessions.start).not.toHaveBeenCalled();
      expect(throttle.recordFailure).toHaveBeenCalled();
    },
  );

  it('hash bcrypt valid tetap bisa login', async () => {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const { service, sessions } = make(baseUser(hash));
    const res = await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(res.refreshToken).toBe('rt');
    expect(sessions.start).toHaveBeenCalled();
  });

  it('pesan error sama untuk email tak terdaftar dan sandi salah', async () => {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const a = make(baseUser(hash)).service.login({ email: 'a@b.co', password: 'salah-salah' });
    const b = make(null).service.login({ email: 'tidak@ada.co', password: 'salah-salah' });
    const [ea, eb] = await Promise.all([a.catch((e) => e), b.catch((e) => e)]);
    expect(ea.message).toBe(eb.message);
    expect(ea.getStatus()).toBe(eb.getStatus());
  });

  it('isUsablePasswordHash', () => {
    expect(isUsablePasswordHash('!pending-invite')).toBe(false);
    expect(isUsablePasswordHash(null)).toBe(false);
    expect(isUsablePasswordHash(bcrypt.hashSync('x', 4))).toBe(true);
  });
});

describe('login menurut keadaan akun (trial habis, ditangguhkan)', () => {
  beforeEach(() => vi.clearAllMocks());
  const PAST = new Date(Date.now() - 86_400_000);
  const FUTURE = new Date(Date.now() + 5 * 86_400_000);
  const owner = async (settings: unknown = {}) => ({
    ...baseUser(await bcrypt.hash(PASSWORD, 4)),
    role: 'owner',
    tenant: { name: 'T', subscriptionPlan: 'plus_ai', settings },
  });

  it('trial habis tetap bisa masuk dan menerima keadaan baca saja agar data masih bisa dilihat', async () => {
    const { service, sessions } = make(await owner(), { status: 'trialing', endsAt: PAST });
    const res: any = await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(sessions.start).toHaveBeenCalled();
    expect(res.access).toMatchObject({ mode: 'read_only', reason: 'trial_expired', subscriptionStatus: 'trialing' });
    expect(res.access.endsAt).toBe(PAST.toISOString());
  });

  it('trial berjalan menerima akses penuh', async () => {
    const { service } = make(await owner(), { status: 'trialing', endsAt: FUTURE });
    const res: any = await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(res.access).toMatchObject({ mode: 'full', reason: 'ok' });
  });

  it('tenant ditangguhkan ditolak masuk dengan kode TENANT_SUSPENDED dan tanpa membuat sesi', async () => {
    const { service, sessions } = make(await owner({ status: 'suspended' }), { status: 'active', endsAt: null });
    const err = await service.login({ email: 'a@b.co', password: PASSWORD }).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'TENANT_SUSPENDED' });
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('superadmin platform tidak dibatasi walau tenant-nya ditangguhkan', async () => {
    const user = { ...(await owner({ status: 'suspended' })), role: 'superadmin' };
    const { service } = make(user, { status: 'cancelled', endsAt: PAST });
    const res: any = await service.login({ email: 'a@b.co', password: PASSWORD });
    expect(res.access.mode).toBe('full');
  });
});
