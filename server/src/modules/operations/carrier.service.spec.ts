import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  computeWebhookSignature,
  mapCarrierStatus,
  parseOccurredAt,
  verifyWebhookSignature,
} from './carrier-webhook';
import { CarrierService } from './carrier.service';

const SECRET = 'rahasia-kurir-1234567890';
const NOW = 1_800_000_000; // detik epoch tetap supaya tes deterministik

describe('verifyWebhookSignature', () => {
  const body = { trackingNumber: 'TRK-1', status: 'delivered' };
  const good = computeWebhookSignature(SECRET, NOW, body);
  const verify = (over: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) =>
    verifyWebhookSignature({ secret: SECRET, timestamp: NOW, body, signature: good, nowSeconds: NOW, ...over });

  it('menerima signature yang benar (dan tidak peka huruf besar/spasi pada hex)', () => {
    expect(() => verify()).not.toThrow();
    expect(() => verify({ signature: ` ${good.toUpperCase()} ` })).not.toThrow();
  });

  it('menolak secret salah, body diubah, dan timestamp yang tidak ikut ditandatangani', () => {
    expect(() => verify({ secret: 'secret-lain-1234567890' })).toThrow(/Signature/);
    expect(() => verify({ body: { ...body, status: 'returned' } })).toThrow(/Signature/);
    // signature valid untuk NOW, tetapi dikirim dengan timestamp lain yang masih dalam jendela
    expect(() => verify({ timestamp: NOW + 10 })).toThrow(/Signature/);
  });

  it('menolak signature kosong atau panjang berbeda tanpa melempar error non-HTTP', () => {
    expect(() => verify({ signature: '' })).toThrow(BadRequestException);
    expect(() => verify({ signature: 'abc' })).toThrow(BadRequestException);
    expect(() => verify({ signature: undefined as never })).toThrow(BadRequestException);
  });

  it('timestamp NaN/0/negatif ditolak (NaN tidak boleh melewati cek kedaluwarsa)', () => {
    for (const ts of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      expect(() =>
        verifyWebhookSignature({
          secret: SECRET, timestamp: ts, body, nowSeconds: NOW,
          signature: computeWebhookSignature(SECRET, ts, body),
        }),
      ).toThrow(/Timestamp webhook tidak valid/);
    }
  });

  it('batas 300 detik: tepat 300 diterima, 301 ditolak, di dua arah', () => {
    const at = (ts: number) =>
      verifyWebhookSignature({ secret: SECRET, timestamp: ts, body, nowSeconds: NOW, signature: computeWebhookSignature(SECRET, ts, body) });
    expect(() => at(NOW - 300)).not.toThrow();
    expect(() => at(NOW + 300)).not.toThrow();
    expect(() => at(NOW - 301)).toThrow(/kedaluwarsa/);
    expect(() => at(NOW + 301)).toThrow(/kedaluwarsa/);
  });
});

describe('mapCarrierStatus', () => {
  it('memetakan status kurir ke status internal', () => {
    expect(mapCarrierStatus('picked_up')).toBe('in_transit');
    expect(mapCarrierStatus('failed_attempt')).toBe('in_transit');
    expect(mapCarrierStatus('delivered')).toBe('delivered');
    expect(mapCarrierStatus('returned')).toBe('cancelled');
    expect(mapCarrierStatus('  Delivered ')).toBe('delivered');
  });

  it.each(['', 'unknown', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined, 42])(
    'menolak status tidak dikenal: %s',
    (raw) => {
      expect(() => mapCarrierStatus(raw)).toThrow(BadRequestException);
    },
  );
});

describe('parseOccurredAt', () => {
  const now = new Date('2026-10-11T10:00:00Z');
  it('kosong -> sekarang; tanggal sah dipakai apa adanya', () => {
    expect(parseOccurredAt(undefined, now)).toBe(now);
    expect(parseOccurredAt('2026-10-11T09:00:00Z', now).toISOString()).toBe('2026-10-11T09:00:00.000Z');
  });
  it('menolak tanggal rusak dan masa depan jauh, memberi toleransi 5 menit', () => {
    expect(() => parseOccurredAt('bukan-tanggal', now)).toThrow(BadRequestException);
    expect(() => parseOccurredAt('2026-10-11T10:06:00Z', now)).toThrow(/masa depan/);
    expect(() => parseOccurredAt('2026-10-11T10:04:00Z', now)).not.toThrow();
  });
});

