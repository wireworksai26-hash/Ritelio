import { CrmService } from '../../../modules/crm/crm.service';
import { grossAmount } from '../../../modules/finance/document-amounts';
import { ReceivablesService } from '../../../modules/receivables/receivables.service';
import { SalesService } from '../../../modules/sales/sales.service';
import type { DemoContext } from '../context';
import type { Backdater } from './backdate';
import {
  demoTag,
  leadPath,
  linesTotal,
  oppPath,
  round2,
  withTag,
  type CrmPlan,
  type LinePlan,
  type OppPlan,
  type OrderPlan,
  type PaymentPlan,
  type QuotationPlan,
} from './crm-plan';
import type { StockBudget } from './stock';

const DAY_MS = 86_400_000;

export interface TimelineEvent {
  when: Date;
  label: string;
  run(): Promise<void>;
}

export class Stats {
  readonly counts = new Map<string, number>();
  readonly failures: string[] = [];
  add(key: string, n = 1): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + n);
  }
  fail(message: string): void {
    this.failures.push(message);
  }
  describe(): string {
    return [...this.counts.entries()].map(([k, v]) => `${k}=${v}`).join(' ');
  }
}

const LEAD_RANK: Record<string, number> = { new: 0, contacted: 1, qualified: 2 };
const QUOTATION_PATH: Record<string, string[]> = {
  draft: [],
  sent: ['sent'],
  accepted: ['sent', 'accepted'],
  converted: ['sent', 'accepted'], // 'converted' dicapai lewat konversi ke pesanan
  rejected: ['sent', 'rejected'],
  expired: ['sent', 'expired'],
};

/**
 * Menjalankan rencana CRM lewat CrmService / ReceivablesService / SalesService. Dokumen dikenali kembali
 * lewat penanda "[demo:KODE]" pada kolom catatan, sehingga menjalankan ulang tidak menggandakan apa pun.
 * Kolom tanggal kosmetik (createdAt, closedAt, validUntil, ...) disetel ulang hanya saat dokumen baru dibuat;
 * tanggal yang menyangkut jurnal dan stok ada di Backdater.
 */
export class CrmRunner {
  private readonly crm: CrmService;
  private readonly receivables: ReceivablesService;
  private readonly sales: SalesService;
  private readonly customers = new Map<string, string>();
  /** baris dokumen setelah disesuaikan dengan stok, per kode dokumen */
  private readonly resolved = new Map<string, LinePlan[]>();

  constructor(
    private readonly ctx: DemoContext,
    private readonly plan: CrmPlan,
    private readonly bd: Backdater,
    private readonly budget: StockBudget,
    private readonly stats: Stats,
    /** hari terjauh yang boleh dimundurkan (tidak sebelum 2 Januari) */
    private readonly maxAgo: number,
  ) {
    this.crm = ctx.get(CrmService);
    this.receivables = ctx.get(ReceivablesService);
    this.sales = ctx.get(SalesService);
  }

  private when(ago: number, hour: number, minute = 0): Date {
    return this.ctx.at(Math.min(Math.max(ago, 0), this.maxAgo), hour, minute);
  }

  private get t() {
    return { tenantId: this.ctx.tenantId, companyId: this.ctx.companyId };
  }

  private priceOf = (sku: string): number => this.ctx.product(sku).sellPrice;
  private stocked = (sku: string): boolean => this.ctx.product(sku).productType !== 'service';

  private async customerId(name: string): Promise<string> {
    const cached = this.customers.get(name) ?? this.ctx.customerIds.get(name);
    if (cached) return cached;
    const row = await this.ctx.prisma.customer.findFirst({ where: { ...this.t, name }, select: { id: true } });
    if (!row) throw new Error(`Pelanggan "${name}" tidak ditemukan untuk rencana CRM.`);
    this.customers.set(name, row.id);
    return row.id;
  }

