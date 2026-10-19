import { roundMoney } from '../../../common/utils/money';
import type { BusinessSeed, ProductSeed } from '../../businesses.data';
import type { SupplyEvent, SupplyPlan } from './types';

/**
 * Pemeriksaan murni atas rencana (tanpa database): urutan status dokumen, referensi, stok tidak negatif,
 * dan perkiraan umur utang. Dipakai oleh plan.spec.ts supaya rencana yang rusak ketahuan sebelum seed dijalankan.
 */

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90plus';

export interface PlanReport {
  problems: string[];
  /** "sku@indeksGudang" -> qty di akhir rencana. */
  stock: Map<string, number>;
  /** Stok di/bawah titik pesan ulang di akhir rencana, "sku@indeksGudang". */
  low: string[];
  /** Tagihan yang masih terbuka/sebagian menurut rencana, dengan hari telat (negatif = belum jatuh tempo). */
  openBills: Array<{ key: string; late: number; bucket: AgingBucket; partial: boolean }>;
  paidBills: string[];
}

export function bucketOf(daysLate: number): AgingBucket {
  if (daysLate <= 0) return 'current';
  if (daysLate <= 30) return 'd1_30';
  if (daysLate <= 60) return 'd31_60';
  if (daysLate <= 90) return 'd61_90';
  return 'd90plus';
}

const stockKey = (sku: string, wh: number) => `${sku}@${wh}`;

type ReqState = 'draft' | 'submitted' | 'approved' | 'rejected' | 'converted';
type PoState = 'draft' | 'ordered' | 'received' | 'cancelled';
type TrfState = 'draft' | 'in_transit' | 'received';
type MoState = 'planned' | 'released' | 'completed' | 'cancelled';

