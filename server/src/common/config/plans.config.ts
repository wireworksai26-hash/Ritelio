type Env = Record<string, string | undefined>;

export type PlanKey = 'basic' | 'plus_ai' | 'custom';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nilai bawaan sama dengan angka yang sebelumnya tertulis langsung di kode: pendaftaran memberi trial 14 hari
 * dengan 1000 pertanyaan AI, panel superadmin memberi 0 / 3000 / 25000 menurut paket. Semuanya dapat diubah
 * lewat environment tanpa deploy ulang kode.
 */
const DEFAULTS = {
  TRIAL_DAYS: 14,
  TRIAL_AI_QUOTA: 1000,
  AI_QUOTA_BASIC: 0,
  AI_QUOTA_PLUS_AI: 3000,
  AI_QUOTA_CUSTOM: 25000,
} as const;

type Key = keyof typeof DEFAULTS;

/** Batas bawah: trial minimal 1 hari; kuota boleh 0 (AI mati). */
const MINIMUM: Record<Key, number> = {
  TRIAL_DAYS: 1,
  TRIAL_AI_QUOTA: 0,
  AI_QUOTA_BASIC: 0,
  AI_QUOTA_PLUS_AI: 0,
  AI_QUOTA_CUSTOM: 0,
};

function readInt(key: Key, env: Env): number {
  const raw = env[key]?.trim();
  if (!raw) return DEFAULTS[key];
  const value = Number(raw);
  return Number.isInteger(value) && value >= MINIMUM[key] ? value : DEFAULTS[key];
}

export function trialDays(env: Env = process.env): number {
  return readInt('TRIAL_DAYS', env);
}

/** Kuota pertanyaan AI per bulan selama trial. */
export function trialAiQuota(env: Env = process.env): number {
  return readInt('TRIAL_AI_QUOTA', env);
}

/** Kuota pertanyaan AI per bulan bawaan untuk paket berbayar. */
export function paidAiQuotaFor(plan: PlanKey, env: Env = process.env): number {
  if (plan === 'basic') return readInt('AI_QUOTA_BASIC', env);
  if (plan === 'plus_ai') return readInt('AI_QUOTA_PLUS_AI', env);
  return readInt('AI_QUOTA_CUSTOM', env);
}

/** Tanggal berakhir trial yang dimulai pada `from`. */
export function trialEndsAt(from: Date = new Date(), env: Env = process.env): Date {
  return new Date(from.getTime() + trialDays(env) * DAY_MS);
}

/** Kesalahan nilai environment untuk validasi saat boot; kosong berarti semua sah atau tidak diisi. */
export function planConfigProblems(env: Env): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(DEFAULTS) as Key[]) {
    const raw = env[key]?.trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < MINIMUM[key]) {
      problems.push(`${key} harus berupa bilangan bulat ${MINIMUM[key]} atau lebih`);
    }
  }
  return problems;
}
