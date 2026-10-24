// Pembuat CSV kecil untuk ekspor dari panel. Nilai yang diawali = + - @ (atau tab/CR) diberi awalan apostrof supaya
// Excel/Sheets tidak menjalankannya sebagai rumus (CSV injection), mengingat isinya berasal dari input orang luar.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<{ key: keyof T & string; header: string }>): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key])).join(','));
  // BOM supaya Excel membaca UTF-8 dengan benar.
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Unduh teks sebagai berkas di peramban. */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
