import { BankingService } from '../../../modules/banking/banking.service';
import { LEDGER_STATUSES } from '../../../modules/accounting/ledger';
import { addDays, isoDate, todayOf } from './calendar';
import { planStatements, type CashLine } from './bank-plan';
import { auditAt, type BankRef, type FinanceEnv } from './env';

export interface StatementCounts {
  imported: number;
  reconciled: number;
  /** mutasi yang direncanakan cocok tetapi ditolak layanan (jurnal sudah terpakai, dst.) */
  rejected: number;
}

const WINDOW_DAYS = 60;

async function cashLinesOf(env: FinanceEnv, bank: BankRef): Promise<CashLine[]> {
  const { ctx } = env;
  const since = env.at(addDays(env.today, -(WINDOW_DAYS + 5)), 7);
  const rows = await ctx.prisma.journalLine.findMany({
    where: {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      accountId: bank.ledgerId,
      journal: { status: { in: LEDGER_STATUSES }, entryDate: { gte: since } },
    },
    select: { direction: true, amount: true, journal: { select: { number: true, entryDate: true, sourceModule: true, memo: true, status: true } } },
    orderBy: [{ journal: { entryDate: 'asc' } }, { journal: { number: 'asc' } }],
    take: 6000,
  });
  const lines: CashLine[] = [];
  for (const r of rows) {
    // Hanya jurnal yang masih berlaku dan bukan pembalik: jurnal yang sudah dibalik tidak mungkin tampil di bank.
    if (r.journal.status !== 'posted' || r.journal.sourceModule.endsWith(':reversal')) continue;
    lines.push({
      journalNumber: r.journal.number,
      date: todayOf(r.journal.entryDate),
      amount: Number(r.amount),
      direction: r.direction,
      source: r.journal.sourceModule,
      memo: r.journal.memo,
    });
  }
  return lines;
}

/**
 * Mutasi rekening koran + rekonsiliasi lewat BankingService. Sebagian dicocokkan ke jurnal kas yang sudah ada;
 * sisanya sengaja belum cocok. Kunci alami = referensi "DEMO-STM-...".
 */
export async function seedStatements(env: FinanceEnv): Promise<StatementCounts> {
  const { ctx } = env;
  const banking = ctx.get(BankingService);
  const counts: StatementCounts = { imported: 0, reconciled: 0, rejected: 0 };

  for (const bank of env.banks) {
    const lines = await cashLinesOf(env, bank);
    const main = bank.role === 'main';
    const plan = planStatements({
      bankCode: bank.code,
      lines,
      today: env.today,
      windowDays: WINDOW_DAYS,
      maxFromLedger: main ? 40 : 30,
      maxPos: main ? 10 : 0,
      matchRate: 0.82,
      strayCount: main ? 5 : 2,
    });

    const existing = new Map(
      (
        await ctx.prisma.bankStatement.findMany({
          where: { tenantId: ctx.tenantId, companyId: ctx.companyId, bankAccountId: bank.id, reference: { startsWith: 'DEMO-STM-' } },
          select: { id: true, reference: true, isReconciled: true },
        })
      ).map((s) => [s.reference, s]),
    );

    let imported = 0;
    let reconciled = 0;
    for (const s of plan) {
      let row = existing.get(s.reference);
      if (!row) {
        const created = await banking.importStatement(ctx.tenantId, {
          bankAccountId: bank.id,
          statementDate: isoDate(s.date),
          description: s.description,
          reference: s.reference,
          amount: s.amount,
        });
        row = { id: created.id, reference: s.reference, isReconciled: false };
        imported++;
      }
      if (s.intent !== 'match' || row.isReconciled || !s.journalDate) continue;
      try {
        await banking.reconcile(ctx.tenantId, {
          statementId: row.id,
          amount: Math.abs(s.amount),
          entryDate: isoDate(s.journalDate),
        });
        reconciled++;
      } catch {
        counts.rejected++;
      }
    }
    counts.imported += imported;
    counts.reconciled += reconciled;

    const stamp = env.at(addDays(env.today, -1), 17);
    if (imported > 0) {
      await auditAt(env, stamp, { role: 'admin', entity: 'banking/statements', entityId: bank.id, after: { bank: bank.code, imported } });
    }
    if (reconciled > 0) {
      await auditAt(env, stamp, { role: 'admin', entity: 'banking/reconcile', entityId: bank.id, after: { bank: bank.code, reconciled } });
    }
  }
  return counts;
}

