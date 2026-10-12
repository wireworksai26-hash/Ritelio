import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

// bcrypt hanya memproses 72 byte pertama. Tanpa batas atas eksplisit, dua kata
// sandi berbeda dengan prefix 72 byte yang sama menjadi tidak dapat dibedakan.
const MAX_BCRYPT_BYTES = 72;

const COMMON_PASSWORDS = new Set([
  'admin123',
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'ferry123',
  'retalio123',
  'admin1234',
]);

/**
 * Kebijakan kata sandi:
 * - panjang 8..72 byte (bcrypt truncation ceiling)
 * - mengandung huruf besar, huruf kecil, dan angka
 * - ditolak bila ada di daftar kata sandi umum
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          if (Buffer.byteLength(value, 'utf8') > MAX_BCRYPT_BYTES) return false;
          if (COMMON_PASSWORDS.has(value.toLowerCase())) return false;
          return (
            value.length >= 8 &&
            /[a-z]/.test(value) &&
            /[A-Z]/.test(value) &&
            /\d/.test(value)
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return (
            'Kata sandi harus 8 karakter atau lebih, memuat huruf besar, huruf kecil, dan angka, ' +
            'maksimal 72 byte, dan tidak boleh termasuk kata sandi umum.'
          );
        },
      },
    });
  };
}