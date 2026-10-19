import { TaxDocumentsService } from '../../../modules/tax/tax-documents.service';
import { addDays, isBefore, isoDate } from './calendar';
import { auditAt, netBalance, postKeyed, type FinanceEnv } from './env';
import { ceilTo, roundTo } from './random';

/**
 * Pembayaran PPN: setengah dari saldo Utang PPN (2100) yang ada, lewat TaxDocumentsService.recordPayment.
 * Hanya bila memang ada saldo yang berarti (butuh penjualan ber-PPN dari domain lain). Mengembalikan jumlah dibayar.
 */
export async function payVat(env: FinanceEnv): Promise<number> {
  const { ctx, plan } = env;
  const reference = 'DEMO-FIN-PPN-001';
  const done = await ctx.prisma.journalHeader.findFirst({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, sourceModule: 'tax', sourceRefId: reference },
    select: { id: true },
  });
  if (done) return 0;

  const payableId = env.accounts.get('2100');
  if (!payableId) return 0;
  const owed = -(await netBalance(ctx, payableId));
  if (owed < 1_000_000) return 0;

  const amount = roundTo(owed * 0.5, 1_000);
  const date = addDays(env.today, -9);
  const pay = await ctx.get(TaxDocumentsService).recordPayment(ctx.tenantId, {
    amount,
    payDate: isoDate(isBefore(date, plan.start) ? plan.start : date),
    reference,
  });
  await auditAt(env, env.at(date, 15), { role: 'owner', entity: 'tax/payment', entityId: pay.journalId, after: { reference, amount } });
  return amount;
}

/**
 * Jaga agar saldo kas tidak negatif di akhir: bila penjualan domain lain lebih kecil dari pembelian aset dan
 * beban, pemilik dianggap menambah modal. Jurnal berkunci tetap, jadi tidak berlipat saat diulang.
 */
export async function topUpCash(env: FinanceEnv): Promise<number> {
  const { ctx, plan } = env;
  const ids = env.banks.map((b) => b.ledgerId);
  const accounts = [...new Set([env.accountId('1000'), ...ids])];
  let total = 0;
  for (const id of accounts) total += await netBalance(ctx, id);
  if (total >= 5_000_000) return 0;

  const amount = ceilTo(5_000_000 - total + 5_000_000, 1_000_000);
  const date = addDays(plan.start, Math.min(10, Math.floor(plan.windowDays / 4)));
  const at = env.at(date, 10);
  const r = await postKeyed(env, {
    key: 'DEMO-FIN-CAP-002',
    at,
    memo: 'Tambahan modal pemilik untuk menutup kebutuhan kas',
    role: 'owner',
    lines: [
      { code: '1000', direction: 'debit', amount, memo: 'Tambahan setoran modal' },
      { code: '3000', direction: 'credit', amount, memo: 'Modal pemilik' },
    ],
  });
  if (r.created) await auditAt(env, at, { role: 'owner', entity: 'journals', entityId: r.id, after: { amount } });
  return r.created ? amount : 0;
}
