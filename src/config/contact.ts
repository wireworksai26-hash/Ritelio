// Kontak sales Retalio: satu sumber untuk halaman depan dan aplikasi. Diisi lewat variabel build
// VITE_SALES_WHATSAPP dan VITE_SALES_EMAIL (lihat .env.example), bukan ditulis di komponen.
// Vite menanamkan nilainya saat build, jadi mengubahnya berarti build ulang (di Railway: deploy ulang).

/** Bentuk nomor untuk wa.me: hanya angka dengan kode negara. Mengembalikan null bila bukan nomor yang masuk akal. */
export function normalizeWhatsAppNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits; // nomor negara lain
}

export function buildWhatsAppUrl(rawNumber: string, message?: string): string | null {
  const number = normalizeWhatsAppNumber(rawNumber);
  if (!number) return null;
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export function buildMailtoUrl(email: string, subject?: string, body?: string): string {
  const params = [
    subject ? `subject=${encodeURIComponent(subject)}` : '',
    body ? `body=${encodeURIComponent(body)}` : '',
  ].filter(Boolean);
  return `mailto:${email}${params.length > 0 ? `?${params.join('&')}` : ''}`;
}

/**
 * Alamat formulir konsultasi (Google Form). Hanya tautan https yang dipakai, supaya nilai salah isi (atau skema
 * seperti javascript:) tidak pernah menjadi tautan di halaman. Mengembalikan null bila kosong atau tidak valid.
 */
export function normalizeFormUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// Email sales yang sudah dipakai di halaman depan menjadi nilai bawaan, supaya perilaku tidak berubah bila variabel tidak diisi.
const DEFAULT_SALES_EMAIL = 'sales@retalio.id';

const env = import.meta.env as Record<string, string | undefined>;

export const SALES_EMAIL = env.VITE_SALES_EMAIL?.trim() || DEFAULT_SALES_EMAIL;
/** Nomor seperti yang diketik pengelola (untuk ditampilkan). Kosong bila belum diisi. */
export const SALES_WHATSAPP_DISPLAY = env.VITE_SALES_WHATSAPP?.trim() ?? '';

/** Tautan WhatsApp sales dengan pesan awal, atau null bila nomornya belum diisi atau tidak valid. */
export function salesWhatsAppUrl(message?: string): string | null {
  return buildWhatsAppUrl(SALES_WHATSAPP_DISPLAY, message);
}

export function salesMailtoUrl(subject?: string, body?: string): string {
  return buildMailtoUrl(SALES_EMAIL, subject, body);
}

/** Tautan formulir konsultasi (VITE_INTAKE_FORM_URL), atau null bila belum diatur. */
export const INTAKE_FORM_URL = normalizeFormUrl(env.VITE_INTAKE_FORM_URL);
