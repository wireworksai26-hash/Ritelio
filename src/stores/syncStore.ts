import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiFetch } from '../lib/api';
import { enqueueSale, flushSaleQueue } from '../lib/offlineQueue';
import { pendingSyncCount } from '../lib/stats';
import type { SalesTransaction } from '../types';
import { useBusinessStore } from './businessStore';
import { toast } from './toastStore';

// Status konektivitas + antrean penjualan offline.
// Antrean disimpan di perangkat (bertahan walau tab ditutup) dan benar-benar
// dikirim ke POST /v1/sales/transactions saat koneksi pulih; server idempoten
// lewat clientGeneratedId, jadi pengiriman ulang aman.
interface SyncState {
  isOnline: boolean;
  pendingLocal: SalesTransaction[];
  lastSyncAt: string | null;
  flushing: boolean;
  setOnline: (online: boolean) => void;
  queueTransaction: (tx: SalesTransaction) => void;
  /** Kirim antrean ke server. Mengembalikan jumlah transaksi yang diterima server. */
  syncNow: () => Promise<number>;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      pendingLocal: [],
      lastSyncAt: null,
      flushing: false,
      setOnline: (online) => {
        set({ isOnline: online });
        if (online) void get().syncNow();
      },
      queueTransaction: (tx) => set((s) => ({ pendingLocal: enqueueSale(s.pendingLocal, tx) })),
      syncNow: async () => {
        const { pendingLocal, flushing } = get();
        if (flushing || pendingLocal.length === 0) return 0;
        set({ flushing: true });
        try {
          const result = await flushSaleQueue(pendingLocal, (payload) =>
            apiFetch('/v1/sales/transactions', { method: 'POST', body: JSON.stringify(payload) }),
          );
          const done = new Set([...result.accepted, ...result.rejected.map((r) => r.id)]);
          // Hanya yang selesai diproses yang keluar dari antrean; transaksi baru yang masuk selama kirim tetap ada.
          set((s) => ({
            pendingLocal: s.pendingLocal.filter((t) => !done.has(t.client_generated_id || t.id)),
            lastSyncAt: result.accepted.length > 0 ? new Date().toISOString() : s.lastSyncAt,
          }));
          useBusinessStore.setState((b) => ({
            transactions: b.transactions.map((t) => {
              const id = t.client_generated_id || t.id;
              if (result.accepted.includes(id)) return { ...t, sync_status: 'synced' as const, server_timestamp: new Date().toISOString() };
              if (result.rejected.some((r) => r.id === id)) return { ...t, sync_status: 'needs_review' as const };
              return t;
            }),
          }));
          if (result.held) {
            toast({
              title: 'Transaksi tertahan di perangkat ini',
              description: `${result.held} Transaksi tetap tersimpan dan terkirim otomatis setelah akun aktif kembali.`,
              icon: 'warning',
            });
          }
          if (result.rejected.length > 0) {
            toast({
              title: `${result.rejected.length} transaksi ditolak server dan perlu ditinjau`,
              description: result.rejected[0].reason,
              icon: 'warning',
            });
          }
          return result.accepted.length;
        } finally {
          set({ flushing: false });
        }
      },
    }),
    {
      name: 'retalio-sale-queue',
      partialize: (s) => ({ pendingLocal: s.pendingLocal, lastSyncAt: s.lastSyncAt }),
    },
  ),
);

export function totalPending(): number {
  return pendingSyncCount() + useSyncStore.getState().pendingLocal.length;
}
