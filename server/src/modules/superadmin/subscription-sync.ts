import { paidAiQuotaFor, type PlanKey } from '../../common/config/plans.config';
import type { UpdateSuperadminTenantDto } from './dto/superadmin.dto';

export type { PlanKey };

/** Kuota AI bulanan bawaan per paket, dipakai saat membuat tenant dan saat paket diganti dari panel. */
export function defaultAiQuotaFor(plan: PlanKey): number {
  return paidAiQuotaFor(plan);
}

export interface SubscriptionChange {
  plan?: PlanKey;
  status?: string;
  aiQuota?: number;
  endsAt?: Date | null;
}

/**
 * Perubahan pada baris Subscription yang harus mengikuti perubahan tenant dari panel superadmin.
 *
 * Login dan kuota AI membaca baris Subscription, bukan Tenant.settings. Tanpa sinkron ini, mengubah status
 * menjadi active di panel tidak membuka kunci akun yang masa trial-nya habis, dan kuota yang diatur di panel
 * tidak berefek. Status suspended sengaja tidak diterjemahkan ke langganan: baris yang bukan trialing tidak
 * pernah dikunci saat login, jadi menandainya cancelled justru akan membuka kunci trial yang sudah habis.
 */
export function subscriptionChangeFor(input: {
  dto: Pick<UpdateSuperadminTenantDto, 'subscriptionPlan' | 'status' | 'aiQuotaLimit'>;
  currentPlan: PlanKey;
}): SubscriptionChange | null {
  const { dto, currentPlan } = input;
  const change: SubscriptionChange = {};

  const planChanged = dto.subscriptionPlan !== undefined && dto.subscriptionPlan !== currentPlan;
  if (planChanged) change.plan = dto.subscriptionPlan;

  if (dto.status === 'active') {
    change.status = 'active';
    change.endsAt = null;
  } else if (dto.status === 'trial') {
    change.status = 'trialing';
  }

  if (dto.aiQuotaLimit !== undefined) change.aiQuota = dto.aiQuotaLimit;
  else if (planChanged) change.aiQuota = defaultAiQuotaFor(dto.subscriptionPlan as PlanKey);

  return Object.keys(change).length > 0 ? change : null;
}
