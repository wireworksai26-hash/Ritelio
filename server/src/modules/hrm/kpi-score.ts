import { roundMoney } from '../../common/utils/money';

/** Pencapaian per KPI dibatasi di sini supaya satu KPI yang melonjak tidak menutupi KPI lain yang gagal. */
export const ACHIEVEMENT_CAP_PCT = 200;

export function isValidKpiPeriod(period: string): boolean {
  return /^\d{4}-(Q[1-4]|0[1-9]|1[0-2])$/.test(period);
}

export function gradeFor(score: number): string {
  if (score >= 120) return 'A+';
  if (score >= 100) return 'A';
  if (score >= 90) return 'B';
  if (score >= 80) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

/**
 * Persentase pencapaian satu KPI. `null` = belum ada nilai aktual (belum dilaporkan).
 *
 *  - higher-is-better: aktual / target. Target 0: aktual 0 -> 100%, aktual > 0 -> 0%
 *    (target 0 tidak punya skala, jadi tidak diberi nilai lebih).
 *  - lower-is-better (mis. biaya, keluhan): aktual <= target -> 100%, selebihnya target / aktual.
 *  Hasil tidak pernah negatif atau NaN/Infinity.
 */
export function computeAchievement(target: number, actual: number | null, higherIsBetter: boolean): number {
  if (actual === null || !Number.isFinite(actual) || !Number.isFinite(target)) return 0;
  let achievement: number;
  if (higherIsBetter) {
    achievement = target === 0 ? (actual === 0 ? 100 : 0) : (actual / target) * 100;
  } else {
    achievement = actual <= target ? 100 : (target / Math.max(actual, 0.0001)) * 100;
  }
  return Number.isFinite(achievement) ? Math.max(achievement, 0) : 0;
}

export interface KpiScoreInput {
  kpiCode: string;
  kpiName: string;
  unit: string;
  higherIsBetter: boolean;
  target: number;
  actual: number | null;
  weight: number;
}

export function scoreKpiItems(inputs: KpiScoreInput[]) {
  const items = inputs.map((t) => {
    const achievement = computeAchievement(t.target, t.actual, t.higherIsBetter);
    return {
      kpiCode: t.kpiCode,
      kpiName: t.kpiName,
      unit: t.unit,
      higherIsBetter: t.higherIsBetter,
      target: roundMoney(t.target),
      actual: t.actual === null ? null : roundMoney(t.actual),
      weight: t.weight,
      achievementPct: roundMoney(achievement),
      cappedAchievement: roundMoney(Math.min(achievement, ACHIEVEMENT_CAP_PCT)),
      reported: t.actual !== null,
    };
  });

  const weightSum = items.reduce((sum, i) => sum + i.weight, 0);
  const score = weightSum > 0
    ? roundMoney(items.reduce((sum, i) => sum + i.cappedAchievement * i.weight, 0) / weightSum)
    : 0;
  const unreported = items.filter((i) => !i.reported).length;
  return { items, score, grade: gradeFor(score), unreported };
}

/**
 * Peringkat: skor tertinggi dulu; skor sama berbagi peringkat yang sama
 * (1, 1, 3) dan diurutkan stabil menurut nomor karyawan.
 */
export function rankLeaderboard<T extends { score: number; employeeNo: string }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.employeeNo.localeCompare(b.employeeNo));
  const out: Array<T & { rank: number }> = [];
  sorted.forEach((r, i) => {
    const rank = i > 0 && out[i - 1].score === r.score ? out[i - 1].rank : i + 1;
    out.push({ ...r, rank });
  });
  return out;
}
