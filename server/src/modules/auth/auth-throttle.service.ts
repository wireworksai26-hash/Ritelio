import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';

export interface ThrottleKey {
  key: string;
  /** Jumlah kegagalan dalam jendela sebelum kunci terkunci. */
  limit: number;
}

const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

/**
 * Penghitung kegagalan login yang disimpan di database (bukan memori proses),
 * sehingga tetap berlaku di banyak instance dan setelah restart.
 *
 * Kunci memakai hash, tidak bergantung pada ada/tidaknya akun, sehingga respons
 * untuk email yang tidak terdaftar identik dengan email terdaftar:
 *  - akun+IP  : 5 gagal   -> 15 menit (mengunci penyerang tanpa mengunci pemilik akun dari IP lain)
 *  - akun     : 15 gagal  -> 15 menit (menahan brute force terdistribusi)
 *  - IP       : 40 gagal  -> 15 menit (menahan credential stuffing lintas akun)
 */
@Injectable()
export class AuthThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 32);
  }

  loginKeys(email: string, ip: string | null | undefined): ThrottleKey[] {
    const account = this.digest(email.trim().toLowerCase());
    const addr = this.digest(ip ?? 'unknown');
    return [
      { key: `login:pair:${account}:${addr}`, limit: 5 },
      { key: `login:acct:${account}`, limit: 15 },
      { key: `login:ip:${addr}`, limit: 40 },
    ];
  }

  /** Lempar 429 bila salah satu kunci sedang terkunci. */
  async assertNotLocked(keys: ThrottleKey[]): Promise<void> {
    const rows = await this.prisma.authAttempt.findMany({
      where: { key: { in: keys.map((k) => k.key) }, lockedUntil: { gt: new Date() } },
      select: { lockedUntil: true },
    });
    if (rows.length === 0) return;
    const until = Math.max(...rows.map((r) => r.lockedUntil!.getTime()));
    const retryAfter = Math.max(1, Math.ceil((until - Date.now()) / 1000));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.',
        error: 'Too Many Requests',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Catat satu kegagalan pada semua kunci (atomik per kunci). */
  async recordFailure(keys: ThrottleKey[]): Promise<void> {
    await Promise.all(
      keys.map(
        (k) => this.prisma.$executeRaw`
        INSERT INTO auth_attempts ("key", failures, window_start, locked_until, updated_at)
        VALUES (${k.key}, 1, timezone('utc', now()), NULL, timezone('utc', now()))
        ON CONFLICT ("key") DO UPDATE SET
          failures = CASE
            WHEN auth_attempts.window_start < timezone('utc', now()) - make_interval(mins => ${WINDOW_MINUTES}::int) THEN 1
            ELSE auth_attempts.failures + 1 END,
          window_start = CASE
            WHEN auth_attempts.window_start < timezone('utc', now()) - make_interval(mins => ${WINDOW_MINUTES}::int) THEN timezone('utc', now())
            ELSE auth_attempts.window_start END,
          locked_until = CASE
            WHEN (CASE
                    WHEN auth_attempts.window_start < timezone('utc', now()) - make_interval(mins => ${WINDOW_MINUTES}::int) THEN 1
                    ELSE auth_attempts.failures + 1 END) >= ${k.limit}::int
              THEN timezone('utc', now()) + make_interval(mins => ${LOCK_MINUTES}::int)
            ELSE auth_attempts.locked_until END,
          updated_at = timezone('utc', now())`,
      ),
    );
  }

  /** Login sukses: hapus penghitung akun dan akun+IP (penghitung IP dibiarkan meluruh). */
  async recordSuccess(keys: ThrottleKey[]): Promise<void> {
    const reset = keys.filter((k) => !k.key.startsWith('login:ip:')).map((k) => k.key);
    if (reset.length === 0) return;
    await this.prisma.authAttempt.deleteMany({ where: { key: { in: reset } } });
  }
}
