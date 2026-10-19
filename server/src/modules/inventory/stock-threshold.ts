/**
 * Ambang stok minimum yang berlaku untuk satu baris stok.
 *
 * Ada dua tempat ambang disimpan: `InventoryStock.minThreshold` (per gudang) dan `Product.reorderPoint`
 * (per produk, dipakai saran pembelian). Tidak ada API yang mengisi `minThreshold`, sehingga ia selalu 0
 * untuk produk yang dibuat lewat aplikasi dan peringatan "stok menipis" tidak pernah menyala, padahal saran
 * pembelian berfungsi. Aturannya: ambang per gudang menang bila diisi (> 0), selain itu memakai titik pesan
 * ulang produk. Semua peringatan stok (daftar stok menipis, dashboard, asisten AI, lencana UI) memakai ini.
 */
export interface ThresholdRow {
  minThreshold?: unknown;
  product?: { reorderPoint?: unknown } | null;
}

export function effectiveMinThreshold(row: ThresholdRow): number {
  const own = Number(row.minThreshold ?? 0);
  if (Number.isFinite(own) && own > 0) return own;
  const reorder = Number(row.product?.reorderPoint ?? 0);
  return Number.isFinite(reorder) && reorder > 0 ? reorder : 0;
}

/** Stok di bawah atau sama dengan ambang efektif (perilaku lama dipertahankan: ambang 0 menandai stok kosong). */
export function isAtOrBelowThreshold(row: ThresholdRow & { quantity: unknown }): boolean {
  return Number(row.quantity) <= effectiveMinThreshold(row);
}
