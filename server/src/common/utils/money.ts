/**
 * Pembulatan uang ke 2 desimal (satuan rupiah).
 * Prisma menyimpan numerik money sebagai Decimal(14,2); semua total dihitung
 * sebagai float lalu dibulatkan SEKALI di titik yang sama supaya laporan tidak
 * berbeda dengan jurnal.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Jumlahkan nilai money dengan pembulatan aman dari galat floating point. */
export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0));
}