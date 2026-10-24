/**
 * Keadaan akses sebuah tenant, diturunkan dari baris Subscription terbaru dan status tenant.
 * Satu sumber untuk login, penjaga akses di setiap request, respons ke klien, dan panel superadmin.
 *
 * - full       : semua fitur sesuai peran.
 * - read_only  : trial/langganan berakhir atau dibatalkan. Data tetap bisa dilihat dan diekspor,
 *                tetapi tidak bisa ditambah atau diubah.
 * - suspended  : ditangguhkan oleh superadmin. Tidak bisa masuk sama sekali.
 */
export type AccessMode = 'full' | 'read_only' | 'suspended';
export type AccessReason = 'ok' | 'trial_expired' | 'period_ended' | 'cancelled' | 'suspended';

export interface AccessInfo {
  mode: AccessMode;
  reason: AccessReason;
  subscriptionStatus: string | null;
  endsAt: Date | null;
}

export interface SubscriptionLike {
  status: string;
  endsAt: Date | null;
}

/** Kode mesin pada respons 403 supaya klien bisa membedakannya dari penolakan izin biasa. */
export const READ_ONLY_CODE = 'SUBSCRIPTION_READ_ONLY';
export const SUSPENDED_CODE = 'TENANT_SUSPENDED';

/** Status tenant yang diatur superadmin disimpan di JSON Tenant.settings. */
export function tenantStatusOf(settings: unknown): string | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const status = (settings as Record<string, unknown>).status;
  return typeof status === 'string' ? status : null;
}

export function accessFor(input: {
  tenantStatus?: string | null;
  subscription: SubscriptionLike | null;
  now?: Date;
}): AccessInfo {
  const now = input.now ?? new Date();
  const sub = input.subscription;
  const base = { subscriptionStatus: sub?.status ?? null, endsAt: sub?.endsAt ?? null };

  if (input.tenantStatus === 'suspended') return { mode: 'suspended', reason: 'suspended', ...base };
  if (!sub) return { mode: 'full', reason: 'ok', ...base };

  if (sub.status === 'cancelled') return { mode: 'read_only', reason: 'cancelled', ...base };

  // Selaras dengan aturan kuota AI: masa berlaku yang sudah lewat, pada trial maupun langganan aktif, berarti berakhir.
  const expired = (sub.status === 'trialing' || sub.status === 'active') && sub.endsAt && sub.endsAt.getTime() < now.getTime();
  if (expired) return { mode: 'read_only', reason: sub.status === 'trialing' ? 'trial_expired' : 'period_ended', ...base };

  // past_due dibiarkan penuh sebagai masa tenggang; superadmin memutuskan kapan dibatalkan.
  return { mode: 'full', reason: 'ok', ...base };
}

export function accessMessage(info: Pick<AccessInfo, 'reason'>): string {
  switch (info.reason) {
    case 'suspended':
      return 'Akun ini ditangguhkan. Hubungi tim Retalio untuk mengaktifkannya kembali.';
    case 'trial_expired':
      return 'Masa trial akun Anda sudah berakhir, jadi akun hanya bisa dibaca. Perpanjang langganan untuk menambah atau mengubah data.';
    case 'period_ended':
      return 'Masa langganan akun Anda sudah berakhir, jadi akun hanya bisa dibaca. Perpanjang langganan untuk menambah atau mengubah data.';
    case 'cancelled':
      return 'Langganan akun ini sudah dihentikan, jadi akun hanya bisa dibaca. Hubungi tim Retalio untuk mengaktifkannya kembali.';
    default:
      return 'Akses akun dibatasi.';
  }
}

export function isWriteMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

/** Rute yang tetap boleh ditulis saat baca saja: keluar dari akun dan pengaturan keamanan akun. */
export function isReadOnlyExempt(url: string): boolean {
  return url.split('?')[0].startsWith('/v1/auth/');
}

/** Bentuk ringkas untuk klien (login, refresh, /auth/me). */
export function accessPayload(info: AccessInfo) {
  return {
    mode: info.mode,
    reason: info.reason,
    subscriptionStatus: info.subscriptionStatus,
    endsAt: info.endsAt ? info.endsAt.toISOString() : null,
  };
}