  private async termOf(customerId: string): Promise<number> {
    const c = await this.ctx.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { paymentTermDays: true } });
    return c.paymentTermDays;
  }

  /** Sesuaikan baris dengan stok. Barang berstok yang akan keluar (consume) dibatasi jatah B2B outlet. */
  private resolveLines(tag: string, lines: LinePlan[], outletIdx: number, consume: boolean): LinePlan[] {
    const cached = this.resolved.get(tag);
    if (cached) return cached;
    const out: LinePlan[] = [];
    for (const l of lines) {
      if (!consume || !this.stocked(l.sku)) {
        out.push(l);
        continue;
      }
      const granted = this.budget.takeB2b(outletIdx, l.sku, l.qty);
      if (granted > 0) out.push({ ...l, qty: granted });
    }
    this.resolved.set(tag, out);
    return out;
  }

  private orderOfQuotation(qTag: string): OrderPlan | undefined {
    return this.plan.orders.find((o) => o.quotation === qTag);
  }

  private linesOfQuotation(q: QuotationPlan): LinePlan[] {
    const order = this.orderOfQuotation(q.tag);
    return this.resolveLines(q.tag, q.lines, order?.outletIdx ?? 0, order?.end === 'fulfilled');
  }

  private linesOfOrder(o: OrderPlan): LinePlan[] {
    if (o.quotation) {
      const q = this.plan.quotations.find((x) => x.tag === o.quotation);
      return q ? this.linesOfQuotation(q) : [];
    }
    return this.resolveLines(o.tag, o.lines ?? [], o.outletIdx, o.end === 'fulfilled');
  }

  // ============================== PROSPEK ==============================

  async leads(): Promise<void> {
    const { prisma } = this.ctx;
    const { tenantId } = this.t;
    for (const lp of [...this.plan.leads].sort((a, b) => b.ageDays - a.ageDays)) {
      let lead = await prisma.lead.findFirst({ where: { ...this.t, notes: { contains: demoTag(lp.tag) } } });
      const fresh = !lead;
      if (!lead) {
        lead = await this.crm.createLead(tenantId, {
          name: lp.name,
          contactName: lp.contact,
          phone: lp.phone,
          email: lp.email,
          source: lp.source,
          notes: withTag(lp.note, lp.tag),
        });
        this.stats.add('lead');
      }

      let status = lead.status as string;
      for (const step of leadPath(lp.end)) {
        if ((LEAD_RANK[status] ?? 99) < (LEAD_RANK[step] ?? 99)) {
          await this.crm.moveLeadStage(tenantId, lead.id, { status: step as 'contacted' | 'qualified' });
          status = step;
        }
      }
      if (lp.end === 'lost' && status !== 'lost') {
        await this.crm.moveLeadStage(tenantId, lead.id, { status: 'lost' });
        status = 'lost';
      }
      let customerCreatedAt: string | undefined;
      if (lp.end === 'converted' && status !== 'converted') {
        if (!lp.customer) throw new Error(`Prospek ${lp.tag} berstatus converted tetapi tanpa data pelanggan.`);
        const customer = await this.crm.convertLead(tenantId, lead.id, {
          name: lp.name,
          contact: lp.contact,
          phone: lp.phone,
          email: lp.email,
          city: lp.customer.city,
          address: lp.customer.address,
          paymentTermDays: lp.customer.term,
        });
        this.customers.set(lp.name, customer.id);
        customerCreatedAt = customer.id;
        this.stats.add('lead→pelanggan');
      }

      if (fresh) {
        // Kosmetik non-keuangan: tanggal pembuatan prospek (service memakai waktu sekarang).
        const created = this.when(lp.ageDays, 9);
        const closed = lp.closedAgo !== undefined ? this.when(lp.closedAgo, 11) : undefined;
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            createdAt: created,
            updatedAt: closed ?? created,
            ...(lp.end === 'converted' && closed ? { convertedAt: closed } : {}),
            ...(lp.end === 'lost' && closed ? { lostAt: closed } : {}),
          },
        });
        if (customerCreatedAt && closed) await prisma.customer.update({ where: { id: customerCreatedAt }, data: { createdAt: closed, updatedAt: closed } });
      }
    }
  }

  // ============================== PELUANG, PENAWARAN, PESANAN ==============================

  private async ensureOpp(op: OppPlan, value: number): Promise<string> {
    const { prisma } = this.ctx;
    const found = await prisma.opportunity.findFirst({ where: { ...this.t, notes: { contains: demoTag(op.tag) } }, select: { id: true } });
    if (found) return found.id;

    const customerId = op.customer ? await this.customerId(op.customer) : undefined;
    const lead = op.lead ? await prisma.lead.findFirst({ where: { ...this.t, notes: { contains: demoTag(op.lead) } }, select: { id: true } }) : null;
    const expect = new Date(this.ctx.daysAgo(0).getTime() + op.expectCloseInDays * DAY_MS);
    const created = await this.crm.createOpportunity(this.t.tenantId, {
      title: op.title,
      ...(customerId ? { customerId } : {}),
      ...(lead ? { leadId: lead.id } : {}),
      value,
      stage: 'prospecting',
      expectedCloseDate: expect.toISOString().slice(0, 10),
      notes: withTag(op.note, op.tag),
    });
    for (const stage of oppPath(op.end)) await this.crm.moveOpportunity(this.t.tenantId, created.id, { stage });

    // Kosmetik non-keuangan: tanggal pembuatan dan penutupan peluang.
    const createdAt = this.when(op.ageDays, 9);
    const closedAt = op.end === 'closed_won' || op.end === 'closed_lost' ? this.when(op.closedAgo ?? op.ageDays, 15) : null;
    await prisma.opportunity.update({ where: { id: created.id }, data: { createdAt, closedAt, updatedAt: closedAt ?? createdAt } });
    this.stats.add('peluang');
    return created.id;
  }

  private async ensureQuotation(q: QuotationPlan): Promise<void> {
    const { prisma } = this.ctx;
    const { tenantId } = this.t;
    let quotation = await prisma.quotation.findFirst({ where: { ...this.t, note: { contains: demoTag(q.tag) } } });
    const fresh = !quotation;

    if (!quotation) {
      const lines = this.linesOfQuotation(q);
      if (lines.length === 0) {
        this.stats.add('penawaran dilewati (stok)');
        return;
      }
      const opp = q.opp ? this.plan.opps.find((o) => o.tag === q.opp) : undefined;
      const oppId = opp ? await this.ensureOpp(opp, linesTotal(lines, this.priceOf)) : undefined;
      quotation = await this.crm.createQuotation(tenantId, {
        customerId: await this.customerId(q.customer),
        ...(oppId ? { opportunityId: oppId } : {}),
        note: withTag(q.note, q.tag),
        lines: lines.map((l) => ({ productId: this.ctx.product(l.sku).id, qty: l.qty, price: l.price ?? this.priceOf(l.sku) })),
      });
      this.stats.add('penawaran');
    }

    // Penawaran diterima hanya bila belum lewat masa berlaku saat itu; validUntil diatur setelah status final.
    const path = QUOTATION_PATH[q.end];
    const at = ['draft', ...path].indexOf(quotation.status);
    for (const step of at < 0 ? [] : path.slice(at)) {
      await this.crm.moveQuotation(tenantId, quotation.id, { status: step as 'sent' | 'accepted' | 'rejected' | 'expired' });
    }

    if (fresh) {
      // Kosmetik non-keuangan: tanggal dibuat dan masa berlaku penawaran.
      const createdAt = this.when(q.ageDays, 11);
      await prisma.quotation.update({
        where: { id: quotation.id },
        data: { createdAt, updatedAt: this.when(q.ageDays - 1, 11), validUntil: new Date(createdAt.getTime() + q.validDays * DAY_MS) },
      });
    }
  }

  private async ensureOrder(o: OrderPlan): Promise<void> {
    const { prisma } = this.ctx;
    const { tenantId } = this.t;
    let order = await prisma.salesOrder.findFirst({ where: { ...this.t, note: { contains: demoTag(o.tag) } } });
    const fresh = !order;
    const warehouseId = this.ctx.warehouseIds[o.outletIdx];

    if (!order) {
      if (o.quotation) {
        const q = await prisma.quotation.findFirst({ where: { ...this.t, note: { contains: demoTag(o.quotation) } }, select: { id: true, number: true } });
        if (!q) {
          this.stats.add('pesanan dilewati (tanpa penawaran)');
          return;
        }
        order = await this.crm.convertQuotation(tenantId, q.id, { warehouseId, note: withTag(`${o.note} Dari penawaran ${q.number}.`, o.tag) });
      } else {
        const lines = this.linesOfOrder(o);
        if (lines.length === 0) {
          this.stats.add('pesanan dilewati (stok)');
          return;
        }
        order = await this.crm.createSalesOrder(tenantId, {
          customerId: await this.customerId(o.customer),
          warehouseId,
          note: withTag(o.note, o.tag),
          lines: lines.map((l) => ({ productId: this.ctx.product(l.sku).id, qty: l.qty, price: l.price ?? this.priceOf(l.sku) })),
        });
      }
      this.stats.add('pesanan');
    }

    let status = order.status as string;
    if (o.end !== 'draft' && status === 'draft') {
      await this.crm.confirm(tenantId, order.id);
      status = 'confirmed';
    }
    if (o.end === 'cancelled' && status === 'confirmed') await this.crm.cancel(tenantId, order.id);

    if (fresh) {
      // Kosmetik non-keuangan: tanggal pesanan dibuat/dibatalkan (tanggal fulfil + jurnalnya di Backdater).
      const createdAt = this.when(o.ageDays, 13);
      const last = o.cancelAgo ?? o.confirmAgo;
      await prisma.salesOrder.update({
        where: { id: order.id },
        data: { createdAt, updatedAt: last !== undefined ? this.when(last, 13) : createdAt },
      });
    }
  }

  /** Peluang tanpa penawaran, penawaran (beserta peluangnya), lalu pesanan; masing-masing dari yang tertua. */
  async deals(): Promise<void> {
    const quoted = new Set(this.plan.quotations.map((q) => q.opp).filter(Boolean));
    const items: Array<{ age: number; rank: number; run: () => Promise<void> }> = [];
    for (const op of this.plan.opps) {
      if (!quoted.has(op.tag)) items.push({ age: op.ageDays, rank: 0, run: async () => void (await this.ensureOpp(op, op.value ?? 0)) });
    }
    for (const q of this.plan.quotations) items.push({ age: q.ageDays, rank: 1, run: () => this.ensureQuotation(q) });
    items.sort((a, b) => b.age - a.age || a.rank - b.rank);
    for (const it of items) await it.run();

    for (const o of [...this.plan.orders].sort((a, b) => b.ageDays - a.ageDays)) await this.ensureOrder(o);
  }

  // ============================== FULFIL, PENJUALAN KREDIT, PENERIMAAN ==============================

  private async receive(tag: string, idx: number, p: PaymentPlan, invoiceId: string | null, when: Date): Promise<void> {
    if (!invoiceId) return;
    const { prisma } = this.ctx;
    const noteTag = demoTag(`R-${tag}-${idx + 1}`);
    const exists = await prisma.customerReceipt.findFirst({ where: { ...this.t, note: { contains: noteTag } }, select: { id: true } });
    if (exists) return;
    const inv = await prisma.customerInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const gross = grossAmount(inv);
    const outstanding = round2(gross - Number(inv.paidAmount));
    if (outstanding <= 0) return;
    const amount = p.pct === 'rest' ? outstanding : Math.min(outstanding, round2((gross * p.pct) / 100));
    const result = await this.receivables.receive(this.t.tenantId, invoiceId, {
      amount,
      method: p.method,
      payDate: when.toISOString(),
      note: `Pembayaran ${tag} ${noteTag}`,
    });
    await this.bd.receipt(result.receipt.id, result.journalId, when);
    this.stats.add('penerimaan');
  }

  private paymentEvents(tag: string, payments: PaymentPlan[] | undefined, invoiceOf: () => Promise<string | null>): TimelineEvent[] {
    return [...(payments ?? [])]
      .sort((a, b) => b.ago - a.ago)
      .map((p, i) => {
        const when = this.when(p.ago, 11, 30);
        return { when, label: `terima ${tag}#${i + 1}`, run: async () => this.receive(tag, i, p, await invoiceOf(), when) };
      });
  }

  events(): TimelineEvent[] {
    const { prisma } = this.ctx;
    const out: TimelineEvent[] = [];

    for (const o of this.plan.orders) {
      if (o.end !== 'fulfilled') continue;
      const orderRow = () => prisma.salesOrder.findFirst({ where: { ...this.t, note: { contains: demoTag(o.tag) } }, select: { id: true, status: true, customerId: true, invoiceId: true } });
      const when = this.when(o.fulfilAgo ?? o.ageDays, 10);
      out.push({
        when,
        label: `fulfil ${o.tag}`,
        run: async () => {
          const so = await orderRow();
          if (!so || so.status !== 'confirmed') return;
          const res = await this.crm.fulfil(this.t.tenantId, so.id);
          await this.bd.fulfilment(so.id, when, { id: res.invoice.id, termDays: await this.termOf(so.customerId) });
          this.stats.add('fulfil');
        },
      });
      out.push(...this.paymentEvents(o.tag, o.payments, async () => (await orderRow())?.invoiceId ?? null));
    }

    for (const c of this.plan.creditSales) {
      const clientId = `demo-${this.ctx.biz.key}-credit-${c.tag}`;
      const when = this.when(c.ageDays, c.hour, 20);
      const invoiceOf = async () => {
        const tx = await prisma.salesTransaction.findFirst({ where: { ...this.t, clientGeneratedId: clientId }, select: { id: true } });
        if (!tx) return null;
        return (await prisma.customerInvoice.findFirst({ where: { ...this.t, salesTransactionId: tx.id }, select: { id: true } }))?.id ?? null;
      };
      out.push({
        when,
        label: `kredit ${c.tag}`,
        run: async () => {
          const exists = await prisma.salesTransaction.findFirst({ where: { ...this.t, clientGeneratedId: clientId }, select: { id: true } });
          if (exists) return;
          const customerId = await this.customerId(c.customer);
          const items = this.resolveLines(`credit-${c.tag}`, c.lines, c.outletIdx, true).map((l) => ({
            productId: this.ctx.product(l.sku).id,
            qty: l.qty,
            price: l.price ?? this.priceOf(l.sku),
          }));
          if (items.length === 0) {
            this.stats.add('penjualan kredit dilewati (stok)');
            return;
          }
          const res = await this.sales.processOne(this.ctx.actor(c.role), {
            outletId: this.ctx.outletIds[c.outletIdx],
            customerId,
            clientGeneratedId: clientId,
            clientTimestamp: when.toISOString(),
            paymentMethod: 'credit',
            items,
          });
          if (res.status !== 'confirmed' || !res.serverId) throw new Error(`Penjualan kredit ${c.tag} tidak terkonfirmasi: ${res.status} ${res.message ?? ''}`);
          await this.bd.sale(res.serverId, when, res.invoice ? { id: res.invoice.id, termDays: await this.termOf(customerId) } : undefined);
          this.stats.add('penjualan kredit');
        },
      });
      out.push(...this.paymentEvents(c.tag, c.payments, invoiceOf));
    }
    return out;
  }

  // ============================== INTERAKSI & KELUHAN ==============================

  async interactions(): Promise<void> {
    const { prisma } = this.ctx;
    for (const i of this.plan.interactions) {
      const found = await prisma.customerInteraction.findFirst({ where: { ...this.t, detail: { contains: demoTag(i.tag) } }, select: { id: true } });
      if (found) continue;
      const when = this.when(i.ago, 11);
      const row = await this.crm.createInteraction(this.t.tenantId, await this.customerId(i.customer), this.ctx.users[i.by].id, {
        type: i.type,
        summary: i.summary,
        detail: withTag(i.detail, i.tag),
        interactionDate: when.toISOString(),
      });
      // Kosmetik non-keuangan: cap waktu pembuatan catatan interaksi.
      await prisma.customerInteraction.update({ where: { id: row.id }, data: { createdAt: when } });
      this.stats.add('interaksi');
    }
  }

  async complaints(): Promise<void> {
    const { prisma } = this.ctx;
    for (const k of this.plan.complaints) {
      const found = await prisma.customerComplaint.findFirst({ where: { ...this.t, description: { contains: demoTag(k.tag) } }, select: { id: true } });
      if (found) continue;
      const customerId = await this.customerId(k.customer);
      const sale = k.linkSale
        ? await prisma.salesTransaction.findFirst({ where: { ...this.t, customerId, syncStatus: 'synced' }, orderBy: { clientTimestamp: 'asc' }, select: { id: true } })
        : null;
      const row = await this.crm.createComplaint(this.t.tenantId, {
        customerId,
        title: k.title,
        description: withTag(k.description, k.tag),
        ...(sale ? { salesTransactionId: sale.id } : {}),
      });
      if (k.end === 'in_progress') {
        await this.crm.resolveComplaint(this.t.tenantId, row.id, { status: 'in_progress', resolution: k.resolution ?? 'Sedang ditindaklanjuti oleh tim.' });
      } else if (k.end === 'resolved') {
        await this.crm.resolveComplaint(this.t.tenantId, row.id, { status: 'resolved', resolution: k.resolution ?? 'Selesai.' });
      }
      // Kosmetik non-keuangan: tanggal keluhan dibuat dan diselesaikan.
      const createdAt = this.when(k.ago, 14);
      const resolvedAt = k.end === 'resolved' ? this.when(k.resolvedAgo ?? k.ago, 16) : null;
      await prisma.customerComplaint.update({ where: { id: row.id }, data: { createdAt, resolvedAt, updatedAt: resolvedAt ?? createdAt } });
      this.stats.add('keluhan');
    }
  }
}
