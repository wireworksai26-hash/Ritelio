import { isNetworkError } from './offline';
import type { SalesTransaction } from '../types';

export interface SaleSyncPayload {
  clientGeneratedId: string;
  outletId: string;
  customerId: string | null;
  total: number;
  paymentMethod: string;
  clientTimestamp: string;
  items: Array<{ productId: string; qty: number; price: number }>;
}

/** Bentuk body POST /v1/sales/transactions dari transaksi lokal. */
export function toSalePayload(tx: SalesTransaction): SaleSyncPayload {
  return {
    clientGeneratedId: tx.client_generated_id || tx.id,
    outletId: tx.outlet_id,
    customerId: tx.customer_id,
    total: tx.total,
    paymentMethod: tx.payment_method,
    clientTimestamp: tx.client_timestamp,
    items: tx.items.map((i) => ({ productId: i.product_id, qty: i.qty, price: i.price })),
  };
}

/** Tambahkan ke antrean tanpa duplikat (kunci: client_generated_id). */
export function enqueueSale(queue: SalesTransaction[], tx: SalesTransaction): SalesTransaction[] {
  const key = tx.client_generated_id || tx.id;
  if (queue.some((q) => (q.client_generated_id || q.id) === key)) return queue;
  return [...queue, tx];
}

export interface FlushResult {
  /** client_generated_id yang sudah diterima server (termasuk duplikat/konflik yang dicatat server). */
  accepted: string[];
  /** Ditolak server dengan alasan; tidak akan berhasil bila diulang apa adanya. */
  rejected: Array<{ id: string; reason: string }>;
  /** Masih menunggu: jaringan putus sebelum sempat dikirim. */
  remaining: SalesTransaction[];
}

/**
 * Kirim antrean satu per satu, berurutan. Server idempoten lewat clientGeneratedId,
 * jadi mengulang pengiriman aman. Galat jaringan menghentikan proses (sisa tetap
 * antre); penolakan server hanya menandai transaksi itu dan lanjut ke berikutnya,
 * supaya satu transaksi buruk tidak memblokir sisanya.
 */
export async function flushSaleQueue(
  queue: SalesTransaction[],
  send: (payload: SaleSyncPayload) => Promise<unknown>,
): Promise<FlushResult> {
  const accepted: string[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  let index = 0;
  for (; index < queue.length; index++) {
    const tx = queue[index];
    const id = tx.client_generated_id || tx.id;
    try {
      await send(toSalePayload(tx));
      accepted.push(id);
    } catch (err) {
      if (isNetworkError(err)) break;
      rejected.push({ id, reason: err instanceof Error ? err.message : 'Ditolak server.' });
    }
  }
  return { accepted, rejected, remaining: queue.slice(index) };
}
