/**
 * Barang yang benar-benar punya stok. Jasa (cuci kiloan, antar-jemput, ...) tidak punya baris persediaan,
 * jadi tidak boleh ikut dicek/dikurangi stoknya dan tidak punya HPP persediaan. Tanpa pemisahan ini,
 * setiap penjualan jasa dianggap "stok kurang" dan masuk antrean tinjauan.
 */
export function isStockTracked(productType: string | null | undefined): boolean {
  return productType !== 'service';
}

/** Jumlah per produk (item duplikat digabung), hanya untuk produk yang berstok. */
export function stockedQtyByProduct(
  lines: Array<{ productId: string; qty: number }>,
  typeOf: (productId: string) => string | null | undefined,
): Map<string, number> {
  const needed = new Map<string, number>();
  for (const line of lines) {
    if (!isStockTracked(typeOf(line.productId))) continue;
    needed.set(line.productId, (needed.get(line.productId) ?? 0) + line.qty);
  }
  return needed;
}
