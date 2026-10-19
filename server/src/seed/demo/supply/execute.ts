import { Prisma } from '@prisma/client';
import { roundMoney } from '../../../common/utils/money';
import { grossAmount } from '../../../modules/finance/document-amounts';
import { InventoryService } from '../../../modules/inventory/inventory.service';
import { StockOpService } from '../../../modules/inventory/stock-op.service';
import { ManufacturingService } from '../../../modules/manufacturing/manufacturing.service';
import { WorkCenterService } from '../../../modules/manufacturing/workcenter.service';
import { supplierInvoiceTag } from '../../../modules/payables/bill-input';
import { PayablesService } from '../../../modules/payables/payables.service';
import { ProcurementService } from '../../../modules/procurement/procurement.service';
import { PurchasingService } from '../../../modules/purchasing/purchasing.service';
import type { DemoContext } from '../context';
import { withClock } from './clock';
import { DemoRefs } from './refs';
import { placeSchedule } from './schedule';
import type { SupplyEvent, SupplyPlan } from './types';

/**
 * Menjalankan rencana supply lewat service aplikasi, dari peristiwa paling lama ke terbaru.
 *
 * Semua perubahan uang dan stok (jurnal, persediaan, utang, pembayaran, produksi) terjadi di dalam service,
 * dijalankan di bawah jam yang digeser (clock.ts) sehingga tanggal jurnal dan jatuh tempo benar.
 * Satu-satunya tulis mentah adalah update KOSMETIK tanggal pada kolom bawaan database yang tidak bisa diatur
 * lewat service (createdAt dan sejenisnya). Tidak ada nilai uang atau jumlah stok yang disentuh di sini.
 *
 * Idempoten: dokumen dikenali lewat DemoRefs (kunci rencana -> id) dan transisi status dijaga oleh status
 * dokumen saat ini. Update kosmetik hanya dijalankan pada putaran yang benar-benar membuat atau mengubah
 * dokumen, jadi menjalankan ulang di hari lain tidak menggeser tanggal yang sudah ada.
 */

export interface SupplyStats {
  requisitions: number;
  orders: number;
  receipts: number;
  bills: number;
  payments: number;
  transfers: number;
  adjustments: number;
  stockOps: number;
  productionOrders: number;
  schedules: number;
  qualityChecks: number;
  reorderOrders: number;
  performance: number;
}

const emptyStats = (): SupplyStats => ({
  requisitions: 0, orders: 0, receipts: 0, bills: 0, payments: 0, transfers: 0, adjustments: 0,
  stockOps: 0, productionOrders: 0, schedules: 0, qualityChecks: 0, reorderOrders: 0, performance: 0,
});

const OPERATING_EXPENSE = '6100';

type Ev<K extends SupplyEvent['kind']> = Extract<SupplyEvent, { kind: K }>;

class SupplyRunner {
  readonly stats = emptyStats();
  private readonly tid: string;
  private readonly purchasing: PurchasingService;
  private readonly procurement: ProcurementService;
  private readonly payables: PayablesService;
  private readonly inventory: InventoryService;
  private readonly stockOps: StockOpService;
  private readonly manufacturing: ManufacturingService;
  private readonly workCenters: WorkCenterService;

  constructor(
    private readonly ctx: DemoContext,
    private readonly refs: DemoRefs,
  ) {
    this.tid = ctx.tenantId;
    this.purchasing = ctx.get(PurchasingService);
    this.procurement = ctx.get(ProcurementService);
    this.payables = ctx.get(PayablesService);
    this.inventory = ctx.get(InventoryService);
    this.stockOps = ctx.get(StockOpService);
    this.manufacturing = ctx.get(ManufacturingService);
    this.workCenters = ctx.get(WorkCenterService);
  }

  private get db() {
    return this.ctx.prisma;
  }

  private pid(sku: string): string {
    return this.ctx.product(sku).id;
  }

  private wid(index: number): string {
    const id = this.ctx.warehouseIds[index];
    if (!id) throw new Error(`Gudang indeks ${index} tidak ada di ${this.ctx.biz.businessName}.`);
    return id;
  }

