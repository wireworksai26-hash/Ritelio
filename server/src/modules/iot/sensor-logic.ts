import { BadRequestException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { roundMoney } from '../../common/utils/money';

export type SensorKind = 'temperature' | 'humidity' | 'counter' | 'weight' | 'vibration' | 'power';

const HASH_PREFIX = 'sha256:';

export function generateApiKey(): string {
  return randomBytes(24).toString('hex');
}

/** API key disimpan sebagai hash; nilai aslinya hanya tampil sekali saat dibuat/diputar. */
export function hashApiKey(key: string): string {
  return HASH_PREFIX + createHash('sha256').update(key, 'utf8').digest('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Cocokkan API key yang dikirim sensor dengan nilai tersimpan. Nilai tersimpan
 * berawalan "sha256:" = hash; selain itu dianggap key plain warisan (sensor yang
 * didaftarkan sebelum hashing) dan `legacy` = true supaya pemanggil bisa
 * menggantinya dengan hash setelah verifikasi berhasil.
 */
export function verifyApiKey(stored: string, provided: unknown): { ok: boolean; legacy: boolean } {
  if (typeof provided !== 'string' || provided.length === 0 || !stored) return { ok: false, legacy: false };
  if (stored.startsWith(HASH_PREFIX)) {
    return { ok: constantTimeEqual(stored, hashApiKey(provided)), legacy: false };
  }
  return { ok: constantTimeEqual(stored, provided), legacy: true };
}

/** Batas wajar per jenis sensor; angka di luar ini hampir pasti sensor rusak, bukan kondisi dunia nyata. */
const BOUNDS: Record<SensorKind, { min: number; max: number }> = {
  temperature: { min: -100, max: 1_000 },
  humidity: { min: 0, max: 100 },
  counter: { min: 0, max: 1_000_000_000 },
  weight: { min: 0, max: 1_000_000_000 },
  vibration: { min: 0, max: 100_000 },
  power: { min: 0, max: 1_000_000_000 },
};

/** Kolom value bertipe Decimal(14,4): lebih dari ini ditolak database, jadi tolak lebih awal dengan pesan jelas. */
const DECIMAL_LIMIT = 1_000_000_000;

export function validateReading(type: string, value: unknown, now: Date = new Date(), recordedAt?: string): Date {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException('Nilai pembacaan harus angka.');
  }
  const bounds = BOUNDS[type as SensorKind] ?? { min: -DECIMAL_LIMIT, max: DECIMAL_LIMIT };
  if (value < bounds.min || value > bounds.max) {
    throw new BadRequestException(
      `Nilai ${value} di luar rentang sensor ${type} (${bounds.min} s.d. ${bounds.max}).`,
    );
  }
  if (!recordedAt) return now;
  const at = new Date(recordedAt);
  if (Number.isNaN(at.getTime())) throw new BadRequestException('Waktu pembacaan tidak valid.');
  if (at.getTime() > now.getTime() + 60_000) {
    throw new BadRequestException('Waktu pembacaan tidak boleh di masa depan.');
  }
  return at;
}

/** Rentang aman rantai dingin: 2-12 C (35,6-53,6 F). Hanya dilaporkan; stok tidak pernah diubah otomatis. */
export function detectAnomaly(type: string, last: number | null, unit: string) {
  if (type !== 'temperature' || last === null) return null;
  const fahrenheit = /f/i.test(unit) && !/c/i.test(unit);
  const [lo, hi] = fahrenheit ? [35.6, 53.6] : [2, 12];
  if (last >= lo && last <= hi) return null;
  return { level: 'warning', message: `Suhu ${last}${unit} di luar rentang aman ${lo}–${hi}${unit}.` };
}

export function summarizeValues(values: number[]) {
  const last = values.length ? values[values.length - 1] : null;
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return {
    count: values.length,
    last,
    average: avg === null ? null : roundMoney(avg),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}
