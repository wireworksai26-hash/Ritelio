import { ProcurementService } from '../../../modules/procurement/procurement.service';
import type { DemoContext } from '../context';
import { distributionOf, type Capacity, type StockTimeline } from './plan';
import { B2B_STOCK_FRACTION, OUTLET_SHARES, POS_STOCK_FRACTION } from './profiles';

const isStocked = (ctx: DemoContext, sku: string): boolean => ctx.product(sku).productType !== 'service';

/**
 * Stok awal seed:businesses hanya ada di gudang outlet pertama. Supaya outlet lain bisa berjualan barang,
 * sebagian stok dipindahkan lewat transfer antar gudang (kirim lalu terima) satu kali. Dilewati bila gudang
 * outlet itu sudah punya riwayat stok untuk barang tersebut (mis. domain 'supply' sudah mendistribusikannya).
 * Transfer tidak menjurnal apa pun; tanggalnya dimundurkan ke sebelum penjualan pertama.
 */
export async function distributeStock(ctx: DemoContext, skus: string[], when: Date): Promise<number> {
  const shares = OUTLET_SHARES[ctx.biz.key];
  if (!shares || ctx.outletIds.length < 2) return 0;
  const procurement = ctx.get(ProcurementService);
  const { prisma, tenantId, companyId } = ctx;
  let moved = 0;

  for (let o = 1; o < ctx.outletIds.length; o++) {
    const toWarehouseId = ctx.warehouseIds[o];
    const fromWarehouseId = ctx.warehouseIds[0];
    const done = await prisma.stockTransfer.findFirst({
      where: { tenantId, companyId, toWarehouseId, note: { startsWith: '[demo] Distribusi awal' } },
      select: { id: true },
    });
    if (done) continue;

    const lines: Array<{ productId: string; qty: number }> = [];
    for (const sku of skus) {
      if (!isStocked(ctx, sku)) continue;
      const productId = ctx.product(sku).id;
      const seen = await prisma.stockMovement.count({ where: { tenantId, companyId, productId, warehouseId: toWarehouseId } });
      if (seen > 0) continue;
      const src = await prisma.inventoryStock.findUnique({
        where: { tenantId_companyId_productId_warehouseId: { tenantId, companyId, productId, warehouseId: fromWarehouseId } },
        select: { quantity: true },
      });
      const qty = distributionOf(Number(src?.quantity ?? 0), shares)[o] ?? 0;
      if (qty > 0) lines.push({ productId, qty });
    }
    if (lines.length === 0) continue;

    const created = await procurement.createTransfer(tenantId, {
      fromWarehouseId,
      toWarehouseId,
      note: `[demo] Distribusi awal stok ke ${ctx.biz.outlets[o].name}`,
      lines,
    });
    await procurement.shipTransfer(tenantId, created.id);
    await procurement.receiveTransfer(tenantId, created.id);

    // Kosmetik non-keuangan (transfer tidak menjurnal): tanggal dokumen dan pergerakan stok sebelum penjualan pertama.
    await prisma.stockTransfer.update({ where: { id: created.id }, data: { createdAt: when, shippedAt: when, receivedAt: when, updatedAt: when } });
    await prisma.stockMovement.updateMany({ where: { tenantId, companyId, refId: created.id }, data: { createdAt: when } });
    moved += lines.length;
  }
  return moved;
}

/**
 * Anggaran stok per outlet. `base` = stok sekarang + yang sudah dijual seed ini, jadi nilainya sama pada
 * setiap kali dijalankan (rencana POS tetap stabil) dan ikut naik bila domain lain menambah stok.
 *  - POS memakai paling banyak POS_STOCK_FRACTION dari `base`, lewat rencana yang dipangkas (planPosSales).
 *  - Pesanan/penjualan kredit B2B memakai paling banyak B2B_STOCK_FRACTION dari `base` outlet masing-masing.
 * `live` adalah stok yang masih tersisa menurut pembukuan seed ini; tidak pernah dibiarkan negatif.
 */
export class StockBudget {
  private constructor(
    private readonly ctx: DemoContext,
    private readonly base: Array<Map<string, number>>,
    private readonly live: Array<Map<string, number>>,
    private readonly b2bUsed: Array<Map<string, number>>,
    private readonly myRefIds: string[],
  ) {}

