/**
 * Bentuk rencana CRM (prospek -> peluang -> penawaran -> pesanan -> faktur -> penerimaan) dan fungsi murni
 * pendukungnya. Tidak menyentuh database; isi rencana per usaha ada di crm-data.ts.
 *
 * Semua umur ("Ago" / "ageDays") adalah jumlah hari lalu dari hari ini.
 */

export type DemoRoleName = 'owner' | 'admin' | 'manager' | 'cashier' | 'staff';
export type PayMethod = 'cash' | 'qris' | 'debit' | 'transfer';

export type LeadEnd = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
export type OppStage = 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
export type QuotationEnd = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
export type OrderEnd = 'draft' | 'confirmed' | 'fulfilled' | 'cancelled';
export type ComplaintEnd = 'open' | 'in_progress' | 'resolved';

export interface LinePlan {
  sku: string;
  qty: number;
  /** harga satuan; kosong = harga jual master */
  price?: number;
}

export interface LeadPlan {
  tag: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  source: string;
  note: string;
  ageDays: number;
  end: LeadEnd;
  /** hari lalu saat prospek dikonversi/dinyatakan hilang */
  closedAgo?: number;
  /** data pelanggan baru; wajib bila end = 'converted' */
  customer?: { term: number; city: string; address: string };
}

export interface OppPlan {
  tag: string;
  title: string;
  /** nama pelanggan (master atau hasil konversi prospek) */
  customer?: string;
  /** tag prospek asal */
  lead?: string;
  ageDays: number;
  end: OppStage;
  /** nilai bila tidak ada penawaran terkait; selain itu nilai = total penawaran */
  value?: number;
  /** hari lalu saat ditutup (menang/kalah) */
  closedAgo?: number;
  /** perkiraan tutup: hari dari sekarang (negatif = sudah lewat) */
  expectCloseInDays: number;
  note: string;
}

export interface QuotationPlan {
  tag: string;
  customer: string;
  opp?: string;
  ageDays: number;
  validDays: number;
  note: string;
  lines: LinePlan[];
  end: QuotationEnd;
}

export interface PaymentPlan {
  /** hari lalu */
  ago: number;
  /** persen dari nilai faktur (termasuk PPN), atau 'rest' = sisa tagihan */
  pct: number | 'rest';
  method: PayMethod;
}

export interface OrderPlan {
  tag: string;
  customer: string;
  /** tag penawaran asal (garis dari penawaran dipakai apa adanya) */
  quotation?: string;
  ageDays: number;
  outletIdx: number;
  /** wajib bila tanpa penawaran */
  lines?: LinePlan[];
  end: OrderEnd;
  /** hari lalu saat dikonfirmasi / difulfil / dibatalkan */
  confirmAgo?: number;
  fulfilAgo?: number;
  cancelAgo?: number;
  note: string;
  payments?: PaymentPlan[];
}

/** Penjualan kredit B2B lewat kasir (POS) dengan faktur piutang. */
export interface CreditSalePlan {
  tag: string;
  customer: string;
  ageDays: number;
  hour: number;
  outletIdx: number;
  role: 'cashier' | 'manager';
  lines: LinePlan[];
  payments?: PaymentPlan[];
}

export interface InteractionPlan {
  tag: string;
  customer: string;
  type: 'call' | 'email' | 'visit' | 'meeting' | 'note';
  summary: string;
  detail: string;
  ago: number;
  by: DemoRoleName;
}

export interface ComplaintPlan {
  tag: string;
  customer: string;
  title: string;
  description: string;
  ago: number;
  end: ComplaintEnd;
  resolution?: string;
  resolvedAgo?: number;
  /** tautkan ke transaksi POS tertua pelanggan ini bila ada */
  linkSale?: boolean;
}

export interface CrmPlan {
  leads: LeadPlan[];
  opps: OppPlan[];
  quotations: QuotationPlan[];
  orders: OrderPlan[];
  creditSales: CreditSalePlan[];
  interactions: InteractionPlan[];
  complaints: ComplaintPlan[];
}

/** Penanda yang ditempel pada kolom catatan supaya dokumen bisa ditemukan lagi saat seed diulang. */
export const demoTag = (tag: string): string => `[demo:${tag}]`;
export const withTag = (text: string, tag: string): string => `${text} ${demoTag(tag)}`.trim();

/** Tarif PPN keluaran contoh (aturan PPN-KELUARAN di domain foundation). */
export const PPN_RATE = 0.11;

export const OPP_FLOW: OppStage[] = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won'];
export const LEAD_FLOW: LeadEnd[] = ['new', 'contacted', 'qualified'];

/** Tahap yang harus dilalui berurutan sampai `end` (closed_lost boleh dari tahap terbuka mana pun). */
export function oppPath(end: OppStage): OppStage[] {
  if (end === 'closed_lost') return ['qualification', 'proposal', 'closed_lost'];
  return OPP_FLOW.slice(1, OPP_FLOW.indexOf(end) + 1);
}

