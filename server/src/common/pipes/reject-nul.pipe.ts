import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MAX_DEPTH = 32;

/** True bila string, atau kunci/nilai di dalam objek/array, memuat karakter NUL (U+0000). */
export function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes('\u0000');
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return false;
  if (Array.isArray(value)) return value.some((v) => containsNul(v, depth + 1));
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key.includes('\u0000') || containsNul(v, depth + 1)) return true;
  }
  return false;
}

/**
 * PostgreSQL tidak bisa menyimpan U+0000 di kolom teks, sehingga input seperti "a\u0000b"
 * berubah menjadi 500 di endpoint mana pun yang menyimpannya. Tolak sebagai 400 sebelum
 * sampai ke validasi/service. Berlaku untuk body, query, dan parameter rute.
 */
@Injectable()
export class RejectNulPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'custom' && containsNul(value)) {
      throw new BadRequestException('Input memuat karakter yang tidak diizinkan.');
    }
    return value;
  }
}
