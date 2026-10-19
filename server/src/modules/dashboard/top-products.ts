import { roundMoney } from '../../common/utils/money';

interface ItemRow {
  productId: string;
  qty: unknown;
  price: unknown;
}

/**
 * Produk terlaris menurut omzet: jumlah x harga dihitung PER BARIS lalu dijumlahkan.
 * Sebelumnya omzet dihitung dari jumlah total x jumlah semua harga satuan (groupBy), sehingga angkanya
 * membengkak sebanyak jumlah transaksi produk itu.
 */
export function rankTopItems(rows: ItemRow[], limit = 10): Array<{ productId: string; qty: number; revenue: number }> {
  const byProduct = new Map<string, { qty: number; revenue: number }>();
  for (const row of rows) {
    const qty = Number(row.qty);
    const cur = byProduct.get(row.productId) ?? { qty: 0, revenue: 0 };
    cur.qty += qty;
    cur.revenue += qty * Number(row.price);
    byProduct.set(row.productId, cur);
  }
  return [...byProduct.entries()]
    .map(([productId, v]) => ({ productId, qty: v.qty, revenue: roundMoney(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}
