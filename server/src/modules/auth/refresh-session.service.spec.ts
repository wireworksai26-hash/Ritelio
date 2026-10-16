import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDurationMs, RefreshSessionService } from './refresh-session.service';

process.env.JWT_REFRESH_SECRET = 'r'.repeat(40);

function make() {
  const prisma: any = {
    refreshSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  return { prisma, service: new RefreshSessionService(prisma) };
}

const future = () => new Date(Date.now() + 3_600_000);

describe('RefreshSessionService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parseDurationMs', () => {
    expect(parseDurationMs('15m', 0)).toBe(900_000);
    expect(parseDurationMs('7d', 0)).toBe(7 * 86_400_000);
    expect(parseDurationMs('oops', 5)).toBe(5);
  });

  it('hanya menyimpan HMAC token, bukan token mentah', async () => {
    const { prisma, service } = make();
    const { token } = await service.start({ tenantId: 't', userId: 'u', mfaVerified: false });
    const stored = prisma.refreshSession.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(service.hash(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('token yang sudah dirotasi dipakai lagi -> seluruh family dicabut', async () => {
    const { prisma, service } = make();
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'r1',
      familyId: 'fam',
      userId: 'u',
      tenantId: 't',
      usedAt: new Date(),
      revokedAt: null,
      expiresAt: future(),
      familyExpiresAt: future(),
    });
    await expect(service.findUsable('lama')).rejects.toBeInstanceOf(UnauthorizedException);
    const call = prisma.refreshSession.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ familyId: 'fam', revokedAt: null });
    expect(call.data.revokedReason).toBe('reuse_detected');
  });

  it('token kedaluwarsa, dicabut, atau tak dikenal ditolak tanpa mencabut family', async () => {
    const { prisma, service } = make();
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'r',
      familyId: 'f',
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      familyExpiresAt: future(),
    });
    await expect(service.findUsable('x')).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.refreshSession.findUnique.mockResolvedValue({
      id: 'r',
      familyId: 'f',
      usedAt: null,
      revokedAt: new Date(),
      expiresAt: future(),
      familyExpiresAt: future(),
    });
    await expect(service.findUsable('x')).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.refreshSession.findUnique.mockResolvedValue(null);
    await expect(service.findUsable('x')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshSession.updateMany).not.toHaveBeenCalled();
  });

  it('rotasi yang kalah balapan dianggap pemakaian ulang dan mencabut family', async () => {
    const { prisma, service } = make();
    const row: any = { id: 'r1', familyId: 'fam', userId: 'u', tenantId: 't', familyExpiresAt: future() };
    prisma.refreshSession.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
    await expect(service.rotate(row, false)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshSession.create).not.toHaveBeenCalled();
    const revoke = prisma.refreshSession.updateMany.mock.calls.at(-1)[0];
    expect(revoke.data.revokedReason).toBe('reuse_detected');
  });

  it('rotasi sukses menandai token lama terpakai dan membuat token baru dalam family yang sama', async () => {
    const { prisma, service } = make();
    const row: any = { id: 'r1', familyId: 'fam', userId: 'u', tenantId: 't', familyExpiresAt: future() };
    const next = await service.rotate(row, true);
    expect(next).toBeTruthy();
    expect(prisma.refreshSession.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'r1', usedAt: null });
    expect(prisma.refreshSession.create.mock.calls[0][0].data).toMatchObject({ familyId: 'fam', mfaVerified: true });
  });

  it('logout-all mencabut semua sesi dan menyetel tokensValidAfter', async () => {
    const { prisma, service } = make();
    await service.revokeAllForUser('u', 'logout_all');
    expect(prisma.user.updateMany.mock.calls[0][0].data.tokensValidAfter).toBeInstanceOf(Date);
  });
});
