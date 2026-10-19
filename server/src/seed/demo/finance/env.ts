import { Prisma } from '@prisma/client';
import { AuditService } from '../../../modules/audit/audit.service';
import { JournalService } from '../../../modules/accounting/journal.service';
import { LEDGER_STATUSES } from '../../../modules/accounting/ledger';
import type { DemoContext, DemoRole } from '../context';
import { daysAgoOf, todayOf, type Ymd } from './calendar';
import { OWN_EXPENSE_CODES, type BankRole, type FinanceProfile } from './profiles';
import type { FinancePlan, LedgerStats } from './plan';

/** Rekening bank yang sudah ada di database beserta akun buku besarnya. */
export interface BankRef {
  id: string;
  code: string;
  name: string;
  role: BankRole;
  ledgerCode: string;
  ledgerId: string;
}

export interface FinanceEnv {
  ctx: DemoContext;
  profile: FinanceProfile;
  plan: FinancePlan;
  stats: LedgerStats;
  today: Ymd;
  /** kode akun -> id akun pada perusahaan utama */
  accounts: Map<string, string>;
  banks: BankRef[];
  /** kunci pemasok (sewa, internet, ...) -> id pemasok */
  vendors: Map<string, string>;
  /** waktu mulai eksekusi; dipakai merapikan cap waktu audit yang baru ditulis */
  startedAt: Date;
  /** tanggal kalender -> Date pada jam WIB tertentu, lewat pembantu tanggal konteks */
  at(date: Ymd, hourWib: number): Date;
  accountId(code: string): string;
  /** akun buku besar tempat uang keluar/masuk untuk sebuah peran rekening */
  ledgerFor(role: BankRole): string;
}

export function makeEnv(
  ctx: DemoContext,
  profile: FinanceProfile,
  plan: FinancePlan,
  stats: LedgerStats,
  accounts: Map<string, string>,
  banks: BankRef[],
  vendors: Map<string, string>,
  startedAt: Date,
): FinanceEnv {
  const today = plan.today;
  return {
    ctx,
    profile,
    plan,
    stats,
    today,
    accounts,
    banks,
    vendors,
    startedAt,
    at: (date, hourWib) => ctx.at(daysAgoOf(today, date), hourWib),
    accountId(code) {
      const id = accounts.get(code);
      if (!id) throw new Error(`Akun ${code} tidak ada di COA ${ctx.biz.businessName}.`);
      return id;
    },
    ledgerFor(role) {
      const bank = banks.find((b) => b.role === role) ?? banks.find((b) => b.role === 'main');
      if (!bank) throw new Error('Rekening utama belum dibuat.');
      return bank.ledgerCode;
    },
  };
}


export async function loadAccountIds(ctx: DemoContext, companyId: string): Promise<Map<string, string>> {
  const rows = await ctx.prisma.chartOfAccount.findMany({ where: { tenantId: ctx.tenantId, companyId }, select: { id: true, code: true } });
  return new Map(rows.map((r) => [r.code, r.id]));
}

export interface KeyedLine {
  code: string;
  direction: 'debit' | 'credit';
  amount: number;
  memo?: string;
}

export interface KeyedJournal {
  key: string;
  at: Date;
  memo: string;
  lines: KeyedLine[];
  role?: DemoRole;
  sourceModule?: string;
  companyId?: string;
  accountIds?: Map<string, string>;
}

/**
 * Jurnal berkunci: kunci alami disimpan di sourceRefId, jadi dijalankan ulang tidak menggandakan.
 * Lewat JournalService.post (jalur yang sama dengan jurnal manual aplikasi), bukan insert mentah.
 */
export async function postKeyed(env: FinanceEnv, j: KeyedJournal): Promise<{ id: string; created: boolean }> {
  const { ctx } = env;
  const companyId = j.companyId ?? ctx.companyId;
  const sourceModule = j.sourceModule ?? 'manual';
  const found = await ctx.prisma.journalHeader.findFirst({
    where: { tenantId: ctx.tenantId, companyId, sourceModule, sourceRefId: j.key },
    select: { id: true },
  });
  if (found) return { id: found.id, created: false };

  const ids = j.accountIds ?? env.accounts;
  const lines = j.lines.map((l) => {
    const accountId = ids.get(l.code);
    if (!accountId) throw new Error(`Akun ${l.code} tidak ada untuk jurnal ${j.key}.`);
    return { accountId, direction: l.direction, amount: l.amount, memo: l.memo ?? '' };
  });
  const journals = ctx.get(JournalService);
  const header = await ctx.prisma.$transaction((tx) =>
    journals.post(tx, {
      tenantId: ctx.tenantId,
      companyId,
      entryDate: j.at,
      sourceModule,
      sourceRefId: j.key,
      memo: j.memo,
      actorId: ctx.users[j.role ?? 'admin'].id,
      lines,
    }),
  );
  return { id: header.id, created: true };
}

