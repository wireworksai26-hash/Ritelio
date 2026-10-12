import { describe, expect, it } from 'vitest';
import { computePph21, type Pph21Bracket } from './pph21';

const brackets: Pph21Bracket[] = [
  { lowerBound: 0, upperBound: 5_000_000, ratePercent: 5, rule: { source: 'official', code: 'PPH21-2024' } },
  { lowerBound: 5_000_000, upperBound: 20_000_000, ratePercent: 15, rule: { source: 'official', code: 'PPH21-2024' } },
  { lowerBound: 20_000_000, upperBound: null, ratePercent: 25, rule: { source: 'official', code: 'PPH21-2024' } },
];

describe('computePph21', () => {
  it('memakai tarif bracket pertama untuk penghasilan kecil', () => {
    const r = computePph21(4_000_000, brackets);
    expect(r.amount).toBe(200_000);
    expect(r.rate).toBe(0.05);
    expect(r.source).toBe('official');
  });

  it('memakai tarif bracket kedua untuk penghasilan menengah', () => {
    const r = computePph21(10_000_000, brackets);
    expect(r.amount).toBe(1_500_000);
    expect(r.rate).toBe(0.15);
  });

  it('memakai tarif bracket teratas untuk penghasilan besar', () => {
    const r = computePph21(50_000_000, brackets);
    expect(r.amount).toBe(12_500_000);
    expect(r.rate).toBe(0.25);
  });

  it('tanpa bracket menghasilkan PPh 21 nol, bukan tarif karangan', () => {
    const r = computePph21(10_000_000, []);
    expect(r.amount).toBe(0);
    expect(r.source).toBe('none');
  });

  it('menandai sumber aturan non-official sebagai estimate', () => {
    const estimate: Pph21Bracket[] = [
      { lowerBound: 0, upperBound: null, ratePercent: 10, rule: { source: 'estimate', code: 'EST' } },
    ];
    expect(computePph21(1_000_000, estimate).source).toBe('estimate');
    expect(computePph21(1_000_000, estimate).amount).toBe(100_000);
  });

  it('menghasilkan nol untuk penghasilan nol atau negatif', () => {
    expect(computePph21(0, brackets).amount).toBe(0);
    expect(computePph21(-1000, brackets).amount).toBe(0);
  });

  it('bracket dengan upperBound null dianggap terbuka ke atas', () => {
    const open: Pph21Bracket[] = [
      { lowerBound: 0, upperBound: 1_000_000, ratePercent: 5, rule: { source: 'official', code: 'X' } },
      { lowerBound: 1_000_000, upperBound: null, ratePercent: 30, rule: { source: 'official', code: 'X' } },
    ];
    expect(computePph21(9_000_000, open).rate).toBe(0.3);
  });
});