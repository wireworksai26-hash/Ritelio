import { BadRequestException } from '@nestjs/common';
import { roundMoney } from '../../common/utils/money';

export interface JournalLineInput {
  accountId: string;
  direction: 'debit' | 'credit';
  amount: number;
  memo?: string;
  /** Dimensi analitik opsional (pemasok/pelanggan dan proyek). */
  partnerId?: string | null;
  projectId?: string | null;
}

/** Normalize currency amounts and enforce the double-entry balance invariant. */
export function normalizeAndValidateJournalLines(lines: JournalLineInput[]): JournalLineInput[] {
  const normalized = lines.map((line) => ({ ...line, amount: roundMoney(line.amount) }));
  if (
    normalized.length < 2 ||
    normalized.some((line) => !Number.isFinite(line.amount) || line.amount <= 0)
  ) {
    throw new BadRequestException('Jurnal harus memiliki minimal dua baris dengan nilai positif.');
  }

  const debitCents = normalized
    .filter((line) => line.direction === 'debit')
    .reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
  const creditCents = normalized
    .filter((line) => line.direction === 'credit')
    .reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
  if (debitCents === 0 || debitCents !== creditCents) {
    throw new BadRequestException('Total debit dan kredit jurnal harus sama dan tidak nol.');
  }
  return normalized;
}
