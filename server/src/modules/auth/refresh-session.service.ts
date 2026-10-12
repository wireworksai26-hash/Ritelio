import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { RefreshSession } from '@prisma/client';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';

export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

const INVALID = 'Refresh token tidak valid. Silakan login ulang.';

/** '15m' | '7d' | '12h' | '30s' | angka (detik) -> milidetik. */
export function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const match = /^\s*(\d+)\s*([smhd]?)\s*$/i.exec(value);
  if (!match) return fallbackMs;
  const n = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const mult = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1_000;
  return n * mult;
}

/**
 * Siklus hidup refresh token:
 *  - token mentah acak 48 byte, hanya HMAC-SHA256-nya yang disimpan;
 *  - setiap pemakaian MEROTASI token (baris lama ditandai usedAt, baris baru dibuat
 *    dalam family yang sama);
 *  - memakai ulang token yang sudah dirotasi = indikasi pencurian -> seluruh family dicabut;
 *  - umur token idle dibatasi JWT_REFRESH_EXPIRES_IN, umur family dibatasi SESSION_MAX_DAYS;
 *  - jumlah sesi aktif per user dibatasi MAX_SESSIONS_PER_USER (yang tertua dicabut).
 */
@Injectable()
export class RefreshSessionService {
  private readonly logger = new Logger(RefreshSessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  hash(token: string): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) throw new Error('JWT_REFRESH_SECRET belum diset');
    return createHmac('sha256', secret).update(token).digest('hex');
  }

  private idleTtlMs(): number {
    return parseDurationMs(process.env.JWT_REFRESH_EXPIRES_IN, 7 * 86_400_000);
  }

  private familyTtlMs(): number {
    const days = Number(process.env.SESSION_MAX_DAYS ?? 30);
    return (Number.isFinite(days) && days > 0 ? days : 30) * 86_400_000;
  }

  private maxSessions(): number {
    const n = Number(process.env.MAX_SESSIONS_PER_USER ?? 10);
    return Number.isInteger(n) && n > 0 ? n : 10;
  }

  /** Mulai sesi (family) baru saat login/register. Mengembalikan token mentah. */
  async start(params: {
    tenantId: string;
    userId: string;
    mfaVerified: boolean;
    ctx?: SessionContext;
  }): Promise<{ token: string; familyId: string }> {
    const now = Date.now();
    const familyId = randomUUID();
    const token = await this.insert({
      tenantId: params.tenantId,
      userId: params.userId,
      familyId,
      mfaVerified: params.mfaVerified,
      familyExpiresAt: new Date(now + this.familyTtlMs()),
      ctx: params.ctx,
    });
    await this.enforceSessionCap(params.userId);
    if (Math.random() < 0.05) void this.purgeExpired();
    return { token, familyId };
  }

  private async insert(params: {
    tenantId: string;
    userId: string;
    familyId: string;
    mfaVerified: boolean;
    familyExpiresAt: Date;
    ctx?: SessionContext;
    db?: Pick<PrismaService, 'refreshSession'>;
  }): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    const idleExpiry = Date.now() + this.idleTtlMs();
    await (params.db ?? this.prisma).refreshSession.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        familyId: params.familyId,
        tokenHash: this.hash(token),
        mfaVerified: params.mfaVerified,
        expiresAt: new Date(Math.min(idleExpiry, params.familyExpiresAt.getTime())),
        familyExpiresAt: params.familyExpiresAt,
        ipAddress: params.ctx?.ip?.slice(0, 64) ?? null,
        userAgent: params.ctx?.userAgent?.slice(0, 255) ?? null,
      },
    });
    return token;
  }

  /**
   * Cari sesi untuk token mentah dan tolak bila tidak sah. Token yang sudah
   * dirotasi memicu pencabutan family (reuse detection).
   */
  async findUsable(token: string): Promise<RefreshSession> {
    const row = await this.prisma.refreshSession.findUnique({ where: { tokenHash: this.hash(token) } });
    if (!row) throw new UnauthorizedException(INVALID);
    if (row.revokedAt) throw new UnauthorizedException(INVALID);
    if (row.usedAt) {
      await this.revokeFamily(row.familyId, 'reuse_detected');
      this.logger.warn(`Refresh token dipakai ulang: user=${row.userId} family=${row.familyId}`);
      throw new ReuseDetectedException(row);
    }
    if (row.expiresAt.getTime() <= Date.now() || row.familyExpiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(INVALID);
    }
    return row;
  }

  /**
   * Rotasi atomik: tandai token lama terpakai lalu terbitkan token baru dalam
   * family yang sama. Bila dua request berlomba memakai token yang sama, hanya
   * satu yang menang; yang kalah dianggap pemakaian ulang.
   */
  async rotate(row: RefreshSession, mfaVerified: boolean, ctx?: SessionContext): Promise<string> {
    return this.prisma
      .$transaction(async (tx) => {
        const claimed = await tx.refreshSession.updateMany({
          where: { id: row.id, usedAt: null, revokedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new ReuseDetectedException(row);
        return this.insert({
          tenantId: row.tenantId,
          userId: row.userId,
          familyId: row.familyId,
          mfaVerified,
          familyExpiresAt: row.familyExpiresAt,
          ctx,
          db: tx,
        });
      })
      .catch(async (err) => {
        if (err instanceof ReuseDetectedException) {
          await this.revokeFamily(row.familyId, 'reuse_detected');
          throw new UnauthorizedException(INVALID);
        }
        throw err;
      });
  }

  async revokeFamily(familyId: string, reason: string): Promise<number> {
    const res = await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return res.count;
  }

  /** Cabut sesi milik token ini (logout). Idempoten: token tak dikenal diabaikan. */
  async revokeByToken(token: string): Promise<{ userId: string; tenantId: string } | null> {
    const row = await this.prisma.refreshSession.findUnique({ where: { tokenHash: this.hash(token) } });
    if (!row) return null;
    await this.revokeFamily(row.familyId, 'logout');
    return { userId: row.userId, tenantId: row.tenantId };
  }

  /** Cabut semua sesi user dan batalkan access token yang sudah terbit. */
  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const [res] = await this.prisma.$transaction([
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
      this.prisma.user.updateMany({ where: { id: userId }, data: { tokensValidAfter: new Date() } }),
    ]);
    return res.count;
  }

  /** Setelah 2FA diaktifkan, sesi lama (tanpa OTP) tidak boleh diperpanjang lagi. */
  async downgradeMfa(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { mfaVerified: false },
    });
  }

  private async enforceSessionCap(userId: string): Promise<void> {
    const live = await this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { familyId: true },
    });
    const cap = this.maxSessions();
    if (live.length <= cap) return;
    const surplus = live.slice(cap).map((r) => r.familyId);
    await this.prisma.refreshSession.updateMany({
      where: { familyId: { in: surplus }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'session_cap' },
    });
  }

  private async purgeExpired(): Promise<void> {
    await this.prisma.refreshSession
      .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } })
      .catch(() => undefined);
  }
}

/** Internal: dipakai untuk membedakan pemakaian ulang dari token sekadar tidak valid. */
export class ReuseDetectedException extends UnauthorizedException {
  constructor(readonly session: RefreshSession) {
    super(INVALID);
  }
}
