import { describe, expect, it } from 'vitest';
import { computeDepreciation } from '../../../modules/assets/assets.service';
import { addDays, daysAgoOf, isBefore, monthsBetween, todayOf, yearFloor, type Ymd } from './calendar';
import {
  PPN_RATE,
  assetScale,
  depreciationMonths,
  estimateDepreciation,
  monthlyDepreciation,
  ownExpenseBudget,
  planFinance,
  planSubsidiary,
  thin,
  windowStart,
  type FinancePlan,
  type LedgerStats,
} from './plan';
import { FINANCE_PROFILES, CATEGORY_ACCOUNT, EXTRA_ACCOUNTS, OWN_EXPENSE_CODES } from './profiles';

const TODAY: Ymd = { y: 2026, m: 10, d: 19 };
const BUSY: LedgerStats = { revenue: 600_000_000, cogs: 270_000_000, otherOpex: 90_000_000, firstRevenueDaysAgo: 120 };
const NONE: LedgerStats = { revenue: 0, cogs: 0, otherOpex: 0, firstRevenueDaysAgo: null };

const profiles = Object.values(FINANCE_PROFILES);

function netOfPlan(plan: FinancePlan, stats: LedgerStats): number {
  const bills = plan.expenses.filter((e) => e.mode === 'bill').reduce((s, e) => s + e.amount * (1 + PPN_RATE), 0);
  const journals = plan.expenses.filter((e) => e.mode === 'journal').reduce((s, e) => s + e.amount, 0);
  const fees = plan.fees.reduce((s, f) => s + f.amount, 0);
  return stats.revenue - stats.cogs - stats.otherOpex - bills - journals - fees - plan.estimatedDepreciation;
}

describe('kalender', () => {
  it('todayOf memakai tanggal UTC seperti DemoContext', () => {
    expect(todayOf(new Date('2026-10-19T23:30:00Z'))).toEqual({ y: 2026, m: 10, d: 19 });
  });

  it('daysAgoOf dan addDays saling balik', () => {
    const d = addDays(TODAY, -45);
    expect(daysAgoOf(TODAY, d)).toBe(45);
    expect(d).toEqual({ y: 2026, m: 9, d: 4 });
  });

  it('monthsBetween mencakup bulan awal dan akhir', () => {
    expect(monthsBetween({ y: 2026, m: 8, d: 30 }, TODAY).map((m) => m.code)).toEqual(['2026-08', '2026-09', '2026-10']);
  });
});

describe('ownExpenseBudget', () => {
  const base = { revenue: 100_000_000, cogs: 45_000_000, otherOpex: 10_000_000, depreciation: 5_000_000, targetNetMargin: 0.15, months: 4, fallbackMonthly: 6_000_000 };

  it('membidik laba bersih sebesar margin sasaran setelah beban domain lain dan penyusutan', () => {
    const budget = ownExpenseBudget(base);
    const net = base.revenue - base.cogs - base.otherOpex - base.depreciation - budget;
    expect(net / base.revenue).toBeCloseTo(0.15, 2);
  });

  it('tanpa pendapatan: beban kecil sebanding jumlah bulan', () => {
    expect(ownExpenseBudget({ ...base, revenue: 0, cogs: 0, otherOpex: 0 })).toBe(24_000_000);
  });

  it('bila domain lain sudah menghabiskan ruang laba, beban tetap kecil dan tidak nol', () => {
    const budget = ownExpenseBudget({ ...base, otherOpex: 80_000_000 });
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThanOrEqual(base.revenue * 0.1 + 6_000_000 * 4);
  });

  it('dibatasi atas supaya tidak melahap pendapatan', () => {
    expect(ownExpenseBudget({ ...base, cogs: 0, otherOpex: 0, targetNetMargin: 0 })).toBeLessThanOrEqual(base.revenue * 0.4);
  });
});

