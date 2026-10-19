type EnvConfig = Record<string, string | undefined>;

const PLACEHOLDER_MARKERS = ['ganti-dengan', 'changeme', 'your-secret', 'secret123'];

const MIN_SECRET_LENGTH = 32;

/**
 * Origin CORS yang berlaku. CORS_ORIGIN menang bila diisi. Bila kosong dan berjalan di Railway,
 * dipakai domain publik service itu sendiri (RAILWAY_PUBLIC_DOMAIN), yang cocok untuk deploy satu
 * service ketika frontend dan API satu domain.
 */
export function resolveCorsOrigins(env: EnvConfig): string[] {
  const explicit = parseCorsOrigins(env.CORS_ORIGIN);
  if (explicit.length > 0) return explicit;
  const railwayDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim();
  return railwayDomain ? [`https://${railwayDomain}`] : [];
}

/** Pecah CORS_ORIGIN (dipisah koma) menjadi daftar origin bersih. */
export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Validasi konfigurasi wajib saat boot. Tanpa ini, secret yang hilang/kurang
 * panjang hanya muncul sebagai 401 di setiap request — sulit didiagnosis dan
 * berarti token bisa ditebak bila secret-nya lemah.
 */
export function validateConfig(config: EnvConfig): EnvConfig {
  const errors: string[] = [];

  const require = (key: string): string => {
    const value = config[key]?.trim();
    if (!value) {
      errors.push(`${key} wajib diisi`);
      return '';
    }
    return value;
  };

  const databaseUrl = require('DATABASE_URL');
  const jwtSecret = require('JWT_SECRET');
  const jwtRefreshSecret = require('JWT_REFRESH_SECRET');

  for (const [key, value] of [
    ['JWT_SECRET', jwtSecret],
    ['JWT_REFRESH_SECRET', jwtRefreshSecret],
  ] as const) {
    if (value && value.length < MIN_SECRET_LENGTH) {
      errors.push(`${key} minimal ${MIN_SECRET_LENGTH} karakter`);
    }
    if (value && PLACEHOLDER_MARKERS.some((marker) => value.toLowerCase().includes(marker))) {
      errors.push(`${key} masih memakai nilai contoh — ganti dengan string acak`);
    }
  }

  if (jwtSecret && jwtSecret === jwtRefreshSecret) {
    errors.push('JWT_SECRET dan JWT_REFRESH_SECRET harus berbeda');
  }

  const port = Number(config.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT harus berupa angka antara 1 dan 65535');
  }

  const ttl = Number(config.AI_CACHE_TTL_SECONDS ?? 600);
  if (!Number.isFinite(ttl) || ttl < 0) {
    errors.push('AI_CACHE_TTL_SECONDS harus berupa angka non-negatif');
  }

  // CORS: dengan credentials:true, wildcard tidak boleh dipakai; di produksi origin wajib eksplisit.
  const isProduction = config.NODE_ENV === 'production';
  const corsOrigins = resolveCorsOrigins(config);
  if (isProduction && corsOrigins.length === 0) {
    errors.push('CORS_ORIGIN wajib diisi di produksi (daftar origin dipisah koma, mis. https://app.contoh.com)');
  }
  for (const origin of corsOrigins) {
    if (origin === '*' || origin.includes('*')) {
      errors.push('CORS_ORIGIN tidak boleh memakai wildcard (*)');
    } else if (!/^https?:\/\/[^/\s]+$/i.test(origin)) {
      errors.push(`CORS_ORIGIN "${origin}" harus berupa origin http(s) tanpa path, mis. https://app.contoh.com`);
    } else if (
      isProduction &&
      !/^https:\/\//i.test(origin) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    ) {
      errors.push(`CORS_ORIGIN "${origin}" harus memakai https di produksi`);
    }
  }

  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('DATABASE_URL harus berupa URL PostgreSQL');
  }

  const oneSignalAppId = config.ONESIGNAL_APP_ID?.trim();
  if (oneSignalAppId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oneSignalAppId)) {
    errors.push('ONESIGNAL_APP_ID harus berformat UUID standar (mis. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
  }

  if (errors.length > 0) {
    throw new Error(`Konfigurasi environment tidak valid:\n- ${errors.join('\n- ')}`);
  }

  return config;
}