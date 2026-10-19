/**
 * Rencana keuangan yang deterministik (tanpa akses database, tanpa jam sistem).
 *
 * Besar beban dan aset tidak ditulis mati: dihitung dari pendapatan yang SUDAH ada di buku besar
 * (diberikan lewat LedgerStats) supaya laba rugi tetap wajar berapa pun besar penjualan yang diisi
 * domain lain. Masukan sama -> rencana sama, jadi seed aman diulang.
 */
import {
  addDays,
  clampDate,
  dayOfMonth,
  daysAgoOf,
  isBefore,
  isoDate,
  lastDayOfMonth,
  monthLabel,
  monthsBetween,
  yearFloor,
  type Ymd,
} from './calendar';
import {
  CATEGORY_ACCOUNT,
  type AssetSpec,
  type BankRole,
  type ExpenseCategory,
  type FinanceProfile,
  type VendorKey,
} from './profiles';
import { allocate, ceilTo, roundTo, unitFor } from './random';

export const PPN_RATE = 0.11;

export interface LedgerStats {
  revenue: number;
  cogs: number;
  /** beban operasional di luar akun milik domain ini (gaji payroll, perawatan armada, dst.) */
  otherOpex: number;
  /** berapa hari lalu pendapatan pertama tercatat; null bila belum ada pendapatan */
  firstRevenueDaysAgo: number | null;
}

export interface PlannedAsset {
  code: string;
  name: string;
  category: string;
  location: string;
  date: Ymd;
  cost: number;
  salvage: number;
  lifeMonths: number;
  method: 'straight_line' | 'declining_balance';
  rate?: number;
  disposeDate: Ymd | null;
}

export interface PlannedExpense {
  /** kunci alami, dipakai sebagai sourceRefId jurnal atau nomor faktur pemasok */
  key: string;
  category: ExpenseCategory;
  account: string;
  date: Ymd;
  /** nilai jurnal, atau DPP (sebelum PPN) bila berupa tagihan pemasok */
  amount: number;
  mode: 'bill' | 'journal';
  memo: string;
  vendor?: VendorKey;
  /** tanggal pelunasan tagihan; null = dibiarkan terbuka */
  paidOn?: Ymd | null;
  termDays?: number;
  /** rekening sumber dana untuk jurnal (role bank profil) */
  bank: BankRole;
  /** tagihan yang dipakai contoh alur persetujuan */
  approval?: 'two-step-pending' | 'approved';
}

export interface PlannedTransfer {
  key: string;
  date: Ymd;
  amount: number;
  toRole: BankRole;
  memo: string;
}

export interface PlannedFee {
  key: string;
  date: Ymd;
  amount: number;
  bank: BankRole;
  memo: string;
}

export interface PlannedReversal {
  key: string;
  date: Ymd;
  reverseDate: Ymd;
  amount: number;
  memo: string;
  wrongAccount: string;
  rightAccount: string;
}

export interface PlannedCapital {
  key: string;
  date: Ymd;
  amount: number;
  memo: string;
}

export interface FinancePlan {
  today: Ymd;
  start: Ymd;
  windowDays: number;
  scale: number;
  /** anggaran beban operasional domain ini (termasuk PPN masukan), di luar penyusutan */
  budget: number;
  capital: PlannedCapital;
  assets: PlannedAsset[];
  expenses: PlannedExpense[];
  transfers: PlannedTransfer[];
  fees: PlannedFee[];
  reversal: PlannedReversal | null;
  /** perkiraan total penyusutan yang akan terbentuk pada jendela rencana */
  estimatedDepreciation: number;
}

export interface DepreciationParams {
  cost: number;
  salvage: number;
  lifeMonths: number;
  method: 'straight_line' | 'declining_balance';
  rate?: number;
}

/** Rumus yang sama dengan AssetsService.computeDepreciation (diuji kesetaraannya di spec). */
export function monthlyDepreciation(a: DepreciationParams, accumulated: number): number {
  const base = a.cost - a.salvage;
  if (base <= 0) return 0;
  if (a.method === 'declining_balance') {
    const rate = a.rate ?? 0;
    if (rate <= 0) return 0;
    const monthly = ((a.cost - accumulated - a.salvage) * rate) / 12;
    return Math.round(Math.max(0, Math.min(monthly, base - accumulated)) * 100) / 100;
  }
  return Math.round(Math.max(0, Math.min(base / a.lifeMonths, base - accumulated)) * 100) / 100;
}