describe('assetScale dan windowStart', () => {
  it('skala mengikuti pendapatan bulanan terhadap acuan, dibatasi 0,3 sampai 1,6', () => {
    expect(assetScale(0, 100, 100_000_000)).toBe(0.3);
    expect(assetScale(1_000_000, 90, 100_000_000)).toBe(0.3);
    expect(assetScale(300_000_000, 90, 100_000_000)).toBe(1);
    expect(assetScale(9_000_000_000, 90, 100_000_000)).toBe(1.6);
  });

  it('jendela dimulai dari pendapatan pertama, tidak sebelum awal tahun', () => {
    expect(windowStart(TODAY, { firstRevenueDaysAgo: 60 })).toEqual(addDays(TODAY, -60));
    expect(windowStart(TODAY, { firstRevenueDaysAgo: null })).toEqual(addDays(TODAY, -150));
    expect(windowStart({ y: 2026, m: 2, d: 10 }, { firstRevenueDaysAgo: 200 })).toEqual(yearFloor({ y: 2026, m: 2, d: 10 }));
  });
});

describe('penyusutan', () => {
  it('rumus sama dengan AssetsService.computeDepreciation (garis lurus dan saldo menurun)', () => {
    const cases = [
      { cost: 84_000_000, salvage: 8_400_000, lifeMonths: 96, method: 'straight_line' as const },
      { cost: 24_500_000, salvage: 2_500_000, lifeMonths: 60, method: 'declining_balance' as const, rate: 0.25 },
    ];
    for (const c of cases) {
      let acc = 0;
      for (let i = 0; i < 6; i++) {
        const mine = monthlyDepreciation(c, acc);
        const svc = computeDepreciation(
          { acquisitionCost: c.cost, salvageValue: c.salvage, usefulLifeMonths: c.lifeMonths, depreciationMethod: c.method, decliningRate: c.rate },
          acc,
        );
        expect(mine).toBeCloseTo(svc, 2);
        acc += svc;
      }
    }
  });

  it('hanya bulan yang sudah lewat penuh', () => {
    const months = depreciationMonths([{ date: { y: 2026, m: 7, d: 3 } }], TODAY).map((m) => m.code);
    expect(months).toEqual(['2026-07', '2026-08', '2026-09']);
  });
});

