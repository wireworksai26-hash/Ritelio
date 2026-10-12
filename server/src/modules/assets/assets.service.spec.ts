import { describe, expect, it } from 'vitest';
import { computeDepreciation } from './assets.service';

describe('computeDepreciation', () => {
  it('garis lurus: (harga - nilai sisa) / masa manfaat', () => {
    // (100.000.000 - 10.000.000) / 60 = 1.500.000
    expect(
      computeDepreciation(
        {
          acquisitionCost: 100_000_000,
          salvageValue: 10_000_000,
          usefulLifeMonths: 60,
          depreciationMethod: 'straight_line',
        },
        0,
      ),
    ).toBe(1_500_000);
  });

  it('garis lurus: bulan terakhir tidak boleh melebihi sisa terakru', () => {
    const base = {
      acquisitionCost: 1_000_000,
      salvageValue: 100_000,
      usefulLifeMonths: 12,
      depreciationMethod: 'straight_line',
    };
    let accumulated = 0;
    let monthly = 0;
    for (let i = 0; i < 12; i++) {
      monthly = computeDepreciation(base, accumulated);
      accumulated += monthly;
    }
    // Setelah masa manfaat habis, akumulasi harus persis = harga - nilai sisa
    expect(accumulated).toBe(900_000);
    expect(computeDepreciation(base, accumulated)).toBe(0);
  });

  it('garis lurus: nilai sisa lebih besar dari nol tidak boleh dilewati', () => {
    const dep = computeDepreciation(
      {
        acquisitionCost: 500_000,
        salvageValue: 200_000,
        usefulLifeMonths: 10,
        depreciationMethod: 'straight_line',
      },
      299_999,
    );
    expect(dep).toBe(1);
  });

  it('saldo menurun: nilai buku x tingkat', () => {
    // nilai buku 100 juta x 25% = 25 juta
    expect(
      computeDepreciation(
        {
          acquisitionCost: 100_000_000,
          salvageValue: 0,
          usefulLifeMonths: 48,
          depreciationMethod: 'declining_balance',
          decliningRate: 0.25,
        },
        0,
      ),
    ).toBe(25_000_000);
  });

  it('saldo menurun: berbasis nilai buku tersisa, bukan harga perolehan', () => {
    // buku tersisa 60 juta x 25% = 15 juta
    expect(
      computeDepreciation(
        {
          acquisitionCost: 100_000_000,
          salvageValue: 0,
          usefulLifeMonths: 48,
          depreciationMethod: 'declining_balance',
          decliningRate: 0.25,
        },
        40_000_000,
      ),
    ).toBe(15_000_000);
  });

  it('saldo menurun: tidak turun di bawah nilai sisa', () => {
    // nilai buku 1.000.000 - 99.000 = 901.000; dikurangi nilai sisa 900.000
    // menyisakan 1.000 untuk disusutkan, x 50% = 500.
    const dep = computeDepreciation(
      {
        acquisitionCost: 1_000_000,
        salvageValue: 900_000,
        usefulLifeMonths: 24,
        depreciationMethod: 'declining_balance',
        decliningRate: 0.5,
      },
      99_000,
    );
    expect(dep).toBe(500);
  });

  it('saldo menurun: berhenti tepat saat mencapai nilai sisa', () => {
    const asset = {
      acquisitionCost: 1_000_000,
      salvageValue: 900_000,
      usefulLifeMonths: 24,
      depreciationMethod: 'declining_balance',
      decliningRate: 0.5,
    };
    expect(computeDepreciation(asset, 100_000)).toBe(0);
  });

  it('nilai sisa >= harga perolehen menghasilkan nol', () => {
    expect(
      computeDepreciation(
        {
          acquisitionCost: 1_000_000,
          salvageValue: 1_000_000,
          usefulLifeMonths: 12,
          depreciationMethod: 'straight_line',
        },
        0,
      ),
    ).toBe(0);
  });
});