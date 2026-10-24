import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it('nilai biasa apa adanya; kosong menjadi string kosong', () => {
    expect(csvCell('budi@contoh.id')).toBe('budi@contoh.id');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('koma, tanda kutip, dan baris baru dibungkus dan di-escape', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('dia "bilang"')).toBe('"dia ""bilang"""');
    expect(csvCell('baris1\nbaris2')).toBe('"baris1\nbaris2"');
  });

  it('awalan rumus dinetralkan agar tidak dijalankan Excel', () => {
    for (const bad of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd']) {
      expect(csvCell(bad).replace(/^"/, '').startsWith("'")).toBe(true);
    }
  });

  it('tanggal menjadi ISO', () => {
    expect(csvCell(new Date('2026-10-25T09:00:00Z'))).toBe('2026-10-25T09:00:00.000Z');
  });
});

describe('toCsv', () => {
  it('menulis header lalu baris, dengan BOM dan akhir baris CRLF', () => {
    const out = toCsv([{ email: 'a@b.co', status: 'pending' }, { email: '=evil', status: 'x,y' }], [
      { key: 'email', header: 'Email' },
      { key: 'status', header: 'Status' },
    ]);
    expect(out).toBe("﻿Email,Status\r\na@b.co,pending\r\n'=evil,\"x,y\"\r\n");
  });

  it('tanpa baris tetap menghasilkan header', () => {
    expect(toCsv([], [{ key: 'email', header: 'Email' }])).toBe('﻿Email\r\n');
  });
});
