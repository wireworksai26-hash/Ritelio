// Definisi paket subscription Retalio (frontend-first).
// - Basic  : kasir, inventori, dan laporan keuangan tanpa AI
// - +AI    : semua fitur Basic + Retalio Intelligence (kuota AI bulanan)
// - Custom : semua + modul ERP lengkap dan kapabilitas advance
// Catatan: pembatasan modul ERP per paket belum ditegakkan di aplikasi. Daftar fitur di sini
// adalah materi penjualan, bukan kontrol akses.
import type { SubscriptionPlan } from '../types';

export interface Plan {
  id: SubscriptionPlan;
  name: string;
  tagline: string;
  monthlyPrice: number | null; // null = harga kustom
  yearlyPrice: number | null; // per bulan, ditagih tahunan
  features: string[];
  cta: string;
  featured?: boolean;
  badge?: string;
}

export const plans: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    tagline: 'Kasir, inventori, dan laporan keuangan untuk operasional inti.',
    monthlyPrice: 149000,
    yearlyPrice: 119000,
    features: [
      'Kasir & POS offline-first',
      'Kontrol inventori multi-gudang',
      'Laporan keuangan real-time',
      '1 outlet · 3 pengguna',
      'Push notification & install PWA',
      'Export PDF / Excel',
    ],
    cta: 'Mulai dengan Basic',
  },
  {
    id: 'plus_ai',
    name: '+AI',
    tagline: 'Semua fitur Basic, ditambah Retalio Intelligence.',
    monthlyPrice: 349000,
    yearlyPrice: 279000,
    badge: 'Retalio Intelligence',
    featured: true,
    features: [
      'Semua fitur Basic',
      'AI Business Assistant (tanya jawab natural)',
      'Prediksi stok & saran restock otomatis',
      'Cashflow forecast 30/60/90 hari',
      'Deteksi anomali & fraud',
      'Digest insight harian + OCR nota',
      '3 outlet · 10 pengguna',
      '1.000 query AI / bulan',
    ],
    cta: 'Coba +AI 14 hari',
  },
  {
    id: 'custom',
    name: 'Custom',
    tagline: 'Untuk operasi yang lebih advance.',
    monthlyPrice: null,
    yearlyPrice: null,
    features: [
      'Semua fitur +AI',
      'Outlet & pengguna tanpa batas',
      'Modul ERP lengkap: akuntansi, pengadaan, manufaktur, SDM & payroll, proyek, logistik, IoT',
      'Multi-perusahaan dan multi-mata uang',
      'Custom workflow, field & integrasi API',
      'Audit log penuh dan 2FA',
      'Dukungan prioritas + SLA',
    ],
    cta: 'Hubungi Sales',
  },
];

// Kuota AI tenant demo (ai_usage_counters di schema)
export const aiUsage = { used: 342, quota: 1000 };

export function planById(id: SubscriptionPlan): Plan {
  return plans.find((p) => p.id === id) ?? plans[0];
}
