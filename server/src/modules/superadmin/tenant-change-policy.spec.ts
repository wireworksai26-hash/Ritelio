import { describe, expect, it } from 'vitest';
import { platformOnlyFieldsIn } from './tenant-change-policy';

describe('platformOnlyFieldsIn', () => {
  it('kosong untuk perubahan nama dan template saja', () => {
    expect(platformOnlyFieldsIn({ name: 'Toko Baru', industryTemplate: 'retail' })).toEqual([]);
    expect(platformOnlyFieldsIn({ modules: { pos: true } })).toEqual([]);
  });

  it('menyebut setiap kolom paket, status, kuota, dan pendapatan yang disertakan', () => {
    expect(
      platformOnlyFieldsIn({
        subscriptionPlan: 'custom',
        status: 'active',
        aiQuotaLimit: 10,
        monthlyRevenue: 5,
        resetAiQuota: true,
      }),
    ).toEqual(['subscriptionPlan', 'status', 'aiQuotaLimit', 'monthlyRevenue', 'resetAiQuota']);
  });

  it('menghitung nilai falsy yang sengaja dikirim (0 dan false) sebagai disentuh', () => {
    expect(platformOnlyFieldsIn({ aiQuotaLimit: 0, resetAiQuota: false })).toEqual(['aiQuotaLimit', 'resetAiQuota']);
  });
});
