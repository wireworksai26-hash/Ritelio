import { describe, expect, it } from 'vitest';
import { BUSINESSES } from '../../businesses.data';
import { CRM_PLANS } from './crm-data';
import {
  agingBucket,
  demoTag,
  fixedUses,
  grossOf,
  invoiceFacts,
  leadPath,
  linesTotal,
  oppPath,
  paymentAmounts,
  stockDemand,
  withTag,
  type CrmPlan,
} from './crm-plan';
import { OUTLET_SHARES, B2B_STOCK_FRACTION, POS_PROFILES } from './profiles';
import { distributionOf } from './plan';

const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe('helper murni CRM', () => {
  it('penanda dokumen ditempel di akhir catatan', () => {
    expect(demoTag('Q01')).toBe('[demo:Q01]');
    expect(withTag('Catatan', 'Q01')).toBe('Catatan [demo:Q01]');
  });

  it('jalur tahap peluang dan prospek berurutan dan berakhir di tahap tujuan', () => {
    expect(oppPath('prospecting')).toEqual([]);
    expect(oppPath('negotiation')).toEqual(['qualification', 'proposal', 'negotiation']);
    expect(oppPath('closed_won').at(-1)).toBe('closed_won');
    expect(oppPath('closed_lost').at(-1)).toBe('closed_lost');
    expect(leadPath('new')).toEqual([]);
    expect(leadPath('qualified')).toEqual(['contacted', 'qualified']);
    expect(leadPath('converted')).toEqual(['contacted', 'qualified']);
  });

  it('ember aging sama dengan batas di ReceivablesService.aging', () => {
    expect(agingBucket(-3)).toBe('current');
    expect(agingBucket(0)).toBe('current');
    expect(agingBucket(1)).toBe('d1_30');
    expect(agingBucket(30)).toBe('d1_30');
    expect(agingBucket(31)).toBe('d31_60');
    expect(agingBucket(61)).toBe('d61_90');
    expect(agingBucket(91)).toBe('d90plus');
  });

  it('tagihan memakai PPN 11% dan pembayaran tidak pernah melebihi tagihan', () => {
    expect(grossOf(1_000_000)).toBe(1_110_000);
    const gross = grossOf(1_000_000);
    expect(paymentAmounts(gross, [{ ago: 5, pct: 'rest', method: 'cash' }, { ago: 10, pct: 50, method: 'cash' }])).toEqual([555_000, 555_000]);
    expect(paymentAmounts(gross, [{ ago: 10, pct: 80, method: 'cash' }, { ago: 5, pct: 80, method: 'cash' }])).toEqual([888_000, 222_000]);
  });
});

