import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  computeAchievement,
  gradeFor,
  isValidKpiPeriod,
  rankLeaderboard,
  scoreKpiItems,
} from './kpi-score';
import { PerformanceService } from './performance.service';

describe('computeAchievement', () => {
  it('higher-is-better: aktual / target', () => {
    expect(computeAchievement(100, 80, true)).toBe(80);
    expect(computeAchievement(100, 150, true)).toBe(150);
    expect(computeAchievement(100, 0, true)).toBe(0);
  });

  it('target nol: aktual nol = 100%, aktual positif = 0% (tidak Infinity/NaN)', () => {
    expect(computeAchievement(0, 0, true)).toBe(100);
    expect(computeAchievement(0, 25, true)).toBe(0);
    expect(Number.isFinite(computeAchievement(0, 25, true))).toBe(true);
  });

  it('lower-is-better: di bawah/sama target = 100%, di atas dihukum proporsional', () => {
    expect(computeAchievement(10, 10, false)).toBe(100);
    expect(computeAchievement(10, 4, false)).toBe(100);
    expect(computeAchievement(10, 20, false)).toBe(50);
  });

  it('lower-is-better dengan target 0: aktual 0 = 100%, aktual > 0 = 0% (bukan NaN)', () => {
    expect(computeAchievement(0, 0, false)).toBe(100);
    expect(computeAchievement(0, 5, false)).toBe(0);
  });

  it('belum ada aktual (null), nilai negatif, dan non-finite menghasilkan 0, tidak pernah negatif', () => {
    expect(computeAchievement(100, null, true)).toBe(0);
    expect(computeAchievement(100, -50, true)).toBe(0);
    expect(computeAchievement(100, Number.NaN, true)).toBe(0);
    expect(computeAchievement(Number.POSITIVE_INFINITY, 5, true)).toBe(0);
  });
});

describe('gradeFor (batas bawah inklusif)', () => {
  it.each([
    [120, 'A+'], [119.99, 'A'], [100, 'A'], [99.99, 'B'], [90, 'B'],
    [89.99, 'C'], [80, 'C'], [79.99, 'D'], [60, 'D'], [59.99, 'E'], [0, 'E'],
  ])('skor %s -> %s', (score, grade) => {
    expect(gradeFor(score)).toBe(grade);
  });
});

describe('scoreKpiItems', () => {
  const kpi = (over: Partial<Parameters<typeof scoreKpiItems>[0][number]> = {}) => ({
    kpiCode: 'K', kpiName: 'KPI', unit: 'number', higherIsBetter: true,
    target: 100, actual: 100, weight: 1, ...over,
  });

  it('rata-rata tertimbang: bobot besar menang', () => {
    // 100% (bobot 3) dan 50% (bobot 1) -> (300 + 50) / 4 = 87,5
    const r = scoreKpiItems([kpi({ weight: 3 }), kpi({ actual: 50, weight: 1 })]);
    expect(r.score).toBe(87.5);
    expect(r.grade).toBe('C');
  });

  it('pencapaian dibatasi 200% sehingga satu KPI melonjak tidak menutupi KPI gagal', () => {
    const r = scoreKpiItems([kpi({ actual: 1000 }), kpi({ actual: 0 })]);
    expect(r.items[0].achievementPct).toBe(1000);
    expect(r.items[0].cappedAchievement).toBe(200);
    expect(r.score).toBe(100); // (200 + 0) / 2
  });

  it('bobot nol di semua KPI -> skor 0 (bukan NaN)', () => {
    const r = scoreKpiItems([kpi({ weight: 0 }), kpi({ weight: 0 })]);
    expect(r.score).toBe(0);
    expect(Number.isNaN(r.score)).toBe(false);
  });

  it('KPI berbobot nol tidak memengaruhi skor', () => {
    const r = scoreKpiItems([kpi({ weight: 1 }), kpi({ actual: 0, weight: 0 })]);
    expect(r.score).toBe(100);
  });

  it('menghitung KPI yang belum dilaporkan dan memperlakukannya 0%', () => {
    const r = scoreKpiItems([kpi(), kpi({ actual: null })]);
    expect(r.unreported).toBe(1);
    expect(r.items[1]).toMatchObject({ reported: false, achievementPct: 0 });
    expect(r.score).toBe(50);
  });

  it('campuran higher/lower-is-better dihitung masing-masing', () => {
    const r = scoreKpiItems([
      kpi({ target: 100, actual: 100 }),
      kpi({ higherIsBetter: false, target: 5, actual: 10 }), // 50%
    ]);
    expect(r.score).toBe(75);
  });

  it('daftar kosong tidak melempar', () => {
    expect(scoreKpiItems([])).toMatchObject({ score: 0, unreported: 0, items: [] });
  });
});

describe('isValidKpiPeriod', () => {
  it.each(['2026-01', '2026-12', '2026-Q1', '2026-Q4'])('menerima %s', (p) => expect(isValidKpiPeriod(p)).toBe(true));
  it.each(['2026-00', '2026-13', '2026-Q5', '2026-Q0', '26-01', '2026-1', '2026-01-01', '', 'Q1-2026'])(
    'menolak %s',
    (p) => expect(isValidKpiPeriod(p)).toBe(false),
  );
});

