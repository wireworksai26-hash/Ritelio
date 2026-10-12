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
  | 'outlets:write'
  | 'audit:read';

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
  'audit:read',
];

// Hierarki role: actor hanya boleh memberikan peran dengan rank <= rank-nya sendiri.
export const ROLE_RANK: Record<string, number> = {
  staff: 0,
  cashier: 1,
  manager: 2,
  admin: 3,
  owner: 4,
  superadmin: 5,
};

export function roleRank(role: string): number {
  return ROLE_RANK[role] ?? -1;
}

/** True bila actor boleh menetapkan `targetRole` ke user (menjaga dari eskalasi priviles). */
export function canAssignRole(actorRole: string, targetRole: string): boolean {
  return roleRank(targetRole) <= roleRank(actorRole);
}

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
    'audit:read',
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
  if (role === 'owner' || role === 'superadmin') return true;
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

/**
 * Sanitasi override izin: buang key di luar daftar izin resmi dan nilai non-boolean.
 * Mencegah penyimpanan key asing (mis. "all", "__proto__") yang menggugurkan matriks role.
 */
export function sanitizePermissionOverrides(
  input: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const allowed = new Set<string>(ALL_PERMISSIONS);
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) continue;
    const value = input[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}
