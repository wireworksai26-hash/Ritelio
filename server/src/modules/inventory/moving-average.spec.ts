import { describe, expect, it } from 'vitest';
import { computeMovingAverage } from './moving-average';

describe('computeMovingAverage', () => {
  it('memakai harga masuk saat gudang masih kosong', () => {
    expect(
      computeMovingAverage({ currentQty: 0, currentAvgCost: 0, incomingQty: 10, incomingCost: 5000 }),
    ).toBe(5000);
  });

  it('membobot rata-rata ketika harga beli berubah', () => {
    // 10 @ 5000 + 10 @ 7000 => 20 unit, rata-rata 6000
    expect(
      computeMovingAverage({
        currentQty: 10,
        currentAvgCost: 5000,
        incomingQty: 10,
        incomingCost: 7000,
      }),
    ).toBe(6000);
  });

  it('tidak menggeser rata-rata saat qty dan harga identik', () => {
    expect(
      computeMovingAverage({
        currentQty: 25,
        currentAvgCost: 12000,
        incomingQty: 5,
        incomingCost: 12000,
      }),
    ).toBe(12000);
  });

  it('menjaga presisi 4 desimal untuk nilai pecahan', () => {
    const result = computeMovingAverage({
      currentQty: 3,
      currentAvgCost: 1000,
      incomingQty: 1,
      incomingCost: 2000,
    });
    expect(result).toBe(1250);
    expect(Number(result.toFixed(4))).toBe(result);
  });

  it('tidak menghasilkan NaN saat stok habis terjual', () => {
    expect(
      computeMovingAverage({
        currentQty: 5,
        currentAvgCost: 3000,
        incomingQty: -5,
        incomingCost: 0,
      }),
    ).toBe(3000);
  });
});