export function analysePlan(biz: BusinessSeed, plan: SupplyPlan): PlanReport {
  const problems: string[] = [];
  const bad = (msg: string) => problems.push(msg);

  const products = new Map<string, ProductSeed>(biz.products.map((p) => [p.sku, p]));
  const suppliers = new Map(biz.suppliers.map((s) => [s.name, s]));
  const boms = new Map((biz.boms ?? []).map((b) => [b.product, b]));
  const workCenters = new Set((biz.workCenters ?? []).map((w) => w.code));
  const warehouses = biz.outlets.length;

  const stock = new Map<string, number>();
  for (const p of biz.products) if (p.kind !== 'service' && p.stock && p.stock > 0) stock.set(stockKey(p.sku, 0), p.stock);

  const sku = (s: string, ctx: string): ProductSeed | null => {
    const p = products.get(s);
    if (!p) {
      bad(`${ctx}: SKU ${s} tidak ada.`);
      return null;
    }
    if (p.kind === 'service') {
      bad(`${ctx}: ${s} adalah jasa, tidak boleh dibeli, ditransfer, disesuaikan, atau diproduksi.`);
      return null;
    }
    return p;
  };
  const wh = (i: number, ctx: string) => {
    if (!Number.isInteger(i) || i < 0 || i >= warehouses) bad(`${ctx}: gudang ${i} tidak ada.`);
  };
  const add = (key: string, delta: number, ctx: string) => {
    const next = roundMoney((stock.get(key) ?? 0) + delta);
    if (next < 0) bad(`${ctx}: stok ${key} menjadi negatif (${next}).`);
    stock.set(key, next);
  };

  const reqs = new Map<string, { state: ReqState; lines: Array<{ sku: string; qty: number }>; ctx: string }>();
  const pos = new Map<string, { state: PoState; supplier: string; wh: number; lines: Array<{ sku: string; qty: number; price: number }>; receivedDay?: number; paid: number }>();
  const trfs = new Map<string, { state: TrfState; from: number; to: number; lines: Array<{ sku: string; qty: number }> }>();
  const mos = new Map<string, { state: MoState; sku: string; qty: number; wh: number; qcFailed: boolean }>();
  const sops = new Map<string, { wh: number; state: 'open' | 'counted' | 'closed'; variances: Record<string, number>; partial: boolean }>();
  const manual = new Map<string, { dueDay: number; paid: number }>();
  const adjKeys = new Set<string>();
  const scheduleKeys = new Set<string>();
  const seenKeys = new Set<string>();
  let lastDay = Infinity;

  const fresh = (kind: string, key: string, ctx: string) => {
    const id = `${kind}:${key}`;
    if (seenKeys.has(id)) bad(`${ctx}: kunci ${id} ganda.`);
    seenKeys.add(id);
  };

  for (const [i, e] of plan.events.entries()) {
    const ctx = `#${i} ${e.kind}`;
    if (e.day > lastDay) bad(`${ctx}: urutan tidak kronologis (hari ${e.day} setelah ${lastDay}).`);
    lastDay = e.day;
    if (!Number.isFinite(e.day) || e.day < 0 || e.day > 110) bad(`${ctx}: hari ${e.day} di luar rentang 0-110.`);

    const e2 = e as SupplyEvent;
    switch (e2.kind) {
      case 'req.create': {
        fresh('req', e2.key, ctx);
        for (const l of e2.lines) sku(l.sku, ctx);
        reqs.set(e2.key, { state: 'draft', lines: e2.lines, ctx });
        break;
      }
      case 'req.submit': {
        const r = reqs.get(e2.key);
        if (!r || r.state !== 'draft') bad(`${ctx}: requisition ${e2.key} bukan draf.`);
        else r.state = 'submitted';
        break;
      }
      case 'req.decide': {
        const r = reqs.get(e2.key);
        if (!r || r.state !== 'submitted') bad(`${ctx}: requisition ${e2.key} belum diajukan.`);
        else r.state = e2.approve ? 'approved' : 'rejected';
        break;
      }
      case 'req.convert': {
        const r = reqs.get(e2.key);
        wh(e2.warehouse, ctx);
        if (!r || r.state !== 'approved') {
          bad(`${ctx}: requisition ${e2.key} belum disetujui.`);
          break;
        }
        r.state = 'converted';
        // Satu requisition = satu PO hanya bila semua barisnya satu pemasok utama.
        const names = new Set(r.lines.map((l) => products.get(l.sku)?.supplier ?? '(kosong)'));
        if (names.size !== 1 || names.has('(kosong)')) bad(`${ctx}: baris requisition ${e2.key} tidak satu pemasok utama.`);
        fresh('po', e2.poKey, ctx);
        pos.set(e2.poKey, {
          state: 'draft',
          supplier: [...names][0],
          wh: e2.warehouse,
          lines: r.lines.map((l) => ({ sku: l.sku, qty: l.qty, price: products.get(l.sku)?.cost ?? 0 })),
          paid: 0,
        });
        break;
      }
      case 'po.create': {
        fresh('po', e2.key, ctx);
        wh(e2.warehouse, ctx);
        if (!suppliers.has(e2.supplier)) bad(`${ctx}: pemasok ${e2.supplier} tidak ada.`);
        for (const l of e2.lines) {
          sku(l.sku, ctx);
          if (!(l.price > 0) || !(l.qty > 0)) bad(`${ctx}: baris ${l.sku} tanpa harga atau jumlah.`);
        }
        pos.set(e2.key, { state: 'draft', supplier: e2.supplier, wh: e2.warehouse, lines: e2.lines, paid: 0 });
        break;
      }
      case 'po.send': {
        const p = pos.get(e2.key);
        if (!p || p.state !== 'draft') bad(`${ctx}: PO ${e2.key} bukan draf.`);
        else p.state = 'ordered';
        break;
      }
      case 'po.receive': {
        const p = pos.get(e2.key);
        if (!p || p.state !== 'ordered') {
          bad(`${ctx}: PO ${e2.key} belum dikirim.`);
          break;
        }
        for (const l of p.lines) {
          const rej = e2.rejections?.[l.sku] ?? 0;
          if (rej < 0 || rej > l.qty) bad(`${ctx}: penolakan ${l.sku} di luar jumlah.`);
          add(stockKey(l.sku, p.wh), l.qty - rej, ctx);
        }
        for (const s of Object.keys(e2.rejections ?? {})) {
          if (!p.lines.some((l) => l.sku === s)) bad(`${ctx}: penolakan untuk ${s} yang tidak ada di PO.`);
        }
        p.state = 'received';
        p.receivedDay = e2.day;
        break;
      }
      case 'po.cancel': {
        const p = pos.get(e2.key);
        if (!p || (p.state !== 'draft' && p.state !== 'ordered')) bad(`${ctx}: PO ${e2.key} tidak bisa dibatalkan.`);
        else p.state = 'cancelled';
        break;
      }
      case 'bill.manual': {
        fresh('bill', e2.key, ctx);
        if (!suppliers.has(e2.supplier)) bad(`${ctx}: pemasok ${e2.supplier} tidak ada.`);
        if (e2.dueDay > e2.day) bad(`${ctx}: jatuh tempo ${e2.dueDay} lebih awal dari tanggal tagihan ${e2.day}.`);
        if (!(e2.amount > 0)) bad(`${ctx}: nilai tagihan harus positif.`);
        manual.set(e2.key, { dueDay: e2.dueDay, paid: 0 });
        break;
      }
      case 'bill.pay': {
        fresh('pay', e2.key, ctx);
        const p = pos.get(e2.target);
        const m = manual.get(e2.target);
        const holder = p ?? m;
        if (!holder) {
          bad(`${ctx}: target ${e2.target} tidak ada.`);
          break;
        }
        if (p && p.state !== 'received') bad(`${ctx}: PO ${e2.target} belum diterima, belum ada tagihan.`);
        const part = e2.fraction === 'full' ? 1 - holder.paid : e2.fraction;
        if (!(part > 0) || holder.paid + part > 1 + 1e-9) bad(`${ctx}: pembayaran ${e2.target} melebihi tagihan.`);
        holder.paid = Math.min(1, holder.paid + part);
        break;
      }
      case 'trf.create': {
        fresh('trf', e2.key, ctx);
        wh(e2.from, ctx);
        wh(e2.to, ctx);
        if (e2.from === e2.to) bad(`${ctx}: gudang asal dan tujuan sama.`);
        for (const l of e2.lines) sku(l.sku, ctx);
        trfs.set(e2.key, { state: 'draft', from: e2.from, to: e2.to, lines: e2.lines });
        break;
      }
      case 'trf.ship': {
        const t = trfs.get(e2.key);
        if (!t || t.state !== 'draft') {
          bad(`${ctx}: transfer ${e2.key} bukan draf.`);
          break;
        }
        for (const l of t.lines) add(stockKey(l.sku, t.from), -l.qty, ctx);
        t.state = 'in_transit';
        break;
      }
      case 'trf.receive': {
        const t = trfs.get(e2.key);
        if (!t || t.state !== 'in_transit') {
          bad(`${ctx}: transfer ${e2.key} belum dikirim.`);
          break;
        }
        for (const l of t.lines) add(stockKey(l.sku, t.to), l.qty, ctx);
        t.state = 'received';
        break;
      }
      case 'adj': {
        fresh('adj', e2.key, ctx);
        wh(e2.warehouse, ctx);
        sku(e2.sku, ctx);
        if (e2.qty === 0) bad(`${ctx}: penyesuaian nol.`);
        if (adjKeys.has(e2.note)) bad(`${ctx}: catatan penyesuaian harus unik (kunci idempotensi).`);
        adjKeys.add(e2.note);
        add(stockKey(e2.sku, e2.warehouse), e2.qty, ctx);
        break;
      }
      case 'sop.open': {
        fresh('sop', e2.key, ctx);
        wh(e2.warehouse, ctx);
        sops.set(e2.key, { wh: e2.warehouse, state: 'open', variances: {}, partial: false });
        break;
      }
      case 'sop.count': {
        const s = sops.get(e2.key);
        if (!s || s.state !== 'open') {
          bad(`${ctx}: opname ${e2.key} tidak terbuka.`);
          break;
        }
        for (const k of Object.keys(e2.variances)) if (!stock.has(stockKey(k, s.wh))) bad(`${ctx}: ${k} tidak punya stok di gudang opname.`);
        s.variances = e2.variances;
        s.partial = (e2.fraction ?? 1) < 1;
        s.state = 'counted';
        break;
      }
      case 'sop.close': {
        const s = sops.get(e2.key);
        if (!s || s.state !== 'counted' || s.partial) {
          bad(`${ctx}: opname ${e2.key} belum selesai dihitung.`);
          break;
        }
        for (const [k, v] of Object.entries(s.variances)) add(stockKey(k, s.wh), v, ctx);
        s.state = 'closed';
        break;
      }
      case 'qc.config': {
        sku(e2.sku, ctx);
        break;
      }
      case 'mo.create': {
        fresh('mo', e2.key, ctx);
        wh(e2.warehouse, ctx);
        if (!boms.has(e2.sku)) bad(`${ctx}: ${e2.sku} tidak punya BOM.`);
        sku(e2.sku, ctx);
        mos.set(e2.key, { state: 'planned', sku: e2.sku, qty: e2.qty, wh: e2.warehouse, qcFailed: false });
        break;
      }
      case 'mo.schedule': {
        const m = mos.get(e2.key);
        if (!m || (m.state !== 'planned' && m.state !== 'released')) bad(`${ctx}: order ${e2.key} tidak bisa dijadwalkan.`);
        if (!workCenters.has(e2.workCenter)) bad(`${ctx}: work center ${e2.workCenter} tidak ada.`);
        if (scheduleKeys.has(e2.scheduleKey)) bad(`${ctx}: kunci jadwal ${e2.scheduleKey} ganda.`);
        scheduleKeys.add(e2.scheduleKey);
        break;
      }
      case 'mo.release': {
        const m = mos.get(e2.key);
        if (!m || m.state !== 'planned') {
          bad(`${ctx}: order ${e2.key} bukan rencana.`);
          break;
        }
        const bom = boms.get(m.sku)!;
        for (const l of bom.lines) {
          const need = roundMoney(l.qty * (m.qty / bom.outputQty) * (1 + (l.scrapPercent ?? 0) / 100));
          add(stockKey(l.sku, m.wh), -need, ctx);
        }
        m.state = 'released';
        break;
      }
      case 'mo.qc': {
        const m = mos.get(e2.key);
        if (!m || m.state === 'completed' || m.state === 'cancelled') bad(`${ctx}: order ${e2.key} tidak bisa di-QC.`);
        else if (e2.defect > e2.checked) bad(`${ctx}: cacat melebihi yang diperiksa.`);
        else if (m.qcFailed) bad(`${ctx}: QC tahap sebelumnya gagal, tahap berikutnya tertahan.`);
        else if ((e2.checked - e2.defect) / e2.checked < 0.95) m.qcFailed = true;
        break;
      }
      case 'mo.complete': {
        const m = mos.get(e2.key);
        if (!m || m.state !== 'released') {
          bad(`${ctx}: order ${e2.key} belum dilepas.`);
          break;
        }
        if (m.qcFailed) bad(`${ctx}: order ${e2.key} QC gagal, tidak boleh selesai.`);
        add(stockKey(m.sku, m.wh), e2.qty ?? m.qty, ctx);
        m.state = 'completed';
        break;
      }
      case 'mo.cancel': {
        const m = mos.get(e2.key);
        if (!m || m.state !== 'planned') bad(`${ctx}: order ${e2.key} hanya bisa dibatalkan saat rencana.`);
        else m.state = 'cancelled';
        break;
      }
      case 'reorder.generate':
        fresh('reorder', e2.key, ctx);
        break;
    }
  }

  const low: string[] = [];
  for (const [key, qty] of stock) {
    const [s] = key.split('@');
    const point = products.get(s)?.reorderPoint ?? 0;
    if (point > 0 && qty <= point) low.push(key);
  }

  const openBills: PlanReport['openBills'] = [];
  const paidBills: string[] = [];
  const settle = (key: string, dueDay: number, paid: number) => {
    if (paid >= 1 - 1e-9) paidBills.push(key);
    else openBills.push({ key, late: dueDay, bucket: bucketOf(dueDay), partial: paid > 0 });
  };
  for (const [key, p] of pos) {
    if (p.state !== 'received' || p.receivedDay === undefined) continue;
    const term = suppliers.get(p.supplier)?.paymentTermDays ?? 0;
    settle(key, p.receivedDay - term, p.paid);
  }
  for (const [key, m] of manual) settle(key, m.dueDay, m.paid);

  return { problems, stock, low: low.sort(), openBills, paidBills };
}
