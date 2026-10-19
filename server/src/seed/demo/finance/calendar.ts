/**
 * Kalender murni untuk rencana domain keuangan (tanpa database, tanpa jam sistem).
 *
 * "Hari ini" mengikuti cara DemoContext menghitung tanggal: tanggal UTC dari `now`, mundur n hari.
 * Semua rencana memakai tanggal kalender (Ymd) lalu diubah ke "n hari lalu" saat dieksekusi lewat ctx.at().
 */

export interface Ymd {
  y: number;
  /** 1..12 */
  m: number;
  d: number;
}

export interface MonthSpan {
  y: number;
  m: number;
  /** YYYY-MM, sama dengan kode periode fiskal */
  code: string;
  label: string;
}

const DAY_MS = 86_400_000;

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;

export function todayOf(now: Date): Ymd {
  return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
}

export function dayNumber(x: Ymd): number {
  return Math.floor(Date.UTC(x.y, x.m - 1, x.d) / DAY_MS);
}

export function fromDayNumber(n: number): Ymd {
  const d = new Date(n * DAY_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Selisih hari: berapa hari `target` sebelum `today` (negatif bila di masa depan). */
export function daysAgoOf(today: Ymd, target: Ymd): number {
  return dayNumber(today) - dayNumber(target);
}

export function addDays(x: Ymd, n: number): Ymd {
  return fromDayNumber(dayNumber(x) + n);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Hari ke-d pada bulan itu, dipotong ke hari terakhir bulan (mis. tanggal 31 di Februari). */
export function dayOfMonth(y: number, m: number, d: number): Ymd {
  return { y, m, d: Math.min(d, daysInMonth(y, m)) };
}

export function lastDayOfMonth(y: number, m: number): Ymd {
  return { y, m, d: daysInMonth(y, m) };
}

export function isoDate(x: Ymd): string {
  return `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
}

export function monthCode(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function monthLabel(y: number, m: number): string {
  return `${MONTH_NAMES_ID[m - 1]} ${y}`;
}

export function isBefore(a: Ymd, b: Ymd): boolean {
  return dayNumber(a) < dayNumber(b);
}

export function clampDate(x: Ymd, min: Ymd, max: Ymd): Ymd {
  if (isBefore(x, min)) return min;
  if (isBefore(max, x)) return max;
  return x;
}

/** Bulan kalender dari bulan `start` sampai bulan `end`, keduanya ikut. */
export function monthsBetween(start: Ymd, end: Ymd): MonthSpan[] {
  const out: MonthSpan[] = [];
  let y = start.y;
  let m = start.m;
  while (y < end.y || (y === end.y && m <= end.m)) {
    out.push({ y, m, code: monthCode(y, m), label: monthLabel(y, m) });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Awal tahun berjalan yang aman dipakai (2 Januari, sama dengan batas bawah DemoContext). */
export function yearFloor(today: Ymd): Ymd {
  return { y: today.y, m: 1, d: 2 };
}
