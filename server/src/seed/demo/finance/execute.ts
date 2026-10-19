import { BadRequestException } from '@nestjs/common';
import { AssetsService } from '../../../modules/assets/assets.service';
import { JournalService } from '../../../modules/accounting/journal.service';
import { PayablesService } from '../../../modules/payables/payables.service';
import { supplierInvoiceTag } from '../../../modules/payables/bill-input';
import { outstandingOf } from '../../../modules/finance/document-amounts';
import { addDays, isBefore, isoDate, lastDayOfMonth, type Ymd } from './calendar';
import { auditAt, postKeyed, type FinanceEnv } from './env';
import { depreciationMonths, PPN_RATE, type PlannedAsset, type PlannedExpense } from './plan';
import { unitFor } from './random';

/** Satu langkah kronologis. Diurutkan menurut tanggal supaya nomor jurnal mengikuti urutan waktu. */
interface Step {
  date: Ymd;
  order: number;
  label: string;
  run(): Promise<void>;
}

export interface TimelineCounts {
  journals: number;
  bills: number;
  payments: number;
  assets: number;
  depreciationRuns: number;
  disposals: number;
  reversals: number;
}

const hourFor = (key: string, from: number, to: number) => from + Math.floor(unitFor(`h:${key}`) * (to - from + 1));

function billTag(key: string): string {
  return supplierInvoiceTag(key);
}