/** Awal jendela rencana: sejak pendapatan pertama (atau 150 hari bila belum ada), dalam batas tahun berjalan. */
export function windowStart(today: Ymd, stats: Pick<LedgerStats, 'firstRevenueDaysAgo'>): Ymd {
  const raw = stats.firstRevenueDaysAgo ?? 150;
  const days = Math.min(Math.max(raw, 14), 240);
  const floor = yearFloor(today);
  const start = addDays(today, -days);
  return isBefore(start, floor) ? floor : start;
}

export interface BudgetInput {
  revenue: number;
  cogs: number;
  otherOpex: number;
  depreciation: number;
  targetNetMargin: number;
  months: number;
  fallbackMonthly: number;
}

/**
 * Anggaran beban domain ini. Dengan pendapatan: laba bersih dibidik sebesar `targetNetMargin`,
 * jadi beban total = laba kotor - laba sasaran; yang sudah dipakai domain lain dan penyusutan dikurangkan.
 * Tanpa pendapatan: beban kecil saja.
 */
export function ownExpenseBudget(i: BudgetInput): number {
  if (i.revenue <= 0) return roundTo(i.fallbackMonthly * Math.max(1, i.months), 1_000);
  const gross = i.revenue - i.cogs;
  const raw = gross - i.revenue * i.targetNetMargin - i.otherOpex - i.depreciation;
  // Lantai: bila domain lain sudah memakai seluruh ruang laba, beban tetap tidak nol (sewa, listrik, dst. harus terlihat),
  // tapi tetap kecil dan sebanding dengan pendapatan.
  const floor = Math.max(i.revenue * 0.04, i.fallbackMonthly * 0.3 * Math.max(1, i.months));
  const cap = i.revenue * 0.4;
  return roundTo(Math.max(Math.min(raw, cap), floor), 1_000);
}

/** Skala nominal aset terhadap pendapatan bulanan nyata; tanpa pendapatan dipakai skala kecil. */
export function assetScale(revenue: number, windowDays: number, refMonthlyRevenue: number): number {
  if (revenue <= 0) return 0.3;
  const monthly = revenue / Math.max(1, windowDays / 30);
  return Math.min(Math.max(monthly / refMonthlyRevenue, 0.3), 1.6);
}

function planAssets(profile: FinanceProfile, start: Ymd, today: Ymd, windowDays: number, scale: number): PlannedAsset[] {
  const latest = addDays(today, -7);
  return profile.assets.map((spec: AssetSpec) => {
    const date = clampDate(addDays(start, Math.round(windowDays * spec.frac)), start, latest);
    const cost = Math.max(500_000, roundTo(spec.cost * scale, 500_000));
    const salvage = roundTo(cost * spec.salvagePct, 100_000);
    let disposeDate: Ymd | null = null;
    if (spec.disposeAt !== undefined) {
      const candidate = addDays(start, Math.round(windowDays * spec.disposeAt));
      // Dilepas hanya bila sudah dimiliki cukup lama dan jatuh sebelum hari ini.
      if (daysAgoOf(candidate, date) >= 30 && daysAgoOf(today, candidate) >= 3) disposeDate = candidate;
    }
    return {
      code: spec.code,
      name: spec.name,
      category: spec.category,
      location: spec.location,
      date,
      cost,
      salvage,
      lifeMonths: spec.lifeMonths,
      method: spec.method,
      rate: spec.rate,
      disposeDate,
    };
  });
}

/** Bulan-bulan yang sudah lewat penuh sejak perolehan pertama; penyusutan hanya dijalankan untuk bulan ini. */
export function depreciationMonths(assets: Pick<PlannedAsset, 'date'>[], today: Ymd) {
  if (assets.length === 0) return [];
  const first = assets.reduce((min, a) => (isBefore(a.date, min) ? a.date : min), assets[0].date);
  return monthsBetween(first, today).filter((m) => m.y < today.y || (m.y === today.y && m.m < today.m));
}

export function estimateDepreciation(assets: PlannedAsset[], today: Ymd): number {
  let total = 0;
  const accumulated = new Map<string, number>();
  for (const month of depreciationMonths(assets, today)) {
    const end = lastDayOfMonth(month.y, month.m);
    for (const a of assets) {
      const gone = a.disposeDate !== null && isBefore(a.disposeDate, end);
      if (isBefore(end, a.date) || gone) continue;
      const acc = accumulated.get(a.code) ?? 0;
      const dep = monthlyDepreciation(a, acc);
      accumulated.set(a.code, acc + dep);
      total += dep;
    }
  }
  return total;
}

