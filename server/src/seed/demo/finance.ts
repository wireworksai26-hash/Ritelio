import type { DemoContext, DemoDomain } from './context';
import { todayOf } from './finance/calendar';
import { makeEnv, readLedgerStats } from './finance/env';
import { runTimeline } from './finance/execute';
import { planFinance } from './finance/plan';
import { FINANCE_PROFILES } from './finance/profiles';
import { seedApprovals } from './finance/approvals';
import { seedInsights } from './finance/insights';
import { seedNotifications } from './finance/notifications';
import { closeOldPeriods } from './finance/periods';
import { ensureAccounts, ensureBanks, ensureVendors } from './finance/setup';
import { seedStatements } from './finance/statements';
import { seedSubsidiary } from './finance/subsidiary';
import { payVat, topUpCash } from './finance/treasury';
import { formatRupiah } from './finance/format';

/**
 * Domain "finance": kas & bank, aset tetap, beban operasional (tagihan pemasok dan jurnal manual), pembalikan
 * jurnal, persetujuan, pajak, anak usaha, dan notifikasi. Semua perubahan uang lewat service aplikasi.
 *
 * Besar beban dan aset DIUKUR dari pendapatan yang sudah ada di buku besar saat domain ini jalan (jalan terakhir),
 * sehingga laba bersih tetap wajar berapa pun besar penjualan domain lain. Tanpa pendapatan, bebannya kecil.
 * Rencana ada di finance/plan.ts dan finance/bank-plan.ts (murni, diuji tanpa database).
 */
export const financeDomain: DemoDomain = {
  key: 'finance',
  title: 'Keuangan: bank, aset tetap, jurnal manual, pajak, persetujuan',
  async run(ctx: DemoContext) {
    const profile = FINANCE_PROFILES[ctx.biz.key];
    if (!profile) throw new Error(`Profil keuangan untuk ${ctx.biz.key} belum ada.`);
    const startedAt = new Date();
    const today = todayOf(new Date());

    const { ids, created: newAccounts } = await ensureAccounts(ctx);
    const banks = await ensureBanks(ctx, profile, ids);
    const vendors = await ensureVendors(ctx, profile);

    const stats = await readLedgerStats(ctx, today);
    const plan = planFinance(profile, today, stats);
    const env = makeEnv(ctx, profile, plan, stats, ids, banks, vendors, startedAt);
    ctx.log(
      `rencana: pendapatan ${formatRupiah(stats.revenue)}, anggaran beban ${formatRupiah(plan.budget)}, ` +
        `skala aset ${plan.scale.toFixed(2)}, ${plan.assets.length} aset, ${plan.expenses.length} beban`,
    );

    const t = await runTimeline(env);
    const sub = await seedSubsidiary(env);
    const approvals = await seedApprovals(env);
    const vat = await payVat(env);
    const topUp = await topUpCash(env);
    const statements = await seedStatements(env);
    const notifications = await seedNotifications(env);
    const insights = await seedInsights(env);
    const periods = await closeOldPeriods(env);

    ctx.log(`akun COA baru ${newAccounts}, rekening bank ${banks.length}, pemasok ${vendors.size}`);
    ctx.log(
      `baru dibuat: jurnal manual ${t.journals}, tagihan ${t.bills}, pembayaran ${t.payments}, aset ${t.assets}, ` +
        `penyusutan ${t.depreciationRuns} bulan, pelepasan ${t.disposals}, pembalikan ${t.reversals}`,
    );
    ctx.log(`anak usaha ${sub.companyCode}: ${sub.journals} jurnal baru; PPN dibayar ${formatRupiah(vat)}; tambahan modal ${formatRupiah(topUp)}`);
    ctx.log(`persetujuan baru: menunggu ${approvals.pending}, disetujui ${approvals.approved}, ditolak ${approvals.rejected}`);
    ctx.log(`mutasi bank baru ${statements.imported}, direkonsiliasi ${statements.reconciled}, ditolak layanan ${statements.rejected}`);
    ctx.log(`notifikasi baru ${notifications}, insight keuangan baru ${insights}; periode ditutup: ${periods.closed.join(', ') || 'tidak ada'}${periods.skippedReason ? ` (${periods.skippedReason})` : ''}`);
  },
};
