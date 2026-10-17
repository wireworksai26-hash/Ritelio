// Validasi akun owner di onboarding. Aturan sengaja sama dengan backend (RegisterDto + IsStrongPassword),
// supaya kesalahan terlihat saat mengisi form, bukan setelah server menolak di langkah terakhir.

export interface OwnerAccountInput {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export const PASSWORD_HINT = 'Minimal 8 karakter, memuat huruf besar, huruf kecil, dan angka.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Panjang dalam byte UTF-8: bcrypt hanya membaca 72 byte pertama, jadi backend menolak yang lebih panjang. */
function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Kata sandi harus memuat huruf besar, huruf kecil, dan angka.';
  }
  if (utf8Bytes(password) > 72) return 'Kata sandi terlalu panjang (maksimal 72 byte).';
  return null;
}

/** Pesan galat pertama yang ditemukan, atau null bila akun owner siap didaftarkan. */
export function ownerAccountProblem(input: OwnerAccountInput): string | null {
  const business = input.businessName.trim();
  if (business.length < 2) return 'Nama usaha minimal 2 karakter.';
  if (business.length > 80) return 'Nama usaha maksimal 80 karakter.';
  const owner = input.ownerName.trim();
  if (owner.length < 2) return 'Nama owner minimal 2 karakter.';
  if (owner.length > 80) return 'Nama owner maksimal 80 karakter.';
  if (!EMAIL_PATTERN.test(input.ownerEmail.trim())) return 'Masukkan email owner yang valid.';
  return passwordProblem(input.ownerPassword);
}
