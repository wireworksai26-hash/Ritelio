import { describe, expect, it } from 'vitest';
import { BUSINESSES } from '../../businesses.data';
import { buildSupplyPlan, EXPECTED_LOW, sortChronologically } from './plan';
import type { SupplyEvent } from './types';
import { analysePlan, bucketOf, type AgingBucket } from './validate';

const ALL_BUCKETS: AgingBucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus'];

describe.each(BUSINESSES.map((b) => [b.key, b] as const))('rencana supply %s', (_key, biz) => {
  const plan = buildSupplyPlan(biz);
  const report = analysePlan(biz, plan);

  it('tidak melanggar aturan dokumen, referensi, dan stok', () => {
    expect(report.problems).toEqual([]);
  });

  it('tidak pernah menyentuh produk jasa', () => {
    const services = new Set(biz.products.filter((p) => p.kind === 'service').map((p) => p.sku));
    const touched: string[] = [];
    for (const e of plan.events) {
      const lines = 'lines' in e ? (e.lines as Array<{ sku: string }>) : [];
      for (const l of lines) touched.push(l.sku);
      if ('sku' in e) touched.push(e.sku);
    }
    expect(touched.filter((s) => services.has(s))).toEqual([]);
  });

  it('menyisakan hanya produk yang sengaja di bawah titik pesan ulang', () => {
    expect(report.low).toEqual([...EXPECTED_LOW[biz.key]].sort());
  });

  it('umur utang mencakup kelima bucket, ada yang lunas dan ada yang dibayar sebagian', () => {
    const buckets = new Set(report.openBills.map((b) => b.bucket));
    expect([...buckets].sort()).toEqual([...ALL_BUCKETS].sort());
    expect(report.paidBills.length).toBeGreaterThanOrEqual(1);
    expect(report.openBills.some((b) => b.partial)).toBe(true);
  });

  it('hari telat tidak dekat batas bucket (selisih jam saat seed berjalan tidak menggeser bucket)', () => {
    for (const b of report.openBills) {
      for (const edge of [0, 30, 60, 90]) expect(Math.abs(b.late - edge)).toBeGreaterThanOrEqual(2);
    }
  });

  it('tanggal tidak lebih dari 110 hari ke belakang dan tidak di masa depan', () => {
    for (const e of plan.events) {
      expect(e.day).toBeGreaterThanOrEqual(0);
      expect(e.day).toBeLessThanOrEqual(110);
    }
  });

  it('stok baru keluar setelah stok awal: pengeluaran pertama tidak lebih tua dari 65 hari', () => {
    // Domain penjualan memundurkan stok awal sampai sekitar hari ke-70 s.d. 78. Barang masuk (penerimaan PO) boleh
    // lebih tua, tetapi pengeluaran (kirim transfer, penyesuaian negatif, bahan produksi) harus sesudahnya,
    // kalau tidak kartu stok berurutan tanggal menjadi negatif.
    const outflowDays = plan.events
      .filter((e) => e.kind === 'trf.ship' || e.kind === 'mo.release' || (e.kind === 'adj' && e.qty < 0))
      .map((e) => e.day);
    expect(Math.max(0, ...outflowDays)).toBeLessThanOrEqual(65);
  });

  it('kunci peristiwa unik per jenis dokumen sehingga idempoten', () => {
    const creators = plan.events.filter((e) => ['req.create', 'po.create', 'trf.create', 'sop.open', 'mo.create', 'bill.manual', 'adj'].includes(e.kind));
    const ids = creators.map((e) => `${e.kind}:${'key' in e ? e.key : ''}`);
    expect(new Set(ids).size).toBe(ids.length);
    const notes = plan.events.flatMap((e) => (e.kind === 'adj' || e.kind === 'trf.create' || e.kind === 'mo.create' || e.kind === 'sop.open' ? [e.note] : []));
    expect(new Set(notes).size).toBe(notes.length);
    notes.forEach((n) => expect(n.startsWith('[demo] ')).toBe(true));
  });
});

