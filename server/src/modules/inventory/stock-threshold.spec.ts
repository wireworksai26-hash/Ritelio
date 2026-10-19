import { describe, expect, it } from 'vitest';
import { effectiveMinThreshold, isAtOrBelowThreshold } from './stock-threshold';

describe('effectiveMinThreshold', () => {
  it('ambang per gudang menang bila diisi', () => {
    expect(effectiveMinThreshold({ minThreshold: '10.00', product: { reorderPoint: '25' } })).toBe(10);
  });

  it('minThreshold 0 (tidak pernah diisi lewat API) memakai titik pesan ulang produk', () => {
    expect(effectiveMinThreshold({ minThreshold: 0, product: { reorderPoint: '12.00' } })).toBe(12);
    expect(effectiveMinThreshold({ minThreshold: '0', product: { reorderPoint: 12 } })).toBe(12);
  });

  it('keduanya kosong menghasilkan 0, tanpa NaN', () => {
    expect(effectiveMinThreshold({ minThreshold: 0, product: { reorderPoint: 0 } })).toBe(0);
    expect(effectiveMinThreshold({})).toBe(0);
    expect(effectiveMinThreshold({ minThreshold: null, product: null })).toBe(0);
    expect(effectiveMinThreshold({ minThreshold: 'abc', product: { reorderPoint: 'xyz' } })).toBe(0);
  });

  it('nilai negatif tidak dianggap ambang', () => {
    expect(effectiveMinThreshold({ minThreshold: -5, product: { reorderPoint: 8 } })).toBe(8);
    expect(effectiveMinThreshold({ minThreshold: 0, product: { reorderPoint: -3 } })).toBe(0);
  });
});

describe('isAtOrBelowThreshold', () => {
  it('Croissant sisa 6 dengan titik pesan ulang 12 ditandai menipis (kasus yang dulu lolos)', () => {
    expect(isAtOrBelowThreshold({ quantity: '6.00', minThreshold: 0, product: { reorderPoint: 12 } })).toBe(true);
  });

  it('stok di atas ambang tidak ditandai; tepat di ambang ditandai', () => {
    expect(isAtOrBelowThreshold({ quantity: 13, minThreshold: 0, product: { reorderPoint: 12 } })).toBe(false);
    expect(isAtOrBelowThreshold({ quantity: 12, minThreshold: 0, product: { reorderPoint: 12 } })).toBe(true);
  });

  it('perilaku lama dipertahankan: stok kosong tanpa ambang apa pun tetap ditandai', () => {
    expect(isAtOrBelowThreshold({ quantity: 0, minThreshold: 0, product: { reorderPoint: 0 } })).toBe(true);
    expect(isAtOrBelowThreshold({ quantity: 5, minThreshold: 0, product: { reorderPoint: 0 } })).toBe(false);
  });
});
