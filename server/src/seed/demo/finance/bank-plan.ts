/**
 * Rencana mutasi rekening koran contoh (tanpa akses database).
 *
 * Mutasi diturunkan dari baris kas yang SUDAH ada di buku besar supaya sebagian bisa direkonsiliasi
 * lewat BankingService (nominal sama, tanggal berselisih paling banyak 3 hari). Sebagian sengaja dibiarkan
 * belum diproses, dan ada mutasi yang tidak punya jurnal sama sekali (bunga, setoran tanpa keterangan,
 * debet otomatis) sehingga daftar "Belum cocok" tidak kosong.
 */
import { addDays, isBefore, lastDayOfMonth, monthsBetween, type Ymd } from './calendar';
import { roundTo, unitFor } from './random';

export interface CashLine {
  journalNumber: string;
  date: Ymd;
  /** nominal positif */
  amount: number;
  /** debit pada akun kas = uang masuk */
  direction: 'debit' | 'credit';
  source: string;
  memo: string;
}

export interface PlannedStatement {
  reference: string;
  date: Ymd;
  description: string;
  /** bertanda: positif masuk, negatif keluar */
  amount: number;
  /** match = coba direkonsiliasi ke jurnal; open = dibiarkan belum cocok */
  intent: 'match' | 'open';
  /** tanggal jurnal yang dicocokkan (untuk memanggil rekonsiliasi) */
  journalDate?: Ymd;
}

export interface StatementPlanInput {
  bankCode: string;
  lines: CashLine[];
  today: Ymd;
  /** berapa hari ke belakang mutasi dibuat */
  windowDays: number;
  /** batas perkiraan jumlah mutasi dari buku besar */
  maxFromLedger: number;
  /** batas perkiraan jumlah mutasi dari transaksi kasir (settlement) */
  maxPos: number;
  /** peluang sebuah mutasi dari buku besar dicocokkan */
  matchRate: number;
  /** jumlah mutasi tanpa jurnal selain bunga */
  strayCount: number;
}

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}.` : text);

export function describeLine(line: CashLine): string {
  const memo = line.memo.trim();
  if (line.direction === 'debit') {
    if (line.source === 'pos' || line.source === 'sales') return 'SETTLEMENT PENJUALAN HARIAN';
    return shorten(`TRSF MASUK ${memo || line.source}`.toUpperCase(), 90);
  }
  if (line.source === 'tax') return shorten(`SETORAN PAJAK ${memo}`.toUpperCase(), 90);
  if (line.source === 'assets') return shorten(`PEMBELIAN ASET ${memo}`.toUpperCase(), 90);
  return shorten(`TRSF KELUAR ${memo || line.source}`.toUpperCase(), 90);
}

export function planStatements(input: StatementPlanInput): PlannedStatement[] {
  const { bankCode, today, windowDays } = input;
  const since = addDays(today, -windowDays);
  const lastDay = addDays(today, -1);

  const inWindow = input.lines.filter((l) => !isBefore(l.date, since) && !isBefore(lastDay, l.date));
  const isPos = (l: CashLine) => l.source === 'pos' || l.source === 'sales';
  const pos = inWindow.filter(isPos);
  const rest = inWindow.filter((l) => !isPos(l));
  const pPos = pos.length === 0 ? 0 : Math.min(1, input.maxPos / pos.length);
  const pRest = rest.length === 0 ? 0 : Math.min(1, input.maxFromLedger / rest.length);

  const out: PlannedStatement[] = [];
  const used = new Set<string>();
  const take = (line: CashLine, p: number) => {
    const reference = `DEMO-STM-${bankCode}-${line.journalNumber}`;
    if (used.has(reference)) return;
    if (unitFor(`sel:${reference}`) >= p) return;
    used.add(reference);
    const lag = line.direction === 'debit' ? [0, 1, 1][Math.floor(unitFor(`lag:${reference}`) * 3)] : [0, 1, 2][Math.floor(unitFor(`lag:${reference}`) * 3)];
    let date = addDays(line.date, lag);
    if (isBefore(today, date)) date = today;
    out.push({
      reference,
      date,
      description: describeLine(line),
      amount: line.direction === 'debit' ? line.amount : -line.amount,
      intent: unitFor(`m:${reference}`) < input.matchRate ? 'match' : 'open',
      journalDate: line.date,
    });
  };
  for (const l of pos) take(l, pPos);
  for (const l of rest) take(l, pRest);

  // Mutasi tanpa jurnal: bunga bulanan, lalu beberapa setoran/debet yang belum dikenali.
  for (const mo of monthsBetween(since, today)) {
    const end = lastDayOfMonth(mo.y, mo.m);
    if (isBefore(end, since) || !isBefore(end, today)) continue;
    out.push({
      reference: `DEMO-STM-${bankCode}-INT-${mo.code}`,
      date: end,
      description: `BUNGA JASA GIRO ${mo.code}`,
      amount: roundTo(8_000 + unitFor(`int:${bankCode}:${mo.code}`) * 30_000, 100),
      intent: 'open',
    });
  }
  for (let k = 0; k < input.strayCount; k++) {
    const day = Math.floor(unitFor(`stray-day:${bankCode}:${k}`) * Math.max(1, windowDays - 2)) + 1;
    const date = addDays(today, -day);
    const incoming = k % 3 !== 2;
    const amount = roundTo(150_000 + unitFor(`stray-amt:${bankCode}:${k}`) * 2_350_000, 1_000);
    out.push({
      reference: `DEMO-STM-${bankCode}-X-${k + 1}`,
      date,
      description: incoming ? 'TRSF MASUK TANPA KETERANGAN' : 'DEBET OTOMATIS ASURANSI',
      amount: incoming ? amount : -roundTo(amount / 4, 1_000),
      intent: 'open',
    });
  }

  return out.sort((a, b) => (isBefore(a.date, b.date) ? -1 : isBefore(b.date, a.date) ? 1 : a.reference.localeCompare(b.reference)));
}

