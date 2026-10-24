import { describe, expect, it, vi } from 'vitest';
import type { SalesTransaction } from '../types';
import { ApiRequestError, READ_ONLY_CODE, SUSPENDED_CODE } from './api';
import { NetworkError } from './offline';
import { flushSaleQueue } from './offlineQueue';

const tx = (n: number): SalesTransaction =>
  ({
    id: `txn-${n}`,
    client_generated_id: `cgid-${n}`,
    outlet_id: 'o1',
    customer_id: null,
    total: 1000 * n,
    payment_method: 'cash',
    client_timestamp: '2026-11-10T08:00:00.000Z',
    items: [{ product_id: 'p1', qty: 1, price: 1000 * n }],
  }) as unknown as SalesTransaction;

describe('flushSaleQueue', () => {
  it('mengirim berurutan dan melaporkan yang diterima', async () => {
    const send = vi.fn().mockResolvedValue({});
    const res = await flushSaleQueue([tx(1), tx(2)], send);
    expect(res.accepted).toEqual(['cgid-1', 'cgid-2']);
    expect(res.remaining).toEqual([]);
    expect(res.held).toBeUndefined();
  });

  it('galat jaringan menghentikan pengiriman dan sisa tetap antre', async () => {
    const send = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new NetworkError('offline'));
    const res = await flushSaleQueue([tx(1), tx(2), tx(3)], send);
    expect(res.accepted).toEqual(['cgid-1']);
    expect(res.remaining.map((t) => t.id)).toEqual(['txn-2', 'txn-3']);
  });

  it('penolakan validasi menandai transaksi itu lalu lanjut ke berikutnya', async () => {
    const send = vi.fn().mockRejectedValueOnce(new ApiRequestError('Pelanggan nonaktif', 400)).mockResolvedValueOnce({});
    const res = await flushSaleQueue([tx(1), tx(2)], send);
    expect(res.rejected).toEqual([{ id: 'cgid-1', reason: 'Pelanggan nonaktif' }]);
    expect(res.accepted).toEqual(['cgid-2']);
    expect(res.held).toBeUndefined();
  });

  it.each([
    ['akun baca saja', READ_ONLY_CODE],
    ['tenant ditangguhkan', SUSPENDED_CODE],
  ])('%s: transaksi tidak dibuang, pengiriman berhenti, seluruh sisa tetap antre', async (_label, code) => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiRequestError('Akun hanya bisa dibaca.', 403, code));
    const res = await flushSaleQueue([tx(1), tx(2), tx(3)], send);
    expect(res.accepted).toEqual(['cgid-1']);
    expect(res.rejected).toEqual([]);
    expect(res.remaining.map((t) => t.id)).toEqual(['txn-2', 'txn-3']);
    expect(res.held).toBe('Akun hanya bisa dibaca.');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('403 biasa (izin peran, tanpa kode akun) tetap dianggap penolakan transaksi', async () => {
    const send = vi.fn().mockRejectedValue(new ApiRequestError('Akses ditolak.', 403));
    const res = await flushSaleQueue([tx(1)], send);
    expect(res.rejected).toEqual([{ id: 'cgid-1', reason: 'Akses ditolak.' }]);
    expect(res.held).toBeUndefined();
  });
});
