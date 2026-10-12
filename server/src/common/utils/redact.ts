// Redaksi data sensitif sebelum teks dikirim ke model AI eksternal (TRD: redaksi data sensitif).
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PHONE_RE = /(?:\+62|62|0)8\d{2}[-\s]?\d{3,4}[-\s]?\d{3,4}/g;
const NPWP_RE = /\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\d\b/g;
const CARD_RE = /\b(?:\d{4}[ -]?){3}\d{4}\b/g;

export function redactSensitive(text: string): string {
  return text
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[telepon]')
    .replace(NPWP_RE, '[npwp]')
    .replace(CARD_RE, '[kartu]');
}

// ── Redaksi secret untuk audit log ──────────────────────
// Field yang nilainya tidak boleh pernah tersimpan di audit_logs, walau request
// sukses maupun gagal (kata sandi, token, API key sensor IoT, secret webhook, OTP).
const SECRET_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'apikey',
  'secret',
  'twofactorsecret',
  'otp',
  'authorization',
  'cookie',
  'setcookie',
  'privatekey',
]);

/** Kolom yang terlalu berat/tak berguna untuk jejak audit (mis. gambar OCR base64). */
const HEAVY_KEYS = new Set(['database64', 'filecontent', 'body']);

/** String lebih panjang dari ini dipotong sebelum masuk audit_logs. */
const MAX_AUDIT_STRING = 2000;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, '');
}

export function isSecretKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SECRET_KEYS.has(normalized) ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('apikey') ||
    normalized.endsWith('token') ||
    normalized.endsWith('tokenhash')
  );
}

/**
 * Salinan dalam objek yang aman ditulis ke log: seluruh nilai yang key-nya menandakan
 * secret diganti penanda '[redacted]'. Sengaja bekerja pada salinan — input tidak
 * boleh dimutasi.
 */
export function redactSecrets<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = redactSecrets(val, depth + 1);
  }
  return out as unknown as T;
}

/**
 * Bentuk nilai yang boleh disimpan ke audit_logs: JSON biasa (Date/Decimal diserialisasi),
 * secret diredaksi, kolom berat dibuang, string panjang dipotong, array dibatasi 50 elemen.
 * Dipakai SEBELUM menulis (interceptor & AuditService.record) dan lagi SAAT membaca
 * (baris lama yang ditulis sebelum aturan ini ada).
 */
export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_AUDIT_STRING ? `${value.slice(0, 200)}…[dipotong ${value.length} karakter]` : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;
  if (depth > 6) return '[terlalu dalam]';
  if (value instanceof Date) return value.toISOString();
  const withJson = value as { toJSON?: () => unknown };
  if (typeof withJson.toJSON === 'function') return sanitizeForAudit(withJson.toJSON(), depth + 1);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitizeForAudit(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(key)) out[key] = '[redacted]';
    else if (HEAVY_KEYS.has(normalizeKey(key))) out[key] = '[tidak disimpan]';
    else out[key] = sanitizeForAudit(val, depth + 1);
  }
  return out;
}
