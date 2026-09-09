import { create } from 'zustand';
import type { SalesTransaction } from '../types';
import { pendingSyncCount } from '../lib/stats';

// Meniru status konektivitas + antrean offline POS (Background Sync).
// Saat "online" kembali, antrean ditandai synced secara otomatis (mock).
interface SyncState {
  isOnline: boolean;
  pendingLocal: SalesTransaction[];
  lastSyncAt: string | null;
  setOnline: (online: boolean) => void;
  queueTransaction: (tx: SalesTransaction) => void;
  syncNow: () => number;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingLocal: [],
  lastSyncAt: null,
  setOnline: (online) => {
    set({ isOnline: online });
    if (online) {
      // Mock Background Sync: flush antrean begitu koneksi pulih
      get().syncNow();
    }
  },
  queueTransaction: (tx) => set((s) => ({ pendingLocal: [...s.pendingLocal, tx] })),
  syncNow: () => {
    const n = get().pendingLocal.length;
    set({ pendingLocal: [], lastSyncAt: new Date().toISOString() });
    return n;
  },
}));

export function totalPending(): number {
  return pendingSyncCount() + useSyncStore.getState().pendingLocal.length;
}
