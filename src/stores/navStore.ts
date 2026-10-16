import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NavGroupKey } from '../components/layout/nav';

interface NavState {
  /** Pilihan eksplisit pengguna per grup. Grup tanpa pilihan mengikuti default (terbuka bila memuat halaman aktif). */
  open: Partial<Record<NavGroupKey, boolean>>;
  setOpen: (key: NavGroupKey, open: boolean) => void;
}

export const useNavStore = create<NavState>()(
  persist(
    (set) => ({
      open: {},
      setOpen: (key, open) => set((s) => ({ open: { ...s.open, [key]: open } })),
    }),
    { name: 'retalio-nav' },
  ),
);

/** Grup terbuka bila pengguna memilihnya, atau (tanpa pilihan) bila memuat halaman aktif. */
export function isGroupOpen(
  open: Partial<Record<NavGroupKey, boolean>>,
  key: NavGroupKey,
  activeKey: NavGroupKey | undefined,
): boolean {
  return open[key] ?? key === activeKey;
}
