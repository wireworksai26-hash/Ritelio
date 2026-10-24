import { create } from 'zustand';

// Status dialog "Hubungi sales" di halaman depan. Satu dialog dipakai bersama oleh semua tombol Hubungi Sales.
interface ContactSalesState {
  open: boolean;
  /** Topik yang ikut terisi di pesan WhatsApp dan subjek email, mis. "Paket Custom". */
  topic: string | null;
  show: (topic?: string) => void;
  close: () => void;
}

export const useContactSalesStore = create<ContactSalesState>((set) => ({
  open: false,
  topic: null,
  show: (topic) => set({ open: true, topic: topic ?? null }),
  close: () => set({ open: false }),
}));
