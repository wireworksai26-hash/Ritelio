import { createHmac, randomBytes } from 'node:crypto';

type Env = Record<string, string | undefined>;

export const MIN_MASTER_LENGTH = 16;
export const SEED_PASSWORD_LENGTH = 14;

// Tanpa karakter yang mudah tertukar (I, l, 1, O, 0) supaya aman diketik dari layar.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGIT = '23456789';
const ALL = UPPER + LOWER + DIGIT;

/**
 * Kata sandi akun seed, diturunkan dari satu kunci induk dan email akun.
 *
 * - Deterministik: seed yang diulang menghasilkan kata sandi yang sama, tanpa menyimpan apa pun di repo.
 * - Setiap akun mendapat kata sandi berbeda; mengetahui satu tidak membuka yang lain.
 * - Selalu memenuhi kebijakan backend (>= 8 karakter, huruf besar, huruf kecil, angka).
 */
export function deriveSeedPassword(master: string, email: string): string {
  const bytes = createHmac('sha256', master).update(email.trim().toLowerCase()).digest(); // 32 byte
  const at = (i: number) => bytes[i];
  const chars: string[] = [
    UPPER[at(0) % UPPER.length],
    LOWER[at(1) % LOWER.length],
    DIGIT[at(2) % DIGIT.length],
  ];
  for (let i = 3; i < SEED_PASSWORD_LENGTH; i++) chars.push(ALL[at(i) % ALL.length]);

  // Acak posisi secara deterministik agar tiga karakter pertama tidak selalu besar-kecil-angka.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = at(SEED_PASSWORD_LENGTH + (i % (bytes.length - SEED_PASSWORD_LENGTH))) % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export interface MasterSecret {
  secret: string;
  /** true bila dibangkitkan acak karena tidak diberikan (hanya di luar produksi). */
  generated: boolean;
}

/**
 * SEED_MASTER_SECRET wajib di produksi (kata sandi akun nyata tidak boleh bergantung pada nilai yang
 * dibangkitkan lalu hilang). Di luar produksi, bila kosong dibangkitkan acak dan dicetak sekali.
 */
export function resolveMasterSecret(env: Env): MasterSecret {
  const given = env.SEED_MASTER_SECRET?.trim();
  if (given) {
    if (given.length < MIN_MASTER_LENGTH) {
      throw new Error(`SEED_MASTER_SECRET minimal ${MIN_MASTER_LENGTH} karakter.`);
    }
    return { secret: given, generated: false };
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'SEED_MASTER_SECRET wajib diisi di produksi (minimal 16 karakter, simpan di tempat aman). ' +
        'Kata sandi semua akun seed diturunkan dari nilai ini.',
    );
  }
  return { secret: randomBytes(18).toString('base64url'), generated: true };
}
