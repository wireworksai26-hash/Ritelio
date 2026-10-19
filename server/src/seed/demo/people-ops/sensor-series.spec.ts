import { describe, expect, it } from 'vitest';
import { detectAnomaly, validateReading } from '../../../modules/iot/sensor-logic';
import { generateReadings, readingSlots, spanMs, type SeriesSpec } from './sensor-series';

const END = new Date('2026-10-19T05:00:00.000Z');
const DAYS = 10;

describe('readingSlots', () => {
  it('menaik, unik, berakhir tepat di end, dan rapat (30 menit) pada 48 jam terakhir', () => {
    const slots = readingSlots(END, DAYS);
    expect(slots[slots.length - 1].getTime()).toBe(END.getTime());
    const times = slots.map((s) => s.getTime());
    expect(new Set(times).size).toBe(times.length);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const dense = slots.slice(-96);
    for (let i = 1; i < dense.length; i++) expect(dense[i].getTime() - dense[i - 1].getTime()).toBe(30 * 60_000);
  });

  it('end dapat dipulihkan dari pembacaan tertua (dasar idempotensi)', () => {
    const slots = readingSlots(END, DAYS);
    const recovered = new Date(slots[0].getTime() + spanMs(DAYS));
    expect(recovered.getTime()).toBe(END.getTime());
    expect(readingSlots(recovered, DAYS).map((s) => s.getTime())).toEqual(slots.map((s) => s.getTime()));
  });

  it('mencakup sekitar 10 hari', () => {
    const slots = readingSlots(END, DAYS);
    const spanDays = (END.getTime() - slots[0].getTime()) / 86_400_000;
    expect(spanDays).toBeGreaterThan(9.9);
    expect(spanDays).toBeLessThanOrEqual(10);
  });
});

const chiller: SeriesSpec = {
  code: 'T-CHL',
  shape: 'flat',
  baseline: 5.2,
  noise: 0.3,
  dailyAmplitude: 0.5,
  decimals: 1,
  anomalies: [
    { endHoursAgo: 52, durationHours: 3, offset: 8, form: 'spike' },
    { endHoursAgo: 0, durationHours: 2, offset: 9, form: 'sustained' },
  ],
};

describe('generateReadings', () => {
  const slots = readingSlots(END, DAYS);

  it('deterministik per kode sensor', () => {
    expect(generateReadings(chiller, slots)).toEqual(generateReadings(chiller, slots));
    expect(generateReadings({ ...chiller, code: 'T-LAIN' }, slots)).not.toEqual(generateReadings(chiller, slots));
  });

  it('suhu chiller normal berada di rentang aman, anomali sesaat melewati 12 C', () => {
    const rs = generateReadings(chiller, slots);
    const normal = rs.filter((r) => (END.getTime() - r.recordedAt.getTime()) / 3_600_000 > 60).map((r) => r.value);
    expect(Math.min(...normal)).toBeGreaterThan(2);
    expect(Math.max(...normal)).toBeLessThan(12);
    expect(Math.max(...rs.map((r) => r.value))).toBeGreaterThan(12);
  });

  it('anomali "sustained" bertahan sampai pembacaan terakhir sehingga peringatan aplikasi menyala', () => {
    const rs = generateReadings(chiller, slots);
    const last = rs[rs.length - 1].value;
    expect(last).toBeGreaterThan(12);
    expect(detectAnomaly('temperature', last, '°C')).not.toBeNull();
    // tanpa anomali akhir, pembacaan terakhir aman
    const calm = generateReadings({ ...chiller, anomalies: [chiller.anomalies![0]] }, slots);
    expect(detectAnomaly('temperature', calm[calm.length - 1].value, '°C')).toBeNull();
  });

  it('daya "duty": menyala di jam kerja WIB, siaga di luar jam kerja', () => {
    const rs = generateReadings({ code: 'T-PWR', shape: 'duty', baseline: 18, idle: 1, noise: 0.5, activeHours: [3, 13] }, slots);
    const wib = (d: Date) => (d.getUTCHours() + 7) % 24;
    const on = rs.filter((r) => wib(r.recordedAt) >= 3 && wib(r.recordedAt) < 13).map((r) => r.value);
    const off = rs.filter((r) => wib(r.recordedAt) >= 14 && wib(r.recordedAt) < 24).map((r) => r.value);
    expect(Math.min(...on)).toBeGreaterThan(14);
    expect(Math.max(...off)).toBeLessThan(3);
  });

  it('penghitung produksi tidak pernah turun dan bernilai bulat', () => {
    const rs = generateReadings({ code: 'T-CNT', shape: 'production', baseline: 38, idle: 12_400, noise: 9, activeHours: [4, 13], decimals: 0 }, slots);
    for (let i = 1; i < rs.length; i++) expect(rs[i].value).toBeGreaterThanOrEqual(rs[i - 1].value);
    expect(rs.every((r) => Number.isInteger(r.value))).toBe(true);
    expect(rs[rs.length - 1].value).toBeGreaterThan(rs[0].value);
  });

  it('semua nilai lolos validasi ingest aplikasi dan tidak ada waktu di masa depan', () => {
    const now = new Date(END.getTime() + 60_000);
    for (const r of generateReadings(chiller, slots)) {
      expect(() => validateReading('temperature', r.value, now, r.recordedAt.toISOString())).not.toThrow();
      expect(r.value).toBeGreaterThanOrEqual(0);
    }
  });
});