  static async load(ctx: DemoContext, skus: string[]): Promise<StockBudget> {
    const { prisma, tenantId, companyId } = ctx;
    const stocked = [...new Set(skus)].filter((s) => isStocked(ctx, s));
    const productIds = stocked.map((s) => ctx.product(s).id);
    const skuOf = new Map(stocked.map((s) => [ctx.product(s).id, s]));

    const rows = await prisma.inventoryStock.findMany({
      where: { tenantId, companyId, warehouseId: { in: ctx.warehouseIds }, productId: { in: productIds } },
      select: { productId: true, warehouseId: true, quantity: true },
    });

    // Yang sudah dijual seed ini (POS + fulfil sales order), supaya dasar anggaran tidak menyusut saat diulang.
    const myTx = await prisma.salesTransaction.findMany({
      where: { tenantId, companyId, clientGeneratedId: { startsWith: `demo-${ctx.biz.key}-` } },
      select: { id: true },
    });
    const myOrders = await prisma.salesOrder.findMany({
      where: { tenantId, companyId, note: { contains: '[demo:' } },
      select: { id: true },
    });
    const refIds = [...myTx, ...myOrders].map((r) => r.id);
    const sold =
      refIds.length === 0
        ? []
        : await prisma.stockMovement.groupBy({
            by: ['productId', 'warehouseId'],
            where: { tenantId, companyId, type: 'sale', refId: { in: refIds }, productId: { in: productIds } },
            _sum: { quantity: true },
          });

    const make = () => ctx.warehouseIds.map(() => new Map<string, number>());
    const base = make();
    const live = make();
    for (const r of rows) {
      const sku = skuOf.get(r.productId);
      const o = ctx.warehouseIds.indexOf(r.warehouseId);
      if (sku === undefined || o < 0) continue;
      live[o].set(sku, Number(r.quantity));
      base[o].set(sku, Number(r.quantity));
    }
    for (const r of sold) {
      const sku = skuOf.get(r.productId);
      const o = ctx.warehouseIds.indexOf(r.warehouseId);
      if (sku === undefined || o < 0) continue;
      base[o].set(sku, (base[o].get(sku) ?? 0) - Number(r._sum.quantity ?? 0)); // jumlah keluar bertanda negatif
    }
    return new StockBudget(ctx, base, live, make(), refIds);
  }

  /**
   * Riwayat stok luar per outlet dan SKU (semua pergerakan kecuali penjualan seed ini), urut waktu.
   * Dipakai agar penjualan tidak mendahului barang yang baru masuk belakangan (pembelian, produksi, transfer).
   */
  async timeline(skus: string[]): Promise<StockTimeline> {
    const { prisma, tenantId, companyId } = this.ctx;
    const stocked = [...new Set(skus)].filter((s) => isStocked(this.ctx, s));
    const skuOf = new Map(stocked.map((s) => [this.ctx.product(s).id, s]));
    const mine = new Set(this.myRefIds);
    const rows = await prisma.stockMovement.findMany({
      where: { tenantId, companyId, warehouseId: { in: this.ctx.warehouseIds }, productId: { in: [...skuOf.keys()] } },
      select: { productId: true, warehouseId: true, quantity: true, createdAt: true, refId: true, type: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const out: StockTimeline = this.ctx.warehouseIds.map(() => new Map(stocked.map((s) => [s, []])));
    for (const r of rows) {
      if (r.type === 'sale' && r.refId && mine.has(r.refId)) continue; // penjualan seed ini dihitung terpisah
      const sku = skuOf.get(r.productId);
      const o = this.ctx.warehouseIds.indexOf(r.warehouseId);
      if (sku === undefined || o < 0) continue;
      out[o].get(sku)!.push({ at: r.createdAt.getTime(), qty: Number(r.quantity) });
    }
    return out;
  }

  /** Kapasitas penjualan POS per outlet untuk SKU berstok di `skus`; SKU yang tidak berstok tidak dibatasi. */
  posCapacity(skus: string[]): Capacity {
    return this.base.map((m) => {
      const out = new Map<string, number>();
      for (const sku of skus) if (isStocked(this.ctx, sku)) out.set(sku, Math.floor((m.get(sku) ?? 0) * POS_STOCK_FRACTION));
      return out;
    });
  }

  /** Jumlah yang boleh dikeluarkan POS sekarang (tidak melebihi stok yang tersisa). */
  takePos(outletIdx: number, sku: string, qty: number): number {
    const left = this.live[outletIdx]?.get(sku) ?? 0;
    const granted = Math.max(0, Math.floor(Math.min(qty, left) * 100) / 100);
    this.live[outletIdx]?.set(sku, left - granted);
    return granted;
  }

  /** Jumlah B2B yang boleh keluar: dibatasi jatah B2B outlet dan stok yang tersisa. */
  takeB2b(outletIdx: number, sku: string, qty: number): number {
    const cap = Math.floor((this.base[outletIdx]?.get(sku) ?? 0) * B2B_STOCK_FRACTION);
    const used = this.b2bUsed[outletIdx]?.get(sku) ?? 0;
    const left = this.live[outletIdx]?.get(sku) ?? 0;
    const granted = Math.max(0, Math.floor(Math.min(qty, cap - used, left) * 100) / 100);
    this.b2bUsed[outletIdx]?.set(sku, used + granted);
    this.live[outletIdx]?.set(sku, left - granted);
    return granted;
  }
}
