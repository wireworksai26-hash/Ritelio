import { BadRequestException } from '@nestjs/common';
import { roundMoney } from '../../common/utils/money';
import type { JournalLineInput } from '../accounting/journal-validation';

export interface BillLineInput {
  accountId: string;
  description?: string;
  amount: number;
}

/**
 * Susun jurnal tagihan pemasok: tiap baris beban/aset di-debit, satu baris
 * Hutang Usaha di-kredit sebesar total. Total dihitung dalam sen supaya
 * jumlah baris desimal tidak melenceng satu sen dari sisi kredit.
 */
export function buildBillPosting(
  lines: BillLineInput[],
  apAccountId: string,
): { total: number; journalLines: JournalLineInput[] } {
  const cents = lines.map((l) => Math.round(roundMoney(l.amount) * 100));
  if (cents.length === 0 || cents.some((c) => !Number.isFinite(c) || c <= 0)) {
    throw new BadRequestException('Setiap baris tagihan harus bernilai positif.');
  }
  const total = cents.reduce((s, c) => s + c, 0) / 100;
  return {
    total,
    journalLines: [
      ...lines.map((l, i) => ({
        accountId: l.accountId,
        direction: 'debit' as const,
        amount: cents[i] / 100,
        memo: l.description?.trim() || 'Tagihan pemasok',
      })),
      { accountId: apAccountId, direction: 'credit' as const, amount: total, memo: 'Utang usaha' },
    ],
  };
}

/** Jatuh tempo: tanggal eksplisit, atau tanggal tagihan + termin pemasok. */
export function resolveDueDate(billDate: Date, dueDate: Date | null, termDays: number): Date {
  if (dueDate) {
    if (dueDate.getTime() < billDate.getTime()) {
      throw new BadRequestException('Jatuh tempo tidak boleh lebih awal dari tanggal tagihan.');
    }
    return dueDate;
  }
  const due = new Date(billDate);
  due.setUTCDate(due.getUTCDate() + Math.max(0, termDays));
  return due;
}

/** Awalan catatan yang memuat nomor faktur pemasok; dipakai juga untuk deteksi ganda. */
export function supplierInvoiceTag(ref: string): string {
  return `[Faktur ${ref.trim()}]`;
}

export function buildBillNote(ref: string | undefined, note: string | undefined, source?: string): string {
  const parts = [ref?.trim() ? supplierInvoiceTag(ref) : '', source ?? '', note?.trim() ?? ''].filter(Boolean);
  return parts.join(' ').slice(0, 255);
}
