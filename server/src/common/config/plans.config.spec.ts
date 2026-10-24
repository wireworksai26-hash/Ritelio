import { describe, expect, it } from 'vitest';
import {
  paidAiQuotaFor,
  planConfigProblems,
  trialAiQuota,
  trialDays,
  trialEndsAt,
} from './plans.config';

describe('plans.config: nilai bawaan sama dengan angka yang sebelumnya tertulis di kode', () => {
  it('trial 14 hari dan 1000 pertanyaan AI', () => {
    expect(trialDays({})).toBe(14);
    expect(trialAiQuota({})).toBe(1000);
  });

  it('kuota paket berbayar: basic 0, plus_ai 3000, custom 25000', () => {
    expect(paidAiQuotaFor('basic', {})).toBe(0);
    expect(paidAiQuotaFor('plus_ai', {})).toBe(3000);
    expect(paidAiQuotaFor('custom', {})).toBe(25000);
  });

  it('trialEndsAt menambah jumlah hari konfigurasi pada waktu awal', () => {
    const from = new Date('2026-10-01T00:00:00.000Z');
    expect(trialEndsAt(from, {}).toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(trialEndsAt(from, { TRIAL_DAYS: '30' }).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });
});

describe('plans.config: nilai dari environment', () => {
  it('membaca angka dari env dan mengabaikan spasi', () => {
    const env = { TRIAL_DAYS: ' 7 ', TRIAL_AI_QUOTA: '200', AI_QUOTA_BASIC: '5', AI_QUOTA_PLUS_AI: '1500', AI_QUOTA_CUSTOM: '60000' };
    expect(trialDays(env)).toBe(7);
    expect(trialAiQuota(env)).toBe(200);
    expect(paidAiQuotaFor('basic', env)).toBe(5);
    expect(paidAiQuotaFor('plus_ai', env)).toBe(1500);
    expect(paidAiQuotaFor('custom', env)).toBe(60000);
  });

  it('kuota 0 sah (mematikan AI), env kosong memakai bawaan', () => {
    expect(trialAiQuota({ TRIAL_AI_QUOTA: '0' })).toBe(0);
    expect(trialDays({ TRIAL_DAYS: '' })).toBe(14);
  });
});

describe('planConfigProblems', () => {
  it('kosong bila semua nilai sah atau tidak diisi', () => {
    expect(planConfigProblems({})).toEqual([]);
    expect(planConfigProblems({ TRIAL_DAYS: '14', AI_QUOTA_PLUS_AI: '0' })).toEqual([]);
  });

  it('menolak angka negatif, pecahan, dan teks', () => {
    const problems = planConfigProblems({ TRIAL_DAYS: '0', TRIAL_AI_QUOTA: '-5', AI_QUOTA_BASIC: '1.5', AI_QUOTA_CUSTOM: 'banyak' });
    expect(problems).toHaveLength(4);
    expect(problems.join(' ')).toMatch(/TRIAL_DAYS/);
    expect(problems.join(' ')).toMatch(/TRIAL_AI_QUOTA/);
    expect(problems.join(' ')).toMatch(/AI_QUOTA_BASIC/);
    expect(problems.join(' ')).toMatch(/AI_QUOTA_CUSTOM/);
  });
});