for (const biz of BUSINESSES) {
  describe(`rencana CRM ${biz.businessName}`, () => {
    const plan: CrmPlan = CRM_PLANS[biz.key];
    const products = new Map(biz.products.map((p) => [p.sku, p]));
    const termOfCustomer = new Map<string, number>(biz.customers.map((c) => [c.name, c.paymentTermDays]));
    for (const l of plan.leads) if (l.customer) termOfCustomer.set(l.name, l.customer.term);
    const priceOf = (sku: string) => products.get(sku)!.sell;
    const facts = invoiceFacts(plan, priceOf, (c) => termOfCustomer.get(c) ?? NaN);

    it('rencana tersedia dan kode dokumen unik per jenis', () => {
      expect(plan).toBeTruthy();
      for (const list of [plan.leads, plan.opps, plan.quotations, plan.orders, plan.creditSales, plan.interactions, plan.complaints]) {
        expect(unique(list.map((x) => x.tag))).toBe(true);
      }
      // penanda unik meski kodenya mirip ("[demo:S01]" bukan awalan dari yang lain)
      expect(unique(plan.orders.map((o) => demoTag(o.tag)))).toBe(true);
    });

    it('semua pelanggan ada (master atau hasil konversi prospek) dan semua SKU ada di katalog', () => {
      const known = new Set([...biz.customers.map((c) => c.name), ...plan.leads.filter((l) => l.end === 'converted').map((l) => l.name)]);
      const customers = [
        ...plan.opps.map((x) => x.customer),
        ...plan.quotations.map((x) => x.customer),
        ...plan.orders.map((x) => x.customer),
        ...plan.creditSales.map((x) => x.customer),
        ...plan.interactions.map((x) => x.customer),
        ...plan.complaints.map((x) => x.customer),
      ].filter((c): c is string => Boolean(c));
      for (const c of customers) expect(known.has(c), c).toBe(true);

      const lines = [...plan.quotations.flatMap((q) => q.lines), ...plan.orders.flatMap((o) => o.lines ?? []), ...plan.creditSales.flatMap((c) => c.lines)];
      for (const l of lines) {
        expect(products.has(l.sku), l.sku).toBe(true);
        expect(l.qty).toBeGreaterThan(0);
        if (l.price !== undefined) expect(l.price).toBeGreaterThan(0);
      }
      for (const doc of [...plan.quotations.map((q) => q.lines), ...plan.orders.map((o) => o.lines ?? []), ...plan.creditSales.map((c) => c.lines)]) {
        expect(unique(doc.map((l) => l.sku))).toBe(true); // satu baris per produk per dokumen
      }
    });

    it('rujukan antar dokumen valid', () => {
      for (const q of plan.quotations) if (q.opp) expect(plan.opps.some((o) => o.tag === q.opp)).toBe(true);
      for (const o of plan.opps) if (o.lead) expect(plan.leads.some((l) => l.tag === o.lead)).toBe(true);
      const quoted = plan.quotations.map((q) => q.opp).filter(Boolean);
      expect(unique(quoted as string[])).toBe(true); // satu penawaran per peluang
      for (const o of plan.orders) {
        if (o.quotation) {
          const q = plan.quotations.find((x) => x.tag === o.quotation);
          expect(q?.end).toBe('converted');
          expect(q?.customer).toBe(o.customer);
          expect(o.lines).toBeUndefined();
        } else {
          expect(o.lines?.length).toBeGreaterThan(0);
        }
      }
      for (const q of plan.quotations.filter((x) => x.end === 'converted')) {
        expect(plan.orders.filter((o) => o.quotation === q.tag)).toHaveLength(1);
      }
      for (const l of plan.leads.filter((x) => x.end === 'converted')) expect(l.customer).toBeTruthy();
    });

    it('semua tahap, status, dan jenis dokumen terwakili', () => {
      expect(new Set(plan.leads.map((l) => l.end))).toEqual(new Set(['new', 'contacted', 'qualified', 'converted', 'lost']));
      expect(new Set(plan.opps.map((o) => o.end))).toEqual(new Set(['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']));
      expect(new Set(plan.quotations.map((q) => q.end))).toEqual(new Set(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']));
      expect(new Set(plan.orders.map((o) => o.end))).toEqual(new Set(['draft', 'confirmed', 'fulfilled', 'cancelled']));
      expect(new Set(plan.complaints.map((c) => c.end))).toEqual(new Set(['open', 'in_progress', 'resolved']));
      expect(plan.interactions.length).toBeGreaterThanOrEqual(6);
    });

    it('urutan waktu masuk akal: prospek, peluang, penawaran, pesanan, fulfil', () => {
      for (const o of plan.opps) {
        if (o.lead) {
          const lead = plan.leads.find((l) => l.tag === o.lead)!;
          expect(lead.ageDays, `${o.tag} lebih tua dari prospeknya`).toBeGreaterThanOrEqual(o.ageDays);
        }
        if (o.end === 'closed_won' || o.end === 'closed_lost') {
          expect(o.closedAgo).toBeDefined();
          expect(o.closedAgo!).toBeLessThan(o.ageDays);
        }
      }
      for (const q of plan.quotations) {
        const opp = plan.opps.find((o) => o.tag === q.opp);
        if (opp) expect(opp.ageDays).toBeGreaterThanOrEqual(q.ageDays);
      }
      for (const o of plan.orders) {
        if (o.quotation) expect(plan.quotations.find((q) => q.tag === o.quotation)!.ageDays).toBeGreaterThan(o.ageDays);
        if (o.confirmAgo !== undefined) expect(o.confirmAgo).toBeLessThanOrEqual(o.ageDays);
        if (o.fulfilAgo !== undefined) expect(o.fulfilAgo).toBeLessThanOrEqual(o.confirmAgo ?? o.ageDays);
        if (o.end === 'fulfilled') expect(o.fulfilAgo).toBeDefined();
        if (o.end === 'cancelled') expect(o.cancelAgo).toBeLessThanOrEqual(o.confirmAgo ?? o.ageDays);
      }
      for (const l of plan.leads) if (l.closedAgo !== undefined) expect(l.closedAgo).toBeLessThan(l.ageDays);
      for (const k of plan.complaints) if (k.end === 'resolved') expect(k.resolvedAgo!).toBeLessThan(k.ago);
    });

    it('aging piutang punya kelima ember, dengan faktur lunas, sebagian, dan belum dibayar', () => {
      const open = facts.filter((f) => f.status !== 'paid');
      expect(new Set(open.map((f) => f.bucket))).toEqual(new Set(['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus']));
      expect(new Set(facts.map((f) => f.status))).toEqual(new Set(['paid', 'partial', 'open']));
      for (const f of facts) {
        expect(f.outstanding).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(f.daysLate)).toBe(false);
      }
      // jauh dari batas ember supaya selisih jam/hari saat dijalankan tidak memindahkan faktur antar ember
      for (const f of open) {
        for (const edge of [0, 30, 60, 90]) expect(Math.abs(f.daysLate - edge), `${f.tag} dekat batas ${edge}`).toBeGreaterThanOrEqual(2);
      }
    });

    it('pembayaran jatuh setelah faktur terbit', () => {
      const invoiceAge = new Map(facts.map((f) => [f.tag, f.invoiceAge]));
      for (const o of plan.orders) for (const p of o.payments ?? []) expect(p.ago).toBeLessThan(invoiceAge.get(o.tag)!);
      for (const c of plan.creditSales) for (const p of c.payments ?? []) expect(p.ago).toBeLessThan(c.ageDays);
      for (const o of plan.orders) if (o.payments) expect(o.end).toBe('fulfilled');
    });

    it('barang berstok yang keluar masih di bawah jatah B2B stok awal outlet', () => {
      const shares = OUTLET_SHARES[biz.key];
      const distributed = new Set(POS_PROFILES[biz.key].catalog.map((e) => e.sku));
      const demand = stockDemand(plan, (sku) => products.get(sku)!.kind !== 'service');
      for (const [outlet, bySku] of demand) {
        for (const [sku, qty] of bySku) {
          const stock = products.get(sku)!.stock ?? 0;
          const sent = distributionOf(stock, shares);
          // barang yang tidak dijual di POS tidak dipindahkan ke outlet lain
          const held = distributed.has(sku) ? stock - sent.reduce((a, b) => a + b, 0) : stock;
          if (Number(outlet) === 0) expect(qty, `${sku} outlet ${outlet}`).toBeLessThanOrEqual(Math.floor(held * B2B_STOCK_FRACTION));
        }
      }
    });

    it('pemakaian stok tetap hanya dari pesanan terpenuhi dan penjualan kredit, dengan waktu menurun mengikuti umur', () => {
      const uses = fixedUses(plan, (sku) => products.get(sku)!.kind !== 'service', (ago, hour, minute) => 1_000_000 - ago * 86_400 + hour * 60 + minute);
      const expectedLines =
        plan.orders.filter((o) => o.end === 'fulfilled').reduce((n, o) => n + ((o.quotation ? plan.quotations.find((q) => q.tag === o.quotation)!.lines : o.lines!).filter((l) => products.get(l.sku)!.kind !== 'service').length), 0) +
        plan.creditSales.reduce((n, c) => n + c.lines.filter((l) => products.get(l.sku)!.kind !== 'service').length, 0);
      expect(uses).toHaveLength(expectedLines);
      for (const u of uses) {
        expect(products.get(u.sku)!.kind).not.toBe('service');
        expect(u.qty).toBeGreaterThan(0);
      }
    });

    it('nilai penawaran dan faktur positif; peluang terkait punya nilai', () => {
      for (const q of plan.quotations) expect(linesTotal(q.lines, priceOf)).toBeGreaterThan(0);
      for (const f of facts) expect(f.net).toBeGreaterThan(0);
      for (const o of plan.opps) if (!plan.quotations.some((q) => q.opp === o.tag)) expect(o.value).toBeGreaterThan(0);
    });

    it('perkiraan tutup peluang terbuka berada di masa depan dan tersebar antar bulan', () => {
      const open = plan.opps.filter((o) => o.end !== 'closed_won' && o.end !== 'closed_lost');
      for (const o of open) expect(o.expectCloseInDays).toBeGreaterThan(0);
      expect(new Set(open.map((o) => Math.floor(o.expectCloseInDays / 30))).size).toBeGreaterThanOrEqual(3);
    });
  });
}
