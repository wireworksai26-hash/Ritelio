import { describe, expect, it } from 'vitest';
import {
  computeDemandForecast,
  forecastMonthKeys,
  forecastWindowStart,
  weightedAverage,
  type SaleMovement,
} from './demand-forecast';

// "Sekarang" = 15 Okt 2026 -> jendela 6 bulan: Apr, Mei, Jun, Jul, Agu, Sep 2026.
const NOW = new Date('2026-10-15T10:00:00.000Z');
const product = { sku: 'SKU-1', name: 'Roti', unit: 'pcs', reorderPoint: 0, reorderQty: 0 };

function mv(month: string, qty: number, productId = 'p1', p = product): SaleMovement {
  return { productId, quantity: qty, createdAt: new Date(`${month}-10T08:00:00.000Z`), product: p };
}

const run = (movements: SaleMovement[], months = 6, horizon = 3) =>
  computeDemandForecast(movements, { months, horizon, now: NOW });

describe('jendela bulan', () => {
  it('mulai tepat tanggal 1 pukul 00:00 UTC, bulan berjalan tidak ikut', () => {
    expect(forecastWindowStart(NOW, 6).toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(forecastMonthKeys(forecastWindowStart(NOW, 6), 6)).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ]);
  });

  it('melewati pergantian tahun', () => {
    const jan = new Date('2026-01-20T00:00:00.000Z');
    expect(forecastMonthKeys(forecastWindowStart(jan, 3), 3)).toEqual(['2025-10', '2025-11', '2025-12']);
  });

  it('penjualan tanggal 1 pukul 00:01 pada awal jendela tetap terhitung', () => {
    const edge: SaleMovement = {
      productId: 'p1', quantity: 10, product,
      createdAt: new Date('2026-04-01T00:01:00.000Z'),
    };
    expect(run([edge]).products[0].history[0]).toBe(10);
  });
});

describe('weightedAverage', () => {
  it('bulan terbaru berbobot paling besar', () => {
    // bobot 1,2,3 -> (10*1 + 20*2 + 30*3) / 6 = 23,33
    expect(weightedAverage([10, 20, 30])).toBeCloseTo(23.333, 3);
    // (30*1 + 20*2 + 10*3) / 6 = 16,67 < 23,33: deret menurun menghasilkan rata-rata lebih rendah
    expect(weightedAverage([30, 20, 10])).toBeCloseTo(16.667, 3);
  });
  it('deret kosong -> 0, bukan NaN', () => {
    expect(weightedAverage([])).toBe(0);
  });
});

