import { describe, expect, it } from 'vitest';
import { roundMoney } from './money';

describe('roundMoney', () => {
  it('removes binary floating-point artifacts at currency precision', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('rejects non-finite values to a safe zero', () => {
    expect(roundMoney(Number.NaN)).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
