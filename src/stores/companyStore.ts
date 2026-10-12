import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CompanyState {
  /** Id perusahaan aktif; kosong = perusahaan utama (perilaku bawaan backend). */
  selected: string;
  setSelected: (id: string) => void;
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set) => ({
      selected: '',
      setSelected: (id) => set({ selected: id }),
    }),
    { name: 'retalio-company' },
  ),
);

/** Dibaca apiFetch di luar komponen React. */
export function selectedCompanyId(): string {
  return useCompanyStore.getState().selected;
}