describe('rankLeaderboard', () => {
  const row = (employeeNo: string, score: number) => ({ employeeNo, score });

  it('urut turun; skor sama berbagi peringkat; peringkat berikutnya melompat', () => {
    const r = rankLeaderboard([row('E3', 80), row('E1', 95), row('E2', 95), row('E4', 70)]);
    expect(r.map((x) => [x.employeeNo, x.rank])).toEqual([['E1', 1], ['E2', 1], ['E3', 3], ['E4', 4]]);
  });

  it('tiga seri berturut-turut semua peringkat 1', () => {
    expect(rankLeaderboard([row('A', 90), row('B', 90), row('C', 90)]).map((x) => x.rank)).toEqual([1, 1, 1]);
  });

  it('kosong -> kosong; tidak mengubah array asli', () => {
    expect(rankLeaderboard([])).toEqual([]);
    const input = [row('B', 1), row('A', 2)];
    rankLeaderboard(input);
    expect(input[0].employeeNo).toBe('B');
  });
});

type Row = Record<string, any>;

function setup(targets: Row[], reviews: Row[] = []) {
  const state = { upserts: [] as Row[], lastTake: 0 };
  const prisma = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    employee: { findFirst: async () => ({ id: 'e1' }) },
    kpiTarget: { findFirst: async () => ({ id: 't1' }), findMany: async () => targets },
    performanceReview: {
      upsert: async (args: Row) => (state.upserts.push(args), args.create),
      findMany: async ({ take }: { take: number }) => ((state.lastTake = take), reviews),
    },
  };
  return { state, service: new PerformanceService(prisma as never) };
}

const target = (over: Row = {}) => ({
  target: 100, actual: 100, weight: 1,
  kpi: { code: 'K', name: 'KPI', unit: 'number', higherIsBetter: true }, ...over,
});

describe('PerformanceService', () => {
  it('employeeScore tanpa target -> N/A, bukan error', async () => {
    const { service } = setup([]);
    expect(await service.employeeScore('t', 'e1', '2026-Q1')).toMatchObject({ score: 0, grade: 'N/A', items: [] });
  });

  it('employeeScore membaca Decimal-like (string) dan memberi catatan bila ada KPI belum diisi', async () => {
    const { service } = setup([target({ target: '200.00', actual: '100.00', weight: '2.00' }), target({ actual: null })]);
    const r = await service.employeeScore('t', 'e1', '2026-Q1');
    // (50*2 + 0*1) / 3 = 33,33
    expect(r.score).toBe(33.33);
    expect(r.note).toMatch(/1 KPI belum diisi/);
  });

  it('review ditolak selama ada KPI yang belum diisi dan tidak menyimpan apa pun', async () => {
    const { service, state } = setup([target({ actual: null })]);
    await expect(service.review('t', 'e1', '2026-Q1', {})).rejects.toThrow(/belum diisi/);
    expect(state.upserts).toHaveLength(0);
  });

  it('review menyimpan skor yang dihitung server beserta grade, draft vs submitted', async () => {
    const { service, state } = setup([target({ actual: 120 })]);
    await service.review('t', 'e1', '2026-Q1', { submit: true }, 'rev-1');
    expect(state.upserts[0].create).toMatchObject({ grade: 'A+', status: 'submitted', reviewerId: 'rev-1' });
    expect(Number(state.upserts[0].create.score)).toBe(120);
    await service.review('t', 'e1', '2026-Q1', {});
    expect(state.upserts[1].create.status).toBe('draft');
  });

  it('setTargets menolak periode salah, target negatif/NaN, bobot negatif, dan daftar kosong', async () => {
    const { service } = setup([]);
    const t = { kpiId: 'k', employeeId: 'e', target: 10 };
    await expect(service.setTargets('t', '2026-13', [t])).rejects.toThrow(/Format periode/);
    await expect(service.setTargets('t', '2026-01', [])).rejects.toThrow(/kosong/);
    const prisma = {
      company: { findFirst: async () => ({ id: 'c1' }) },
      kpiDefinition: { findMany: async () => [{ id: 'k' }] },
      employee: { findMany: async () => [{ id: 'e' }] },
      kpiTarget: { upsert: async () => ({}) },
    };
    const svc = new PerformanceService(prisma as never);
    await expect(svc.setTargets('t', '2026-01', [{ ...t, target: -1 }])).rejects.toThrow(BadRequestException);
    await expect(svc.setTargets('t', '2026-01', [{ ...t, target: Number.NaN }])).rejects.toThrow(/Target/);
    await expect(svc.setTargets('t', '2026-01', [{ ...t, weight: -1 }])).rejects.toThrow(/Bobot/);
  });

  it('recordActual menolak NaN', async () => {
    const { service } = setup([]);
    await expect(service.recordActual('t', 't1', Number.NaN)).rejects.toThrow(/angka/);
  });

  it('leaderboard: peringkat berbagi untuk skor sama dan limit dibatasi 1..100', async () => {
    const reviews = [
      { score: '95', grade: 'B', employee: { employeeNo: 'E2', fullName: 'B' } },
      { score: '95', grade: 'B', employee: { employeeNo: 'E1', fullName: 'A' } },
      { score: '80', grade: 'C', employee: { employeeNo: 'E3', fullName: 'C' } },
    ];
    const { service, state } = setup([], reviews);
    const r = await service.leaderboard('t', '2026-Q1', -5);
    expect(r.map((x) => [x.employeeNo, x.rank, x.score])).toEqual([['E1', 1, 95], ['E2', 1, 95], ['E3', 3, 80]]);
    expect(state.lastTake).toBe(1); // limit negatif tidak boleh jadi take negatif (paging terbalik di Prisma)
    await service.leaderboard('t', '2026-Q1', 5000);
    expect(state.lastTake).toBe(100);
  });
});
