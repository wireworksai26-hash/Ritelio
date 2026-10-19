import { describe, expect, it } from 'vitest';
import { rankTopItems } from './top-products';

describe('rankTopItems', () => {
  it('omzet = jumlah dikali harga per baris, bukan total jumlah dikali total harga', () => {
    const rows = [
      { productId: 'a', qty: 2, price: 10_000 },
      { productId: 'a', qty: 1, price: 10_000 },
      { productId: 'a', qty: 3, price: 10_000 },
      { productId: 'b', qty: 1, price: 50_000 },
    ];
    const out = rankTopItems(rows);
    expect(out).toEqual([
      { productId: 'a', qty: 6, revenue: 60_000 },
      { productId: 'b', qty: 1, revenue: 50_000 },
    ]);
  });

  it('menerima Decimal/teks, mengurutkan menurun, dan membatasi jumlah', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ productId: `p${i}`, qty: String(i + 1), price: '1000.50' }));
    const out = rankTopItems(rows, 10);
    expect(out).toHaveLength(10);
    expect(out[0].productId).toBe('p14');
    expect(out[0].revenue).toBe(15_007.5);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].revenue).toBeGreaterThanOrEqual(out[i].revenue);
  });

  it('tanpa baris menghasilkan daftar kosong', () => {
    expect(rankTopItems([])).toEqual([]);
  });
});
