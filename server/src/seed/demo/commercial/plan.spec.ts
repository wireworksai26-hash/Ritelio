import { describe, expect, it } from 'vitest';
import { BUSINESSES } from '../../businesses.data';
import {
  discountedPrice,
  distributionOf,
  dowOf,
  holdingOf,
  limitByTimeline,
  maxAgoOf,
  mulberry32,
  planPosSales,
  todayCutHour,
  unitHash,
  type Capacity,
  type PlannedSale,
  type PosProfile,
  type StockTimeline,
} from './plan';
import { OUTLET_SHARES, POS_PROFILES, POS_STOCK_FRACTION } from './profiles';

// Hari ini = Senin 19 Oktober 2026 (hanya untuk menentukan hari dalam sepekan).
const TODAY = new Date(Date.UTC(2026, 9, 19, 5, 0, 0));
const iso = (d: number) => new Date(TODAY.getTime() - d * 86_400_000).toISOString().slice(0, 10);
const opts = (profile: PosProfile, capacity?: Capacity) => ({
  windowDays: profile.days,
  todayDow: TODAY.getUTCDay(),
  isoOf: iso,
  capacity,
});

const seedCapacity = (key: string): Capacity => {
  const biz = BUSINESSES.find((b) => b.key === key)!;
  const shares = OUTLET_SHARES[key];
  const profile = POS_PROFILES[key];
  return shares.map((_, o) => {
    const m = new Map<string, number>();
    for (const e of profile.catalog) {
      const p = biz.products.find((x) => x.sku === e.sku)!;
      if (p.kind === 'service') continue;
      m.set(e.sku, Math.floor(holdingOf(p.stock ?? 0, shares, o) * POS_STOCK_FRACTION));
    }
    return m;
  });
};

const perDay = (sales: PlannedSale[]) => {
  const m = new Map<number, number>();
  for (const s of sales) m.set(s.dayOffset, (m.get(s.dayOffset) ?? 0) + 1);
  return m;
};

describe('pembangkit acak', () => {
  it('mulberry32 deterministik dan unitHash stabil untuk teks yang sama', () => {
    expect(mulberry32(7)()).toBe(mulberry32(7)());
    expect(unitHash('a:b')).toBe(unitHash('a:b'));
    expect(unitHash('a:b')).not.toBe(unitHash('a:c'));
    const u = unitHash('x');
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
  });

  it('dowOf memutar mundur dari hari ini', () => {
    expect(dowOf(1, 0)).toBe(1);
    expect(dowOf(1, 1)).toBe(0);
    expect(dowOf(1, 2)).toBe(6);
    expect(dowOf(0, 7)).toBe(0);
  });
});

describe('todayCutHour', () => {
  it('berubah hanya pada tiga ambang dan tidak pernah melewati jam sekarang', () => {
    expect(todayCutHour(9 * 60)).toBeUndefined();
    expect(todayCutHour(10 * 60 + 29)).toBeUndefined();
    expect(todayCutHour(10 * 60 + 30)).toBe(9);
    expect(todayCutHour(14 * 60 + 29)).toBe(9);
    expect(todayCutHour(14 * 60 + 30)).toBe(13);
    expect(todayCutHour(18 * 60 + 30)).toBe(17);
    for (let m = 0; m < 24 * 60; m++) {
      const cut = todayCutHour(m);
      if (cut !== undefined) expect((cut + 1) * 60).toBeLessThanOrEqual(m);
    }
  });
});

describe('discountedPrice dan maxAgoOf', () => {
  it('diskon dibulatkan ke Rp 100 dan tanpa diskon harga tetap', () => {
    expect(discountedPrice(24000, 0)).toBe(24000);
    expect(discountedPrice(24000, 10)).toBe(21600);
    expect(discountedPrice(22000, 15)).toBe(18700);
    expect(discountedPrice(100, 90)).toBe(100);
  });

  it('batas mundur tidak pernah sebelum 2 Januari', () => {
    expect(maxAgoOf(new Date(Date.UTC(2026, 0, 2, 5)))).toBe(0);
    expect(maxAgoOf(new Date(Date.UTC(2026, 0, 12, 5)))).toBe(9);
    expect(maxAgoOf(new Date(Date.UTC(2026, 9, 19, 5)))).toBe(289);
  });
});

