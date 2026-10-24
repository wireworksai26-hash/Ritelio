import { describe, expect, it } from 'vitest';
import { resolveCorsOrigins, validateConfig } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};

describe('validateConfig CORS', () => {
  it('produksi menolak CORS_ORIGIN kosong', () => {
    expect(() => validateConfig({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGIN wajib/);
    expect(() => validateConfig({ ...base, NODE_ENV: 'production', CORS_ORIGIN: '  ' })).toThrow(/CORS_ORIGIN wajib/);
  });

  it('menolak wildcard di lingkungan mana pun', () => {
    expect(() => validateConfig({ ...base, CORS_ORIGIN: '*' })).toThrow(/wildcard/);
    expect(() => validateConfig({ ...base, NODE_ENV: 'production', CORS_ORIGIN: 'https://*.contoh.com' })).toThrow(/wildcard/);
  });

  it('produksi mewajibkan https (kecuali localhost) dan origin tanpa path', () => {
    expect(() => validateConfig({ ...base, NODE_ENV: 'production', CORS_ORIGIN: 'http://app.contoh.com' })).toThrow(/https/);
    expect(() => validateConfig({ ...base, NODE_ENV: 'production', CORS_ORIGIN: 'https://app.contoh.com/path' })).toThrow(/origin/);
    expect(() => validateConfig({ ...base, NODE_ENV: 'production', CORS_ORIGIN: 'https://app.contoh.com, https://admin.contoh.com' })).not.toThrow();
  });

  it('dev boleh kosong atau localhost', () => {
    expect(() => validateConfig({ ...base })).not.toThrow();
    expect(() => validateConfig({ ...base, CORS_ORIGIN: 'http://localhost:5173' })).not.toThrow();
  });
});

describe('resolveCorsOrigins (default domain Railway)', () => {
  it('CORS_ORIGIN yang diisi selalu menang', () => {
    expect(resolveCorsOrigins({ CORS_ORIGIN: 'https://a.com, https://b.com', RAILWAY_PUBLIC_DOMAIN: 'x.up.railway.app' })).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('kosong di Railway: memakai domain publik service itu sendiri', () => {
    expect(resolveCorsOrigins({ RAILWAY_PUBLIC_DOMAIN: 'ritelio-production.up.railway.app' })).toEqual([
      'https://ritelio-production.up.railway.app',
    ]);
  });

  it('kosong di luar Railway: tidak menebak apa pun', () => {
    expect(resolveCorsOrigins({})).toEqual([]);
    expect(resolveCorsOrigins({ CORS_ORIGIN: '   ' })).toEqual([]);
  });

  it('produksi di Railway tanpa CORS_ORIGIN lolos validasi berkat domain publiknya', () => {
    expect(() =>
      validateConfig({ ...base, NODE_ENV: 'production', RAILWAY_PUBLIC_DOMAIN: 'ritelio-production.up.railway.app' }),
    ).not.toThrow();
  });

  it('produksi non-Railway tanpa CORS_ORIGIN tetap ditolak', () => {
    expect(() => validateConfig({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGIN wajib/);
  });
});

describe('validateConfig lama trial dan kuota AI', () => {
  it('tidak diisi atau berisi bilangan bulat yang sah: lolos', () => {
    expect(() => validateConfig({ ...base })).not.toThrow();
    expect(() => validateConfig({ ...base, TRIAL_DAYS: '30', TRIAL_AI_QUOTA: '0', AI_QUOTA_PLUS_AI: '1500' })).not.toThrow();
  });

  it('menolak nilai yang bukan bilangan bulat sah dan menyebut nama variabelnya', () => {
    expect(() => validateConfig({ ...base, TRIAL_DAYS: '0' })).toThrow(/TRIAL_DAYS/);
    expect(() => validateConfig({ ...base, TRIAL_AI_QUOTA: '-1' })).toThrow(/TRIAL_AI_QUOTA/);
    expect(() => validateConfig({ ...base, AI_QUOTA_CUSTOM: 'tak terbatas' })).toThrow(/AI_QUOTA_CUSTOM/);
  });
});

describe('validateConfig rahasia webhook formulir', () => {
  it('tidak diisi atau kuat: lolos', () => {
    expect(() => validateConfig({ ...base })).not.toThrow();
    expect(() => validateConfig({ ...base, INTAKE_WEBHOOK_SECRET: 'c'.repeat(40) })).not.toThrow();
  });

  it('terlalu pendek, nilai contoh, atau sama dengan rahasia JWT: ditolak', () => {
    expect(() => validateConfig({ ...base, INTAKE_WEBHOOK_SECRET: 'pendek' })).toThrow(/INTAKE_WEBHOOK_SECRET minimal/);
    expect(() => validateConfig({ ...base, INTAKE_WEBHOOK_SECRET: 'ganti-dengan-' + 'x'.repeat(40) })).toThrow(/nilai contoh/);
    expect(() => validateConfig({ ...base, INTAKE_WEBHOOK_SECRET: base.JWT_SECRET })).toThrow(/berbeda dari rahasia JWT/);
  });
});