describe('computeDemandForecast', () => {
  it('data kosong: produk kosong dan catatan yang jujur', () => {
    const r = run([]);
    expect(r.products).toEqual([]);
    expect(r.method).toBe('weighted-moving-average');
    expect(r.note).toMatch(/Belum ada riwayat/);
  });

  it('satu bulan data saja: tidak NaN/Infinity dan prakiraan tidak negatif', () => {
    const r = run([mv('2026-09', 100)]);
    const p = r.products[0];
    expect(p.history).toEqual([0, 0, 0, 0, 0, 100]);
    expect(p.trendPct).toBe(0); // bulan sebelumnya 0 -> tak ada dasar persen
    for (const f of p.forecast) {
      expect(Number.isFinite(f.qty)).toBe(true);
      expect(f.qty).toBeGreaterThanOrEqual(0);
    }
    // bobot 6/21 * 100 = 28,57 -> +5% = 30
    expect(p.forecast[0].qty).toBe(30);
  });

  it('menjumlahkan beberapa pergerakan dalam satu bulan dan memakai nilai absolut qty', () => {
    const r = run([mv('2026-09', 40), mv('2026-09', -10)]); // sale bisa bertanda negatif di ledger
    expect(r.products[0].lastMonthQty).toBe(50);
  });

  it('bulan berjalan (parsial) dan di luar jendela diabaikan', () => {
    const r = run([mv('2026-10', 999), mv('2026-03', 999), mv('2026-09', 10)]);
    expect(r.products).toHaveLength(1);
    expect(r.products[0].history.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('produk yang hanya laku di bulan berjalan tidak muncul', () => {
    expect(run([mv('2026-10', 5)]).products).toEqual([]);
  });

  it('tren naik menaikkan prakiraan, tren turun menurunkannya', () => {
    const up = run([mv('2026-08', 100), mv('2026-09', 150)]).products[0];
    const down = run([mv('2026-08', 150), mv('2026-09', 100)]).products[0];
    expect(up.trendPct).toBe(50);
    expect(down.trendPct).toBe(-33.33);
    expect(up.forecast[2].qty).toBeGreaterThan(up.forecast[0].qty);
    expect(down.forecast[2].qty).toBeLessThan(down.forecast[0].qty);
  });

  it('lonjakan ekstrem dibatasi: 1 -> 10.000 tidak menghasilkan prakiraan 1000x', () => {
    const p = run([mv('2026-08', 1), mv('2026-09', 10_000)]).products[0];
    expect(p.trendPct).toBe(999_900);
    const base = Math.round(p.weightedMonthly * 1.05);
    // trend efektif maksimal +200%: pada bulan ke-3 faktor = 1 + 2 * 1,5 = 4x
    expect(p.forecast[2].qty).toBeLessThanOrEqual(base * 4);
  });

  it('penurunan 100% tidak menghasilkan qty negatif pada horizon panjang', () => {
    const p = run([mv('2026-08', 100), mv('2026-09', 0.0001)], 6, 12).products[0];
    for (const f of p.forecast) expect(f.qty).toBeGreaterThanOrEqual(0);
  });

  it('baris dengan qty rusak (NaN) dilewati tanpa meracuni total', () => {
    const r = run([mv('2026-09', Number.NaN), mv('2026-09', 20)]);
    expect(r.products[0].lastMonthQty).toBe(20);
    expect(Number.isFinite(r.products[0].weightedMonthly)).toBe(true);
  });

  it('quantity berupa string desimal (Prisma.Decimal) dibaca benar', () => {
    const r = run([{ ...mv('2026-09', 0), quantity: '12.5' }]);
    expect(r.products[0].lastMonthQty).toBe(12.5);
  });

  it('saran reorder: hanya bila reorderPoint > 0 dan prakiraan >= titik pesan ulang', () => {
    const lowPoint = { ...product, reorderPoint: 25, reorderQty: 100 };
    const noPoint = { ...product, reorderPoint: 0 };
    // prakiraan dasar = round(100*6/21*1.05) = 30
    expect(run([mv('2026-09', 100, 'p1', lowPoint)]).products[0].suggestsReorder).toBe(true);
    expect(run([mv('2026-09', 100, 'p1', { ...lowPoint, reorderPoint: 31 })]).products[0].suggestsReorder).toBe(false);
    expect(run([mv('2026-09', 100, 'p1', noPoint)]).products[0].suggestsReorder).toBe(false);
  });

  it('diurutkan dari permintaan terbesar; seri dipecah berdasarkan SKU (deterministik)', () => {
    const r = run([
      mv('2026-09', 10, 'a', { ...product, sku: 'B' }),
      mv('2026-09', 10, 'b', { ...product, sku: 'A' }),
      mv('2026-09', 50, 'c', { ...product, sku: 'C' }),
    ]);
    expect(r.products.map((p) => p.sku)).toEqual(['C', 'A', 'B']);
  });

  it('months/horizon <= 0 dipaksa minimal 1 (tidak membagi nol)', () => {
    const r = run([mv('2026-09', 10)], 0, 0);
    expect(r.monthsAnalyzed).toBe(1);
    expect(r.horizonMonths).toBe(1);
    expect(r.products[0].forecast).toHaveLength(1);
    expect(Number.isFinite(r.products[0].weightedMonthly)).toBe(true);
  });

  it('tidak mengklaim musiman', () => {
    expect(run([mv('2026-09', 10)]).note).toMatch(/bukan model musiman/);
  });
});