const CATEGORY_TAXED: Record<ExpenseCategory, boolean> = {
  sewa: true,
  listrik: false,
  internet: true,
  honor: false,
  pemasaran: true,
  perawatan: false,
  umum: false,
};

const CATEGORY_VENDOR: Partial<Record<ExpenseCategory, VendorKey>> = {
  sewa: 'sewa',
  internet: 'internet',
  pemasaran: 'pemasaran',
};

interface Slot {
  category: ExpenseCategory;
  date: Ymd;
  key: string;
}

function pick<T>(list: T[], key: string): T {
  return list[Math.floor(unitFor(`pick:${key}`) * list.length) % list.length];
}

function slotsFor(profile: FinanceProfile, start: Ymd, today: Ymd): Slot[] {
  const lastDay = addDays(today, -1);
  const months = monthsBetween(start, today);
  const slots: Slot[] = [];
  const add = (category: ExpenseCategory, date: Ymd, suffix = '') => {
    if (isBefore(date, start) || isBefore(lastDay, date)) return;
    slots.push({ category, date, key: `DEMO-FIN-${category.toUpperCase()}-${isoDate(date)}${suffix}` });
  };

  for (const mo of months) {
    add('sewa', dayOfMonth(mo.y, mo.m, 2));
    add('internet', dayOfMonth(mo.y, mo.m, 6));
    add('pemasaran', dayOfMonth(mo.y, mo.m, 10 + Math.floor(unitFor(`${profile.key}:mkt:${mo.code}`) * 12)));
    add('listrik', dayOfMonth(mo.y, mo.m, 18 + Math.floor(unitFor(`${profile.key}:pln:${mo.code}`) * 3)));
    add('honor', dayOfMonth(mo.y, mo.m, 14), '-A');
    add('honor', dayOfMonth(mo.y, mo.m, 28), '-B');
    const repairs = 1 + Math.floor(unitFor(`${profile.key}:rep:${mo.code}`) * 2);
    for (let r = 0; r < repairs; r++) {
      const day = 5 + Math.floor(unitFor(`${profile.key}:rep:${mo.code}:${r}`) * 22);
      add('perawatan', dayOfMonth(mo.y, mo.m, day), `-${r + 1}`);
    }
  }

  // Pengeluaran kecil harian hanya 75 hari terakhir: cukup untuk grafik arus kas harian yang hidup.
  // Dipilih per tanggal (bukan per langkah dari hari ini) supaya kunci tetap sama bila seed dijalankan di hari lain.
  let cursor = addDays(today, -75);
  if (isBefore(cursor, start)) cursor = start;
  while (!isBefore(lastDay, cursor)) {
    if (unitFor(`${profile.key}:umum:${isoDate(cursor)}`) < 0.4) add('umum', cursor);
    cursor = addDays(cursor, 1);
  }
  return slots.sort((a, b) => (isBefore(a.date, b.date) ? -1 : isBefore(b.date, a.date) ? 1 : a.key.localeCompare(b.key)));
}

/** Nominal wajar terkecil per transaksi; bila anggaran kategori lebih kecil, jumlah transaksinya dikurangi (bukan nominalnya). */
const MIN_AMOUNT: Record<ExpenseCategory, number> = {
  sewa: 500_000,
  internet: 150_000,
  listrik: 150_000,
  honor: 100_000,
  pemasaran: 200_000,
  perawatan: 150_000,
  umum: 25_000,
};

/**
 * Ambil `count` elemen. Pilihan ditentukan oleh nilai hash kunci tiap elemen (bukan indeks), jadi bertambahnya satu
 * elemen baru di ujung daftar tidak menggeser seluruh pilihan dan seed yang diulang di hari lain tidak membuat
 * transaksi pengganti. Urutan asli dipertahankan.
 */
export function thin<T>(list: T[], count: number, keyOf: (item: T) => string): T[] {
  if (count >= list.length) return list;
  const picked = new Set(
    list
      .map((item, index) => ({ index, score: unitFor(`thin:${keyOf(item)}`) }))
      .sort((x, y) => x.score - y.score || x.index - y.index)
      .slice(0, Math.max(1, count))
      .map((x) => x.index),
  );
  return list.filter((_, index) => picked.has(index));
}

