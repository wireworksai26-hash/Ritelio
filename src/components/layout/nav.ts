import type { IconName } from '../icons/Icon';
import type { Role } from '../../types';

export interface NavItem {
  to: string;
  label: string;
  shortLabel?: string;
  icon: IconName;
  module?: string;
  roles: Role[];
  end?: boolean;
}

// Sumber tunggal untuk Sidebar & BottomNav — difilter per role + modul aktif.
// Mengikuti App Flow: kasir hanya POS + notifikasi; finance sensitif hanya owner.
export const NAV_ITEMS: NavItem[] = [
  // Superadmin Portal
  { to: '/app/superadmin', label: 'Superadmin', shortLabel: 'Institusi', icon: 'settings', roles: ['superadmin'], end: true },

  // Executive & Manager Dashboards
  { to: '/app', label: 'Dashboard', icon: 'dashboard', roles: ['owner', 'manager'], end: true },

  // POS Kasir: Khusus Kasir & Manager (Owner fokus analitik bisnis, Staff fokus gudang)
  { to: '/app/pos', label: 'Kasir (POS)', shortLabel: 'Kasir', icon: 'pos', module: 'pos', roles: ['manager', 'cashier'] },

  // Inventori: Owner (kontrol aset), Manager (PO & restock), Staff (fisik stok)
  { to: '/app/inventory', label: 'Inventori', icon: 'inventory', module: 'inventory', roles: ['owner', 'manager', 'staff'] },

  // Keuangan Sensitif: KHUSUS Owner (Laba Rugi, HPP, Margin, Arus Kas)
  { to: '/app/finance', label: 'Keuangan', icon: 'finance', module: 'finance', roles: ['owner'] },

  // Pengaturan Bisnis & Karyawan: KHUSUS Owner
  { to: '/app/settings', label: 'Pengaturan', icon: 'settings', roles: ['owner'] },

  // Notifikasi: Semua peran dengan konteks masing-masing
  { to: '/app/notifications', label: 'Notifikasi', icon: 'bell', roles: ['superadmin', 'owner', 'manager', 'cashier', 'staff'] },
];

export function navForRole(role: Role, isActive: (key: string) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (item.module && !isActive(item.module)) return false;
    return true;
  });
}