type Row = Record<string, any>;

/** Fake Prisma stateful: satu shipment + daftar event + jejak audit. */
function setup(initial: Row = {}) {
  const state = {
    shipment: {
      id: 'sh-1', tenantId: 't1', companyId: 'c1', number: 'SHP-1', status: 'pending',
      carrierTrackingNumber: 'TRK-1', carrierWebhookSecret: SECRET, shippedAt: null, deliveredAt: null,
      ...initial,
    } as Row,
    events: [] as Row[],
    audits: [] as Row[],
  };
  const prisma: Row = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    shipment: {
      findFirst: async ({ where }: { where: Row }) =>
        where.carrierTrackingNumber && where.carrierTrackingNumber !== state.shipment.carrierTrackingNumber
          ? null
          : { ...state.shipment },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        if (state.shipment.status !== where.status) return { count: 0 };
        state.shipment = { ...state.shipment, ...data };
        return { count: 1 };
      },
    },
    shipmentEvent: {
      findFirst: async ({ where }: { where: Row }) =>
        state.events.find((e) =>
          ['status', 'description', 'location', 'source'].every((k) => e[k] === where[k]) &&
          e.occurredAt.getTime() === where.occurredAt.getTime(),
        ) ?? null,
      create: async ({ data }: { data: Row }) => state.events.push(data),
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  const audit = { record: async (e: Row) => void state.audits.push(e) };
  return { state, service: new CarrierService(prisma as never, audit as never) };
}

function signed(body: Row, secret = SECRET, ts = Math.floor(Date.now() / 1000)) {
  return { body, signature: computeWebhookSignature(secret, ts, body), ts };
}
const evt = (status: string, extra: Row = {}) => ({ trackingNumber: 'TRK-1', status, ...extra });

