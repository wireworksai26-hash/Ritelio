import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OutletState {
  selected: string; // 'all' atau outlet id
  setSelected: (id: string) => void;
}

export const useOutletStore = create<OutletState>()(
  persist(
    (set) => ({
      selected: 'all',
      setSelected: (id) => set({ selected: id }),
    }),
    { name: 'retalio-outlet' },
  ),
);
