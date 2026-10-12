import type { IconName } from '../icons/Icon';
import type { Role } from '../../types';

export type NavGroupKey = 'utama' | 'penjualan' | 'gudang' | 'keuangan' | 'sdm' | 'sistem';

export const NAV_GROUP_LABEL: Record<NavGroupKey, string> = {
  utama: 'Utama',
  penjualan: 'Penjualan',
  gudang: 'Gudang & Produksi',
  keuangan: 'Keuangan',
  sdm: 'SDM & Operasi',
  sistem: 'Sistem',
};

const GROUP_ORDER: NavGroupKey[] = ['utama', 'penjualan', 'gudang', 'keuangan', 'sdm', 'sistem'];

export interface NavItem {
  to: string;
  label: string;
  shortLabel?: string;
  /** Satu kalimat untuk kartu di menu HP. */
  hint?: string;
  icon: IconName;
  group: NavGroupKey;
  module?: string;
  roles: Role[];
  end?: boolean;
  /** Tampil permanen di bottom nav HP. Sisanya masuk lembar "Menu". */
  pin?: boolean;
}

const ERP_ROLES: Role[] = ['owner', 'admin', 'manager'];

// Sumber tunggal untuk Sidebar, BottomNav, dan lembar Menu HP — difilter per role + modul aktif.
// Izin sebenarnya tetap dipaksa backend (RequirePermissions); filter ini hanya menjaga
// supaya menu yang pasti ditolak tidak ditampilkan.
export const NAV_ITEMS: NavItem[] = [
  { to: '/app/superadmin', label: 'Superadmin', shortLabel: 'Institusi', icon: 'settings', group: 'utama', roles: ['superadmin'], end: true, pin: true },

  { to: '/app', label: 'Dashboard', icon: 'dashboard', group: 'utama', roles: ['owner', 'admin', 'manager'], end: true, pin: true, hint: 'Ringkasan bisnis hari ini' },
  { to: '/app/pos', label: 'Kasir (POS)', shortLabel: 'Kasir', icon: 'pos', group: 'penjualan', module: 'pos', roles: ['manager', 'cashier'], pin: true, hint: 'Transaksi penjualan' },
  { to: '/app/crm', label: 'Penjualan & CRM', shortLabel: 'CRM', icon: 'handshake', group: 'penjualan', roles: ERP_ROLES, hint: 'Prospek, penawaran, pesanan' },

  { to: '/app/inventory', label: 'Inventori', icon: 'inventory', group: 'gudang', module: 'inventory', roles: ['owner', 'admin', 'manager', 'staff'], pin: true, hint: 'Stok, gudang, opname' },
  { to: '/app/procurement', label: 'Pengadaan', icon: 'truck', group: 'gudang', roles: ERP_ROLES, hint: 'Permintaan, PO, vendor' },
  { to: '/app/manufacturing', label: 'Manufaktur', icon: 'factory', group: 'gudang', roles: ERP_ROLES, hint: 'BOM, MRP, produksi, mutu' },

  { to: '/app/finance', label: 'Keuangan', icon: 'finance', group: 'keuangan', module: 'finance', roles: ['owner'], pin: true, hint: 'Laba rugi dan arus kas' },
  { to: '/app/accounting', label: 'Akuntansi', icon: 'document', group: 'keuangan', roles: ['owner'], hint: 'Jurnal, akun, periode, laporan' },
  { to: '/app/billing', label: 'Piutang & Utang', shortLabel: 'AR/AP', icon: 'receipt', group: 'keuangan', roles: ['owner'], hint: 'Faktur, pembayaran, umur' },
  { to: '/app/banking', label: 'Kas & Bank', icon: 'wallet', group: 'keuangan', roles: ['owner'], hint: 'Rekening dan rekonsiliasi' },
  { to: '/app/assets', label: 'Aset Tetap', icon: 'building', group: 'keuangan', roles: ['owner'], hint: 'Nilai dan penyusutan' },
  { to: '/app/approvals', label: 'Persetujuan', icon: 'clipboard', group: 'keuangan', roles: ['owner'], hint: 'Dokumen menunggu keputusan' },

  { to: '/app/hrm', label: 'SDM & Payroll', shortLabel: 'SDM', icon: 'users', group: 'sdm', roles: ['owner', 'admin'], hint: 'Karyawan, absensi, gaji' },
  { to: '/app/operations', label: 'Proyek & Logistik', shortLabel: 'Operasi', icon: 'route', group: 'sdm', roles: ['owner', 'admin'], hint: 'Proyek, pengiriman, perawatan' },
  { to: '/app/iot', label: 'IoT & Sensor', shortLabel: 'IoT', icon: 'sensor', group: 'sdm', roles: ['owner', 'admin'], hint: 'Perangkat dan pembacaan' },

  { to: '/app/audit', label: 'Audit & Pajak', shortLabel: 'Audit', icon: 'shield', group: 'sistem', roles: ['owner', 'admin'], hint: 'Jejak aktivitas dan aturan pajak' },
  { to: '/app/settings', label: 'Pengaturan', icon: 'settings', group: 'sistem', roles: ['owner'], hint: 'Bisnis, karyawan, modul' },

  { to: '/app/notifications', label: 'Notifikasi', icon: 'bell', group: 'utama', roles: ['superadmin', 'owner', 'admin', 'manager', 'cashier', 'staff'], pin: true },
];

export function navForRole(role: Role, isActive: (key: string) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (item.module && !isActive(item.module)) return false;
    return true;
  });
}

export function groupNav(items: NavItem[]): Array<{ key: NavGroupKey; label: string; items: NavItem[] }> {
  return GROUP_ORDER.map((key) => ({
    key,
    label: NAV_GROUP_LABEL[key],
    items: items.filter((i) => i.group === key),
  })).filter((g) => g.items.length > 0);
}

/**
 * Bottom nav HP: maksimal 5 slot. Bila menu role muat 5, tampilkan semuanya;
 * bila lebih, ambil 4 item pinned dan sisakan slot kelima untuk "Menu".
 */
export function splitForBottomNav(items: NavItem[]): { primary: NavItem[]; hasMore: boolean } {
  if (items.length <= 5) return { primary: items, hasMore: false };
  const pinned = items.filter((i) => i.pin);
  const primary = (pinned.length >= 4 ? pinned : [...pinned, ...items.filter((i) => !i.pin)]).slice(0, 4);
  return { primary, hasMore: true };
}

/** Role yang boleh membuka rute — diturunkan dari menu supaya guard dan navigasi tidak pernah berbeda. */
export function rolesForPath(path: string): Role[] {
  const item = NAV_ITEMS.find((i) => i.to === path);
  return item ? Array.from(new Set<Role>(['superadmin', ...item.roles])) : ['superadmin'];
}
