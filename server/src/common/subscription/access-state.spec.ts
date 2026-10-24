import { describe, expect, it } from 'vitest';
import {
  accessFor,
  accessMessage,
  isReadOnlyExempt,
  isWriteMethod,
  tenantStatusOf,
} from './access-state';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const PAST = new Date('2026-11-09T12:00:00.000Z');
const FUTURE = new Date('2026-11-20T12:00:00.000Z');

describe('accessFor', () => {
  it('trial berjalan, atau langganan aktif tanpa tanggal berakhir: akses penuh', () => {
    expect(accessFor({ subscription: { status: 'trialing', endsAt: FUTURE }, now: NOW }).mode).toBe('full');
    expect(accessFor({ subscription: { status: 'active', endsAt: null }, now: NOW }).mode).toBe('full');
  });

  it('trial yang sudah lewat tanggalnya: baca saja (trial_expired)', () => {
    expect(accessFor({ subscription: { status: 'trialing', endsAt: PAST }, now: NOW })).toMatchObject({
      mode: 'read_only',
      reason: 'trial_expired',
    });
  });

  it('langganan aktif yang masa berlakunya lewat: baca saja (period_ended), selaras dengan aturan kuota AI', () => {
    expect(accessFor({ subscription: { status: 'active', endsAt: PAST }, now: NOW })).toMatchObject({
      mode: 'read_only',
      reason: 'period_ended',
    });
  });

  it('langganan dibatalkan: baca saja (cancelled), walau tanggal berakhirnya kosong', () => {
    expect(accessFor({ subscription: { status: 'cancelled', endsAt: null }, now: NOW })).toMatchObject({
      mode: 'read_only',
      reason: 'cancelled',
    });
  });

  it('past_due masih dalam masa tenggang: akses penuh', () => {
    expect(accessFor({ subscription: { status: 'past_due', endsAt: null }, now: NOW }).mode).toBe('full');
  });

  it('tenant tanpa baris langganan tidak dikunci', () => {
    expect(accessFor({ subscription: null, now: NOW }).mode).toBe('full');
  });

  it('tenant ditangguhkan: suspended, mengalahkan langganan apa pun', () => {
    for (const subscription of [{ status: 'active', endsAt: null }, { status: 'trialing', endsAt: FUTURE }, null]) {
      expect(accessFor({ tenantStatus: 'suspended', subscription, now: NOW })).toMatchObject({
        mode: 'suspended',
        reason: 'suspended',
      });
    }
  });

  it('tepat pada detik berakhir masih penuh; sesaat setelahnya baca saja (sama dengan aturan kuota AI)', () => {
    expect(accessFor({ subscription: { status: 'trialing', endsAt: NOW }, now: NOW }).mode).toBe('full');
    expect(accessFor({ subscription: { status: 'trialing', endsAt: NOW }, now: new Date(NOW.getTime() + 1) }).mode).toBe('read_only');
  });
});

describe('tenantStatusOf', () => {
  it('membaca settings.status dan mengabaikan bentuk lain', () => {
    expect(tenantStatusOf({ status: 'suspended' })).toBe('suspended');
    expect(tenantStatusOf({ status: 'active' })).toBe('active');
    expect(tenantStatusOf({})).toBeNull();
    expect(tenantStatusOf(null)).toBeNull();
    expect(tenantStatusOf(['suspended'])).toBeNull();
    expect(tenantStatusOf({ status: 5 })).toBeNull();
  });
});

describe('isWriteMethod dan isReadOnlyExempt', () => {
  it('GET, HEAD, OPTIONS dianggap baca; sisanya tulis', () => {
    for (const m of ['GET', 'get', 'HEAD', 'OPTIONS']) expect(isWriteMethod(m)).toBe(false);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(isWriteMethod(m)).toBe(true);
  });

  it('hanya rute /v1/auth/ yang dikecualikan dari blokir baca saja (logout, logout-all, 2FA)', () => {
    expect(isReadOnlyExempt('/v1/auth/logout')).toBe(true);
    expect(isReadOnlyExempt('/v1/auth/logout-all?x=1')).toBe(true);
    expect(isReadOnlyExempt('/v1/sales/transactions')).toBe(false);
    expect(isReadOnlyExempt('/v1/ai/chat')).toBe(false);
    expect(isReadOnlyExempt('/v1/authors')).toBe(false);
  });
});

describe('accessMessage', () => {
  it('pesan menjelaskan keadaan dan jalan keluarnya', () => {
    expect(accessMessage({ mode: 'suspended', reason: 'suspended' } as any)).toMatch(/ditangguhkan/);
    expect(accessMessage({ mode: 'read_only', reason: 'trial_expired' } as any)).toMatch(/trial.*berakhir.*dibaca/);
    expect(accessMessage({ mode: 'read_only', reason: 'period_ended' } as any)).toMatch(/langganan.*berakhir.*dibaca/);
    expect(accessMessage({ mode: 'read_only', reason: 'cancelled' } as any)).toMatch(/dihentikan.*dibaca/);
  });
});
