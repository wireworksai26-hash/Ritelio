import { SalesService } from '../../../modules/sales/sales.service';
import type { DemoContext } from '../context';
import type { Backdater } from './backdate';
import type { Stats, TimelineEvent } from './crm';
import { discountedPrice, type PlannedSale } from './plan';
import type { StockBudget } from './stock';

/** Penjualan POS reguler menjadi peristiwa linimasa; yang sudah tercatat (kunci klien sama) dilewati. */
export async function posEvents(
  ctx: DemoContext,
  plan: PlannedSale[],
  budget: StockBudget,
  bd: Backdater,
  stats: Stats,
): Promise<TimelineEvent[]> {
  const sales = ctx.get(SalesService);
  const existing = new Set(
    (
      await ctx.prisma.salesTransaction.findMany({
        where: { tenantId: ctx.tenantId, companyId: ctx.companyId, clientGeneratedId: { startsWith: `demo-${ctx.biz.key}-` } },
        select: { clientGeneratedId: true },
      })
    ).map((r) => r.clientGeneratedId),
  );

  return plan.map((s) => {
    const when = ctx.at(s.dayOffset, s.hour, s.minute);
    return {
      when,
      label: s.clientId,
      async run() {
        if (existing.has(s.clientId)) return;
        const items = [];
        for (const it of s.items) {
          const product = ctx.product(it.sku);
          const qty = product.productType === 'service' ? it.qty : budget.takePos(s.outletIdx, it.sku, it.qty);
          if (qty <= 0) continue;
          items.push({ productId: product.id, qty, price: discountedPrice(product.sellPrice, s.discountPct) });
        }
        if (items.length === 0) {
          stats.add('POS dilewati (stok)');
          return;
        }
        const customerId = s.customerName ? ctx.customerIds.get(s.customerName) : undefined;
        const res = await sales.processOne(ctx.actor(s.role), {
          outletId: ctx.outletIds[s.outletIdx],
          ...(customerId ? { customerId } : {}),
          clientGeneratedId: s.clientId,
          clientTimestamp: when.toISOString(),
          paymentMethod: s.method,
          items,
        });
        if (res.status === 'confirmed' && res.serverId) {
          await bd.sale(res.serverId, when);
          stats.add('POS');
        } else if (res.status === 'duplicate') {
          stats.add('POS sudah ada');
        } else {
          // Tidak boleh terjadi: stok dibatasi anggaran. Dicatat sebagai kegagalan agar terlihat.
          stats.fail(`${s.clientId}: ${res.status} ${res.message ?? ''}`);
        }
      },
    };
  });
}
