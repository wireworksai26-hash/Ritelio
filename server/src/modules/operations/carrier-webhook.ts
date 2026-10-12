import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Peta status kurir ke status internal. Status yang tidak dipetakan ditolak. */
export const CARRIER_STATUS: Readonly<Record<string, 'pending' | 'in_transit' | 'delivered' | 'cancelled'>> = {
  picked_up: 'in_transit',
  in_transit: 'in_transit',
  out_for_delivery: 'in_transit',
  delivered: 'delivered',
  failed_attempt: 'in_transit',
  returned: 'cancelled',
};

/** Toleransi selisih jam antara kurir dan server; di luar ini request dianggap replay/usang. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export function mapCarrierStatus(raw: unknown): 'pending' | 'in_transit' | 'delivered' | 'cancelled' {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  // hasOwn: "constructor"/"__proto__" tidak boleh lolos sebagai status.
  if (!key || !Object.prototype.hasOwnProperty.call(CARRIER_STATUS, key)) {
    throw new BadRequestException(
      `Status "${String(raw)}" tidak dikenal. Yang diterima: ${Object.keys(CARRIER_STATUS).join(', ')}.`,
    );
  }
  return CARRIER_STATUS[key];
}

/** hex HMAC-SHA256(secret, `${timestamp}.${JSON.stringify(body)}`) */
export function computeWebhookSignature(secret: string, timestamp: number, body: unknown): string {
  return createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(body)}`).digest('hex');
}

/**
 * Verifikasi timestamp dan signature. Melempar BadRequest bila timestamp tidak
 * valid / kedaluwarsa / terlalu jauh di masa depan, atau signature tidak cocok.
 * Timestamp NaN harus ditolak: perbandingan `NaN > batas` bernilai false dan
 * akan meloloskan pemeriksaan kedaluwarsa secara diam-diam.
 */
export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: number;
  body: unknown;
  signature: string;
  nowSeconds?: number;
}): void {
  const now = input.nowSeconds ?? Date.now() / 1000;
  if (!Number.isFinite(input.timestamp) || input.timestamp <= 0) {
    throw new BadRequestException('Timestamp webhook tidak valid.');
  }
  if (Math.abs(now - input.timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new BadRequestException('Timestamp webhook kedaluwarsa.');
  }
  const expected = Buffer.from(computeWebhookSignature(input.secret, input.timestamp, input.body), 'utf8');
  const given = Buffer.from(String(input.signature ?? '').trim().toLowerCase(), 'utf8');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new BadRequestException('Signature webhook tidak valid.');
  }
}

/** Waktu kejadian dari kurir: kosong -> sekarang; di masa depan (lewat toleransi) ditolak. */
export function parseOccurredAt(raw: string | undefined, now: Date = new Date()): Date {
  if (!raw) return now;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) throw new BadRequestException('occurredAt tidak valid.');
  if (at.getTime() > now.getTime() + WEBHOOK_TOLERANCE_SECONDS * 1000) {
    throw new BadRequestException('occurredAt tidak boleh di masa depan.');
  }
  return at;
}
