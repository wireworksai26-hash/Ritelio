import { describe, expect, it } from 'vitest';
import { placeSchedule } from './schedule';

describe('placeSchedule', () => {
  it('hari kosong: dipakai apa adanya, tanpa lembur', () => {
    expect(placeSchedule([], 0, 90, 480)).toEqual({ startMinutes: 0, shifted: false, allowOverCapacity: false });
  });

  it('tidak bentrok: menit mulai yang diminta dipertahankan', () => {
    const booked = [{ startMinutes: 0, durationMinutes: 120 }];
    expect(placeSchedule(booked, 120, 180, 480)).toEqual({ startMinutes: 120, shifted: false, allowOverCapacity: false });
  });

  it('bentrok (tanggal terpotong ke hari yang sama): digeser ke setelah jadwal terakhir', () => {
    const booked = [
      { startMinutes: 0, durationMinutes: 90 },
      { startMinutes: 90, durationMinutes: 120 },
    ];
    const p = placeSchedule(booked, 0, 60, 480);
    expect(p.startMinutes).toBe(210);
    expect(p.shifted).toBe(true);
    expect(p.allowOverCapacity).toBe(false);
  });

  it('kapasitas harian terlampaui: lembur diizinkan supaya seed tidak gagal', () => {
    const booked = [{ startMinutes: 0, durationMinutes: 450 }];
    const p = placeSchedule(booked, 0, 120, 480);
    expect(p.startMinutes).toBe(450);
    expect(p.allowOverCapacity).toBe(true);
  });
});
