import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CustomField, IndustryTemplate, ModuleConfig } from '../types';
import { uid } from '../lib/format';

export const defaultModulesCatalog: ModuleConfig[] = [
  { module_key: 'inventory', label: 'Kontrol Inventori', description: 'Stok real-time multi-gudang, alert stok menipis, dan prediksi restock AI.', is_active: true },
  { module_key: 'pos', label: 'Kasir & POS', description: 'Kasir cepat multi-pembayaran dengan mode offline dan sinkronisasi otomatis.', is_active: true },
  { module_key: 'finance', label: 'Laporan Keuangan', description: 'Laba rugi, arus kas, forecast 30/60/90 hari, dan deteksi anomali.', is_active: true },
  { module_key: 'assistant', label: 'Retalio Intelligence', description: 'Asisten AI: tanya jawab bahasa natural, digest harian, dan rekomendasi.', is_active: true },
  { module_key: 'production', label: 'Produksi', description: 'Untuk manufaktur kecil: resep sederhana dan pencatatan produksi.', is_active: false },
  { module_key: 'booking', label: 'Booking & Reservasi', description: 'Untuk bisnis jasa: penjadwalan dan manajemen janji temu.', is_active: false },
];

interface ModuleState {
  modules: ModuleConfig[];
  customFields: CustomField[];
  template: IndustryTemplate;
  toggle: (key: string) => void;
  setModuleActive: (key: string, active: boolean) => void;
  isActive: (key: string) => boolean;
  addCustomField: (field: Omit<CustomField, 'id'>) => void;
  removeCustomField: (id: string) => void;
  setTemplate: (t: IndustryTemplate) => void;
}

export const useModuleStore = create<ModuleState>()(
  persist(
    (set, get) => ({
      modules: defaultModulesCatalog,
      customFields: [
        { id: 'cf-1', module_key: 'inventory', label: 'Tanggal Kedaluwarsa', type: 'date' },
        { id: 'cf-2', module_key: 'inventory', label: 'Varian Rasa', type: 'dropdown', options: ['Original', 'Aren', 'Vanilla'] },
      ],
      template: 'retail',
      toggle: (key) =>
        set((s) => ({
          modules: s.modules.map((m) => (m.module_key === key ? { ...m, is_active: !m.is_active } : m)),
        })),
      setModuleActive: (key, active) =>
        set((s) => ({
          modules: s.modules.map((m) => (m.module_key === key ? { ...m, is_active: active } : m)),
        })),
      isActive: (key) => get().modules.find((m) => m.module_key === key)?.is_active ?? false,
      addCustomField: (field) => set((s) => ({ customFields: [...s.customFields, { ...field, id: uid('cf') }] })),
      removeCustomField: (id) => set((s) => ({ customFields: s.customFields.filter((f) => f.id !== id) })),
      setTemplate: (t) => set({ template: t }),
    }),
    { name: 'retalio-modules' },
  ),
);

