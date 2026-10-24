import { describe, expect, it } from 'vitest';
import { defaultAiQuotaFor, subscriptionChangeFor } from './subscription-sync';

describe('defaultAiQuotaFor', () => {
  it('basic tanpa AI, plus_ai 3000, custom 25000 (sama dengan bawaan pembuatan tenant)', () => {
    expect(defaultAiQuotaFor('basic')).toBe(0);
    expect(defaultAiQuotaFor('plus_ai')).toBe(3000);
    expect(defaultAiQuotaFor('custom')).toBe(25000);
  });
});

describe('subscriptionChangeFor', () => {
  it('status active membuka kunci trial: langganan active dan tanpa tanggal berakhir', () => {
    expect(subscriptionChangeFor({ dto: { status: 'active' }, currentPlan: 'plus_ai' })).toEqual({
      status: 'active',
      endsAt: null,
    });
  });

  it('status trial mengembalikan langganan ke trialing tanpa mengubah tanggal berakhir', () => {
    expect(subscriptionChangeFor({ dto: { status: 'trial' }, currentPlan: 'plus_ai' })).toEqual({ status: 'trialing' });
  });

  it('status suspended tidak mengubah langganan (menghindari membuka kunci trial yang sudah habis)', () => {
    expect(subscriptionChangeFor({ dto: { status: 'suspended' }, currentPlan: 'plus_ai' })).toBeNull();
  });

  it('ganti paket menyalin paket dan memakai kuota bawaan paket baru', () => {
    expect(subscriptionChangeFor({ dto: { subscriptionPlan: 'basic' }, currentPlan: 'plus_ai' })).toEqual({
      plan: 'basic',
      aiQuota: 0,
    });
    expect(subscriptionChangeFor({ dto: { subscriptionPlan: 'plus_ai' }, currentPlan: 'basic' })).toEqual({
      plan: 'plus_ai',
      aiQuota: 3000,
    });
  });

  it('paket yang dikirim sama dengan paket sekarang tidak mereset kuota', () => {
    expect(subscriptionChangeFor({ dto: { subscriptionPlan: 'plus_ai' }, currentPlan: 'plus_ai' })).toBeNull();
  });

  it('kuota eksplisit mengalahkan kuota bawaan paket, dan dapat dikirim sendirian', () => {
    expect(subscriptionChangeFor({ dto: { subscriptionPlan: 'custom', aiQuotaLimit: 500 }, currentPlan: 'basic' })).toEqual({
      plan: 'custom',
      aiQuota: 500,
    });
    expect(subscriptionChangeFor({ dto: { aiQuotaLimit: 0 }, currentPlan: 'plus_ai' })).toEqual({ aiQuota: 0 });
  });

  it('simpan dari modal panel (paket sama + status active + kuota) hanya mengubah status dan kuota', () => {
    expect(
      subscriptionChangeFor({
        dto: { subscriptionPlan: 'plus_ai', status: 'active', aiQuotaLimit: 800 },
        currentPlan: 'plus_ai',
      }),
    ).toEqual({ status: 'active', endsAt: null, aiQuota: 800 });
  });

  it('tanpa kolom langganan (mis. hanya nama) tidak menyentuh langganan', () => {
    expect(subscriptionChangeFor({ dto: { name: 'X' } as any, currentPlan: 'plus_ai' })).toBeNull();
  });
});
