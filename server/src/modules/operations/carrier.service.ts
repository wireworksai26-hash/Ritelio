import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { AuditService } from '../audit/audit.service';
import { mapCarrierStatus, parseOccurredAt, verifyWebhookSignature } from './carrier-webhook';
import { canTransition, claimShipmentStatus } from './shipment-status';

/**
 * Integrasi ekspedisi pihak ketiga lewat webhook masuk.
 *
 * Tidak ada outbound HTTP: kurir hanya mengirim status. Verifikasi memakai
 * HMAC-SHA256 atas body + timestamp supaya request yang bukan dari kurir
 * tidak bisa mengubah status pengiriman.
 */
@Injectable()
export class CarrierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

async registerWebhook(
    tenantId: string,
    shipmentId: string,
    carrierName: string,
    secret: string,
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (secret.length < 16) {
      throw new BadRequestException('Webhook secret minimal 16 karakter.');
    }
    const shipment = await this.prisma.shipment.findFirst({ where: { id: shipmentId, tenantId, companyId } });
    if (!shipment) throw new NotFoundException('Shipment tidak ditemukan.');

    return this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        carrierName,
        carrierWebhookSecret: secret,
        carrierTrackingNumber: shipment.carrierTrackingNumber ?? `TRK-${shipment.number}`,
      },
      select: { id: true, number: true, carrierName: true, carrierTrackingNumber: true },
    });
  }

  async recordManualTracking(tenantId: string, shipmentId: string, status: string, note?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.applyStatus(tenantId, companyId, shipmentId, status, note ?? '', 'manual');
  }

  /**
   * Endpoint webhook. `signature` = hex HMAC-SHA256(secret, `${timestamp}.${body}`).
   * Timestamp jauh di masa lalu ditolak supaya signature lama tidak bisa dipakai ulang.
   */
  async handleWebhook(
    tenantId: string,
    body: { trackingNumber: string; status: string; description?: string; location?: string; occurredAt?: string },
    signature: string,
    timestamp: number,
  ) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { tenantId, carrierTrackingNumber: body.trackingNumber },
      select: { id: true, companyId: true, carrierWebhookSecret: true, status: true },
    });
    if (!shipment) throw new NotFoundException('Tracking number tidak dikenal.');
    if (!shipment.carrierWebhookSecret) {
      throw new BadRequestException('Webhook belum dikonfigurasi untuk shipment ini.');
    }

    try {
      verifyWebhookSignature({ secret: shipment.carrierWebhookSecret, timestamp, body, signature });
    } catch (error) {
      if (error instanceof BadRequestException && /Signature/.test(error.message)) {
        await this.audit
          .record({ tenantId, action: 'carrier_webhook_rejected', entity: 'shipments', entityId: shipment.id, outcome: 'failure', reason: 'signature tidak cocok' })
          .catch(() => undefined);
      }
      throw error;
    }
    const occurredAt = parseOccurredAt(body.occurredAt);

    const result = await this.applyStatus(
      tenantId,
      shipment.companyId,
      shipment.id,
      body.status,
      body.description ?? '',
      'carrier',
      body.location,
      occurredAt,
    );

    await this.audit
      .record({
        tenantId,
        action: 'carrier_webhook',
        entity: 'shipments',
        entityId: shipment.id,
        after: { status: body.status, location: body.location ?? '' },
      })
      .catch(() => undefined);

    return result;
  }

  async timeline(tenantId: string, shipmentId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const shipment = await this.prisma.shipment.findFirst({ where: { id: shipmentId, tenantId, companyId } });
    if (!shipment) throw new NotFoundException('Shipment tidak ditemukan.');
    const events = await this.prisma.shipmentEvent.findMany({
      where: { tenantId, shipmentId },
      orderBy: { occurredAt: 'desc' },
    });
    return { shipment, events };
  }

  private async applyStatus(
    tenantId: string,
    companyId: string,
    shipmentId: string,
    rawStatus: string,
    description: string,
    source: string,
    location = '',
    occurredAt = new Date(),
  ) {
    const mapped = mapCarrierStatus(rawStatus);

    const now = new Date();
    // Transisi memakai klaim atomik yang sama dengan jalur manual: webhook ganda atau
    // webhook + UI bersamaan tidak saling menimpa, dan status akhir tidak bisa dibalik.
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (source === 'carrier') {
        // Event kurir yang datang terlambat/tidak berurutan (mis. "in_transit" setelah
        // "delivered") diabaikan dengan 200, bukan 409: kurir akan mengulang tanpa henti.
        const current = await tx.shipment.findFirst({
          where: { id: shipmentId, tenantId, companyId },
          select: { status: true },
        });
        if (current && !canTransition(current.status as never, mapped)) {
          return { ignored: true as const, status: current.status };
        }
      }
      const claim = await claimShipmentStatus(tx, { tenantId, companyId, shipmentId, to: mapped, at: occurredAt });
      if (!claim.changed) {
        // Pengiriman ulang event yang sama (retry kurir / replay dalam jendela waktu)
        // tidak boleh menggandakan baris timeline.
        const duplicate = await tx.shipmentEvent.findFirst({
          where: { tenantId, shipmentId, status: mapped, occurredAt, description, location, source },
          select: { id: true },
        });
        if (duplicate) return { ignored: true as const, status: mapped };
      }
      await tx.shipmentEvent.create({
        data: { tenantId, companyId, shipmentId, status: mapped, description, location, occurredAt, source },
      });
      return { ignored: false as const, status: mapped };
    });

    return outcome.ignored
      ? { shipmentId, status: outcome.status, recordedAt: now, ignored: true }
      : { shipmentId, status: mapped, recordedAt: now };
  }
}