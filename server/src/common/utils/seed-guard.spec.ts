import { describe, expect, it } from 'vitest';
import { assertSeedAllowed, resolveSeedPasswords } from './seed-guard';

describe('seed guard', () => {
  it('menolak seed di produksi tanpa ALLOW_DESTRUCTIVE_SEED=yes', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/ditolak/);
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', ALLOW_DESTRUCTIVE_SEED: 'true' })).toThrow();
  });

  it('mengizinkan seed di produksi hanya dengan penanda eksplisit, dan selalu di dev', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', ALLOW_DESTRUCTIVE_SEED: 'yes' })).not.toThrow();
    expect(() => assertSeedAllowed({})).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('memakai default dev (admin123/ferry123) hanya di luar produksi', () => {
    const r = resolveSeedPasswords({});
    expect(r.usedDevDefaults).toBe(true);
    expect(r.passwords.owner).toBe('admin123');
    expect(r.passwords.manager).toBe('ferry123');
    expect(r.generated).toEqual([]);
  });

  it('di produksi tidak pernah memakai default: acak bila env kosong', () => {
    const r = resolveSeedPasswords({ NODE_ENV: 'production', ALLOW_DESTRUCTIVE_SEED: 'yes' });
    expect(r.usedDevDefaults).toBe(false);
    expect(r.generated.sort()).toEqual(['kelana', 'manager', 'owner', 'superadmin']);
    for (const pw of Object.values(r.passwords)) {
      expect(pw.length).toBeGreaterThanOrEqual(16);
      expect(['admin123', 'ferry123']).not.toContain(pw);
    }
    expect(new Set(Object.values(r.passwords)).size).toBe(4);
  });

  it('mengambil kata sandi dari env dan menolak yang lemah di produksi', () => {
    const r = resolveSeedPasswords({ NODE_ENV: 'production', SEED_ADMIN_PASSWORD: 'Sangat-Kuat-2026!', SEED_MANAGER_PASSWORD: 'Manager-Kuat-2026!' });
    expect(r.passwords.owner).toBe('Sangat-Kuat-2026!');
    expect(r.passwords.manager).toBe('Manager-Kuat-2026!');
    expect(r.generated).toEqual([]);
    expect(() => resolveSeedPasswords({ NODE_ENV: 'production', SEED_ADMIN_PASSWORD: 'pendek' })).toThrow(/minimal/);
  });
});
