import { describe, expect, it } from 'vitest';
import { isStockTracked, stockedQtyByProduct } from './stock-lines';

describe('stock-lines', () => {
  it('jasa tidak berstok, barang berstok', () => {
    expect(isStockTracked('service')).toBe(false);
    expect(isStockTracked('goods')).toBe(true);
    expect(isStockTracked('raw_material')).toBe(true);
    expect(isStockTracked(undefined)).toBe(true);
  });

  it('menggabungkan item duplikat dan membuang jasa', () => {
    const types: Record<string, string> = { a: 'goods', b: 'service', c: 'goods' };
    const needed = stockedQtyByProduct(
      [
        { productId: 'a', qty: 2 },
        { productId: 'b', qty: 5 },
        { productId: 'a', qty: 1.5 },
        { productId: 'c', qty: 1 },
      ],
      (id) => types[id],
    );
    expect([...needed.entries()]).toEqual([
      ['a', 3.5],
      ['c', 1],
    ]);
  });

  it('transaksi jasa murni tidak membutuhkan stok sama sekali', () => {
    const needed = stockedQtyByProduct([{ productId: 'b', qty: 3 }], () => 'service');
    expect(needed.size).toBe(0);
  });
});