function planExpenses(profile: FinanceProfile, slots: Slot[], budget: number, today: Ymd): PlannedExpense[] {
  const totalShare = Object.values(profile.shares).reduce((s, v) => s + v, 0) || 1;
  const byCategory = new Map<ExpenseCategory, Slot[]>();
  for (const s of slots) byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s]);

  const out: PlannedExpense[] = [];
  const bankOf = (c: ExpenseCategory): BankRole =>
    c === 'listrik' ? 'utilities' : c === 'honor' && profile.banks.some((b) => b.role === 'payroll') ? 'payroll' : 'main';

  for (const [category, all] of byCategory) {
    const share = profile.shares[category] / totalShare;
    // Tagihan ber-PPN: DPP dibagi 1,11 supaya DPP + PPN tetap sebesar porsi anggarannya.
    const base = (budget * share) / (CATEGORY_TAXED[category] ? 1 + PPN_RATE : 1);
    const list = thin(all, Math.max(1, Math.floor(base / MIN_AMOUNT[category])), (slot) => slot.key);
    const spread = category === 'pemasaran' ? 1.4 : category === 'perawatan' ? 0.9 : 0.5;
    const weights = list.map((s) => 1 - spread / 2 + unitFor(`w:${s.key}`) * spread);
    // Satu-satunya transaksi tidak boleh remeh: dinaikkan ke nominal wajar terkecil.
    const amounts = list.length === 1 ? [Math.max(roundTo(base, 1_000), MIN_AMOUNT[category])] : allocate(base, weights, 1_000, MIN_AMOUNT[category]);
    const vendor = CATEGORY_VENDOR[category];
    const vendorSpec = vendor ? profile.vendors.find((v) => v.key === vendor) : undefined;

    list.forEach((slot, idx) => {
      const amount = amounts[idx];
      if (!(amount >= 1_000)) return;
      const label = monthLabel(slot.date.y, slot.date.m);
      let memo = '';
      if (category === 'sewa') memo = `${profile.sewaLabel}, ${label}`;
      else if (category === 'internet') memo = `Langganan internet fiber bisnis, ${label}`;
      else if (category === 'listrik') memo = `Listrik dan air, ${label}`;
      else memo = `${pick(profile.memos[category], slot.key)}, ${label}`;

      let paidOn: Ymd | null | undefined;
      if (vendorSpec) {
        const due = addDays(slot.date, vendorSpec.termDays);
        paidOn = addDays(due, Math.floor(unitFor(`pay:${slot.key}`) * 3) - 1);
        // Tagihan terbaru belum jatuh tempo/dibayar; satu tagihan pemasaran sebelumnya sengaja menunggak.
        if (!isBefore(paidOn, addDays(today, -1))) paidOn = null;
        if (category === 'pemasaran' && idx === list.length - 2 && list.length >= 3) paidOn = null;
      }

      out.push({
        key: slot.key,
        category,
        account: CATEGORY_ACCOUNT[category],
        date: slot.date,
        amount,
        mode: vendor ? 'bill' : 'journal',
        memo,
        vendor,
        paidOn,
        termDays: vendorSpec?.termDays,
        bank: bankOf(category),
      });
    });
  }
  return out.sort((a, b) => (isBefore(a.date, b.date) ? -1 : isBefore(b.date, a.date) ? 1 : a.key.localeCompare(b.key)));
}

const APPROVAL_BILL_SHARE = 0.12;

function byDateThenKey(a: { date: Ymd; key: string }, b: { date: Ymd; key: string }): number {
  return isBefore(a.date, b.date) ? -1 : isBefore(b.date, a.date) ? 1 : a.key.localeCompare(b.key);
}

function planApprovalBills(profile: FinanceProfile, budget: number, start: Ymd, today: Ymd): PlannedExpense[] {
  const vendor = profile.vendors.find((v) => v.key === 'perawatan');
  if (!vendor) return [];
  const make = (n: number, daysBack: number, share: number, memo: string, paidBack: number | null): PlannedExpense | null => {
    const date = clampDate(addDays(today, -daysBack), start, addDays(today, -1));
    const amount = Math.max(300_000, roundTo((budget * share) / (1 + PPN_RATE), 1_000));
    if (amount < 1_000) return null;
    return {
      key: `DEMO-FIN-APR-${n}`,
      category: 'perawatan',
      account: CATEGORY_ACCOUNT.perawatan,
      date,
      amount,
      mode: 'bill',
      memo,
      vendor: 'perawatan',
      paidOn: paidBack === null ? null : clampDate(addDays(today, -paidBack), date, addDays(today, -1)),
      termDays: vendor.termDays,
      bank: 'main',
      approval: paidBack === null ? 'two-step-pending' : 'approved',
    };
  };
  return [
    make(1, 5, APPROVAL_BILL_SHARE * 0.58, 'Penggantian komponen besar dan servis menyeluruh peralatan', null),
    make(2, 22, APPROVAL_BILL_SHARE * 0.42, 'Perbaikan instalasi listrik dan pemasangan stabilizer', 7),
  ].filter((e): e is PlannedExpense => e !== null);
}