describe('planPosSales', () => {
  for (const [key, profile] of Object.entries(POS_PROFILES)) {
    describe(key, () => {
      const ample = planPosSales(profile, opts(profile));

      it('deterministik: masukan sama menghasilkan rencana yang sama', () => {
        expect(planPosSales(profile, opts(profile))).toEqual(ample);
      });

      it('kunci unik, memuat tanggal, dan urut dari yang tertua', () => {
        expect(new Set(ample.map((s) => s.clientId)).size).toBe(ample.length);
        for (const s of ample) expect(s.clientId).toBe(`demo-${key}-${iso(s.dayOffset).replace(/-/g, '')}-${s.clientId.slice(-3)}`);
        for (let i = 1; i < ample.length; i++) {
          const a = ample[i - 1];
          const b = ample[i];
          expect(a.dayOffset > b.dayOffset || (a.dayOffset === b.dayOffset && a.hour * 60 + a.minute <= b.hour * 60 + b.minute)).toBe(true);
        }
      });

      it('tidak memakai hari ini dan tersebar di setiap hari jendela', () => {
        const days = perDay(ample);
        expect(Math.min(...days.keys())).toBeGreaterThanOrEqual(1);
        expect(days.size).toBe(profile.days);
      });

      it('jumlah per hari bervariasi, akhir pekan lebih ramai, dan tren naik pelan', () => {
        const days = perDay(ample);
        const counts = [...days.values()];
        expect(new Set(counts).size).toBeGreaterThan(5);
        const avg = (pred: (d: number) => boolean) => {
          const sel = [...days.entries()].filter(([d]) => pred(d));
          return sel.reduce((s, [, n]) => s + n, 0) / sel.length;
        };
        const weekend = avg((d) => [0, 6].includes(dowOf(TODAY.getUTCDay(), d)));
        const weekday = avg((d) => ![0, 6].includes(dowOf(TODAY.getUTCDay(), d)));
        const bestWeekend = Math.max(profile.dow[0], profile.dow[6]);
        const bestWeekday = Math.max(...profile.dow.slice(1, 6));
        if (bestWeekend > bestWeekday) expect(weekend).toBeGreaterThan(weekday * 0.9);
        const oldest = ample.filter((s) => s.dayOffset > (profile.days * 2) / 3).length;
        const newest = ample.filter((s) => s.dayOffset <= profile.days / 3).length;
        expect(newest).toBeGreaterThan(oldest);
      });

      it('jam, outlet, kasir, dan metode bayar beragam', () => {
        expect(new Set(ample.map((s) => s.hour)).size).toBeGreaterThan(6);
        expect(new Set(ample.map((s) => s.outletIdx)).size).toBe(profile.outletWeights.length);
        expect(new Set(ample.map((s) => s.role)).size).toBe(2);
        expect(new Set(ample.map((s) => s.method)).size).toBeGreaterThanOrEqual(3);
        for (const s of ample) {
          expect(s.hour).toBeGreaterThanOrEqual(7); // sebelum 07 WIB tanggal UTC-nya masih kemarin
          expect(s.items.length).toBeGreaterThan(0);
          expect(new Set(s.items.map((i) => i.sku)).size).toBe(s.items.length);
        }
      });

      it('ada diskon sesekali, bukan di semua transaksi', () => {
        const disc = ample.filter((s) => s.discountPct > 0).length;
        expect(disc).toBeGreaterThan(0);
        expect(disc).toBeLessThan(ample.length * 0.4);
      });

      it('produk terlaris jelas berbeda dengan ekor panjang', () => {
        const qty = new Map<string, number>();
        for (const s of ample) for (const it of s.items) qty.set(it.sku, (qty.get(it.sku) ?? 0) + 1);
        const sorted = [...qty.values()].sort((a, b) => b - a);
        expect(sorted[0]).toBeGreaterThan(sorted[sorted.length - 1] * 3);
      });

      it('semua SKU ada di katalog usaha', () => {
        const biz = BUSINESSES.find((b) => b.key === key)!;
        for (const e of profile.catalog) expect(biz.products.some((p) => p.sku === e.sku)).toBe(true);
        for (const m of profile.members) expect(biz.customers.some((c) => c.name === m)).toBe(true);
      });

      it('dengan kapasitas stok awal: tidak pernah melebihi stok, hari tetap hidup, kunci subset dari rencana tanpa batas', () => {
        const cap = seedCapacity(key);
        const thinned = planPosSales(profile, opts(profile, cap));
        const used = cap.map(() => new Map<string, number>());
        for (const s of thinned) {
          for (const it of s.items) {
            if (cap[s.outletIdx].has(it.sku)) used[s.outletIdx].set(it.sku, (used[s.outletIdx].get(it.sku) ?? 0) + it.qty);
          }
        }
        used.forEach((m, o) => m.forEach((qty, sku) => expect(qty).toBeLessThanOrEqual(cap[o].get(sku) ?? 0)));

        const ids = new Set(ample.map((s) => s.clientId));
        for (const s of thinned) expect(ids.has(s.clientId)).toBe(true);

        const days = perDay(thinned);
        expect(days.size).toBeGreaterThanOrEqual(Math.floor(profile.days * 0.9));
        expect(thinned.length).toBeGreaterThan(profile.days);
      });

      it('kapasitas besar tidak memangkas apa pun', () => {
        const big: Capacity = profile.outletWeights.map(() => new Map(profile.catalog.map((e) => [e.sku, 1_000_000])));
        expect(planPosSales(profile, opts(profile, big)).length).toBe(ample.length);
      });
    });
  }

  it('jasa tidak dibatasi stok, hanya perlengkapan berstok yang dipangkas', () => {
    const profile = POS_PROFILES.laundrysegar;
    const cap = seedCapacity('laundrysegar');
    expect(cap[0].has('LS-001')).toBe(false);
    expect(cap[0].has('PL-001')).toBe(true);
    const thinned = planPosSales(profile, opts(profile, cap));
    const kiloan = thinned.filter((s) => s.items.some((i) => i.sku === 'LS-001')).length;
    const all = planPosSales(profile, opts(profile)).filter((s) => s.items.some((i) => i.sku === 'LS-001')).length;
    expect(kiloan).toBe(all);
  });

  it('kapasitas nol menghilangkan SKU itu sepenuhnya', () => {
    const profile = POS_PROFILES.kopisenja;
    const cap: Capacity = profile.outletWeights.map(() => new Map([['KS-004', 0]]));
    const plan = planPosSales(profile, opts(profile, cap));
    expect(plan.some((s) => s.items.some((i) => i.sku === 'KS-004'))).toBe(false);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('hari ini hanya diisi bila diminta, dan hanya sampai jam batas; kunci hari lain tidak berubah', () => {
    const profile = POS_PROFILES.kopisenja;
    const without = planPosSales(profile, opts(profile));
    const withToday = planPosSales(profile, { ...opts(profile), todayMaxHour: 9 });
    expect(without.some((s) => s.dayOffset === 0)).toBe(false);
    const today = withToday.filter((s) => s.dayOffset === 0);
    expect(today.length).toBeGreaterThan(0);
    for (const s of today) {
      expect(s.hour).toBeLessThanOrEqual(9);
      expect(s.clientId.startsWith(`demo-kopisenja-${iso(0).replace(/-/g, '')}-`)).toBe(true);
    }
    expect(withToday.filter((s) => s.dayOffset > 0)).toEqual(without);
    expect(planPosSales(profile, { ...opts(profile), todayMaxHour: 9 })).toEqual(withToday);
  });

  it('jendela pendek (awal tahun) hanya memakai hari yang tersedia', () => {
    const profile = POS_PROFILES.kopisenja;
    const plan = planPosSales(profile, { ...opts(profile), windowDays: 5 });
    expect(Math.max(...plan.map((s) => s.dayOffset))).toBe(5);
    expect(planPosSales(profile, { ...opts(profile), windowDays: 0 })).toEqual([]);
  });
});

describe('distribusi stok antar outlet', () => {
  it('jumlah yang dikirim ditambah sisa di outlet pertama sama dengan stok awal', () => {
    for (const shares of Object.values(OUTLET_SHARES)) {
      for (const stock of [6, 12, 40, 120, 150, 1000]) {
        const sent = distributionOf(stock, shares);
        const held = shares.map((_, o) => holdingOf(stock, shares, o));
        expect(held.reduce((a, b) => a + b, 0)).toBe(stock);
        expect(held[0]).toBe(stock - sent.reduce((a, b) => a + b, 0));
      }
    }
  });

  it('porsi tiap usaha berjumlah satu dan sesuai jumlah outlet', () => {
    for (const biz of BUSINESSES) {
      const shares = OUTLET_SHARES[biz.key];
      expect(shares).toHaveLength(biz.outlets.length);
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    }
  });
});

describe('limitByTimeline', () => {
  const HOUR = 3_600_000;
  const sale = (clientId: string, hourAt: number, sku: string, qty: number, outletIdx = 0): PlannedSale => ({
    clientId,
    dayOffset: 1,
    hour: hourAt,
    minute: 0,
    outletIdx,
    role: 'cashier',
    method: 'cash',
    items: [{ sku, qty }],
    discountPct: 0,
  });
  const timeOf = (s: PlannedSale) => s.hour * HOUR;

  it('tidak menjual sebelum barang masuk dan tidak melebihi saldo pada waktunya', () => {
    const timeline: StockTimeline = [new Map([['A', [{ at: 5 * HOUR, qty: 3 }, { at: 10 * HOUR, qty: 4 }]]])];
    const sales = [sale('s1', 1, 'A', 2), sale('s2', 6, 'A', 2), sale('s3', 7, 'A', 2), sale('s4', 11, 'A', 5)];
    const out = limitByTimeline(sales, timeOf, timeline, []);
    expect(out.map((s) => [s.clientId, s.items[0].qty])).toEqual([['s2', 2], ['s3', 1], ['s4', 4]]);
  });

  it('pemakaian tetap (pesanan B2B) mengurangi sisa yang bisa dijual', () => {
    const timeline: StockTimeline = [new Map([['A', [{ at: 0, qty: 5 }]]])];
    const out = limitByTimeline([sale('s1', 5, 'A', 4)], timeOf, timeline, [{ outletIdx: 0, sku: 'A', at: 2 * HOUR, qty: 3 }]);
    expect(out[0].items[0].qty).toBe(2);
  });

  it('SKU tanpa riwayat di peta (jasa) tidak dibatasi, SKU berstok tanpa kejadian habis', () => {
    const timeline: StockTimeline = [new Map([['B', []]])];
    const out = limitByTimeline([sale('s1', 5, 'JASA', 9), sale('s2', 6, 'B', 1)], timeOf, timeline, []);
    expect(out.map((s) => s.clientId)).toEqual(['s1']);
  });

  it('rencana lengkap dengan stok yang datang belakangan: saldo berjalan tidak pernah negatif', () => {
    const profile = POS_PROFILES.kopisenja;
    const events: StockTimeline = profile.outletWeights.map((_, o) => {
      const m = new Map<string, Array<{ at: number; qty: number }>>();
      for (const e of profile.catalog) {
        // stok awal besar ada sejak lama di outlet pertama; outlet kedua baru menerima stok 30 hari lalu
        m.set(e.sku, [{ at: TODAY.getTime() - (o === 0 ? 100 : 30) * 86_400_000, qty: o === 0 ? 400 : 200 }]);
      }
      return m;
    });
    const capacity: Capacity = events.map((m) => new Map([...m.keys()].map((k) => [k, 1_000_000])));
    const timeOf2 = (d: number, hour: number, minute: number) => TODAY.getTime() - d * 86_400_000 + (hour - 12) * HOUR + minute * 60_000;
    const plan = planPosSales(profile, { ...opts(profile, capacity), timeline: { events, fixed: [], timeOf: timeOf2 } });
    const free = planPosSales(profile, opts(profile, capacity));
    expect(plan.length).toBeLessThan(free.length);
    const running = new Map<string, number>();
    for (const s of plan) {
      if (s.outletIdx === 1) expect(timeOf2(s.dayOffset, s.hour, s.minute)).toBeGreaterThanOrEqual(TODAY.getTime() - 30 * 86_400_000);
      for (const it of s.items) {
        const k = `${s.outletIdx}|${it.sku}`;
        running.set(k, (running.get(k) ?? 0) + it.qty);
        expect(running.get(k)!).toBeLessThanOrEqual(s.outletIdx === 0 ? 400 : 200);
      }
    }
  });
});