  private supplierId(name: string): string {
    const id = this.ctx.supplierIds.get(name);
    if (!id) throw new Error(`Pemasok "${name}" tidak ada di ${this.ctx.biz.businessName}.`);
    return id;
  }

  private ref(key: string): string {
    const id = this.refs.get(key);
    if (!id) throw new Error(`Rujukan ${key} belum ada: urutan rencana salah.`);
    return id;
  }

  async apply(e: SupplyEvent, at: Date): Promise<void> {
    switch (e.kind) {
      case 'req.create': return this.reqCreate(e, at);
      case 'req.submit': return this.reqSubmit(e, at);
      case 'req.decide': return this.reqDecide(e, at);
      case 'req.convert': return this.reqConvert(e, at);
      case 'po.create': return this.poCreate(e, at);
      case 'po.send': return this.poSend(e, at);
      case 'po.receive': return this.poReceive(e, at);
      case 'po.cancel': return this.poCancel(e, at);
      case 'bill.manual': return this.billManual(e, at);
      case 'bill.pay': return this.billPay(e, at);
      case 'trf.create': return this.trfCreate(e, at);
      case 'trf.ship': return this.trfShip(e, at);
      case 'trf.receive': return this.trfReceive(e, at);
      case 'adj': return this.adjust(e, at);
      case 'sop.open': return this.sopOpen(e, at);
      case 'sop.count': return this.sopCount(e, at);
      case 'sop.close': return this.sopClose(e, at);
      case 'qc.config': return this.qcConfig(e);
      case 'mo.create': return this.moCreate(e, at);
      case 'mo.schedule': return this.moSchedule(e, at);
      case 'mo.release': return this.moRelease(e, at);
      case 'mo.qc': return this.moQc(e, at);
      case 'mo.complete': return this.moComplete(e, at);
      case 'mo.cancel': return this.moCancel(e, at);
      case 'reorder.generate': return this.reorderGenerate(e, at);
    }
  }

  // ───────────── requisition ─────────────

  private async reqCreate(e: Ev<'req.create'>, at: Date) {
    const key = `req:${e.key}`;
    if (this.refs.has(key)) return;
    const req = await withClock(at, () =>
      this.procurement.createRequisition(this.tid, this.ctx.users[e.requester].id, {
        reason: e.reason,
        lines: e.lines.map((l) => ({ productId: this.pid(l.sku), qty: l.qty })),
      }),
    );
    await this.refs.set(key, req.id);
    this.stats.requisitions++;
    // Kosmetik: createdAt bawaan database = waktu seed berjalan; samakan dengan tanggal dokumen.
    await this.db.purchaseRequisition.update({ where: { id: req.id }, data: { createdAt: at } });
  }

  private async reqSubmit(e: Ev<'req.submit'>, at: Date) {
    const id = this.ref(`req:${e.key}`);
    const r = await this.db.purchaseRequisition.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (r.status === 'draft') await withClock(at, () => this.procurement.submitRequisition(this.tid, id));
  }

  private async reqDecide(e: Ev<'req.decide'>, at: Date) {
    const id = this.ref(`req:${e.key}`);
    const r = await this.db.purchaseRequisition.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (r.status === 'submitted') {
      await withClock(at, () => this.procurement.approveRequisition(this.tid, id, this.ctx.users[e.approver].id, { approve: e.approve }));
    }
  }

  private async reqConvert(e: Ev<'req.convert'>, at: Date) {
    const id = this.ref(`req:${e.key}`);
    const poRef = `po:${e.poKey}`;
    const r = await this.db.purchaseRequisition.findUniqueOrThrow({ where: { id }, select: { status: true, purchaseOrderId: true } });
    let poId: string | undefined;
    if (r.status === 'approved') {
      const res = await withClock(at, () => this.procurement.convertRequisitionToPo(this.tid, id, { warehouseId: this.wid(e.warehouse) }));
      poId = res.purchaseOrders[0].id;
      this.stats.orders++;
    } else if (r.status === 'converted' && !this.refs.has(poRef) && r.purchaseOrderId) {
      poId = r.purchaseOrderId; // pemulihan: PO sudah ada tetapi rujukannya belum tersimpan
    }
    if (!poId) return;
    await this.refs.set(poRef, poId);
    await this.db.purchaseOrder.update({ where: { id: poId }, data: { createdAt: at } });
  }