describe.each(profiles.map((p) => [p.key, p] as const))('planFinance %s', (_key, profile) => {
  const plan = planFinance(profile, TODAY, BUSY);
  const lastDay = addDays(TODAY, -1);

  it('deterministik: masukan sama menghasilkan rencana sama', () => {
    expect(planFinance(profile, TODAY, BUSY)).toEqual(plan);
  });

  it('semua tanggal berada dalam jendela [awal, kemarin] dan tidak sebelum awal tahun', () => {
    const floor = yearFloor(TODAY);
    const dates = [
      ...plan.expenses.map((e) => e.date),
      ...plan.transfers.map((t) => t.date),
      ...plan.fees.map((f) => f.date),
      ...plan.assets.map((a) => a.date),
      plan.capital.date,
    ];
    for (const d of dates) {
      expect(isBefore(d, floor)).toBe(false);
      expect(isBefore(d, plan.start)).toBe(false);
      expect(isBefore(lastDay, d)).toBe(false);
    }
  });

  it('kunci unik di seluruh rencana', () => {
    const keys = [...plan.expenses.map((e) => e.key), ...plan.transfers.map((t) => t.key), ...plan.fees.map((f) => f.key), plan.capital.key];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('semua nominal positif dan semua akun ada di COA yang akan dibuat atau bawaan', () => {
    const known = new Set(['1000', '3000', ...EXTRA_ACCOUNTS.map((a) => a.code), ...Object.values(CATEGORY_ACCOUNT)]);
    for (const e of plan.expenses) {
      expect(e.amount).toBeGreaterThan(0);
      expect(known.has(e.account)).toBe(true);
    }
    for (const code of Object.values(CATEGORY_ACCOUNT)) expect(OWN_EXPENSE_CODES).toContain(code);
  });

  it('laba bersih jatuh di sekitar margin sasaran (8-25 persen) bila pendapatan memadai', () => {
    const margin = netOfPlan(plan, BUSY) / BUSY.revenue;
    expect(margin).toBeGreaterThan(0.08);
    expect(margin).toBeLessThan(0.25);
    expect(margin).toBeCloseTo(profile.targetNetMargin, 1);
  });

  it('tanpa pendapatan: beban kecil dan aset berskala kecil', () => {
    const empty = planFinance(profile, TODAY, NONE);
    const months = monthsBetween(empty.start, TODAY).length;
    expect(empty.budget).toBe(Math.round((profile.fallbackMonthly * months) / 1000) * 1000);
    expect(empty.scale).toBe(0.3);
    const total = empty.expenses.reduce((s, e) => s + e.amount * (e.mode === 'bill' ? 1 + PPN_RATE : 1), 0);
    expect(total).toBeLessThan(profile.fallbackMonthly * months * 1.05);
  });

  it('transfer ke bank tambahan menutup seluruh kebutuhannya, dalam kelipatan 100 ribu', () => {
    for (const bank of profile.banks.filter((b) => b.role !== 'main')) {
      const need =
        plan.expenses.filter((e) => e.mode === 'journal' && e.bank === bank.role).reduce((s, e) => s + e.amount, 0) +
        plan.fees.filter((f) => f.bank === bank.role).reduce((s, f) => s + f.amount, 0);
      const funded = plan.transfers.filter((t) => t.toRole === bank.role).reduce((s, t) => s + t.amount, 0);
      expect(funded).toBeGreaterThanOrEqual(need);
    }
    for (const t of plan.transfers) expect(t.amount % 100_000).toBe(0);
  });

  it('aset: tanggal perolehan masuk akal dan pelepasan sesudahnya', () => {
    expect(plan.assets).toHaveLength(profile.assets.length);
    for (const a of plan.assets) {
      expect(a.salvage).toBeLessThan(a.cost);
      if (a.disposeDate) {
        expect(daysAgoOf(a.disposeDate, a.date)).toBeGreaterThanOrEqual(30);
        expect(isBefore(a.disposeDate, TODAY)).toBe(true);
      }
    }
    expect(plan.assets.some((a) => a.disposeDate)).toBe(true);
    expect(plan.estimatedDepreciation).toBeCloseTo(estimateDepreciation(plan.assets, TODAY), 5);
  });

  it('tagihan ber-PPN punya pemasok dan satu tagihan pemasaran menunggak', () => {
    const bills = plan.expenses.filter((e) => e.mode === 'bill');
    expect(bills.length).toBeGreaterThan(8);
    expect(bills.every((b) => b.vendor && profile.vendors.some((v) => v.key === b.vendor))).toBe(true);
    expect(bills.some((b) => b.paidOn === null)).toBe(true);
    expect(bills.some((b) => b.paidOn)).toBe(true);
    for (const b of bills) if (b.paidOn) expect(isBefore(b.paidOn, b.date)).toBe(false);
  });

  it('dua tagihan contoh persetujuan tersedia', () => {
    expect(plan.expenses.filter((e) => e.approval).map((e) => e.approval).sort()).toEqual(['approved', 'two-step-pending']);
  });

  it('pembalikan memakai akun salah lalu benar', () => {
    expect(plan.reversal).not.toBeNull();
    expect(plan.reversal!.wrongAccount).not.toBe(plan.reversal!.rightAccount);
    expect(isBefore(plan.reversal!.reverseDate, plan.reversal!.date)).toBe(false);
  });
});

describe('thin', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}` }));
  const key = (x: { key: string }) => x.key;

  it('mengambil jumlah yang diminta dengan urutan asli', () => {
    const picked = thin(items, 4, key);
    expect(picked).toHaveLength(4);
    expect(picked.map((p) => items.indexOf(p))).toEqual([...picked.map((p) => items.indexOf(p))].sort((a, b) => a - b));
    expect(thin(items, 20, key)).toEqual(items);
    expect(thin(items, 0, key)).toHaveLength(1);
  });

  it('pilihan stabil: menambah elemen baru tidak mengganti hampir seluruh pilihan', () => {
    const before = thin(items, 5, key).map(key);
    const grown = thin([...items, { key: 'baru' }], 5, key).map(key);
    const overlap = before.filter((k) => grown.includes(k)).length;
    expect(overlap).toBeGreaterThanOrEqual(4);
  });
});

describe('planFinance saat pendapatan kecil dan beban domain lain besar', () => {
  const tight: LedgerStats = { revenue: 40_000_000, cogs: 14_000_000, otherOpex: 90_000_000, firstRevenueDaysAgo: 130 };

  it.each(profiles.map((p) => [p.key, p] as const))('%s: tidak ada transaksi bernominal remeh dan beban tetap kecil', (_k, profile) => {
    const plan = planFinance(profile, TODAY, tight);
    const months = monthsBetween(plan.start, TODAY).length;
    expect(plan.budget).toBeGreaterThanOrEqual(Math.round(profile.fallbackMonthly * 0.3 * months));
    for (const e of plan.expenses) expect(e.amount).toBeGreaterThanOrEqual(e.category === 'umum' ? 25_000 : e.approval ? 300_000 : 100_000);
    const byCategory = new Set(plan.expenses.map((e) => e.category));
    expect([...byCategory].sort()).toEqual(['honor', 'internet', 'listrik', 'pemasaran', 'perawatan', 'sewa', 'umum']);
  });
});

describe('stabilitas kunci antar hari', () => {
  it('rencana esok hari memuat semua kunci rencana hari ini (seed yang diulang tidak membuat pengganti)', () => {
    const tomorrow: Ymd = addDays(TODAY, 1);
    const stats: LedgerStats = { ...BUSY, firstRevenueDaysAgo: (BUSY.firstRevenueDaysAgo ?? 0) + 1 };
    for (const profile of profiles) {
      const a = planFinance(profile, TODAY, BUSY);
      const b = planFinance(profile, tomorrow, stats);
      const keysB = new Set([...b.expenses.map((e) => e.key), ...b.fees.map((f) => f.key), ...b.transfers.map((t) => t.key)]);
      const keysA = [...a.expenses.map((e) => e.key), ...a.fees.map((f) => f.key), ...a.transfers.map((t) => t.key)];
      // Jendela pengeluaran harian bergeser sehari: paling banyak satu kunci harian tertua keluar dari jendela.
      const missing = keysA.filter((k) => !keysB.has(k));
      expect(missing.filter((k) => !k.startsWith('DEMO-FIN-UMUM-'))).toEqual([]);
      expect(missing.length).toBeLessThanOrEqual(1);
      expect(a.capital.key).toBe(b.capital.key);
      expect(a.assets.map((x) => x.code)).toEqual(b.assets.map((x) => x.code));
    }
  });
});

describe('planFinance di awal tahun', () => {
  it('tidak menghasilkan tanggal sebelum 2 Januari atau di masa depan', () => {
    const early: Ymd = { y: 2026, m: 1, d: 9 };
    for (const profile of profiles) {
      const plan = planFinance(profile, early, NONE);
      const floor = yearFloor(early);
      const all = [...plan.expenses.map((e) => e.date), ...plan.fees.map((f) => f.date), ...plan.assets.map((a) => a.date), ...plan.transfers.map((t) => t.date)];
      for (const d of all) {
        expect(isBefore(d, floor)).toBe(false);
        expect(isBefore(addDays(early, -1), d)).toBe(false);
      }
      expect(depreciationMonths(plan.assets, early)).toEqual([]);
    }
  });
});

describe('planSubsidiary', () => {
  it('margin anak usaha positif dan wajar, semua tanggal valid', () => {
    for (const profile of profiles) {
      const entries = planSubsidiary(profile, TODAY, BUSY, windowStart(TODAY, BUSY));
      const sum = (pred: (a: [string, string]) => boolean) => entries.filter((e) => pred(e.accounts)).reduce((s, e) => s + e.amount, 0);
      const revenue = sum((a) => a[1] === '4000');
      const costs = sum((a) => a[0].startsWith('5') || a[0].startsWith('6'));
      expect(revenue).toBeGreaterThan(0);
      expect((revenue - costs) / revenue).toBeGreaterThan(0.05);
      expect((revenue - costs) / revenue).toBeLessThan(0.3);
      expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
      for (const e of entries) expect(isBefore(addDays(TODAY, -1), e.date)).toBe(false);
    }
  });
});
