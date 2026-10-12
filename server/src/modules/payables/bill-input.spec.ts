import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { normalizeAndValidateJournalLines } from '../accounting/journal-validation';
import { buildBillNote, buildBillPosting, resolveDueDate, supplierInvoiceTag } from './bill-input';

describe('buildBillPosting', () => {
  it('debit per baris, satu kredit hutang sebesar total, dan lolos validasi balance GL', () => {
    const { total, journalLines } = buildBillPosting(
      [
        { accountId: 'beban-listrik', amount: 1_250_000.5, description: 'Listrik' },
        { accountId: 'beban-air', amount: 349_999.5 },
      ],
      'hutang',
    );
    expect(total).toBe(1_600_000);
    expect(journalLines).toHaveLength(3);
    expect(journalLines.filter((l) => l.direction === 'debit').map((l) => l.accountId)).toEqual([
      'beban-listrik',
      'beban-air',
    ]);
    expect(journalLines[2]).toMatchObject({ accountId: 'hutang', direction: 'credit', amount: 1_600_000 });
    // Validator asli GL tidak boleh menolak jurnal ini.
    expect(() => normalizeAndValidateJournalLines(journalLines)).not.toThrow();
  });

  it('banyak baris desimal tetap balance sampai ke sen (0,1 + 0,2 bukan 0,30000000000000004)', () => {
    const { total, journalLines } = buildBillPosting(
      [
        { accountId: 'a', amount: 0.1 },
        { accountId: 'b', amount: 0.2 },
        { accountId: 'c', amount: 0.07 },
      ],
      'hutang',
    );
    expect(total).toBe(0.37);
    expect(() => normalizeAndValidateJournalLines(journalLines)).not.toThrow();
  });

  it('menolak baris nol atau negatif', () => {
    expect(() => buildBillPosting([{ accountId: 'a', amount: 0 }], 'h')).toThrow(BadRequestException);
    expect(() => buildBillPosting([{ accountId: 'a', amount: -5 }], 'h')).toThrow(BadRequestException);
    expect(() => buildBillPosting([], 'h')).toThrow(BadRequestException);
  });
});

describe('resolveDueDate', () => {
  const billDate = new Date('2026-10-01T00:00:00.000Z');

  it('tanpa tanggal eksplisit memakai termin pemasok', () => {
    expect(resolveDueDate(billDate, null, 30).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('termin 0 = jatuh tempo sama dengan tanggal tagihan', () => {
    expect(resolveDueDate(billDate, null, 0).toISOString()).toBe(billDate.toISOString());
  });

  it('menolak jatuh tempo sebelum tanggal tagihan', () => {
    expect(() => resolveDueDate(billDate, new Date('2026-09-30T00:00:00.000Z'), 0)).toThrow(BadRequestException);
  });
});

describe('buildBillNote', () => {
  it('memuat nomor faktur, asal, dan catatan; deteksi ganda memakai tag yang sama', () => {
    const note = buildBillNote('INV-77', 'termin 2', 'Dari OCR abc');
    expect(note.startsWith(supplierInvoiceTag('INV-77'))).toBe(true);
    expect(note).toContain('Dari OCR abc');
    expect(note).toContain('termin 2');
  });

  it('tanpa nomor faktur tidak menambah tag kosong', () => {
    expect(buildBillNote(undefined, 'catatan')).toBe('catatan');
  });
});
