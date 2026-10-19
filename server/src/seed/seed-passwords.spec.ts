import { describe, expect, it } from 'vitest';
import { IsStrongPassword } from '../modules/auth/dto/password-policy.decorator';
import { validateSync } from 'class-validator';
import { SEED_PASSWORD_LENGTH, deriveSeedPassword, resolveMasterSecret } from './seed-passwords';

const MASTER = 'master-rahasia-untuk-tes-123';

// Memakai validator backend yang sebenarnya, bukan salinan aturannya.
class Probe {
  @IsStrongPassword()
  password!: string;
}
const acceptedByBackend = (password: string): boolean => {
  const p = new Probe();
  p.password = password;
  return validateSync(p).length === 0;
};

describe('deriveSeedPassword', () => {
  it('deterministik: master dan email sama menghasilkan kata sandi sama', () => {
    expect(deriveSeedPassword(MASTER, 'owner@kopisenja.id')).toBe(deriveSeedPassword(MASTER, 'owner@kopisenja.id'));
  });

  it('email dinormalisasi (huruf besar dan spasi tidak mengubah hasil)', () => {
    expect(deriveSeedPassword(MASTER, '  Owner@KopiSenja.ID ')).toBe(deriveSeedPassword(MASTER, 'owner@kopisenja.id'));
  });

  it('akun berbeda mendapat kata sandi berbeda; master berbeda juga berbeda', () => {
    const a = deriveSeedPassword(MASTER, 'owner@kopisenja.id');
    expect(deriveSeedPassword(MASTER, 'kasir@kopisenja.id')).not.toBe(a);
    expect(deriveSeedPassword('master-lain-yang-juga-panjang', 'owner@kopisenja.id')).not.toBe(a);
  });

  it('selalu diterima oleh kebijakan kata sandi backend, untuk banyak akun', () => {
    for (let i = 0; i < 500; i++) {
      const pw = deriveSeedPassword(MASTER, `akun${i}@contoh.id`);
      expect(pw).toHaveLength(SEED_PASSWORD_LENGTH);
      expect(acceptedByBackend(pw)).toBe(true);
    }
  });

  it('tidak memuat karakter yang mudah tertukar (I l 1 O 0)', () => {
    for (let i = 0; i < 300; i++) {
      expect(deriveSeedPassword(MASTER, `akun${i}@contoh.id`)).not.toMatch(/[Il1O0]/);
    }
  });

  it('posisi huruf besar/kecil/angka tidak selalu sama (sudah diacak)', () => {
    const firstThree = new Set(
      Array.from({ length: 60 }, (_, i) => deriveSeedPassword(MASTER, `akun${i}@contoh.id`).slice(0, 3).replace(/[A-Z]/g, 'U').replace(/[a-z]/g, 'l').replace(/\d/g, 'd')),
    );
    expect(firstThree.size).toBeGreaterThan(1);
  });
});

describe('resolveMasterSecret', () => {
  it('memakai SEED_MASTER_SECRET bila diisi', () => {
    expect(resolveMasterSecret({ SEED_MASTER_SECRET: ` ${MASTER} ` })).toEqual({ secret: MASTER, generated: false });
  });

  it('menolak master pendek, di lingkungan mana pun', () => {
    expect(() => resolveMasterSecret({ SEED_MASTER_SECRET: 'pendek' })).toThrow(/minimal 16/);
    expect(() => resolveMasterSecret({ SEED_MASTER_SECRET: 'pendek', NODE_ENV: 'production' })).toThrow(/minimal 16/);
  });

  it('produksi tanpa master ditolak (tidak membangkitkan acak diam-diam)', () => {
    expect(() => resolveMasterSecret({ NODE_ENV: 'production' })).toThrow(/wajib diisi di produksi/);
  });

  it('di luar produksi tanpa master membangkitkan yang acak dan unik', () => {
    const a = resolveMasterSecret({});
    const b = resolveMasterSecret({});
    expect(a.generated).toBe(true);
    expect(a.secret.length).toBeGreaterThanOrEqual(16);
    expect(a.secret).not.toBe(b.secret);
  });
});