/** Status antara yang dilewati lewat moveLeadStage; 'converted' dan 'lost' ditutup terpisah. */
export function leadPath(end: LeadEnd): LeadEnd[] {
  if (end === 'lost') return ['contacted'];
  if (end === 'converted') return ['contacted', 'qualified'];
  return LEAD_FLOW.slice(1, LEAD_FLOW.indexOf(end) + 1);
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function linesTotal(lines: LinePlan[], priceOf: (sku: string) => number): number {
  return round2(lines.reduce((s, l) => s + l.qty * (l.price ?? priceOf(l.sku)), 0));
}

/** Jumlah tagihan (DPP + PPN) dari DPP. */
export function grossOf(net: number): number {
  return round2(net + round2(net * PPN_RATE));
}

/** Nominal tiap penerimaan berurutan; 'rest' = sisa. Tidak pernah melebihi tagihan. */
export function paymentAmounts(gross: number, payments: PaymentPlan[]): number[] {
  const out: number[] = [];
  let paid = 0;
  for (const p of [...payments].sort((a, b) => b.ago - a.ago)) {
    const left = round2(gross - paid);
    const amount = p.pct === 'rest' ? left : Math.min(left, round2((gross * p.pct) / 100));
    out.push(amount);
    paid = round2(paid + amount);
  }
  return out;
}

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90plus';

/** Sama dengan ReceivablesService.aging. */
export function agingBucket(daysLate: number): AgingBucket {
  if (daysLate <= 0) return 'current';
  if (daysLate <= 30) return 'd1_30';
  if (daysLate <= 60) return 'd31_60';
  if (daysLate <= 90) return 'd61_90';
  return 'd90plus';
}

export interface InvoiceFact {
  tag: string;
  customer: string;
  kind: 'order' | 'credit';
  /** umur faktur (hari) */
  invoiceAge: number;
  net: number;
  gross: number;
  outstanding: number;
  daysLate: number;
  bucket: AgingBucket;
  status: 'open' | 'partial' | 'paid';
}

/** Faktur yang akan terbit dari rencana, beserta sisa tagihan dan ember aging-nya. */
export function invoiceFacts(
  plan: CrmPlan,
  priceOf: (sku: string) => number,
  termOf: (customer: string) => number,
): InvoiceFact[] {
  const facts: InvoiceFact[] = [];
  const build = (
    tag: string,
    customer: string,
    kind: 'order' | 'credit',
    age: number,
    lines: LinePlan[],
    payments: PaymentPlan[] | undefined,
  ) => {
    const net = linesTotal(lines, priceOf);
    const gross = grossOf(net);
    const paid = paymentAmounts(gross, payments ?? []).reduce((s, a) => round2(s + a), 0);
    const outstanding = round2(gross - paid);
    const daysLate = age - termOf(customer);
    facts.push({
      tag,
      customer,
      kind,
      invoiceAge: age,
      net,
      gross,
      outstanding,
      daysLate,
      bucket: agingBucket(daysLate),
      status: outstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'open',
    });
  };

  for (const o of plan.orders) {
    if (o.end !== 'fulfilled') continue;
    const lines = o.quotation ? plan.quotations.find((q) => q.tag === o.quotation)?.lines : o.lines;
    if (!lines) throw new Error(`Pesanan ${o.tag} tidak punya baris.`);
    build(o.tag, o.customer, 'order', o.fulfilAgo ?? o.ageDays, lines, o.payments);
  }
  for (const c of plan.creditSales) build(c.tag, c.customer, 'credit', c.ageDays, c.lines, c.payments);
  return facts;
}

/** Baris barang berstok yang akan mengurangi stok outlet (pesanan terpenuhi dan penjualan kredit). */
export function stockDemand(
  plan: CrmPlan,
  isStocked: (sku: string) => boolean,
): Map<string, Map<string, number>> {
  const byOutlet = new Map<string, Map<string, number>>();
  const add = (outletIdx: number, lines: LinePlan[]) => {
    const key = String(outletIdx);
    const m = byOutlet.get(key) ?? new Map<string, number>();
    for (const l of lines) if (isStocked(l.sku)) m.set(l.sku, (m.get(l.sku) ?? 0) + l.qty);
    byOutlet.set(key, m);
  };
  for (const o of plan.orders) {
    if (o.end !== 'fulfilled') continue;
    add(o.outletIdx, (o.quotation ? plan.quotations.find((q) => q.tag === o.quotation)?.lines : o.lines) ?? []);
  }
  for (const c of plan.creditSales) add(c.outletIdx, c.lines);
  return byOutlet;
}

/** Barang berstok yang keluar karena pesanan terpenuhi dan penjualan kredit, lengkap dengan waktunya. */
export function fixedUses(
  plan: CrmPlan,
  isStocked: (sku: string) => boolean,
  atOf: (ago: number, hour: number, minute: number) => number,
): Array<{ outletIdx: number; sku: string; at: number; qty: number }> {
  const out: Array<{ outletIdx: number; sku: string; at: number; qty: number }> = [];
  for (const o of plan.orders) {
    if (o.end !== 'fulfilled') continue;
    const lines = (o.quotation ? plan.quotations.find((q) => q.tag === o.quotation)?.lines : o.lines) ?? [];
    const at = atOf(o.fulfilAgo ?? o.ageDays, 10, 0);
    for (const l of lines) if (isStocked(l.sku)) out.push({ outletIdx: o.outletIdx, sku: l.sku, at, qty: l.qty });
  }
  for (const c of plan.creditSales) {
    const at = atOf(c.ageDays, c.hour, 20);
    for (const l of c.lines) if (isStocked(l.sku)) out.push({ outletIdx: c.outletIdx, sku: l.sku, at, qty: l.qty });
  }
  return out;
}
