import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  isWeekday,
  planAttendance,
  resolveLeaveWindow,
  unitHash,
  weekdaysInRange,
  wibInstant,
  workdaysBefore,
} from './attendance-plan';
import { lateMinutesAt, workedAndOvertime } from '../../../modules/hrm/work-time';

describe('workdaysBefore', () => {
  it('hanya Senin-Jumat, menaik, dan tidak mencakup hari ini', () => {
    const days = workdaysBefore('2026-10-19', 10, '2026-01-02'); // Senin
    expect(days).toHaveLength(10);
    expect(days.every(isWeekday)).toBe(true);
    expect([...days].sort()).toEqual(days);
    expect(days[days.length - 1]).toBe('2026-10-16'); // Jumat sebelum Senin
    expect(days).not.toContain('2026-10-19');
  });

  it('berhenti di batas awal tahun', () => {
    const days = workdaysBefore('2026-01-08', 30, '2026-01-02');
    expect(days[0]).toBe('2026-01-02');
    expect(days.length).toBeLessThan(30);
    expect(days.every((d) => d >= '2026-01-02')).toBe(true);
  });
});

describe('planAttendance', () => {
  const days = workdaysBefore('2026-10-19', 32, '2026-01-02');

  it('deterministik untuk karyawan dan tanggal yang sama', () => {
    expect(planAttendance('KS-0002', days)).toEqual(planAttendance('KS-0002', days));
    expect(planAttendance('KS-0002', days)).not.toEqual(planAttendance('KS-0003', days));
  });

  it('satu baris per hari kerja, tidak ada akhir pekan', () => {
    const plan = planAttendance('RN-0001', days);
    expect(plan.map((p) => p.date)).toEqual(days);
  });

  it('hari cuti disetujui menimpa semua jenis lain', () => {
    const leave = new Set([days[3], days[4]]);
    const plan = planAttendance('KS-0001', days, { script: [{ idx: days.length - 4, kind: 'absent' }], leaveDays: leave });
    expect(plan[3].kind).toBe('leave');
    expect(plan[4].kind).toBe('leave');
    expect(plan[3].checkInMin).toBeUndefined();
  });

  it('skrip menentukan jenis pada indeks hari kerja terakhir ke belakang', () => {
    const plan = planAttendance('KS-0001', days, { script: [{ idx: 0, kind: 'absent' }, { idx: 5, kind: 'sick' }] });
    expect(plan[days.length - 1].kind).toBe('absent');
    expect(plan[days.length - 6].kind).toBe('sick');
  });

  it('jam masuk/pulang konsisten dengan aturan keterlambatan dan lembur aplikasi', () => {
    for (const emp of ['KS-0001', 'RN-0003', 'LS-0004']) {
      for (const d of planAttendance(emp, days)) {
        if (d.kind === 'normal' || d.kind === 'late' || d.kind === 'overtime') {
          const inAt = wibInstant(d.date, d.checkInMin!);
          const outAt = wibInstant(d.date, d.checkOutMin!);
          const late = lateMinutesAt(inAt);
          const { overtime } = workedAndOvertime(inAt, outAt);
          if (d.kind === 'normal') expect(late).toBe(0);
          if (d.kind === 'late') expect(late).toBeGreaterThan(0);
          if (d.kind === 'overtime') expect(overtime).toBeGreaterThan(1);
          expect(outAt.getTime()).toBeGreaterThan(inAt.getTime());
        } else {
          expect(d.checkInMin).toBeUndefined();
        }
      }
    }
  });

  it('variasi wajar: mayoritas hadir normal, ada yang terlambat dan lembur', () => {
    const kinds = ['KS-0001', 'KS-0002', 'RN-0001', 'RN-0002', 'LS-0001', 'LS-0002'].flatMap((e) => planAttendance(e, days).map((p) => p.kind));
    const share = (k: string) => kinds.filter((x) => x === k).length / kinds.length;
    expect(share('normal')).toBeGreaterThan(0.5);
    expect(share('late')).toBeGreaterThan(0);
    expect(share('overtime')).toBeGreaterThan(0);
  });
});

describe('tanggal', () => {
  it('resolveLeaveWindow memindahkan awal dari akhir pekan dan memangkas akhir ke hari kerja', () => {
    expect(resolveLeaveWindow('2026-10-17', 3)).toEqual({ start: '2026-10-19', end: '2026-10-21' }); // Sabtu -> Senin
    expect(resolveLeaveWindow('2026-10-15', 3)).toEqual({ start: '2026-10-15', end: '2026-10-16' }); // Kamis-Sabtu -> sampai Jumat
  });

  it('weekdaysInRange mengabaikan akhir pekan', () => {
    expect(weekdaysInRange('2026-10-16', '2026-10-20')).toEqual(['2026-10-16', '2026-10-19', '2026-10-20']);
  });

  it('wibInstant: 08.00 WIB = 01.00 UTC', () => {
    expect(wibInstant('2026-10-19', 8 * 60).toISOString()).toBe('2026-10-19T01:00:00.000Z');
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('unitHash di [0,1) dan stabil', () => {
    const v = unitHash('KS-0001|2026-10-16');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    expect(unitHash('KS-0001|2026-10-16')).toBe(v);
  });
});