  // ───────────── purchase order ─────────────

  private async poCreate(e: Ev<'po.create'>, at: Date) {
    const key = `po:${e.key}`;
    if (this.refs.has(key)) return;
    const po = await withClock(at, () =>
      this.purchasing.createOrder(this.tid, {
        supplierId: this.supplierId(e.supplier),
        warehouseId: this.wid(e.warehouse),
        items: e.lines.map((l) => ({ productId: this.pid(l.sku), qty: l.qty, price: l.price })),
      }),
    );
    await this.refs.set(key, po.id);
    this.stats.orders++;
    await this.db.purchaseOrder.update({ where: { id: po.id }, data: { createdAt: at } });
  }

  private async poSend(e: Ev<'po.send'>, at: Date) {
    const id = this.ref(`po:${e.key}`);
    const po = await this.db.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (po.status === 'draft') await withClock(at, () => this.purchasing.sendOrder(this.tid, id));
  }

  private async poReceive(e: Ev<'po.receive'>, at: Date) {
    const id = this.ref(`po:${e.key}`);
    const po = await this.db.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
    if (po.status !== 'ordered') return;

    const rejections: Record<string, number> = {};
    for (const [sku, qty] of Object.entries(e.rejections ?? {})) {
      const item = po.items.find((i) => i.productId === this.pid(sku));
      if (!item) throw new Error(`Penolakan ${sku}: baris tidak ada di PO ${po.code}.`);
      rejections[item.id] = qty;
    }
    const res = await withClock(at, () => this.purchasing.receiveOrder(this.tid, id, rejections));
    this.stats.receipts++;
    this.stats.bills++;

    // Kosmetik: pergerakan stok, tagihan, dan hitungan pajak lahir dengan createdAt/billDate bawaan database.
    await this.db.stockMovement.updateMany({ where: { tenantId: this.tid, refId: id, type: 'purchase' }, data: { createdAt: at } });
    await this.db.vendorBill.update({ where: { id: res.bill.id }, data: { billDate: at, createdAt: at, note: `[demo] Penerimaan ${po.code}` } });
    await this.db.taxComputation.updateMany({ where: { tenantId: this.tid, documentType: 'vendor_bill', documentId: res.bill.id }, data: { computedAt: at } });
  }

  private async poCancel(e: Ev<'po.cancel'>, at: Date) {
    const id = this.ref(`po:${e.key}`);
    const po = await this.db.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (po.status === 'draft' || po.status === 'ordered') {
      await withClock(at, () => this.purchasing.updateOrder(this.tid, id, { status: 'cancelled' }));
    }
  }

  // ───────────── tagihan pemasok ─────────────

  private async billManual(e: Ev<'bill.manual'>, at: Date) {
    const key = `bill:${e.key}`;
    if (this.refs.has(key)) return;
    const supplierId = this.supplierId(e.supplier);

    // Nomor faktur pemasok "DEMO-INV-xx" ikut menjadi kunci alami bila rujukan belum sempat tersimpan.
    let id = (
      await this.db.vendorBill.findFirst({
        where: { tenantId: this.tid, supplierId, note: { startsWith: supplierInvoiceTag(e.invoiceNo) } },
        select: { id: true },
      })
    )?.id;
    if (!id) {
      const account = await this.db.chartOfAccount.findFirstOrThrow({
        where: { tenantId: this.tid, companyId: this.ctx.companyId, code: OPERATING_EXPENSE },
        select: { id: true },
      });
      // Jatuh tempo tidak boleh lebih awal dari tanggal tagihan (relevan bila tanggal terpotong awal tahun).
      const due = new Date(Math.max(at.getTime(), this.ctx.daysAgo(e.dueDay).getTime()));
      const bill = await withClock(at, () =>
        this.payables.createBill(
          this.tid,
          {
            supplierId,
            supplierInvoiceNumber: e.invoiceNo,
            billDate: at.toISOString(),
            dueDate: due.toISOString(),
            note: `[demo] ${e.invoiceNo}`,
            lines: [{ accountId: account.id, description: e.description, amount: e.amount }],
          },
          { actorId: this.ctx.users.admin.id },
        ),
      );
      id = bill.id;
      this.stats.bills++;
    }
    await this.refs.set(key, id);
    await this.db.vendorBill.update({ where: { id }, data: { createdAt: at } });
    await this.db.taxComputation.updateMany({ where: { tenantId: this.tid, documentType: 'vendor_bill', documentId: id }, data: { computedAt: at } });
  }

