// Utility Keamanan Client-Side: Redaksi data sensitif, masking kredensial, dan sanitasi payload

/**
 * Masking API key untuk tampilan UI agar tidak terekspos langsung
 * Contoh: nvapi-abc123456789xyz -> nvapi-abc...xyz
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 12) return '********';
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

/**
 * Redaksi data sensitif sebelum dikirim ke model AI eksternal atau log.
 * Menghapus: Nomor Kartu Kredit/Debit, NIK, Password, Bearer Token, API Key.
 */
export function redactSensitiveData(input: string): string {
  if (!input) return '';

  return (
    input
      // 1. Redaksi API Key (nvapi-..., sk-...)
      .replace(/nvapi-[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_SECRET_KEY]')
      // 2. Redaksi Authorization Bearer Header
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]')
      // 3. Redaksi Nomor Kartu 16 Digit (format 4x4 atau sambung)
      .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, '[REDACTED_CARD_NUMBER]')
      // 4. Redaksi NIK / KTP 16 Digit
      .replace(/\b\d{16}\b/g, '[REDACTED_ID_NUMBER]')
      // 5. Redaksi Nomor Telepon Indonesia (08... atau +628...)
      .replace(/(\+62|62|0)8[1-9][0-9]{7,10}\b/g, '[REDACTED_PHONE]')
      // 6. Redaksi field password dalam JSON / teks
      .replace(/(["']?password["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, '$1[REDACTED_PASSWORD]$3')
  );
}

/**
 * Sanitasi string error agar tidak membocorkan header atau query param sensitif
 */
export function sanitizeErrorMessage(err: unknown): string {
  if (!err) return 'Terjadi kesalahan sistem';
  const msg = err instanceof Error ? err.message : String(err);
  return redactSensitiveData(msg).slice(0, 200);
}