describe('cakupan per jenis usaha', () => {
  const kinds = (key: string) => new Set(buildSupplyPlan({ key }).events.map((e) => e.kind));
  const biz = (key: string) => BUSINESSES.find((b) => b.key === key)!;

  it('semua usaha punya requisition, PO, penerimaan, tagihan, pembayaran, transfer, opname, penyesuaian, dan reorder', () => {
    for (const b of BUSINESSES) {
      const k = kinds(b.key);
      for (const need of ['req.create', 'po.create', 'po.receive', 'po.cancel', 'bill.manual', 'bill.pay', 'trf.ship', 'trf.receive', 'adj', 'sop.close', 'reorder.generate']) {
        expect(k.has(need as SupplyEvent['kind']), `${b.key} tanpa ${need}`).toBe(true);
      }
    }
  });

  it('produksi hanya untuk usaha manufaktur', () => {
    expect(kinds('rotinusantara').has('mo.complete')).toBe(true);
    expect(kinds('kopisenja').has('mo.create')).toBe(false);
    expect(kinds('laundrysegar').has('mo.create')).toBe(false);
    expect(biz('rotinusantara').industry).toBe('manufacturing');
  });

  it('requisition mencakup semua status: draf, diajukan, disetujui, ditolak, dikonversi', () => {
    for (const b of BUSINESSES) {
      const events = buildSupplyPlan(b).events;
      const submitted = new Set(events.filter((e) => e.kind === 'req.submit').map((e) => (e as { key: string }).key));
      const created = events.filter((e) => e.kind === 'req.create').map((e) => (e as { key: string }).key);
      const decided = events.filter((e): e is Extract<SupplyEvent, { kind: 'req.decide' }> => e.kind === 'req.decide');
      const converted = new Set(events.filter((e) => e.kind === 'req.convert').map((e) => (e as { key: string }).key));
      expect(created.some((k) => !submitted.has(k)), `${b.key} draf`).toBe(true);
      expect(created.some((k) => submitted.has(k) && !decided.some((d) => d.key === k)), `${b.key} diajukan`).toBe(true);
      expect(decided.some((d) => d.approve && !converted.has(d.key)), `${b.key} disetujui`).toBe(true);
      expect(decided.some((d) => !d.approve), `${b.key} ditolak`).toBe(true);
      expect(converted.size, `${b.key} dikonversi`).toBeGreaterThanOrEqual(1);
    }
  });

  it('transfer mencakup diterima, sedang dikirim (in transit), dan masih draf', () => {
    for (const b of BUSINESSES) {
      const events = buildSupplyPlan(b).events;
      const created = events.filter((e) => e.kind === 'trf.create').map((e) => (e as { key: string }).key);
      const shipped = new Set(events.filter((e) => e.kind === 'trf.ship').map((e) => (e as { key: string }).key));
      const received = new Set(events.filter((e) => e.kind === 'trf.receive').map((e) => (e as { key: string }).key));
      expect(created.some((k) => received.has(k)), `${b.key} diterima`).toBe(true);
      expect(created.some((k) => shipped.has(k) && !received.has(k)), `${b.key} in transit`).toBe(true);
      expect(created.some((k) => !shipped.has(k)), `${b.key} draf`).toBe(true);
    }
  });

  it('opname mencakup yang ditutup dengan selisih dan yang masih terbuka', () => {
    for (const b of BUSINESSES) {
      const events = buildSupplyPlan(b).events;
      const closed = events.filter((e) => e.kind === 'sop.close').map((e) => (e as { key: string }).key);
      const withVariance = events.filter((e): e is Extract<SupplyEvent, { kind: 'sop.count' }> => e.kind === 'sop.count' && closed.includes(e.key));
      expect(withVariance.some((c) => Object.values(c.variances).some((v) => v !== 0)), `${b.key} selisih`).toBe(true);
      const opened = events.filter((e) => e.kind === 'sop.open').map((e) => (e as { key: string }).key);
      expect(opened.some((k) => !closed.includes(k)), `${b.key} terbuka`).toBe(true);
    }
  });

  it('produksi (Roti Nusantara) mencakup rencana, dilepas, selesai, dan dibatalkan, plus QC yang gagal', () => {
    const events = buildSupplyPlan(biz('rotinusantara')).events;
    const has = (kind: string) => events.some((e) => e.kind === kind);
    expect(has('mo.create') && has('mo.release') && has('mo.complete') && has('mo.cancel') && has('mo.schedule') && has('mo.qc')).toBe(true);
    const created = events.filter((e) => e.kind === 'mo.create').map((e) => (e as { key: string }).key);
    const released = new Set(events.filter((e) => e.kind === 'mo.release').map((e) => (e as { key: string }).key));
    const completed = new Set(events.filter((e) => e.kind === 'mo.complete').map((e) => (e as { key: string }).key));
    expect(created.some((k) => released.has(k) && !completed.has(k)), 'dilepas belum selesai').toBe(true);
    expect(created.some((k) => !released.has(k)), 'masih rencana').toBe(true);
    // Order dijadwalkan untuk hari ini (tab Mesin & Jadwal membaca rencana kapasitas hari ini).
    expect(events.some((e) => e.kind === 'mo.schedule' && e.onDay === 0)).toBe(true);
  });

  it('usaha di luar tiga contoh tidak punya rencana dan tidak error', () => {
    expect(buildSupplyPlan({ key: 'lainnya' }).events).toEqual([]);
  });
});

describe('sortChronologically', () => {
  it('mengurutkan dari paling lama dan menjaga urutan tulisan di hari yang sama', () => {
    const e = (day: number, key: string): SupplyEvent => ({ day, kind: 'po.send', key });
    const sorted = sortChronologically([e(3, 'a'), e(10, 'b'), e(3, 'c'), e(10, 'd')]);
    expect(sorted.map((x) => ('key' in x ? x.key : ''))).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('bucketOf', () => {
  it('mengikuti batas aging pemasok (telat <= 0 = belum jatuh tempo)', () => {
    expect(bucketOf(-5)).toBe('current');
    expect(bucketOf(0)).toBe('current');
    expect(bucketOf(1)).toBe('d1_30');
    expect(bucketOf(30)).toBe('d1_30');
    expect(bucketOf(31)).toBe('d31_60');
    expect(bucketOf(61)).toBe('d61_90');
    expect(bucketOf(91)).toBe('d90plus');
  });
});
