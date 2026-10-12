import { roundMoney } from '../../common/utils/money';

export interface Pph21Bracket {
  lowerBound: number;
  upperBound: number | null;
  ratePercent: number;
  rule?: { source: string; code: string } | null;
}

export interface Pph21Result {
  amount: number;
  taxableBase: number;
  rate: number;
  source: 'official' | 'estimate' | 'none';
  ruleCode: string | null;
}

/**
 * PPh 21 untuk pegawai tetap.
 *
 * Percentage-based: tarif progressive cukup dengan mencari bracket yang memuat
 * penghasilan, karena PTKP sudah diasumsikan sudah dikurangi dari penghasilan
 * bruto yang diberikan. Kalau tidak ada bracket sama sekali, PPh 21 bernilai nol
 * dan ditandai 'none' — bukan dikarang memakai tarif default, karena angka
 * pajak yang salah lebih berbahaya daripada kosong.
 */
export function computePph21(gross: number, brackets: Pph21Bracket[]): Pph21Result {
  if (gross <= 0) {
    return { amount: 0, taxableBase: 0, rate: 0, source: 'none', ruleCode: null };
  }
  if (brackets.length === 0) {
    return { amount: 0, taxableBase: gross, rate: 0, source: 'none', ruleCode: null };
  }

  const bracket =
    brackets.find((b) => gross >= Number(b.lowerBound) && (b.upperBound === null || gross <= Number(b.upperBound))) ??
    brackets.find((b) => Number(b.lowerBound) <= gross);

  if (!bracket) {
    return { amount: 0, taxableBase: gross, rate: 0, source: 'none', ruleCode: null };
  }

  const rate = Number(bracket.ratePercent) / 100;
  return {
    amount: roundMoney(gross * rate),
    taxableBase: roundMoney(gross),
    rate,
    source: bracket.rule?.source === 'official' ? 'official' : 'estimate',
    ruleCode: bracket.rule?.code ?? null,
  };
}