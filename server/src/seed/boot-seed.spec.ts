import { describe, expect, it } from 'vitest';
import { bootSeedPlan } from './boot-seed';

const MASTER = 'kunci-induk-untuk-tes-123';

describe('bootSeedPlan', () => {
  it('mati secara bawaan dan tidak berisik (tidak diminta)', () => {
    expect(bootSeedPlan({})).toMatchObject({ run: false, requested: false });
    expect(bootSeedPlan({ SEED_MASTER_SECRET: MASTER })).toMatchObject({ run: false, requested: false });
  });

  it('hanya nilai persis "yes" yang menyalakan (bukan true, 1, YES)', () => {
    for (const v of ['true', '1', 'YES', 'Yes', 'y', '']) {
      expect(bootSeedPlan({ SEED_BUSINESSES_ON_BOOT: v, SEED_MASTER_SECRET: MASTER }).run).toBe(false);
    }
    expect(bootSeedPlan({ SEED_BUSINESSES_ON_BOOT: 'yes', SEED_MASTER_SECRET: MASTER }).run).toBe(true);
  });

  it('diminta tanpa kunci induk: dilewati dan ditandai requested agar dicatat sebagai peringatan', () => {
    const plan = bootSeedPlan({ SEED_BUSINESSES_ON_BOOT: 'yes' });
    expect(plan).toMatchObject({ run: false, requested: true });
    expect(plan.reason).toMatch(/SEED_MASTER_SECRET/);
  });

  it('kunci induk pendek atau hanya spasi ditolak, bukan dibangkitkan acak diam-diam', () => {
    for (const secret of ['pendek', '   ', '123456789012345']) {
      const plan = bootSeedPlan({ SEED_BUSINESSES_ON_BOOT: 'yes', SEED_MASTER_SECRET: secret });
      expect(plan.run, `kunci "${secret}"`).toBe(false);
      expect(plan.requested).toBe(true);
    }
  });

  it('kunci induk tepat 16 karakter diterima', () => {
    expect(bootSeedPlan({ SEED_BUSINESSES_ON_BOOT: 'yes', SEED_MASTER_SECRET: 'a'.repeat(16) }).run).toBe(true);
  });

  it('data transaksi contoh ikut diisi secara bawaan, dan hanya "no" yang mematikannya', () => {
    const base = { SEED_BUSINESSES_ON_BOOT: 'yes', SEED_MASTER_SECRET: MASTER };
    expect(bootSeedPlan(base).demo).toBe(true);
    expect(bootSeedPlan({ ...base, SEED_DEMO_ON_BOOT: 'yes' }).demo).toBe(true);
    expect(bootSeedPlan({ ...base, SEED_DEMO_ON_BOOT: 'no' }).demo).toBe(false);
  });

  it('tanpa seed bisnis, data transaksi contoh tidak pernah jalan sendirian', () => {
    expect(bootSeedPlan({ SEED_DEMO_ON_BOOT: 'yes', SEED_MASTER_SECRET: MASTER }).demo).toBe(false);
    expect(bootSeedPlan({ SEED_BUSINESSES_ON_BOOT: 'yes' }).demo).toBe(false);
  });
});
