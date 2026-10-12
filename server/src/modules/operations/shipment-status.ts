import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type ShipmentStatusValue = 'pending' | 'in_transit' | 'delivered' | 'cancelled';

/**
 * Pengiriman TIDAK menyentuh stok maupun jurnal — sengaja.
 *
 * Stok keluar dan HPP sudah dicatat saat pesanan penjualan di-fulfil
 * (crm.service.ts fulfil: kurangi stok → jurnal pendapatan + HPP → faktur AR).
 * `Shipment` tidak punya salesOrderId maupun warehouseId, jadi tidak ada cara aman
 * membedakan pengiriman milik SO (stok sudah keluar) dari pengiriman lain. Mengurangi
 * stok di sini akan menggandakan barang keluar. Pemindahan antar gudang memakai
 * StockTransfer (procurement). Bila nanti pengiriman perlu memotong stok sendiri,
 * schema harus menambah relasi SO/gudang terlebih dulu.
 *
 * Yang dijaga di sini: transisi yang sah, dan klaim atomik supaya dua permintaan
 * bersamaan (UI + webhook kurir) tidak saling menimpa.
 */
const TRANSITIONS: Record<ShipmentStatusValue, ShipmentStatusValue[]> = {
  pending: ['in_transit', 'delivered', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

/** true bila `to` sama dengan `from` (panggilan ulang — tidak mengubah apa pun) atau transisi sah. */
export function canTransition(from: ShipmentStatusValue, to: ShipmentStatusValue): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ShipmentStatusValue, to: ShipmentStatusValue): void {
  if (canTransition(from, to)) return;
  if (from === 'delivered' || from === 'cancelled') {
    throw new ConflictException(
      `Shipment sudah ${from === 'delivered' ? 'terkirim' : 'dibatalkan'} dan tidak bisa diubah lagi.`,
    );
  }
  throw new BadRequestException(`Shipment berstatus "${from}" tidak bisa diubah ke "${to}".`);
}

export interface ClaimInput {
  tenantId: string;
  companyId: string;
  shipmentId: string;
  to: ShipmentStatusValue;
  at: Date;
  receiverName?: string;
}

/**
 * Pindahkan status secara atomik. Mengembalikan `changed=false` bila status sudah
 * sama (idempotent: tidak menimpa shippedAt/deliveredAt). Melempar Conflict bila
 * baris berubah oleh proses lain di antara baca dan tulis.
 */
export async function claimShipmentStatus(
  tx: Prisma.TransactionClient,
  input: ClaimInput,
): Promise<{ changed: boolean; from: ShipmentStatusValue }> {
  const current = await tx.shipment.findFirst({
    where: { id: input.shipmentId, tenantId: input.tenantId, companyId: input.companyId },
    select: { status: true, shippedAt: true, deliveredAt: true },
  });
  if (!current) throw new NotFoundException('Shipment tidak ditemukan.');
  const from = current.status as ShipmentStatusValue;

  assertTransition(from, input.to);
  if (from === input.to) return { changed: false, from };

  const claimed = await tx.shipment.updateMany({
    where: { id: input.shipmentId, tenantId: input.tenantId, companyId: input.companyId, status: from },
    data: {
      status: input.to,
      ...(input.to === 'in_transit' && !current.shippedAt ? { shippedAt: input.at } : {}),
      ...(input.to === 'delivered'
        ? { deliveredAt: input.at, ...(current.shippedAt ? {} : { shippedAt: input.at }) }
        : {}),
      ...(input.receiverName !== undefined ? { receiverName: input.receiverName } : {}),
    },
  });
  if (claimed.count !== 1) {
    throw new ConflictException('Status shipment baru saja diubah oleh proses lain. Muat ulang lalu coba lagi.');
  }
  return { changed: true, from };
}
