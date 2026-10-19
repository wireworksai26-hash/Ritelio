import { describe, expect, it } from 'vitest';
import { decideRun, makeDateHelpers } from './context';
import { DEMO_DOMAINS } from './index';

describe('decideRun', () => {
  const live = { key: 'supply' };
  const stub = { key: 'finance', implemented: false };

  it('domain terisi yang belum selesai dijalankan', () => {
    expect(decideRun(live, { only: [], force: false, done: false })).toBe('run');
  });

  it('domain yang sudah selesai dilewati, kecuali dipaksa', () => {
    expect(decideRun(live, { only: [], force: false, done: true })).toBe('skip-done');
    expect(decideRun(live, { only: [], force: true, done: true })).toBe('run');
  });

  it('kerangka kosong dilewati dan TIDAK pernah dianggap selesai, bahkan saat dipaksa', () => {
    expect(decideRun(stub, { only: [], force: false, done: false })).toBe('skip-not-implemented');
    expect(decideRun(stub, { only: [], force: true, done: false })).toBe('skip-not-implemented');
  });

  it('filter SEED_DEMO_ONLY menyisihkan domain lain lebih dulu', () => {
    expect(decideRun(live, { only: ['commercial'], force: false, done: false })).toBe('skip-filtered');
    expect(decideRun(live, { only: ['supply'], force: false, done: false })).toBe('run');
  });
});

describe('registri domain', () => {
  it('kunci unik dan urutan menjaga ketergantungan (pajak, pasok, penjualan, SDM, keuangan)', () => {
    const keys = DEMO_DOMAINS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['foundation', 'supply', 'commercial', 'people-ops', 'finance']);
  });

  it('fondasi pajak sudah terisi, bukan kerangka', () => {
    expect(DEMO_DOMAINS.find((d) => d.key === 'foundation')?.implemented).not.toBe(false);
  });
});

describe('makeDateHelpers', () => {
  const NOW = new Date('2026-10-19T08:00:00Z');
  const h = makeDateHelpers(NOW);

  it('daysAgo mundur tepat n hari dari tengah hari WIB', () => {
    const d = h.daysAgo(10);
    expect(d.toISOString()).toBe('2026-10-09T05:00:00.000Z');
  });

  it('at menempatkan jam WIB yang diminta (WIB = UTC+7)', () => {
    expect(h.at(0, 10, 30).toISOString()).toBe('2026-10-19T03:30:00.000Z');
    expect(h.at(3, 22).toISOString()).toBe('2026-10-16T15:00:00.000Z');
  });

  it('tidak pernah mundur sebelum awal tahun berjalan (kalender fiskal hanya untuk tahun itu)', () => {
    const early = makeDateHelpers(new Date('2026-02-10T08:00:00Z'));
    const floor = Date.UTC(2026, 0, 2);
    expect(early.daysAgo(90).getTime()).toBe(floor);
    expect(early.at(200, 9).getTime()).toBe(floor);
    expect(early.daysAgo(5).getTime()).toBeGreaterThan(floor);
  });

  it('isoDay memberi YYYY-MM-DD', () => {
    expect(h.isoDay(new Date('2026-03-05T20:00:00Z'))).toBe('2026-03-05');
  });
});
