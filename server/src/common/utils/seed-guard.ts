import { randomBytes } from 'node:crypto';

type Env = Record<string, string | undefined>;

export type SeedAccount = 'superadmin' | 'owner' | 'manager' | 'kelana';

export interface SeedPasswords {
  passwords: Record<SeedAccount, string>;
  /** Akun yang kata sandinya dibangkitkan acak (harus dicetak sekali ke operator). */
  generated: SeedAccount[];
  /** true bila memakai default dev (admin123/ferry123) — tidak pernah terjadi di produksi. */
  usedDevDefaults: boolean;
}

// DEV ONLY: dipakai hanya bila NODE_ENV != production dan env tidak diisi. Skrip smoke
// dan README dev bergantung pada nilai ini.
const DEV_DEFAULTS: Record<SeedAccount, string> = {
  superadmin: 'admin123',
  owner: 'admin123',
  manager: 'ferry123',
  kelana: 'admin123',
};

const ENV_KEYS: Record<SeedAccount, string> = {
  superadmin: 'SEED_SUPERADMIN_PASSWORD',
  owner: 'SEED_OWNER_PASSWORD',
  manager: 'SEED_MANAGER_PASSWORD',
  kelana: 'SEED_KELANA_PASSWORD',
};

const MIN_PROD_PASSWORD = 12;

/**
 * Seed menghapus SELURUH data tenant demo. Di produksi itu hanya boleh jalan bila
 * operator secara eksplisit menyetel ALLOW_DESTRUCTIVE_SEED=yes.
 */
export function assertSeedAllowed(env: Env): void {
  if (env.NODE_ENV === 'production' && env.ALLOW_DESTRUCTIVE_SEED !== 'yes') {
    throw new Error(
      'Seed ditolak: NODE_ENV=production. Seed MENGHAPUS data dan membuat akun demo. ' +
        'Jika benar-benar disengaja (mis. staging yang dibuat dari nol), jalankan ulang dengan ALLOW_DESTRUCTIVE_SEED=yes.',
    );
  }
}

/**
 * Kata sandi akun seed. Urutan: env spesifik akun -> SEED_ADMIN_PASSWORD ->
 * (dev) default dev -> (produksi) acak. Di produksi kata sandi dari env wajib >= 12 karakter.
 */
export function resolveSeedPasswords(env: Env): SeedPasswords {
  const production = env.NODE_ENV === 'production';
  const passwords = {} as Record<SeedAccount, string>;
  const generated: SeedAccount[] = [];
  let usedDevDefaults = false;

  for (const account of Object.keys(ENV_KEYS) as SeedAccount[]) {
    const fromEnv = env[ENV_KEYS[account]]?.trim() || env.SEED_ADMIN_PASSWORD?.trim();
    if (fromEnv) {
      if (production && fromEnv.length < MIN_PROD_PASSWORD) {
        throw new Error(`Kata sandi seed untuk ${account} minimal ${MIN_PROD_PASSWORD} karakter di produksi.`);
      }
      passwords[account] = fromEnv;
    } else if (production) {
      passwords[account] = randomBytes(15).toString('base64url');
      generated.push(account);
    } else {
      passwords[account] = DEV_DEFAULTS[account];
      usedDevDefaults = true;
    }
  }
  return { passwords, generated, usedDevDefaults };
}