describe('CarrierService.handleWebhook', () => {
  it('webhook valid memajukan status dan menulis satu event timeline', async () => {
    const { state, service } = setup();
    const { body, signature, ts } = signed(evt('picked_up', { location: 'Jakarta', occurredAt: '2026-10-11T08:00:00Z' }));
    const r = await service.handleWebhook('t1', body as never, signature, ts);
    expect(r).toMatchObject({ status: 'in_transit' });
    expect(state.shipment.status).toBe('in_transit');
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({ source: 'carrier', location: 'Jakarta', status: 'in_transit' });
  });

  it('signature salah: 400, status tidak berubah, tidak ada event, tercatat di audit', async () => {
    const { state, service } = setup();
    const { body, ts } = signed(evt('delivered'));
    await expect(service.handleWebhook('t1', body as never, 'f'.repeat(64), ts)).rejects.toThrow(/Signature/);
    expect(state.shipment.status).toBe('pending');
    expect(state.events).toHaveLength(0);
    expect(state.audits[0]).toMatchObject({ action: 'carrier_webhook_rejected', outcome: 'failure' });
  });

  it('secret kurir lain (tenant/shipment lain) tidak bisa mengubah shipment ini', async () => {
    const { state, service } = setup();
    const { body, signature, ts } = signed(evt('delivered'), 'secret-kurir-lain-123456');
    await expect(service.handleWebhook('t1', body as never, signature, ts)).rejects.toThrow(BadRequestException);
    expect(state.shipment.status).toBe('pending');
  });

  it('timestamp kedaluwarsa / bukan angka ditolak sebelum menyentuh status', async () => {
    const { state, service } = setup();
    const old = signed(evt('delivered'), SECRET, Math.floor(Date.now() / 1000) - 3600);
    await expect(service.handleWebhook('t1', old.body as never, old.signature, old.ts)).rejects.toThrow(/kedaluwarsa/);
    const nan = signed(evt('delivered'), SECRET, Number.NaN);
    await expect(service.handleWebhook('t1', nan.body as never, nan.signature, Number('abc'))).rejects.toThrow(/tidak valid/);
    expect(state.shipment.status).toBe('pending');
  });

  it('tracking number tidak dikenal -> 404; tanpa secret terkonfigurasi -> 400', async () => {
    const { service } = setup();
    const s = signed({ trackingNumber: 'TRK-X', status: 'delivered' });
    await expect(service.handleWebhook('t1', s.body as never, s.signature, s.ts)).rejects.toThrow(NotFoundException);

    const { service: noSecret } = setup({ carrierWebhookSecret: null });
    const t = signed(evt('delivered'));
    await expect(noSecret.handleWebhook('t1', t.body as never, t.signature, t.ts)).rejects.toThrow(/belum dikonfigurasi/);
  });

  it('status tidak dikenal (dengan signature valid) -> 400, status tidak berubah', async () => {
    const { state, service } = setup();
    const s = signed(evt('exploded'));
    await expect(service.handleWebhook('t1', s.body as never, s.signature, s.ts)).rejects.toThrow(/tidak dikenal/);
    expect(state.shipment.status).toBe('pending');
    expect(state.events).toHaveLength(0);
  });

  it('idempoten: event persis sama dikirim dua kali -> satu baris timeline, status sama', async () => {
    const { state, service } = setup();
    const body = evt('picked_up', { occurredAt: '2026-10-11T08:00:00Z', description: 'Diambil' });
    const first = signed(body);
    await service.handleWebhook('t1', body as never, first.signature, first.ts);
    const again = await service.handleWebhook('t1', body as never, first.signature, first.ts);
    expect(again).toMatchObject({ status: 'in_transit', ignored: true });
    expect(state.events).toHaveLength(1);
  });

  it('event berbeda dengan status internal sama (picked_up lalu out_for_delivery) keduanya tercatat', async () => {
    const { state, service } = setup();
    for (const [status, at] of [['picked_up', '08:00'], ['out_for_delivery', '09:00']] as const) {
      const body = evt(status, { occurredAt: `2026-10-11T${at}:00Z` });
      const s = signed(body);
      await service.handleWebhook('t1', body as never, s.signature, s.ts);
    }
    expect(state.events).toHaveLength(2);
    expect(state.shipment.status).toBe('in_transit');
  });

  it('status akhir tidak bisa mundur: in_transit setelah delivered diabaikan (200), bukan 409', async () => {
    const { state, service } = setup({ status: 'delivered', deliveredAt: new Date('2026-10-11T09:00:00Z') });
    const s = signed(evt('in_transit'));
    const r = await service.handleWebhook('t1', s.body as never, s.signature, s.ts);
    expect(r).toMatchObject({ status: 'delivered', ignored: true });
    expect(state.shipment.status).toBe('delivered');
    expect(state.events).toHaveLength(0);
  });

  it('returned setelah delivered diabaikan; returned dari in_transit membatalkan', async () => {
    const { state: s1, service: svc1 } = setup({ status: 'delivered' });
    const a = signed(evt('returned'));
    await svc1.handleWebhook('t1', a.body as never, a.signature, a.ts);
    expect(s1.shipment.status).toBe('delivered');

    const { state: s2, service: svc2 } = setup({ status: 'in_transit' });
    const b = signed(evt('returned'));
    await svc2.handleWebhook('t1', b.body as never, b.signature, b.ts);
    expect(s2.shipment.status).toBe('cancelled');
  });

  it('delivered langsung dari pending diizinkan dan mengisi shippedAt + deliveredAt', async () => {
    const { state, service } = setup();
    const s = signed(evt('delivered', { occurredAt: '2026-10-11T09:00:00Z' }));
    await service.handleWebhook('t1', s.body as never, s.signature, s.ts);
    expect(state.shipment.status).toBe('delivered');
    expect(state.shipment.deliveredAt).toEqual(new Date('2026-10-11T09:00:00Z'));
    expect(state.shipment.shippedAt).toEqual(new Date('2026-10-11T09:00:00Z'));
  });
});

describe('CarrierService.registerWebhook & manual', () => {
  it('secret < 16 karakter ditolak', async () => {
    const { service } = setup();
    await expect(service.registerWebhook('t1', 'sh-1', 'JNE', 'pendek')).rejects.toThrow(/16 karakter/);
  });

  it('manual: status mundur tetap 409 (berbeda dari webhook yang diabaikan)', async () => {
    const { service } = setup({ status: 'delivered' });
    await expect(service.recordManualTracking('t1', 'sh-1', 'in_transit')).rejects.toThrow(/tidak bisa diubah/);
  });
});
