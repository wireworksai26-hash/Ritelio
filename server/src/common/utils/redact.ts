// Redaksi data sensitif sebelum teks dikirim ke model AI eksternal (TRD: redaksi data sensitif).
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PHONE_RE = /(?:\+62|62|0)8\d{2}[-\s]?\d{3,4}[-\s]?\d{3,4}/g;

export function redactSensitive(text: string): string {
  return text.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[telepon]');
}
