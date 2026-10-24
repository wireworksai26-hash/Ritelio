// Identitas penyelenggara untuk halaman Syarat & Ketentuan dan Privasi. Diisi lewat variabel build
// (lihat .env.example), bukan ditulis di teks halaman. Vite menanamkan nilainya saat build.
import { SALES_EMAIL } from './contact';

const env = import.meta.env as Record<string, string | undefined>;

const clean = (value: string | undefined): string => value?.trim() ?? '';

export interface LegalContact {
  /** Nama badan usaha penyelenggara; kosong bila belum diisi (halaman memakai nama produk saja). */
  companyName: string;
  /** Alamat korespondensi; kosong bila belum diisi. */
  companyAddress: string;
  /** Email untuk pertanyaan hukum, privasi, dan permintaan data. Bila kosong dipakai email sales. */
  email: string;
}

/** Bentuk pengaturan identitas dari nilai mentah; dipisah dari `import.meta.env` supaya bisa diuji. */
export function buildLegalContact(raw: { name?: string; address?: string; email?: string }, fallbackEmail: string): LegalContact {
  return {
    companyName: clean(raw.name),
    companyAddress: clean(raw.address),
    email: clean(raw.email) || fallbackEmail,
  };
}

export const LEGAL_CONTACT: LegalContact = buildLegalContact(
  { name: env.VITE_COMPANY_NAME, address: env.VITE_COMPANY_ADDRESS, email: env.VITE_LEGAL_EMAIL },
  SALES_EMAIL,
);