  private async billIdOf(target: string): Promise<string> {
    if (this.refs.has(`po:${target}`)) {
      const bill = await this.db.vendorBill.findFirst({ where: { tenantId: this.tid, purchaseOrderId: this.ref(`po:${target}`) }, select: { id: true } });
      if (!bill) throw new Error(`PO ${target} belum punya tagihan: belum diterima.`);
      return bill.id;
    }
    return this.ref(`bill:${target}`);
  }

  private async billPay(e: Ev<'bill.pay'>, at: Date) {
    const key = `pay:${e.key}`;
    if (this.refs.has(key)) return;
    const billId = await this.billIdOf(e.target);
    const bill = await this.db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
    const gross = grossAmount(bill);
    const outstanding = roundMoney(gross - Number(bill.paidAmount));
    const amount = e.fraction === 'full' ? outstanding : roundMoney(gross * e.fraction);
    if (!(amount > 0) || amount > outstanding) {
      throw new Error(`Pembayaran ${e.key} (${amount}) tidak cocok dengan sisa tagihan ${bill.number} (${outstanding}).`);
    }
    const res = await withClock(at, () =>
      this.payables.payBill(this.tid, billId, {
        amount,
        method: e.method,
        payDate: at.toISOString(),
        note: `[demo] DEMO-PAY-${e.key}`,
      }),
    );
    await this.refs.set(key, res.payment.id);
    this.stats.payments++;
    await this.db.vendorPayment.update({ where: { id: res.payment.id }, data: { createdAt: at } });
  }

  // ───────────── transfer stok ─────────────

  private async trfCreate(e: Ev<'trf.create'>, at: Date) {
    const key = `trf:${e.key}`;
    if (this.refs.has(key)) return;
    const t = await withClock(at, () =>
      this.procurement.createTransfer(this.tid, {
        fromWarehouseId: this.wid(e.from),
        toWarehouseId: this.wid(e.to),
        note: e.note,
        lines: e.lines.map((l) => ({ productId: this.pid(l.sku), qty: l.qty })),
      }),
    );
    await this.refs.set(key, t.id);
    this.stats.transfers++;
    await this.db.stockTransfer.update({ where: { id: t.id }, data: { createdAt: at } });
  }

  private async trfShip(e: Ev<'trf.ship'>, at: Date) {
    const id = this.ref(`trf:${e.key}`);
    const t = await this.db.stockTransfer.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (t.status !== 'draft') return;
    await withClock(at, () => this.procurement.shipTransfer(this.tid, id));
    await this.db.stockMovement.updateMany({ where: { tenantId: this.tid, refId: id, type: 'transfer_out' }, data: { createdAt: at } });
  }

  private async trfReceive(e: Ev<'trf.receive'>, at: Date) {
    const id = this.ref(`trf:${e.key}`);
    const t = await this.db.stockTransfer.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (t.status !== 'in_transit') return;
    await withClock(at, () => this.procurement.receiveTransfer(this.tid, id));
    await this.db.stockMovement.updateMany({ where: { tenantId: this.tid, refId: id, type: 'transfer_in' }, data: { createdAt: at } });
  }

  // ───────────── penyesuaian dan opname ─────────────

