export interface BankAccount {
  id: string;
  code: string;
  name: string;
  bankName: string;
  accountNumber: string;
  currencyCode: string;
  account?: { code: string; name: string } | null;
}

export interface BankStatement {
  id: string;
  bankAccountId: string;
  statementDate: string;
  description: string;
  reference: string;
  amount: number | string;
  isReconciled: boolean;
  matchedJournalId: string | null;
  matchedAt: string | null;
}

export interface BankSummary {
  bankAccountId: string;
  code: string;
  name: string;
  totalStatements: number | string;
  reconciledAmount: number | string;
  unreconciledCount: number;
}

export const num = (v: unknown) => Number(v) || 0;

/** Parse angka gaya Indonesia ("1.234.567,89") maupun gaya internasional ("1234567.89"). */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/^rp\.?\s*/i, '').replace(/\s+/g, '');
  if (!s) return null;
  let sign = 1;
  if (s.startsWith('(') && s.endsWith(')')) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    sign = -sign;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  if (s.includes(',') && s.includes('.')) {
    // pemisah desimal = yang muncul terakhir
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? sign * n : null;
}

/** "2026-10-11" atau "11/10/2026" -> "2026-10-11"; selain itu null. */
export function parseDateInput(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export interface ParsedStatementRow {
  line: number;
  statementDate?: string;
  description?: string;
  reference?: string;
  amount?: number;
  error?: string;
}

/** Format kolom: tanggal, deskripsi, [referensi], jumlah. Pemisah koma, titik koma, atau tab. */
export function parseStatementCsv(text: string): ParsedStatementRow[] {
  const rows: ParsedStatementRow[] = [];
  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) return;
    const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const date = parseDateInput(cols[0] ?? '');
    // Baris judul kolom (kolom pertama bukan tanggal pada baris pertama) dilewati diam-diam
    if (!date && rows.length === 0 && idx === 0) return;
    if (cols.length < 3 || cols.length > 4) {
      rows.push({ line: idx + 1, error: 'Butuh 3-4 kolom: tanggal, deskripsi, [referensi], jumlah.' });
      return;
    }
    const amount = parseAmount(cols[cols.length - 1]);
    if (!date) rows.push({ line: idx + 1, error: 'Tanggal tidak valid (pakai YYYY-MM-DD atau DD/MM/YYYY).' });
    else if (amount === null) rows.push({ line: idx + 1, error: 'Jumlah tidak valid.' });
    else if (!cols[1]) rows.push({ line: idx + 1, error: 'Deskripsi kosong.' });
    else
      rows.push({
        line: idx + 1,
        statementDate: date,
        description: cols[1].slice(0, 255),
        reference: cols.length === 4 ? cols[2].slice(0, 80) : '',
        amount: Math.round(amount * 100) / 100,
      });
  });
  return rows;
}