const FEE_BY_ROLE: Record<BankRole, number> = { main: 12_500, utilities: 15_000, payroll: 10_000 };

function planFees(profile: FinanceProfile, start: Ymd, today: Ymd): PlannedFee[] {
  const fees: PlannedFee[] = [];
  for (const mo of monthsBetween(start, today)) {
    const date = lastDayOfMonth(mo.y, mo.m);
    // Hanya bulan yang sudah berakhir.
    if (isBefore(date, start) || !isBefore(date, addDays(today, -1))) continue;
    for (const bank of profile.banks) {
      fees.push({
        key: `DEMO-FIN-FEE-${bank.code}-${mo.code}`,
        date,
        amount: FEE_BY_ROLE[bank.role],
        bank: bank.role,
        memo: `Biaya administrasi ${bank.bankName}, ${mo.label}`,
      });
    }
  }
  return fees;
}

function planTransfers(profile: FinanceProfile, expenses: PlannedExpense[], fees: PlannedFee[], start: Ymd): PlannedTransfer[] {
  const out: PlannedTransfer[] = [];
  for (const bank of profile.banks) {
    if (bank.role === 'main') continue;
    const need = new Map<string, { first: Ymd; sum: number }>();
    const note = (date: Ymd, amount: number) => {
      const code = `${date.y}-${String(date.m).padStart(2, '0')}`;
      const cur = need.get(code);
      need.set(code, { first: cur && isBefore(cur.first, date) ? cur.first : date, sum: (cur?.sum ?? 0) + amount });
    };
    for (const e of expenses) if (e.mode === 'journal' && e.bank === bank.role) note(e.date, e.amount);
    for (const f of fees) if (f.bank === bank.role) note(f.date, f.amount);
    for (const [code, { first, sum }] of need) {
      const date = clampDate(addDays(first, -1), start, first);
      out.push({
        key: `DEMO-FIN-TRF-${bank.code}-${code}`,
        date,
        amount: ceilTo(sum, 100_000),
        toRole: bank.role,
        memo: `Pengisian saldo ${bank.name}, ${monthLabel(first.y, first.m)}`,
      });
    }
  }
  return out.sort((a, b) => (isBefore(a.date, b.date) ? -1 : isBefore(b.date, a.date) ? 1 : a.key.localeCompare(b.key)));
}

export function planFinance(profile: FinanceProfile, today: Ymd, stats: LedgerStats): FinancePlan {
  const start = windowStart(today, stats);
  const windowDays = Math.max(1, daysAgoOf(today, start));
  const months = monthsBetween(start, today).length;
  const scale = assetScale(stats.revenue, windowDays, profile.refMonthlyRevenue);
  const assets = planAssets(profile, start, today, windowDays, scale);
  const estimatedDepreciation = estimateDepreciation(assets, today);

  const budget = ownExpenseBudget({
    revenue: stats.revenue,
    cogs: stats.cogs,
    otherOpex: stats.otherOpex,
    depreciation: estimatedDepreciation,
    targetNetMargin: profile.targetNetMargin,
    months,
    fallbackMonthly: profile.fallbackMonthly,
  });

  // Dua tagihan perawatan besar disisihkan untuk contoh persetujuan; sisanya dibagi ke pos rutin.
  const slots = slotsFor(profile, start, today);
  const expenses = [
    ...planExpenses(profile, slots, budget * (1 - APPROVAL_BILL_SHARE), today),
    ...planApprovalBills(profile, budget, start, today),
  ].sort(byDateThenKey);
  const fees = planFees(profile, start, today);
  const transfers = planTransfers(profile, expenses, fees, start);

  const assetsTotal = assets.reduce((s, a) => s + a.cost, 0);
  const monthlyOut = budget / Math.max(1, months);
  const capital: PlannedCapital = {
    key: 'DEMO-FIN-CAP-001',
    date: start,
    amount: Math.max(25_000_000, ceilTo(assetsTotal + monthlyOut * 2, 5_000_000)),
    memo: 'Setoran modal pemilik untuk pembelian aset dan modal kerja',
  };

  let reversal: PlannedReversal | null = null;
  const reversalDate = addDays(today, -24);
  if (!isBefore(reversalDate, addDays(start, 5))) {
    reversal = {
      key: 'DEMO-FIN-REV-001',
      date: reversalDate,
      reverseDate: addDays(reversalDate, 2),
      amount: Math.max(150_000, roundTo(budget * 0.03, 5_000)),
      memo: profile.reversalMemo,
      wrongAccount: CATEGORY_ACCOUNT.perawatan,
      rightAccount: CATEGORY_ACCOUNT.pemasaran,
    };
  }

  return { today, start, windowDays, scale, budget, capital, assets, expenses, transfers, fees, reversal, estimatedDepreciation };
}