/**
 * Catat jejak audit lewat AuditService, lalu rapikan cap waktunya ke saat peristiwa terjadi.
 * Cap waktu bukan data keuangan; tanpa ini seluruh jejak seed menumpuk pada menit yang sama.
 * Batas bawah dilonggarkan dua menit untuk selisih jam antara aplikasi dan database.
 */
export async function auditAt(
  env: FinanceEnv,
  when: Date,
  entry: { role: DemoRole; action?: string; entity: string; entityId: string; after?: Prisma.InputJsonValue },
): Promise<void> {
  const { ctx } = env;
  await ctx.get(AuditService).record({
    tenantId: ctx.tenantId,
    userId: ctx.users[entry.role].id,
    action: entry.action ?? 'create',
    entity: entry.entity,
    entityId: entry.entityId,
    after: entry.after,
  });
  await ctx.prisma.auditLog.updateMany({
    where: { tenantId: ctx.tenantId, entity: entry.entity, entityId: entry.entityId, action: entry.action ?? 'create', createdAt: { gte: new Date(env.startedAt.getTime() - 120_000) } },
    data: { createdAt: when },
  });
}

/** Saldo bersih (debit - kredit) sebuah akun, semua jurnal yang ikut buku besar. */
export async function netBalance(ctx: DemoContext, accountId: string): Promise<number> {
  const rows = await ctx.prisma.journalLine.groupBy({
    by: ['direction'],
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, accountId, journal: { status: { in: LEDGER_STATUSES } } },
    _sum: { amount: true },
  });
  let net = 0;
  for (const r of rows) net += (r.direction === 'debit' ? 1 : -1) * Number(r._sum.amount ?? 0);
  return Math.round(net * 100) / 100;
}

/** Pendapatan, HPP, dan beban lain dari buku besar perusahaan utama, untuk menakar anggaran. */
export async function readLedgerStats(ctx: DemoContext, today: Ymd): Promise<LedgerStats> {
  const [accounts, rows, first] = await Promise.all([
    ctx.prisma.chartOfAccount.findMany({ where: { tenantId: ctx.tenantId, companyId: ctx.companyId }, select: { id: true, code: true, type: true } }),
    ctx.prisma.journalLine.groupBy({
      by: ['accountId', 'direction'],
      where: { tenantId: ctx.tenantId, companyId: ctx.companyId, journal: { status: { in: LEDGER_STATUSES } } },
      _sum: { amount: true },
    }),
    ctx.prisma.journalLine.findFirst({
      where: { tenantId: ctx.tenantId, companyId: ctx.companyId, account: { type: 'revenue' }, journal: { status: { in: LEDGER_STATUSES } } },
      orderBy: { journal: { entryDate: 'asc' } },
      select: { journal: { select: { entryDate: true } } },
    }),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  let revenue = 0;
  let cogs = 0;
  let otherOpex = 0;
  for (const r of rows) {
    const a = byId.get(r.accountId);
    if (!a) continue;
    const amount = Number(r._sum.amount ?? 0);
    const dr = r.direction === 'debit' ? amount : -amount;
    if (a.type === 'revenue') revenue -= dr;
    else if (a.type === 'expense') {
      if (/^5\d*$/.test(a.code)) cogs += dr;
      else if (!OWN_EXPENSE_CODES.includes(a.code)) otherOpex += dr;
    }
  }
  const firstDate = first?.journal.entryDate ?? null;
  const firstRevenueDaysAgo = firstDate ? Math.max(0, daysAgoOf(today, todayOf(firstDate))) : null;
  return { revenue: Math.max(0, revenue), cogs: Math.max(0, cogs), otherOpex: Math.max(0, otherOpex), firstRevenueDaysAgo };
}
