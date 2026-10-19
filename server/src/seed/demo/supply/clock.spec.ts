import { afterEach, describe, expect, it } from 'vitest';
import { clampTarget, shiftedNow, withClock } from './clock';

describe('jam mundur', () => {
  const RealDate = Date;
  afterEach(() => {
    globalThis.Date = RealDate;
  });

  it('new Date() dan Date.now() di dalam blok mengikuti waktu target, lalu dipulihkan', async () => {
    const target = new Date(Date.now() - 40 * 86_400_000);
    let inside = 0;
    let insideNow = 0;
    await withClock(target, async () => {
      inside = new Date().getTime();
      insideNow = Date.now();
    });
    expect(Math.abs(inside - target.getTime())).toBeLessThan(2_000);
    expect(Math.abs(insideNow - target.getTime())).toBeLessThan(2_000);
    expect(globalThis.Date).toBe(RealDate);
    expect(Math.abs(Date.now() - new Date().getTime())).toBeLessThan(1_000);
    expect(Date.now()).toBeGreaterThan(target.getTime() + 39 * 86_400_000);
  });

  it('tanggal dengan argumen tidak disentuh dan hasilnya tetap instance Date asli', async () => {
    await withClock(new Date('2026-01-10T00:00:00Z'), async () => {
      expect(new Date('2020-05-05T00:00:00Z').toISOString()).toBe('2020-05-05T00:00:00.000Z');
      expect(new Date(2020, 0, 1).getFullYear()).toBe(2020);
      expect(Date.UTC(2021, 1, 1)).toBe(RealDate.UTC(2021, 1, 1));
      expect(new Date() instanceof RealDate).toBe(true);
    });
  });

  it('waktu tetap berjalan di dalam blok', async () => {
    await withClock(new Date(Date.now() - 86_400_000), async () => {
      const a = Date.now();
      await new Promise((r) => setTimeout(r, 25));
      expect(Date.now() - a).toBeGreaterThanOrEqual(20);
    });
  });

  it('jam dipulihkan walau blok melempar, dan tidak boleh bersarang', async () => {
    await expect(
      withClock(new Date(Date.now() - 1000), async () => {
        throw new Error('gagal');
      }),
    ).rejects.toThrow('gagal');
    expect(globalThis.Date).toBe(RealDate);

    await expect(
      withClock(new Date(Date.now() - 1000), () => withClock(new Date(Date.now() - 2000), async () => undefined)),
    ).rejects.toThrow('bersarang');
    expect(globalThis.Date).toBe(RealDate);
  });

  it('target di masa depan dipotong ke sekarang (jam hanya boleh mundur)', () => {
    expect(clampTarget(new Date(2_000_000), 1_000_000)).toBe(1_000_000);
    expect(clampTarget(new Date(500_000), 1_000_000)).toBe(500_000);
    expect(shiftedNow(1_000_000, 400_000)).toBe(600_000);
  });
});