/** Rencana anak usaha: modal awal lalu satu rangkaian jurnal ringkas per bulan. */
export interface PlannedSubsidiaryEntry {
  key: string;
  date: Ymd;
  memo: string;
  /** pasangan debit/kredit [kodeAkunDebit, kodeAkunKredit] */
  accounts: [string, string];
  amount: number;
}

export function planSubsidiary(
  profile: FinanceProfile,
  today: Ymd,
  stats: Pick<LedgerStats, 'revenue'>,
  start: Ymd,
): PlannedSubsidiaryEntry[] {
  const sub = profile.subsidiary;
  const spanDays = Math.max(1, daysAgoOf(today, start));
  const monthlyMain = stats.revenue > 0 ? stats.revenue / Math.max(1, spanDays / 30) : profile.refMonthlyRevenue * 0.4;
  const monthlySales = Math.max(5_000_000, roundTo(monthlyMain * sub.salesShare, 100_000));
  const first = addDays(today, -105);
  const from = isBefore(first, start) ? start : first;
  const lastDay = addDays(today, -1);

  const out: PlannedSubsidiaryEntry[] = [];
  const capitalDate = clampDate(from, yearFloor(today), lastDay);
  out.push({
    key: `DEMO-FIN-SUB-${sub.code}-CAP`,
    date: capitalDate,
    memo: `Setoran modal awal ${sub.name}`,
    accounts: ['1000', '3000'],
    amount: Math.max(20_000_000, ceilTo(monthlySales * 1.5, 5_000_000)),
  });

  for (const mo of monthsBetween(from, today)) {
    const monthEnd = lastDayOfMonth(mo.y, mo.m);
    const at = (d: number): Ymd => {
      const date = dayOfMonth(mo.y, mo.m, d);
      return isBefore(lastDay, date) ? lastDay : date;
    };
    const rows: Array<[string, number, string, [string, string], number]> = [
      ['SALES', 26, `${sub.salesLabel}, ${mo.label}`, ['1000', '4000'], 1],
      ['COGS', 26, `${sub.costLabel}, ${mo.label}`, ['5000', '1000'], -0.55],
      ['RENT', 3, `Sewa tempat usaha, ${mo.label}`, ['6600', '1000'], -0.11],
      ['HONOR', 28, `Upah dan honor kru, ${mo.label}`, ['6630', '1000'], -0.15],
      ['UMUM', 12, `Perlengkapan dan operasional, ${mo.label}`, ['6670', '1000'], -0.03],
    ];
    for (const [kind, day, memo, accounts, factor] of rows) {
      const date = at(day);
      if (isBefore(date, from) || isBefore(lastDay, date)) continue;
      // Bulan berjalan baru sebagian: jumlahnya ikut mengecil menurut porsi hari yang sudah lewat.
      const portion = isBefore(monthEnd, today) ? 1 : Math.min(1, today.d / monthEnd.d);
      // Satu faktor bulanan dipakai bersama supaya margin anak usaha tidak melompat; tiap baris hanya bergeser sedikit.
      const month = 0.9 + unitFor(`sub:${sub.code}:${mo.code}`) * 0.2;
      const line = 0.97 + unitFor(`sub:${sub.code}:${kind}:${mo.code}`) * 0.06;
      const amount = roundTo(monthlySales * Math.abs(factor) * month * line * portion, 1_000);
      if (amount < 1_000) continue;
      out.push({ key: `DEMO-FIN-SUB-${sub.code}-${kind}-${mo.code}`, date, memo, accounts, amount });
    }
  }
  return out;
}
