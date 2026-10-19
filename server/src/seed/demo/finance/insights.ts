import type { InsightType } from '@prisma/client';
import { LEDGER_STATUSES } from '../../../modules/accounting/ledger';
import { FinanceService } from '../../../modules/finance/finance.service';
import { formatRupiah } from './format';
import type { FinanceEnv } from './env';

/**
 * Insight keuangan untuk panel "Insight Keuangan". Isinya disusun dari angka yang dihitung FinanceService dan buku
 * besar (bukan karangan), lalu disimpan ke log insight. Tidak ada API layanan untuk menulis log ini selain jalur obrolan
 * asisten yang butuh model AI, jadi baris dibuat langsung, sama seperti AiService.log. Bukan data uang.
 * Kunci alami: modul "finance" + judul.
 */
export async function seedInsights(env: FinanceEnv): Promise<number> {
  const { ctx } = env;
  const finance = ctx.get(FinanceService);
  const drafts: Array<{ type: InsightType; title: string; content: string; refs: string[]; hoursAgo: number }> = [];

  const [pl, cf] = await Promise.all([
    finance.profitLoss(ctx.tenantId, 30),
    finance.cashflow(ctx.tenantId, 14, 30),
  ]);

  const top = await topExpenses(env);
  const margin = pl.revenue > 0 ? Math.round((pl.net / pl.revenue) * 100) : 0;
  const lines = [
    `Pendapatan 30 hari ${formatRupiah(pl.revenue)}, HPP ${formatRupiah(pl.cogs)}, laba kotor ${formatRupiah(pl.gross)}.`,
    `Beban operasional ${formatRupiah(pl.opex)}; laba bersih ${formatRupiah(pl.net)}${pl.revenue > 0 ? ` (margin ${margin}%)` : ''}.`,
  ];
  if (top.length > 0) lines.push(`Beban terbesar: ${top.map((t) => `${t.name} ${formatRupiah(t.amount)}`).join(', ')}.`);
  if (pl.net < 0) lines.push('Beban operasional melampaui laba kotor. Tinjau beban terbesar di atas dan jadwal penagihan piutang.');
  drafts.push({
    type: 'insight_digest',
    title: 'Ringkasan laba rugi 30 hari',
    content: lines.join('\n'),
    refs: ['journal_lines:revenue', 'journal_lines:expense'],
    hoursAgo: 20,
  });

  const forecast = cf.series.filter((p) => p.forecast);
  const fin = forecast.reduce((s, p) => s + p.inflow, 0);
  const fout = forecast.reduce((s, p) => s + p.outflow, 0);
  drafts.push({
    type: 'cashflow_forecast',
    title: 'Prakiraan arus kas 30 hari ke depan',
    content:
      `14 hari terakhir: kas masuk ${formatRupiah(cf.totals.inflow)}, kas keluar ${formatRupiah(cf.totals.outflow)}, selisih ${formatRupiah(cf.totals.net)}.\n` +
      `Proyeksi 30 hari (pola mingguan): masuk ${formatRupiah(fin)}, keluar ${formatRupiah(fout)}, selisih ${formatRupiah(fin - fout)}.`,
    refs: ['journal_lines:cash'],
    hoursAgo: 44,
  });

  const stray = await ctx.prisma.bankStatement.findMany({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, isReconciled: false, matchedJournalId: null, reference: { contains: '-X-' } },
    orderBy: { amount: 'desc' },
    take: 3,
    select: { description: true, amount: true, statementDate: true },
  });
  if (stray.length > 0) {
    drafts.push({
      type: 'anomaly',
      title: 'Mutasi bank tanpa jurnal pendamping',
      content:
        `${stray.length} mutasi rekening tidak punya jurnal kas yang cocok:\n` +
        stray.map((s) => `- ${s.statementDate.toISOString().slice(0, 10)} ${s.description}: ${formatRupiah(Number(s.amount))}`).join('\n') +
        '\nPeriksa apakah ada pemasukan atau pengeluaran yang belum dicatat.',
      refs: ['bank_statements'],
      hoursAgo: 70,
    });
  }

  let created = 0;
  for (const d of drafts) {
    const exists = await ctx.prisma.aiInsightLog.findFirst({ where: { tenantId: ctx.tenantId, module: 'finance', title: d.title }, select: { id: true } });
    if (exists) continue;
    await ctx.prisma.aiInsightLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.users.owner.id,
        module: 'finance',
        insightType: d.type,
        title: d.title,
        content: d.content,
        basedOnRefs: d.refs,
        createdAt: new Date(Date.now() - d.hoursAgo * 3_600_000),
      },
    });
    created++;
  }
  return created;
}

async function topExpenses(env: FinanceEnv): Promise<Array<{ name: string; amount: number }>> {
  const { ctx } = env;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await ctx.prisma.journalLine.groupBy({
    by: ['accountId', 'direction'],
    where: {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      journal: { status: { in: LEDGER_STATUSES }, entryDate: { gte: since } },
      account: { type: 'expense', NOT: { code: { startsWith: '5' } } },
    },
    _sum: { amount: true },
  });
  const accounts = await ctx.prisma.chartOfAccount.findMany({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, type: 'expense' },
    select: { id: true, name: true },
  });
  const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.accountId, (totals.get(r.accountId) ?? 0) + (r.direction === 'debit' ? 1 : -1) * Number(r._sum.amount ?? 0));
  return [...totals.entries()]
    .map(([id, amount]) => ({ name: nameOf.get(id) ?? id, amount }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
}