export async function runTimeline(env: FinanceEnv): Promise<TimelineCounts> {
  const { ctx, plan } = env;
  const counts: TimelineCounts = { journals: 0, bills: 0, payments: 0, assets: 0, depreciationRuns: 0, disposals: 0, reversals: 0 };
  const steps: Step[] = [];
  const push = (date: Ymd, order: number, label: string, run: () => Promise<void>) => steps.push({ date, order, label, run });

  // 1. Setoran modal pemilik.
  push(plan.capital.date, 0, plan.capital.key, async () => {
    const at = env.at(plan.capital.date, 9);
    const r = await postKeyed(env, {
      key: plan.capital.key,
      at,
      memo: plan.capital.memo,
      role: 'owner',
      lines: [
        { code: '1000', direction: 'debit', amount: plan.capital.amount, memo: 'Setoran modal pemilik' },
        { code: '3000', direction: 'credit', amount: plan.capital.amount, memo: 'Modal pemilik' },
      ],
    });
    if (r.created) {
      counts.journals++;
      await auditAt(env, at, { role: 'owner', entity: 'journals', entityId: r.id, after: { memo: plan.capital.memo, amount: plan.capital.amount } });
    }
  });

  // 2. Aset tetap: perolehan lewat AssetsService, lalu penyusutan bulanan dan satu pelepasan.
  const assets = ctx.get(AssetsService);
  for (const a of plan.assets) {
    push(a.date, 1, `aset ${a.code}`, () => createAsset(env, assets, a, counts));
    if (a.disposeDate) push(a.disposeDate, 8, `lepas ${a.code}`, () => disposeAsset(env, assets, a, counts));
  }
  for (const month of depreciationMonths(plan.assets, plan.today)) {
    push(lastDayOfMonth(month.y, month.m), 9, `penyusutan ${month.code}`, () => depreciate(env, assets, month.code, counts));
  }

  // 3. Pengisian saldo bank tambahan.
  for (const t of plan.transfers) {
    push(t.date, 2, t.key, async () => {
      const at = env.at(t.date, 9);
      const r = await postKeyed(env, {
        key: t.key,
        at,
        memo: t.memo,
        lines: [
          { code: env.ledgerFor(t.toRole), direction: 'debit', amount: t.amount, memo: 'Transfer masuk' },
          { code: '1000', direction: 'credit', amount: t.amount, memo: 'Transfer keluar' },
        ],
      });
      if (r.created) {
        counts.journals++;
        await auditAt(env, at, { role: 'admin', entity: 'journals', entityId: r.id, after: { memo: t.memo, amount: t.amount } });
      }
    });
  }

  // 4. Beban: tagihan pemasok (dengan PPN masukan) atau jurnal manual.
  const payables = ctx.get(PayablesService);
  for (const e of plan.expenses) {
    if (e.mode === 'bill') {
      push(e.date, 3, e.key, () => createBill(env, payables, e, counts));
      if (e.paidOn) push(e.paidOn, 6, `bayar ${e.key}`, () => payBill(env, payables, e, counts));
    } else {
      push(e.date, 4, e.key, async () => {
        const at = env.at(e.date, hourFor(e.key, 9, 17));
        const r = await postKeyed(env, {
          key: e.key,
          at,
          memo: e.memo,
          lines: [
            { code: e.account, direction: 'debit', amount: e.amount, memo: e.memo },
            { code: env.ledgerFor(e.bank), direction: 'credit', amount: e.amount, memo: 'Pembayaran beban' },
          ],
        });
        if (r.created) {
          counts.journals++;
          await auditAt(env, at, { role: 'admin', entity: 'journals', entityId: r.id, after: { memo: e.memo, amount: e.amount } });
        }
      });
    }
  }
  for (const f of plan.fees) {
    push(f.date, 5, f.key, async () => {
      const at = env.at(f.date, 16);
      const r = await postKeyed(env, {
        key: f.key,
        at,
        memo: f.memo,
        lines: [
          { code: '6660', direction: 'debit', amount: f.amount, memo: f.memo },
          { code: env.ledgerFor(f.bank), direction: 'credit', amount: f.amount, memo: 'Potongan biaya bank' },
        ],
      });
      if (r.created) counts.journals++;
    });
  }

  // 5. Satu jurnal salah akun yang dibalik lewat JournalService.reverse, lalu dicatat ulang dengan benar.
  const rev = plan.reversal;
  if (rev) {
    push(rev.date, 7, rev.key, async () => {
      const wrongAt = env.at(rev.date, 10);
      const wrong = await postKeyed(env, {
        key: rev.key,
        at: wrongAt,
        memo: rev.memo,
        lines: [
          { code: rev.wrongAccount, direction: 'debit', amount: rev.amount, memo: rev.memo },
          { code: '1000', direction: 'credit', amount: rev.amount, memo: 'Pembayaran tunai' },
        ],
      });
      if (wrong.created) counts.journals++;

      const original = await ctx.prisma.journalHeader.findUniqueOrThrow({
        where: { id: wrong.id },
        select: { status: true, reversedBy: { select: { id: true } }, number: true },
      });
      const reverseAt = env.at(rev.reverseDate, 10);
      if (original.status === 'posted' && original.reversedBy.length === 0) {
        const journals = ctx.get(JournalService);
        await ctx.prisma.$transaction((tx) =>
          journals.reverse(tx, {
            tenantId: ctx.tenantId,
            companyId: ctx.companyId,
            journalId: wrong.id,
            entryDate: reverseAt,
            memo: `Koreksi akun: ${rev.memo}`,
            actorId: ctx.users.owner.id,
          }),
        );
        counts.reversals++;
        await auditAt(env, reverseAt, { role: 'owner', action: 'reverse', entity: 'journals', entityId: wrong.id, after: { memo: `Koreksi akun: ${rev.memo}` } });
      }
      const fixed = await postKeyed(env, {
        key: `${rev.key}-FIX`,
        at: reverseAt,
        memo: rev.memo.replace(' salah akun', ''),
        lines: [
          { code: rev.rightAccount, direction: 'debit', amount: rev.amount, memo: rev.memo.replace(' salah akun', '') },
          { code: '1000', direction: 'credit', amount: rev.amount, memo: 'Pembayaran tunai' },
        ],
      });
      if (fixed.created) counts.journals++;
    });
  }

  steps.sort((a, b) => {
    if (isBefore(a.date, b.date)) return -1;
    if (isBefore(b.date, a.date)) return 1;
    return a.order - b.order || a.label.localeCompare(b.label);
  });
  for (const step of steps) await step.run();
  return counts;
}

async function createAsset(env: FinanceEnv, assets: AssetsService, a: PlannedAsset, counts: TimelineCounts): Promise<void> {
  const { ctx } = env;
  const found = await ctx.prisma.fixedAsset.findFirst({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, code: a.code },
    select: { id: true },
  });
  if (found) return;
  const created = await assets.create(ctx.tenantId, {
    code: a.code,
    name: a.name,
    category: a.category,
    location: a.location,
    acquisitionDate: isoDate(a.date),
    acquisitionCost: a.cost,
    salvageValue: a.salvage,
    usefulLifeMonths: a.lifeMonths,
    depreciationMethod: a.method,
    ...(a.method === 'declining_balance' ? { decliningRate: a.rate } : {}),
  });
  counts.assets++;
  await auditAt(env, env.at(a.date, 9), {
    role: 'admin',
    entity: 'assets',
    entityId: created.id,
    after: { code: a.code, name: a.name, acquisitionCost: a.cost },
  });
}

