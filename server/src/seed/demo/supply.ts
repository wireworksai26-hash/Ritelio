import type { DemoContext, DemoDomain } from './context';
import { executeSupplyPlan } from './supply/execute';
import { buildSupplyPlan } from './supply/plan';

/**
 * Domain "supply": pengadaan (requisition, PO, penerimaan, tagihan dan pembayaran pemasok, skor kinerja, saran
 * reorder), inventori (transfer antar outlet, opname, penyesuaian) dan, untuk usaha manufaktur, produksi (order,
 * jadwal work center, QC bertingkat). Rencananya per usaha ada di ./supply/plan.ts; pelaksananya di ./supply/execute.ts.
 */
export const supplyDomain: DemoDomain = {
  key: 'supply',
  title: 'Rantai pasok: pembelian, utang usaha, transfer, opname, produksi',
  async run(ctx: DemoContext) {
    const plan = buildSupplyPlan(ctx.biz);
    if (plan.events.length === 0) {
      ctx.log('supply: tidak ada rencana untuk usaha ini');
      return;
    }
    const s = await executeSupplyPlan(ctx, plan);
    ctx.log(
      `supply: ${s.requisitions} requisition, ${s.orders} PO (${s.receipts} diterima), ${s.bills} tagihan, ` +
        `${s.payments} pembayaran, ${s.transfers} transfer, ${s.adjustments} penyesuaian, ${s.stockOps} opname, ` +
        `${s.productionOrders} order produksi, ${s.schedules} jadwal, ${s.qualityChecks} QC, ${s.performance} skor pemasok ` +
        '(angka hanya yang dibuat pada putaran ini)',
    );
  },
};
