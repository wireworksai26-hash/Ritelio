import type { UpdateSuperadminTenantDto } from './dto/superadmin.dto';

/**
 * Kolom tenant yang menentukan tagihan dan biaya AI. Hanya superadmin platform yang boleh mengubahnya.
 * Tanpa pembatasan ini owner/admin mana pun dapat menaikkan paketnya sendiri (mis. ke custom, yang membuat
 * kuota AI tak terbatas) lewat PATCH /superadmin/tenants/:id.
 */
const PLATFORM_ONLY_FIELDS = ['subscriptionPlan', 'status', 'aiQuotaLimit', 'monthlyRevenue', 'resetAiQuota'] as const;

/** Kolom platform-only yang disertakan dalam perubahan ini. Kosong berarti perubahan aman untuk non-superadmin. */
export function platformOnlyFieldsIn(dto: UpdateSuperadminTenantDto): string[] {
  return PLATFORM_ONLY_FIELDS.filter((field) => dto[field] !== undefined);
}