async function depreciate(env: FinanceEnv, assets: AssetsService, periodCode: string, counts: TimelineCounts): Promise<void> {
  const { ctx } = env;
  const period = await ctx.prisma.fiscalPeriod.findFirst({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, code: periodCode },
    select: { status: true, id: true, endDate: true },
  });
  // Periode yang sudah ditutup sudah pernah disusutkan di eksekusi sebelumnya.
  if (!period || period.status !== 'open') return;
  try {
    const res = await assets.runDepreciation(ctx.tenantId, { periodCode });
    if ('processed' in res && res.processed > 0) {
      counts.depreciationRuns++;
      const [y, m] = periodCode.split('-').map(Number);
      await auditAt(env, env.at(lastDayOfMonth(y, m), 17), {
        role: 'admin',
        entity: 'assets/depreciation/run',
        entityId: periodCode,
        after: { periodCode, processed: res.processed, totalDepreciation: 'totalDepreciation' in res ? res.totalDepreciation : 0 },
      });
    }
  } catch (err) {
    // Semua aset sudah dilepas sebelum periode ini: tidak ada yang disusutkan, bukan kegagalan.
    if (err instanceof BadRequestException && /Belum ada aset aktif/.test(err.message)) return;
    throw err;
  }
}

async function disposeAsset(env: FinanceEnv, assets: AssetsService, a: PlannedAsset, counts: TimelineCounts): Promise<void> {
  const { ctx } = env;
  const row = await ctx.prisma.fixedAsset.findFirst({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, code: a.code },
    select: { id: true, status: true, acquisitionCost: true, accumulatedDepreciation: true },
  });
  if (!row || row.status === 'disposed' || !a.disposeDate) return;
  // Dijual sebesar nilai buku: tidak ada laba/rugi sehingga laba rugi tidak bergeser oleh pelepasan ini.
  const proceeds = Math.max(0, Math.round((Number(row.acquisitionCost) - Number(row.accumulatedDepreciation)) * 100) / 100);
  await assets.dispose(ctx.tenantId, row.id, { proceeds, disposalDate: isoDate(a.disposeDate) });
  counts.disposals++;
  await auditAt(env, env.at(a.disposeDate, 14), {
    role: 'admin',
    entity: 'assets/dispose',
    entityId: row.id,
    after: { code: a.code, proceeds },
  });
}

export async function findBillByKey(env: FinanceEnv, key: string) {
  const { ctx } = env;
  return ctx.prisma.vendorBill.findFirst({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, note: { startsWith: billTag(key) } },
    select: { id: true, number: true, status: true, total: true, taxTotal: true, paidAmount: true },
  });
}

async function createBill(env: FinanceEnv, payables: PayablesService, e: PlannedExpense, counts: TimelineCounts): Promise<void> {
  const { ctx } = env;
  if (await findBillByKey(env, e.key)) return;
  const supplierId = env.vendors.get(e.vendor ?? '');
  if (!supplierId) throw new Error(`Pemasok ${e.vendor} belum dibuat.`);
  const due = addDays(e.date, e.termDays ?? 7);
  const bill = await payables.createBill(
    ctx.tenantId,
    {
      supplierId,
      supplierInvoiceNumber: e.key,
      billDate: isoDate(e.date),
      dueDate: isoDate(due),
      note: e.memo,
      lines: [{ accountId: env.accountId(e.account), description: e.memo, amount: e.amount }],
    },
    { actorId: ctx.users.admin.id },
  );
  counts.bills++;
  await auditAt(env, env.at(e.date, 10), {
    role: 'admin',
    entity: 'payables/bills',
    entityId: bill.id,
    after: { supplierInvoiceNumber: e.key, amount: e.amount, ppn: Math.round(e.amount * PPN_RATE) },
  });
}

async function payBill(env: FinanceEnv, payables: PayablesService, e: PlannedExpense, counts: TimelineCounts): Promise<void> {
  const { ctx } = env;
  if (!e.paidOn) return;
  const bill = await findBillByKey(env, e.key);
  if (!bill || bill.status === 'paid' || bill.status === 'voided') return;
  const outstanding = outstandingOf(bill);
  if (outstanding <= 0) return;
  const payment = await payables.payBill(ctx.tenantId, bill.id, {
    amount: outstanding,
    method: 'transfer',
    payDate: isoDate(e.paidOn),
    note: `Pelunasan ${e.memo}`,
  });
  counts.payments++;
  await auditAt(env, env.at(e.paidOn, 14), {
    role: 'admin',
    entity: 'payables/payments',
    entityId: payment.payment.id,
    after: { billNumber: bill.number, amount: outstanding },
  });
}
