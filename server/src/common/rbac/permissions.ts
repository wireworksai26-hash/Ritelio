// ─────────────────────────────────────────────────────────────
// RBAC Retalio — sumber kebenaran izin per role.
//
// Aturan (mengikuti PRD/App Flow):
// - owner   : akses penuh ('*')
// - admin   : operasional + konfigurasi modul, TANPA finansial sensitif
// - manager : inventori + purchasing + POS + laporan keuangan (read) + AI
// - cashier : hanya POS + notifikasi terbatas
// - staff   : minimal; izin tambahan via kolom users.permissions (JSONB override)
//
// Override per-user (kolom permissions):
//   {"finance:read": true}  -> menambah izin
//   {"ai:use": false}       -> mencabut izin
// ─────────────────────────────────────────────────────────────

export type Permission =
  | 'inventory:read'
  | 'inventory:write'
  | 'purchasing:read'
  | 'purchasing:write'
  | 'pos:read'
  | 'pos:write'
  | 'finance:read'
  | 'finance:write'
  | 'ai:use'
  | 'users:manage'
  | 'settings:write'
  | 'notifications:read'
  | 'outlets:read'
  | 'outlets:write';

export const ALL_PERMISSIONS: Permission[] = [
  'inventory:read',
  'inventory:write',
  'purchasing:read',
  'purchasing:write',
  'pos:read',
  'pos:write',
  'finance:read',
  'finance:write',
  'ai:use',
  'users:manage',
  'settings:write',
  'notifications:read',
  'outlets:read',
  'outlets:write',
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ['*'] as unknown as Permission[], // wildcard — dicek khusus di guard
  admin: [
    'inventory:read',
    'inventory:write',
    'purchasing:read',
    'purchasing:write',
    'pos:read',
    'pos:write',
    'ai:use',
    'users:manage',
    'settings:write',
    'notifications:read',
    'outlets:read',
    'outlets:write',
    // sengaja tanpa finance:* — finansial sensitif hanya owner (PRD)
  ],
  manager: [
    'inventory:read',
    'inventory:write',
    'purchasing:read',
    'purchasing:write',
    'pos:read',
    'pos:write',
    'finance:read',
    'ai:use',
    'notifications:read',
    'outlets:read',
  ],
  cashier: ['pos:read', 'pos:write', 'notifications:read'],
  staff: ['inventory:read', 'notifications:read', 'outlets:read'],
};

export function roleHasPermission(
  role: string,
  overrides: Record<string, boolean> | null | undefined,
  permission: Permission,
): boolean {
  // 1. Override per-user (JSONB) — deny menang lebih dulu
  const override = overrides?.[permission];
  if (override === false) return false;
  if (override === true) return true;
  // 2. Matriks role
  if (role === 'owner') return true;
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
