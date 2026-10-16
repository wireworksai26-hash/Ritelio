import { describe, expect, it } from 'vitest';
import {
  businessDate,
  countWorkingDays,
  lateMinutesAt,
  prorateFactorFor,
  workedAndOvertime,
  workingDaysInYear,
} from './work-time';

const utc = (s: string) => new Date(s);

describe('lateMinutesAt (zona WIB, UTC+7)', () => {
  it('08:00 dan 08:15 WIB (masa tenggang) tidak terlambat', () => {
    expect(lateMinutesAt(utc('2026-10-10T01:00:00Z'))).toBe(0); // 08:00 WIB
    expect(lateMinutesAt(utc('2026-10-10T01:15:00Z'))).toBe(0); // 08:15 WIB
  });

  it('09:30 WIB (02:30 UTC) terlambat 75 menit — dulu 0 karena memakai jam UTC', () => {
    expect(lateMinutesAt(utc('2026-10-10T02:30:00Z'))).toBe(75);
  });

  it('sebelum 08:00 WIB tidak negatif', () => {
    expect(lateMinutesAt(utc('2026-10-10T23:30:00Z'))).toBe(0); // 06:30 WIB hari berikutnya
  });
});

describe('businessDate', () => {
  it('06:30 WIB tanggal 12 (23:30 UTC tanggal 11) masuk tanggal kerja 12', () => {
    expect(businessDate(utc('2026-10-11T23:30:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });

  it('23:30 WIB tanggal 11 (16:30 UTC) tetap tanggal 11', () => {
    expect(businessDate(utc('2026-10-11T16:30:00Z')).toISOString()).toBe('2026-10-11T00:00:00.000Z');
  });
});

describe('workedAndOvertime', () => {
  it('10 jam kerja -> lembur 2 jam', () => {
    const r = workedAndOvertime(utc('2026-10-10T02:30:00Z'), utc('2026-10-10T12:30:00Z'));
    expect(r.worked).toBe(10);
    expect(r.overtime).toBe(2);
  });

  it('lembur dibatasi 4 jam per hari', () => {
    expect(workedAndOvertime(utc('2026-10-10T00:00:00Z'), utc('2026-10-10T16:00:00Z')).overtime).toBe(4);
  });

  it('kurang dari 8 jam tidak ada lembur', () => {
    expect(workedAndOvertime(utc('2026-10-10T00:00:00Z'), utc('2026-10-10T05:00:00Z')).overtime).toBe(0);
  });
});

describe('countWorkingDays', () => {
  it('Senin-Jumat = 5 hari; akhir pekan tidak dihitung', () => {
    expect(countWorkingDays(utc('2026-11-02'), utc('2026-11-06'))).toBe(5);
    expect(countWorkingDays(utc('2026-11-02'), utc('2026-11-08'))).toBe(5);
    expect(countWorkingDays(utc('2026-11-07'), utc('2026-11-08'))).toBe(0);
  });

  it('satu hari tunggal dan lintas akhir pekan', () => {
    expect(countWorkingDays(utc('2026-11-03'), utc('2026-11-03'))).toBe(1);
    expect(countWorkingDays(utc('2026-11-06'), utc('2026-11-09'))).toBe(2); // Jum + Sen
  });
});

describe('workingDaysInYear', () => {
  it('cuti lintas tahun hanya memotong jatah tahun yang bersangkutan', () => {
    // Kamis 31 Des 2026 - Jumat 1 Jan 2027
    expect(workingDaysInYear(utc('2026-12-31'), utc('2027-01-01'), 2026)).toBe(1);
    expect(workingDaysInYear(utc('2026-12-31'), utc('2027-01-01'), 2027)).toBe(1);
    expect(workingDaysInYear(utc('2026-12-31'), utc('2027-01-01'), 2028)).toBe(0);
  });
});

describe('prorateFactorFor', () => {
  const period = utc('2026-10-01');

  it('masuk sebelum/pada awal periode: gaji penuh', () => {
    expect(prorateFactorFor(utc('2026-01-01'), period)).toBe(1);
    expect(prorateFactorFor(utc('2026-10-01'), period)).toBe(1);
  });

  it('masuk 16 Oktober: 16/31', () => {
    expect(prorateFactorFor(utc('2026-10-16'), period)).toBeCloseTo(16 / 31, 10);
  });

  it('masuk di bulan berikutnya: 0 (tidak digaji) — dulu tetap digaji prorata dari hari-dalam-bulan', () => {
    expect(prorateFactorFor(utc('2026-11-05'), period)).toBe(0);
  });
});
