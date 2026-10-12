import { roundMoney } from '../../common/utils/money';

interface AmountFields {
  total: unknown;
  taxTotal?: unknown;
  paidAmount: unknown;
}

/**
 * Nilai tagihan yang benar-benar harus dibayar/diterima.
 *
 * `total` adalah DPP (sebelum PPN); PPN dijurnalkan terpisah ke Hutang/Piutang
 * dan hasilnya disimpan di `taxTotal` (DPP + PPN). Faktur tanpa PPN punya
 * `taxTotal = 0`, jadi nilainya jatuh kembali ke `total`. Membandingkan
 * pembayaran dengan `total` saja membuat sisa PPN tersangkut di buku besar
 * sementara dokumennya sudah berstatus lunas.
 */
export function grossAmount(doc: Pick<AmountFields, 'total' | 'taxTotal'>): number {
  const taxTotal = Number(doc.taxTotal ?? 0);
  return roundMoney(taxTotal > 0 ? taxTotal : Number(doc.total));
}

export function outstandingOf(doc: AmountFields): number {
  return roundMoney(grossAmount(doc) - Number(doc.paidAmount));
}