  private async adjust(e: Ev<'adj'>, at: Date) {
    const key = `adj:${e.key}`;
    if (this.refs.has(key)) return;
    const where = { tenantId: this.tid, productId: this.pid(e.sku), warehouseId: this.wid(e.warehouse), type: 'adjustment' as const, note: e.note };
    // Catatan "[demo] DEMO-ADJ-xx" unik, jadi juga kunci alami bila daftar rujukan belum sempat tersimpan.
    if (!(await this.db.stockMovement.findFirst({ where, select: { id: true } }))) {
      await withClock(at, () =>
        this.inventory.adjustStock(this.tid, { productId: where.productId, warehouseId: where.warehouseId, qty: e.qty, note: e.note }, this.ctx.users.admin.id),
      );
      this.stats.adjustments++;
    }
    const movement = await this.db.stockMovement.findFirstOrThrow({ where, select: { id: true } });
    await this.refs.set(key, movement.id);
    await this.db.stockMovement.update({ where: { id: movement.id }, data: { createdAt: at } });
  }

  private async sopOpen(e: Ev<'sop.open'>, at: Date) {
    const key = `sop:${e.key}`;
    if (this.refs.has(key)) return;
    const op = await withClock(at, () => this.stockOps.open(this.tid, { warehouseId: this.wid(e.warehouse), note: e.note }));
    await this.refs.set(key, op.id);
    this.stats.stockOps++;
    await this.db.stockOp.update({ where: { id: op.id }, data: { openedAt: at } });
  }

  private async sopCount(e: Ev<'sop.count'>, at: Date) {
    const id = this.ref(`sop:${e.key}`);
    const op = await this.db.stockOp.findUniqueOrThrow({
      where: { id },
      include: { lines: { include: { product: { select: { sku: true } } } } },
    });
    if (op.status !== 'open') return;
    const sorted = [...op.lines].sort((a, b) => a.product.sku.localeCompare(b.product.sku));
    const take = e.fraction !== undefined && e.fraction < 1 ? Math.max(1, Math.ceil(sorted.length * e.fraction)) : sorted.length;
    const lines = sorted.slice(0, take).map((l) => ({
      productId: l.productId,
      countedQty: Math.max(0, roundMoney(Number(l.systemQty) + (e.variances[l.product.sku] ?? 0))),
    }));
    if (lines.length > 0) await withClock(at, () => this.stockOps.countLines(this.tid, id, lines));
  }

  private async sopClose(e: Ev<'sop.close'>, at: Date) {
    const id = this.ref(`sop:${e.key}`);
    const op = await this.db.stockOp.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (op.status !== 'open') return;
    await withClock(at, () => this.stockOps.close(this.tid, id, { note: e.note }, this.ctx.users.admin.id));
    await this.db.stockMovement.updateMany({ where: { tenantId: this.tid, refId: id, type: 'adjustment' }, data: { createdAt: at } });
  }

  // ───────────── produksi ─────────────

  private async qcConfig(e: Ev<'qc.config'>) {
    const key = `qc:${e.sku}`;
    if (this.refs.has(key)) return;
    await this.workCenters.configureQcStages(
      this.tid,
      this.pid(e.sku),
      e.stages.map((s) => ({ stage: s.stage, isRequired: true, minPassPct: s.minPassPct })),
    );
    await this.refs.set(key, e.sku);
  }

  private async moCreate(e: Ev<'mo.create'>, at: Date) {
    const key = `mo:${e.key}`;
    if (this.refs.has(key)) return;
    // Catatan "[demo] DEMO-MO-xx" unik: kunci alami bila rujukan belum sempat tersimpan.
    let id = (await this.db.productionOrder.findFirst({ where: { tenantId: this.tid, note: e.note }, select: { id: true } }))?.id;
    if (!id) {
      const order = await withClock(at, () =>
        this.manufacturing.createProductionOrder(this.tid, {
          productId: this.pid(e.sku),
          warehouseId: this.wid(e.warehouse),
          qtyPlanned: e.qty,
          priority: e.priority,
          ...(e.scheduledDay !== undefined ? { scheduledDate: this.ctx.isoDay(this.ctx.daysAgo(e.scheduledDay)) } : {}),
          note: e.note,
        }),
      );
      id = order.id;
      this.stats.productionOrders++;
    }
    await this.refs.set(key, id);
    await this.db.productionOrder.update({ where: { id }, data: { createdAt: at } });
  }

