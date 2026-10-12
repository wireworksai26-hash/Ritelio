/** Selisih tanggal (hari) yang masih dianggap sama antara mutasi bank dan jurnal kas. */
export const MATCH_DATE_TOLERANCE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sisi akun kas yang berubah untuk sebuah mutasi bank.
 *
 * Kas adalah akun aset: uang masuk menambah saldo → DEBIT kas (sama seperti
 * receivables.receive: Dr Kas / Cr Piutang), uang keluar → KREDIT kas
 * (payables.pay: Dr Utang / Cr Kas).
 */
export function cashDirectionFor(statementAmount: number): 'debit' | 'credit' {
  return statementAmount >= 0 ? 'debit' : 'credit';
}

/** Rentang [from, to) yang mencakup `toleranceDays` hari sebelum dan sesudah `target` (hari penuh UTC). */
export function matchWindow(target: Date, toleranceDays = MATCH_DATE_TOLERANCE_DAYS) {
  const day = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return {
    from: new Date(day - toleranceDays * DAY_MS),
    to: new Date(day + (toleranceDays + 1) * DAY_MS),
  };
}

/** Kandidat dengan tanggal jurnal paling dekat ke `target`; null bila daftar kosong. */
export function pickClosestByDate<T extends { journal: { entryDate: Date } }>(
  candidates: T[],
  target: Date,
): T | null {
  let best: T | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const gap = Math.abs(candidate.journal.entryDate.getTime() - target.getTime());
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}
