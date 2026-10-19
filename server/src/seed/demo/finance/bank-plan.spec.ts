import { describe, expect, it } from 'vitest';
import { MATCH_DATE_TOLERANCE_DAYS } from '../../../modules/banking/bank-match';
import { addDays, daysAgoOf, isBefore, type Ymd } from './calendar';
import { describeLine, planStatements, type CashLine, type StatementPlanInput } from './bank-plan';

const TODAY: Ymd = { y: 2026, m: 10, d: 19 };

function makeLines(n: number): CashLine[] {
  const lines: CashLine[] = [];
  for (let i = 0; i < n; i++) {
    const out = i % 3 === 0;
    lines.push({
      journalNumber: `JRN-202609-${String(i + 1).padStart(6, '0')}`,
      date: addDays(TODAY, -(1 + (i % 58))),
      amount: 25_000 + i * 1_337,
      direction: out ? 'credit' : 'debit',
      source: i % 4 === 0 ? 'pos' : out ? 'payables' : 'receivables',
      memo: out ? `Pembayaran faktur AP-2026-${i}` : `Penerimaan faktur AR-2026-${i}`,
    });
  }
  return lines;
}

const base = (lines: CashLine[]): StatementPlanInput => ({
  bankCode: 'BCA-UTAMA',
  lines,
  today: TODAY,
  windowDays: 60,
  maxFromLedger: 40,
  maxPos: 10,
  matchRate: 0.8,
  strayCount: 5,
});

describe('planStatements', () => {
  const lines = makeLines(200);
  const plan = planStatements(base(lines));

  it('deterministik', () => {
    expect(planStatements(base(lines))).toEqual(plan);
  });

  it('referensi unik dan berawalan DEMO-STM-', () => {
    const refs = plan.map((s) => s.reference);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.every((r) => r.startsWith('DEMO-STM-BCA-UTAMA-'))).toBe(true);
  });

  it('tidak ada mutasi di masa depan atau di luar jendela', () => {
    for (const s of plan) {
      expect(isBefore(TODAY, s.date)).toBe(false);
      expect(daysAgoOf(TODAY, s.date)).toBeLessThanOrEqual(60);
    }
  });

  it('mutasi yang akan dicocokkan berselisih tanggal dalam toleransi layanan rekonsiliasi', () => {
    const matchable = plan.filter((s) => s.journalDate);
    expect(matchable.length).toBeGreaterThan(20);
    for (const s of matchable) {
      expect(Math.abs(daysAgoOf(s.date, s.journalDate!))).toBeLessThanOrEqual(MATCH_DATE_TOLERANCE_DAYS);
    }
  });

  it('arah dan nominal mengikuti jurnal: masuk positif, keluar negatif', () => {
    const byNumber = new Map(lines.map((l) => [`DEMO-STM-BCA-UTAMA-${l.journalNumber}`, l]));
    for (const s of plan.filter((x) => x.journalDate)) {
      const l = byNumber.get(s.reference)!;
      expect(s.amount).toBe(l.direction === 'debit' ? l.amount : -l.amount);
    }
  });

  it('campuran: sebagian besar dicocokkan, sebagian dibiarkan, ada mutasi tanpa jurnal', () => {
    const match = plan.filter((s) => s.intent === 'match').length;
    const ratio = match / plan.length;
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.9);
    const strays = plan.filter((s) => !s.journalDate);
    expect(strays.length).toBeGreaterThanOrEqual(5);
    expect(strays.every((s) => s.intent === 'open')).toBe(true);
  });

  it('jumlah dari buku besar dibatasi', () => {
    const fromLedger = plan.filter((s) => s.journalDate);
    expect(fromLedger.length).toBeLessThanOrEqual(80);
  });

  it('tanpa baris kas: hanya mutasi tanpa jurnal', () => {
    const empty = planStatements(base([]));
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((s) => !s.journalDate && s.intent === 'open')).toBe(true);
  });

  it('bunga hanya untuk bulan yang sudah berakhir', () => {
    const interest = plan.filter((s) => s.reference.includes('-INT-'));
    expect(interest.length).toBeGreaterThan(0);
    for (const s of interest) expect(isBefore(s.date, TODAY)).toBe(true);
  });

  it('mutasi dari bank sekunder tanpa settlement kasir', () => {
    const p = planStatements({ ...base(lines), bankCode: 'MDR-OPS', maxPos: 0 });
    const posNumbers = new Set(lines.filter((l) => l.source === 'pos').map((l) => `DEMO-STM-MDR-OPS-${l.journalNumber}`));
    expect(p.some((s) => posNumbers.has(s.reference))).toBe(false);
  });
});

describe('describeLine', () => {
  it('menamai mutasi menurut sumber dan arah', () => {
    const line = (over: Partial<CashLine>): CashLine => ({
      journalNumber: 'J',
      date: TODAY,
      amount: 1,
      direction: 'debit',
      source: 'receivables',
      memo: 'Penerimaan faktur AR-1',
      ...over,
    });
    expect(describeLine(line({ source: 'pos' }))).toBe('SETTLEMENT PENJUALAN HARIAN');
    expect(describeLine(line({}))).toContain('TRSF MASUK');
    expect(describeLine(line({ direction: 'credit', source: 'tax', memo: 'Pembayaran PPN' }))).toContain('SETORAN PAJAK');
    expect(describeLine(line({ direction: 'credit', memo: 'x'.repeat(200) })).length).toBeLessThanOrEqual(90);
  });
});
