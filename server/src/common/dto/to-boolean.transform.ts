import { Transform } from 'class-transformer';

/**
 * Konversi boolean untuk query string.
 *
 * `@Type(() => Boolean)` TIDAK boleh dipakai pada query param: JavaScript
 * memakai Boolean('false') === true, sehingga `?isActive=false` tersaring
 * sebagai `true` dan filter tidak pernah bekerja. Untuk body JSON nilai
 * sudah boolean sehingga helper ini aman di kedua tempat.
 */
export const ToBoolean = (): PropertyDecorator =>
  Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return value;
  });