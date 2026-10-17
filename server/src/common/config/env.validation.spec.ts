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