  private async moSchedule(e: Ev<'mo.schedule'>, at: Date) {
    const key = `sch:${e.scheduleKey}`;
    if (this.refs.has(key)) return;
    const wc = await this.db.workCenter.findFirstOrThrow({
      where: { tenantId: this.tid, code: e.workCenter },
      select: { id: true, capacityMinutes: true },
    });
    const day = this.ctx.isoDay(this.ctx.daysAgo(e.onDay));
    // Tanggal yang terpotong awal tahun bisa membuat beberapa jadwal jatuh di hari yang sama.
    const booked = await this.db.productionSchedule.findMany({
      where: { workCenterId: wc.id, scheduledDate: new Date(day), status: { not: 'cancelled' } },
      select: { startMinutes: true, durationMinutes: true },
    });
    const place = placeSchedule(booked, e.startMinutes, e.minutes, wc.capacityMinutes);
    const row = await withClock(at, () =>
      this.workCenters.schedule(this.tid, {
        workCenterId: wc.id,
        productionOrderId: this.ref(`mo:${e.key}`),
        scheduledDate: day,
        startMinutes: place.startMinutes,
        durationMinutes: e.minutes,
        ...(place.allowOverCapacity ? { allowOverCapacity: true } : {}),
      }),
    );
    await this.refs.set(key, row.id);
    this.stats.schedules++;
    // Kosmetik: service selalu membuat jadwal berstatus "planned"; jadwal lampau ditandai sudah berjalan.
    await this.db.productionSchedule.update({ where: { id: row.id }, data: { createdAt: at, ...(e.status ? { status: e.status } : {}) } });
  }

  private async moRelease(e: Ev<'mo.release'>, at: Date) {
    const id = this.ref(`mo:${e.key}`);
    const o = await this.db.productionOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (o.status !== 'planned') return;
    await withClock(at, () => this.manufacturing.release(this.tid, id));
    // Kosmetik: service tidak mengisi startedAt dan tidak mengatur createdAt pergerakan/konsumsi bahan.
    await this.db.productionOrder.update({ where: { id }, data: { startedAt: at } });
    await this.db.stockMovement.updateMany({ where: { tenantId: this.tid, refId: id, type: 'production', quantity: { lt: 0 } }, data: { createdAt: at } });
    await this.db.productionConsumption.updateMany({ where: { productionOrderId: id }, data: { createdAt: at } });
  }

  private async moQc(e: Ev<'mo.qc'>, at: Date) {
    const id = this.ref(`mo:${e.key}`);
    const o = await this.db.productionOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (o.status === 'completed' || o.status === 'cancelled') return;
    const done = await this.db.qualityCheck.findUnique({ where: { productionOrderId_stage: { productionOrderId: id, stage: e.stage } }, select: { id: true } });
    if (done) return;
    await withClock(at, () =>
      this.workCenters.recordQc(
        this.tid,
        id,
        { stage: e.stage, checkedQty: e.checked, defectQty: e.defect, note: e.note },
        this.ctx.users.manager.id,
      ),
    );
    this.stats.qualityChecks++;
    await this.db.qualityCheck.updateMany({ where: { productionOrderId: id, stage: e.stage }, data: { inspectedAt: at } });
  }

  private async moComplete(e: Ev<'mo.complete'>, at: Date) {
    const id = this.ref(`mo:${e.key}`);
    const o = await this.db.productionOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (o.status !== 'released' && o.status !== 'in_progress') return;
    await withClock(at, () => this.manufacturing.complete(this.tid, id, e.qty));
    await this.db.stockMovement.updateMany({ where: { tenantId: this.tid, refId: id, type: 'production', quantity: { gt: 0 } }, data: { createdAt: at } });
  }

  private async moCancel(e: Ev<'mo.cancel'>, at: Date) {
    const id = this.ref(`mo:${e.key}`);
    const o = await this.db.productionOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (o.status === 'planned') await withClock(at, () => this.manufacturing.cancel(this.tid, id));
  }

  // ───────────── reorder ─────────────

