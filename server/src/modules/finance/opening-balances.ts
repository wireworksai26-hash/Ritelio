import type { Prisma } from '@prisma/client';
import { LEDGER_STATUSES } from '../accounting/ledger';
import type { PrismaService } from '../../common/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface OpeningRow {
  accountId: string;
  direction: 'debit' | 'credit';
  _sum: { amount: Prisma.Decimal | null };
}

/**
 * Baris saldo awal yang BELUM punya jurnal di buku besar.
 *
 * `POST /finance/opening-balances` menulis jurnal `opening_balance` sekaligus
 * baris `opening_balances` (rekam jejak input). Menjumlahkan keduanya membuat
 * saldo awal terhitung dobel. Hanya saldo awal yang tidak punya jurnal
 * (mis. data seed lama) yang perlu ditambahkan terpisah.
 */
export async function openingRowsWithoutJournal(
  db: Db,
  tenantId: string,
  companyId: string,
  asOf?: Date,
): Promise<OpeningRow[]> {
  const periods = await db.openingBalance.findMany({
    where: { tenantId, companyId, ...(asOf ? { period: { startDate: { lte: asOf } } } : {}) },
    distinct: ['periodId'],
    select: { periodId: true },
  });
  if (periods.length === 0) return [];

  const journaled = await db.journalHeader.findMany({
    where: {
      tenantId,
      companyId,
      sourceModule: 'opening_balance',
      status: { in: LEDGER_STATUSES },
      sourceRefId: { in: periods.map((p) => `opening-balance:${p.periodId}`) },
    },
    select: { sourceRefId: true },
  });
  const covered = new Set(journaled.map((j) => (j.sourceRefId ?? '').replace('opening-balance:', '')));
  const pending = periods.map((p) => p.periodId).filter((id) => !covered.has(id));
  if (pending.length === 0) return [];

  return db.openingBalance.groupBy({
    by: ['accountId', 'direction'],
    where: { tenantId, companyId, periodId: { in: pending } },
    _sum: { amount: true },
  }) as unknown as Promise<OpeningRow[]>;
}