  private async reorderGenerate(e: Ev<'reorder.generate'>, at: Date) {
    const key = `reorder:${e.key}`;
    if (this.refs.has(key)) return;
    const res = await withClock(at, () => this.procurement.generateReorderPurchaseOrders(this.tid, { notify: false }));
    for (const s of res.skipped) this.ctx.log(`reorder dilewati ${s.sku}: ${s.reason}`);
    const codes = res.created.map((c) => c.orderNumber);
    const orders = await this.db.purchaseOrder.findMany({ where: { tenantId: this.tid, code: { in: codes } }, select: { id: true } });
    await this.refs.set(key, orders.map((o) => o.id).join(','));
    this.stats.reorderOrders += orders.length;
    this.stats.orders += orders.length;
    if (orders.length) await this.db.purchaseOrder.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { createdAt: at } });
  }
}

/** Jurnal yang diposting di bawah jam yang digeser punya posted_at lampau; samakan created_at-nya (kosmetik). */
async function alignJournalCreatedAt(ctx: DemoContext): Promise<number> {
  return ctx.prisma.$executeRaw(
    Prisma.sql`UPDATE journal_headers SET created_at = posted_at WHERE tenant_id = ${ctx.tenantId} AND posted_at IS NOT NULL AND posted_at < created_at`,
  );
}

async function computePerformance(ctx: DemoContext, refs: DemoRefs, plan: SupplyPlan, stats: SupplyStats): Promise<void> {
  if (refs.has('performance')) return;
  const procurement = ctx.get(ProcurementService);
  for (const w of plan.performanceWindows) {
    const res = await procurement.computeVendorPerformance(ctx.tenantId, ctx.isoDay(ctx.daysAgo(w.from)), ctx.isoDay(ctx.daysAgo(w.to)));
    stats.performance += res.computed;
  }
  await refs.set('performance', ctx.isoDay(new Date()));
}

/** Catatan pergerakan stok awal yang dibuat InventoryService.createProduct (dipakai seed:businesses). */
const OPENING_MOVEMENT_NOTE = 'Stok awal produk baru';

/**
 * Stok awal dari seed:businesses tercatat bertanggal hari seed berjalan, padahal pembelian, transfer, dan
 * penyesuaian di sini bertanggal lebih lama. Tanpa ini kartu stok berurutan tanggal akan negatif sebelum stok awal
 * "ada". Tanggal pergerakan stok awal dimundurkan ke sebelum peristiwa tertua (hanya memundurkan, tidak pernah
 * memajukan). Ini kosmetik: jumlah stok tidak berubah. Jurnal modal awalnya sengaja TIDAK disentuh: tanggal dan
 * nomor jurnal terkait periode fiskal dan urutan nomor, jadi hanya boleh lahir dari service.
 */
async function backdateOpeningStock(ctx: DemoContext, plan: SupplyPlan): Promise<number> {
  if (plan.events.length === 0) return 0;
  const oldest = Math.max(...plan.events.map((e) => e.day));
  const openingAt = new Date(Math.min(ctx.at(oldest + 5, 6).getTime(), ctx.at(oldest, 8).getTime() - 3_600_000));
  const res = await ctx.prisma.stockMovement.updateMany({
    where: { tenantId: ctx.tenantId, type: 'adjustment', note: OPENING_MOVEMENT_NOTE, createdAt: { gt: openingAt } },
    data: { createdAt: openingAt },
  });
  return res.count;
}

export async function executeSupplyPlan(ctx: DemoContext, plan: SupplyPlan): Promise<SupplyStats> {
  await backdateOpeningStock(ctx, plan);
  const refs = await DemoRefs.load(ctx);
  const runner = new SupplyRunner(ctx, refs);

  const perDay = new Map<number, number>();
  for (const e of plan.events) {
    // Jam dokumen bertambah di hari yang sama supaya urutan terbaca; tidak pernah melewati sekarang (clamp di clock).
    const n = perDay.get(e.day) ?? 0;
    perDay.set(e.day, n + 1);
    const at = ctx.at(e.day, Math.min(8 + n, 20));
    try {
      await runner.apply(e, at);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`supply ${e.kind}${'key' in e ? ` ${e.key}` : ''} (hari -${e.day}): ${msg}`);
    }
  }

  await computePerformance(ctx, refs, plan, runner.stats);
  await alignJournalCreatedAt(ctx);
  return runner.stats;
}
