import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { advisoryLock, retryOnConflict } from '../inventory/tx-retry';
import { planRequisitionPos } from './requisition-po';
import type {
  ApproveRequisitionDto,
  ConvertRequisitionDto,
  CreateRequisitionDto,
  CreateTransferDto,
  ListRequisitionQueryDto,
  ReorderSuggestion,
} from './dto/procurement.dto';

/**
 * Fase 2 — Pembelian & Inventaris.
 *
 * Tiga hal yang dijaga ketat di sini:
 * 1. Transfer antar gudang mengurangi stok asal dan menambah gudang tujuan.
 *    Barang "diantara" tetap tercatat sebagai movement, bukan hilang.
 * 2. Reorder point hanya memberi saran; tidak pernah membuat PO sendiri
 *    supaya音波 pemesanan tidak terjadi tanpaCzłowiek approval manusia.
 * 3. Scorecard vendor hanya untuk pengurutan, tidak memblokir supplier.
 */
@Injectable()
export class ProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================ REQUISITION ============================

  async listRequisitions(tenantId: string, query: ListRequisitionQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.purchaseRequisition.findMany({
      take: 500,
      where: {
        tenantId,
        companyId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        lines: { include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
        purchaseOrder: { select: { id: true, code: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRequisition(tenantId: string, userId: string, dto: CreateRequisitionDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertProducts(tenantId, dto.lines.map((l) => l.productId));
    // Produk yang sama di dua baris digabung: baris requisition unik per produk.
    const merged = mergeLines(dto.lines);

    return this.prisma.$transaction(async (tx) => {
      const code = await this.nextCode(tx, 'requisition', 'REQ', tenantId, companyId);
      return tx.purchaseRequisition.create({
        data: {
          tenantId,
          companyId,
          code,
          reason: dto.reason ?? '',
          requestedById: userId,
          lines: {
            create: merged.map((l) => ({
              productId: l.productId,
              requestedQty: new Prisma.Decimal(l.qty),
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  /**
   * Setujui requisition. Setelah disetujui bisa dikonversi jadi PO.
   * Orang yang menyetujui tidak boleh sama dengan pemohon — pemisahan
   * kewenangan sederhana tapi mencegah persetujuan oleh diri sendiri.
   */
  async approveRequisition(tenantId: string, id: string, userId: string, dto: ApproveRequisitionDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const req = await this.prisma.purchaseRequisition.findFirst({
      where: { id, tenantId, companyId },
    });
    if (!req) throw new NotFoundException('Permintaan pembelian tidak ditemukan.');
    if (req.status !== 'submitted') {
      throw new BadRequestException(`Permintaan sudah berstatus ${req.status}.`);
    }
    if (req.requestedById === userId) {
      throw new BadRequestException('Pemohon tidak boleh menyetujui permintaannya sendiri.');
    }

    const status = dto.approve === false ? 'rejected' : 'approved';
    // Klaim bersyarat: dua keputusan bersamaan tidak bisa sama-sama menimpa status.
    const claimed = await this.prisma.purchaseRequisition.updateMany({
      where: { id, tenantId, companyId, status: 'submitted' },
      data: { status, approvedById: userId, approvedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Permintaan sudah diputuskan oleh permintaan lain.');
    }
    return this.prisma.purchaseRequisition.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Jadikan requisition yang sudah disetujui sebagai PO draf.
   *
   * Status `approved` → `converted` diklaim atomik di dalam transaksi, jadi dua
   * tap bersamaan tidak pernah menghasilkan PO ganda. Skema hanya punya satu
   * kolom `purchaseOrderId` (unik) per requisition: bila item terbagi ke lebih
   * dari satu pemasok, PO pertama ditautkan dan kode PO lainnya ditambahkan
   * ke `reason` agar tetap bisa ditelusuri.
   */
  async convertRequisitionToPo(tenantId: string, id: string, dto: ConvertRequisitionDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const req = await this.prisma.purchaseRequisition.findFirst({
      where: { id, tenantId, companyId },
      include: {
        lines: { include: { product: { select: { sku: true, preferredSupplierId: true, costPrice: true } } } },
      },
    });
    if (!req) throw new NotFoundException('Permintaan pembelian tidak ditemukan.');
    if (req.status === 'converted') throw new ConflictException('Permintaan ini sudah dijadikan PO.');
    if (req.status !== 'approved') {
      throw new BadRequestException('Hanya permintaan yang sudah disetujui yang bisa dijadikan PO.');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, companyId },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan.');

    const plans = planRequisitionPos(
      req.lines.map((l) => ({
        lineId: l.id,
        productId: l.productId,
        sku: l.product.sku,
        requestedQty: Number(l.requestedQty),
        preferredSupplierId: l.product.preferredSupplierId,
        costPrice: Number(l.product.costPrice),
      })),
      { defaultSupplierId: dto.supplierId, overrides: dto.lines },
    );

    const supplierIds = plans.map((p) => p.supplierId);
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, companyId, id: { in: supplierIds } },
      select: { id: true, code: true, name: true, isActive: true },
    });
    for (const sid of supplierIds) {
      const sup = suppliers.find((x) => x.id === sid);
      if (!sup) throw new NotFoundException('Ada pemasok yang tidak ditemukan.');
      if (!sup.isActive) throw new BadRequestException(`Pemasok ${sup.code} berstatus nonaktif.`);
    }

    return retryOnConflict(() => this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.purchaseRequisition.updateMany({
          where: { id: req.id, tenantId, companyId, status: 'approved' },
          data: { status: 'converted' },
        });
        if (claimed.count !== 1) throw new ConflictException('Permintaan ini sudah dijadikan PO.');

        const orders: Array<{
          id: string;
          code: string;
          supplierId: string;
          supplierName: string;
          lines: number;
          total: number;
        }> = [];
        for (const plan of plans) {
          const code = await this.nextPurchaseOrderCode(tx, tenantId, companyId);
          const po = await tx.purchaseOrder.create({
            data: {
              tenantId,
              companyId,
              code,
              supplierId: plan.supplierId,
              warehouseId: warehouse.id,
              status: 'draft',
              items: {
                create: plan.lines.map((l) => ({
                  productId: l.productId,
                  qty: new Prisma.Decimal(l.qty),
                  price: new Prisma.Decimal(l.price),
                })),
              },
            },
            select: { id: true, code: true },
          });
          for (const l of plan.lines) {
            const src = req.lines.find((x) => x.id === l.lineId)!;
            await tx.purchaseRequisitionLine.update({
              where: { id: l.lineId },
              data: { orderedQty: src.requestedQty },
            });
          }
          orders.push({
            id: po.id,
            code: po.code,
            supplierId: plan.supplierId,
            supplierName: suppliers.find((s) => s.id === plan.supplierId)!.name,
            lines: plan.lines.length,
            total: plan.total,
          });
        }

        const extra = orders.slice(1).map((o) => o.code);
        const requisition = await tx.purchaseRequisition.update({
          where: { id: req.id },
          data: {
            purchaseOrderId: orders[0].id,
            ...(extra.length
              ? { reason: `${req.reason ? `${req.reason} | ` : ''}PO lain dari permintaan ini: ${extra.join(', ')}` }
              : {}),
          },
          include: { lines: true, purchaseOrder: { select: { id: true, code: true, status: true } } },
        });
        return { requisition, purchaseOrders: orders };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ));
  }

  /** Nomor PO memakai deret yang sama dengan PurchasingService.createOrder. */
  private async nextPurchaseOrderCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
  ): Promise<string> {
    const prefix = `PO-${new Date().getFullYear()}-`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const counter = await tx.documentSequence.upsert({
        where: { tenantId_companyId_kind: { tenantId, companyId, kind: 'purchase-order-number' } },
        update: { nextValue: { increment: 1 } },
        create: { tenantId, companyId, kind: 'purchase-order-number', nextValue: 2 },
      });
      const code = `${prefix}${String(counter.nextValue - 1).padStart(3, '0')}`;
      const exists = await tx.purchaseOrder.findFirst({ where: { tenantId, companyId, code }, select: { id: true } });
      if (!exists) return code;
    }
    throw new ConflictException('Gagal membuat nomor PO, coba lagi.');
  }

  /** Tandai sudah disubmit (menunggu persetujuan). */
  async submitRequisition(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const found = await this.prisma.purchaseRequisition.findFirst({ where: { id, tenantId, companyId }, select: { id: true } });
    if (!found) throw new NotFoundException('Permintaan pembelian tidak ditemukan.');
    const claimed = await this.prisma.purchaseRequisition.updateMany({
      where: { id, tenantId, companyId, status: 'draft' },
      data: { status: 'submitted' },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Hanya permintaan berstatus draft yang bisa dikirim.');
    }
    return this.prisma.purchaseRequisition.findUnique({ where: { id }, include: { lines: true } });
  }

  // ============================ STOCK TRANSFER ============================

  async listTransfers(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.stockTransfer.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: {
        fromWarehouse: { select: { id: true, code: true, name: true } },
        toWarehouse: { select: { id: true, code: true, name: true } },
        lines: { include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransfer(tenantId: string, dto: CreateTransferDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Gudang asal dan tujuan tidak boleh sama.');
    }
    const [from, to] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: dto.fromWarehouseId, tenantId, companyId } }),
      this.prisma.warehouse.findFirst({ where: { id: dto.toWarehouseId, tenantId, companyId } }),
    ]);
    if (!from) throw new NotFoundException('Gudang asal tidak ditemukan.');
    if (!to) throw new NotFoundException('Gudang tujuan tidak ditemukan.');
    await this.assertProducts(tenantId, dto.lines.map((l) => l.productId));
    const merged = mergeLines(dto.lines);

    return this.prisma.$transaction(async (tx) => {
      const code = await this.nextCode(tx, 'stock-transfer', 'TRF', tenantId, companyId);
      return tx.stockTransfer.create({
        data: {
          tenantId,
          companyId,
          code,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          note: dto.note ?? '',
          lines: {
            create: merged.map((l) => ({
              productId: l.productId,
              qty: new Prisma.Decimal(l.qty),
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  /**
   * Kirim: stok langsung keluar dari gudang asal. Barang belum ada di gudang
   * tujuan sampai `receive`, jadi tidak ada Lanka dobel di dua gudang.
   */
  async shipTransfer(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const transfer = await this.assertTransfer(tenantId, id);
    if (transfer.status !== 'draft') {
      throw new ConflictException(`Transfer sudah berstatus ${transfer.status}.`);
    }

    return retryOnConflict(() => this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockTransfer.updateMany({
        where: { id, tenantId, companyId, status: 'draft' },
        data: { status: 'in_transit', shippedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('Transfer sudah dikirim.');

      for (const line of transfer.lines) {
        const updated = await tx.inventoryStock.updateMany({
          where: {
            tenantId,
            companyId,
            warehouseId: transfer.fromWarehouseId,
            productId: line.productId,
            quantity: { gte: Number(line.qty) },
          },
          data: { quantity: { decrement: line.qty } },
        });
        if (updated.count !== 1) {
          throw new BadRequestException(
            `Stok "${line.product.name}" di gudang asal tidak cukup (diminta ${line.qty}).`,
          );
        }
        await tx.stockMovement.create({
          data: {
            tenantId,
            companyId,
            productId: line.productId,
            warehouseId: transfer.fromWarehouseId,
            type: 'transfer_out' as never,
            quantity: new Prisma.Decimal(line.qty).negated(),
            note: `Kirim ${transfer.code}`,
            refId: transfer.id,
          },
        });
      }

      return tx.stockTransfer.findUnique({ where: { id }, include: { lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  /** Terima: stok masuk gudang tujuan dengan HPP rata-rata dari gudang asal. */
  async receiveTransfer(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const transfer = await this.assertTransfer(tenantId, id);
    if (transfer.status !== 'in_transit') {
      throw new ConflictException(
        transfer.status === 'received' ? 'Transfer sudah diterima.' : 'Transfer belum dikirim.',
      );
    }

    return retryOnConflict(() => this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockTransfer.updateMany({
        where: { id, tenantId, companyId, status: 'in_transit' },
        data: { status: 'received', receivedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('Transfer sudah diterima.');

      for (const line of transfer.lines) {
        const source = await tx.inventoryStock.findUnique({
          where: {
            tenantId_companyId_productId_warehouseId: {
              tenantId,
              companyId,
              productId: line.productId,
              warehouseId: transfer.fromWarehouseId,
            },
          },
          select: { avgCost: true },
        });
        const unitCost = Number(source?.avgCost ?? 0);

        const existing = await tx.inventoryStock.findUnique({
          where: {
            tenantId_companyId_productId_warehouseId: {
              tenantId,
              companyId,
              productId: line.productId,
              warehouseId: transfer.toWarehouseId,
            },
          },
          select: { quantity: true, avgCost: true },
        });

        const currentQty = existing ? Number(existing.quantity) : 0;
        const currentCost = existing ? Number(existing.avgCost) : 0;
        const incoming = Number(line.qty);
        const newQty = currentQty + incoming;
        // HPP ikut merambat ke gudang tujuan, kalau tidak barang ini akan
        // terlihat gratis setelah dipindah.
        const avgCost = newQty > 0
          ? new Prisma.Decimal((currentQty * currentCost + incoming * unitCost) / newQty).toDecimalPlaces(4)
          : new Prisma.Decimal(unitCost).toDecimalPlaces(4);

        await tx.inventoryStock.upsert({
          where: {
            tenantId_companyId_productId_warehouseId: {
              tenantId,
              companyId,
              productId: line.productId,
              warehouseId: transfer.toWarehouseId,
            },
          },
          create: {
            tenantId,
            companyId,
            productId: line.productId,
            warehouseId: transfer.toWarehouseId,
            quantity: line.qty,
            avgCost,
          },
          update: { quantity: { increment: line.qty }, avgCost },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            companyId,
            productId: line.productId,
            warehouseId: transfer.toWarehouseId,
            type: 'transfer_in' as never,
            quantity: line.qty,
            note: `Terima ${transfer.code}`,
            refId: transfer.id,
          },
        });
      }

      return tx.stockTransfer.findUnique({ where: { id }, include: { lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  // ============================ REORDER POINT ============================

  /**
   * Saran pemesanan berdasarkan stok per gudang vs reorder point.
   *
   * Read-only: dipakai untuk layar "saran". Untuk membuat PO (atau
   * memberitahukan tim) pakai `generateReorderPurchaseOrders`.
   */
  async reorderSuggestions(tenantId: string): Promise<ReorderSuggestion[]> {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const rows = await this.prisma.inventoryStock.findMany({
      where: {
        tenantId,
        companyId,
        product: { reorderPoint: { gt: 0 }, isActive: true },
      },
      select: {
        quantity: true,
        product: {
          select: {
            id: true, sku: true, name: true, unit: true,
            reorderPoint: true, reorderQty: true, costPrice: true,
            preferredSupplierId: true,
          },
        },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { product: { sku: 'asc' } },
    });

    return rows
      .filter((r) => Number(r.quantity) <= Number(r.product.reorderPoint))
      .map((r) => {
        const onHand = Number(r.quantity);
        const target = Number(r.product.reorderPoint) + Number(r.product.reorderQty);
        const suggestedQty = Math.max(0, target - onHand);
        return {
          productId: r.product.id,
          sku: r.product.sku,
          name: r.product.name,
          unit: r.product.unit,
          warehouseId: r.warehouse.id,
          warehouseName: r.warehouse.name,
          onHand,
          reorderPoint: Number(r.product.reorderPoint),
          suggestedQty,
          estimatedCost: roundMoney(suggestedQty * Number(r.product.costPrice)),
          supplierId: r.product.preferredSupplierId,
        };
      })
      .sort((a, b) => a.onHand / (a.reorderPoint || 1) - b.onHand / (b.reorderPoint || 1));
  }

  /**
   * Reorder Point Automation: ubah saran menjadi draf PO.
   *
   * Yang dijaga supaya tidak menghasilkan PO ganda: produk yang sudah punya PO
   * berstatus `draft`/`ordered` di tenant yang sama dilewati. Tanpa itu, setiap
   * pemicu harian akan membuat purchase order bertumpuk untuk barang yang sama.
   *
   * PO tetap berstatus `draft` — tidak pernah langsung dikirim ke vendor.
   */
  async generateReorderPurchaseOrders(
    tenantId: string,
    opts: { notify?: boolean; onlySupplierId?: string } = {},
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const suggestions = await this.reorderSuggestions(tenantId);
    if (suggestions.length === 0) return { created: [], skipped: [], total: 0 };

    // Satu PO = satu pemasok + satu gudang tujuan. Mengelompokkan per pemasok
    // saja membuat seluruh barang masuk ke gudang item pertama.
    const grouped = new Map<string, { supplierId: string; warehouseId: string; items: ReorderSuggestion[] }>();
    const skipped: Array<{ sku: string; reason: string }> = [];
    for (const s of suggestions) {
      // onlySupplierId MEMBATASI ke satu pemasok (sesuai kontrak DTO), bukan memaksa semua
      // barang dipesan ke pemasok itu: itu akan membuat PO untuk barang yang bukan miliknya.
      if (opts.onlySupplierId && s.supplierId !== opts.onlySupplierId) continue;
      const supplierId = s.supplierId;
      if (!supplierId) {
        skipped.push({ sku: s.sku, reason: 'produk belum punya pemasok utama' });
        continue;
      }
      if (!(s.estimatedCost > 0)) {
        skipped.push({ sku: s.sku, reason: 'harga pokok produk belum diisi, PO tidak bisa dibuat' });
        continue;
      }
      const key = `${supplierId}:${s.warehouseId}`;
      const group = grouped.get(key) ?? { supplierId, warehouseId: s.warehouseId, items: [] };
      group.items.push(s);
      grouped.set(key, group);
    }

    const created: Array<{ supplierId: string; warehouseId: string; orderNumber: string; total: number; lines: number }> = [];

    // Seluruh proses dikunci per tenant: dua pemicu bersamaan (cron + klik manual)
    // tidak boleh sama-sama lolos pemeriksaan "sudah ada PO terbuka".
    await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, `reorder-po:${tenantId}:${companyId}`);
      for (const { supplierId, warehouseId, items } of grouped.values()) {
        const fresh: ReorderSuggestion[] = [];
        for (const item of items) {
          const openPo = await tx.purchaseOrderItem.findFirst({
            where: {
              productId: item.productId,
              po: { tenantId, companyId, warehouseId, status: { in: ['draft', 'ordered'] } },
            },
            select: { po: { select: { code: true } } },
          });
          if (openPo) {
            skipped.push({ sku: item.sku, reason: `sudah ada PO ${openPo.po.code} terbuka` });
          } else {
            fresh.push(item);
          }
        }
        if (fresh.length === 0) continue;

        const supplier = await tx.supplier.findFirst({
          where: { id: supplierId, tenantId, companyId, isActive: true },
          select: { id: true, name: true },
        });
        if (!supplier) {
          skipped.push({ sku: fresh[0].sku, reason: 'supplier tidak ditemukan atau nonaktif' });
          continue;
        }

        const lines = fresh.map((i) => ({
          productId: i.productId,
          qty: i.suggestedQty,
          price: roundMoney(i.estimatedCost / (i.suggestedQty || 1)),
        }));
        const total = roundMoney(lines.reduce((sum, l) => sum + l.qty * l.price, 0));
        const code = await this.nextPurchaseOrderCode(tx, tenantId, companyId);
        const order = await tx.purchaseOrder.create({
          data: {
            tenantId,
            companyId,
            code,
            supplierId,
            warehouseId,
            status: 'draft',
            items: {
              create: lines.map((l) => ({
                productId: l.productId,
                qty: new Prisma.Decimal(l.qty),
                price: new Prisma.Decimal(l.price),
              })),
            },
          },
          select: { code: true },
        });
        created.push({ supplierId, warehouseId, orderNumber: order.code, total, lines: fresh.length });

        if (opts.notify) {
          await tx.notification.create({
            data: {
              tenantId,
              type: 'approval',
              title: `Reorder: ${order.code} menunggu persetujuan`,
              body: `${fresh.length} item membuat draft PO otomatis karena stok menyentuh reorder point. Total ${total}.`,
            },
          });
        }
      }
    });

    return { created, skipped, total: roundMoney(created.reduce((sum, c) => sum + c.total, 0)) };
  }

  // ============================ VENDOR SCORECARD ============================

  /**
   * Hitung ulang skor kinerja supplier untuk satu periode dan simpan ke
   * `vendor_performance`.
   *
   * Tiga dimensi sesuai kebutuhan: ketepatan waktu (PO diterima sebelum
   * tenggat), kualitas (baris yang ditolak saat receive), dan harga (harga
   * beli aktual terhadap rata-rata katalog di periode itu).
   */
  async computeVendorPerformance(tenantId: string, periodStart: string, periodEnd: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const from = new Date(periodStart);
    const to = new Date(periodEnd);

    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, companyId },
      select: { id: true, code: true, name: true },
    });

    const rows: Array<{
      supplierId: string;
      ordersCount: number;
      ordersOnTime: number;
      rejectedLines: number;
      receivedLines: number;
      totalValue: number;
      avgPrice: number;
      catalogueAvg: number;
    }> = [];

    for (const supplier of suppliers) {
      const orders = await this.prisma.purchaseOrder.findMany({
        where: { tenantId, companyId, supplierId: supplier.id, createdAt: { gte: from, lte: to } },
        include: { items: true },
      });
      const received = orders.filter((o) => o.status === 'received');

      // Kualitas diukur dari barang yang ditolak saat penerimaan; jumlahnya
      // ini dicatat di `qtyRejected` saat proses receive.
      const receivedLines = received.reduce((s, o) => s + o.items.length, 0);
      const rejectedLines = received.reduce(
        (s, o) => s + o.items.reduce((si, i) => si + Number(i.qtyRejected ?? 0), 0),
        0,
      );

      const prices = orders.flatMap((o) => o.items.map((i) => Number(i.price)));
      const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

      // Rata-rata katalog di periode yang sama sebagai pembanding harga.
      const catalogue = await this.prisma.product.findMany({
        where: { tenantId, costPrice: { gt: 0 } },
        select: { costPrice: true },
      });
      const catalogueAvg =
        catalogue.length > 0
          ? catalogue.reduce((s, p) => s + Number(p.costPrice), 0) / catalogue.length
          : 0;

      rows.push({
        supplierId: supplier.id,
        ordersCount: orders.length,
        ordersOnTime: received.length,
        rejectedLines,
        receivedLines,
        totalValue: orders.reduce((s, o) => s + o.items.reduce((si, i) => si + Number(i.qty) * Number(i.price), 0), 0),
        avgPrice,
        catalogueAvg,
      });
    }

    // Normalisasi lintas supplier: skor 0–100.
    const maxValue = Math.max(...rows.map((r) => r.totalValue), 0);
    const results = rows.map((r) => {
      const onTimeScore =
        r.ordersCount > 0 ? roundMoney((r.ordersOnTime / r.ordersCount) * 100) : 0;
      // Kualitas = porsi baris yang diterima penuh. Baris dengan penolakan
      // parsial menurunkan skor secara proporsional.
      const acceptedLines = Math.max(r.receivedLines - r.rejectedLines, 0);
      const qualityScore =
        r.receivedLines > 0 ? roundMoney((acceptedLines / r.receivedLines) * 100) : 100;
      const priceScore =
        r.catalogueAvg > 0 && r.avgPrice > 0
          ? roundMoney(Math.min((r.catalogueAvg / r.avgPrice) * 100, 100))
          : 0;
      const overallScore = roundMoney(onTimeScore * 0.4 + qualityScore * 0.35 + priceScore * 0.25);

      return {
        supplierId: r.supplierId,
        ordersCount: r.ordersCount,
        ordersOnTime: r.ordersOnTime,
        totalValue: roundMoney(r.totalValue),
        onTimeScore,
        qualityScore,
        priceScore,
        overallScore,
        spendSharePct: maxValue > 0 ? roundMoney((r.totalValue / maxValue) * 100) : 0,
      };
    });

    const saved = await this.prisma.$transaction(
      results.map((r) =>
        this.prisma.vendorPerformance.upsert({
          where: {
            tenantId_companyId_supplierId_periodStart: {
              tenantId,
              companyId,
              supplierId: r.supplierId,
              periodStart: from,
            },
          },
          update: {
            periodEnd: to,
            ordersCount: r.ordersCount,
            ordersOnTime: r.ordersOnTime,
            totalValue: new Prisma.Decimal(r.totalValue),
            qualityScore: new Prisma.Decimal(r.qualityScore),
            onTimeScore: new Prisma.Decimal(r.onTimeScore),
            priceScore: new Prisma.Decimal(r.priceScore),
            overallScore: new Prisma.Decimal(r.overallScore),
            computedAt: new Date(),
          },
          create: {
            tenantId,
            companyId,
            supplierId: r.supplierId,
            periodStart: from,
            periodEnd: to,
            ordersCount: r.ordersCount,
            ordersOnTime: r.ordersOnTime,
            totalValue: new Prisma.Decimal(r.totalValue),
            qualityScore: new Prisma.Decimal(r.qualityScore),
            onTimeScore: new Prisma.Decimal(r.onTimeScore),
            priceScore: new Prisma.Decimal(r.priceScore),
            overallScore: new Prisma.Decimal(r.overallScore),
          },
        }),
      ),
    );

    return { periodStart, periodEnd, computed: saved.length, data: results };
  }

  /** Riwayat skor supplier tersimpan, untuk membandingkan antar periode. */
  async vendorScorecardHistory(tenantId: string, supplierId: string, periods = 6) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId, companyId }, select: { id: true } });
    if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan.');
    return this.prisma.vendorPerformance.findMany({
      where: { tenantId, companyId, supplierId },
      orderBy: { periodStart: 'desc' },
      take: Number.isFinite(periods) ? Math.min(Math.max(Math.trunc(periods), 1), 60) : 6,
    });
  }

  async vendorScorecard(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, companyId },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });

    const rows = await this.prisma.purchaseOrder.groupBy({
      by: ['supplierId', 'status'],
      where: { tenantId, companyId },
      _count: { _all: true },
    });

    const receivedBySupplier = new Map<string, { count: number; value: number }>();
    const receivedOrders = await this.prisma.purchaseOrder.findMany({
      where: { tenantId, companyId, status: 'received' },
      select: {
        supplierId: true,
        createdAt: true,
        items: { select: { qty: true, price: true } },
      },
    });
    for (const po of receivedOrders) {
      const current = receivedBySupplier.get(po.supplierId) ?? { count: 0, value: 0 };
      current.count += 1;
      current.value += po.items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
      receivedBySupplier.set(po.supplierId, current);
    }

    const cancelledBySupplier = new Map<string, number>();
    for (const row of rows) {
      if (row.status === 'cancelled') {
        cancelledBySupplier.set(
          row.supplierId,
          (cancelledBySupplier.get(row.supplierId) ?? 0) + row._count._all,
        );
      }
    }

    // Normalisasi nilai: supplier dengan total belanja terbesar = 100.
    const maxValue = Math.max(...[...receivedBySupplier.values()].map((v) => v.value), 1);

    return suppliers.map((s) => {
      const stats = receivedBySupplier.get(s.id);
      const orders = stats?.count ?? 0;
      const value = stats?.value ?? 0;
      const cancelled = cancelledBySupplier.get(s.id) ?? 0;
      const totalOrders = orders + cancelled;
      const onTimeScore = totalOrders === 0 ? null : roundMoney((orders / totalOrders) * 100);
      const priceScore = roundMoney((value / maxValue) * 100);
      const overall =
        onTimeScore === null ? null : roundMoney(onTimeScore * 0.5 + priceScore * 0.5);

      return {
        supplierId: s.id,
        code: s.code,
        name: s.name,
        ordersReceived: orders,
        ordersCancelled: cancelled,
        totalValue: roundMoney(value),
        onTimeScore,
        priceScore,
        overallScore: overall,
      };
    }).sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1));
  }

  // ============================ HELPERS ============================

  private async assertProducts(tenantId: string, productIds: string[]) {
    const unique = [...new Set(productIds)];
    const found = await this.prisma.product.count({ where: { tenantId, id: { in: unique } } });
    if (found !== unique.length) {
      throw new NotFoundException('Ada produk yang tidak ditemukan pada katalog tenant ini.');
    }
  }

  private async assertTransfer(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId, companyId },
      include: {
        lines: { include: { product: { select: { name: true, unit: true } } } },
        fromWarehouse: true,
        toWarehouse: true,
      },
    });
    if (!transfer) throw new NotFoundException('Transfer stok tidak ditemukan.');
    return transfer;
  }

  private async nextCode(
    tx: Prisma.TransactionClient,
    kind: string,
    prefix: string,
    tenantId: string,
    companyId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      const counter = await tx.documentSequence.upsert({
        where: { tenantId_companyId_kind: { tenantId, companyId, kind } },
        update: { nextValue: { increment: 1 } },
        create: { tenantId, companyId, kind, nextValue: 2 },
      });
      const candidate = `${prefix}-${year}-${String(counter.nextValue - 1).padStart(5, '0')}`;
      // Dua model punya where yang berbeda, jadi dicek terpisah agar tipe
      // Prisma tetap narrow.
      const exists =
        kind === 'requisition'
          ? await tx.purchaseRequisition.findFirst({
              where: { tenantId, companyId, code: candidate },
              select: { id: true },
            })
          : await tx.stockTransfer.findFirst({
              where: { tenantId, companyId, code: candidate },
              select: { id: true },
            });
      if (!exists) return candidate;
    }
    throw new ConflictException('Gagal membuat nomor dokumen, coba lagi.');
  }
}

/** Gabungkan baris dengan produk sama (qty dijumlah): tabel baris punya unique (dokumen, produk). */
function mergeLines<T extends { productId: string; qty: number }>(lines: T[]): Array<{ productId: string; qty: number }> {
  const byProduct = new Map<string, number>();
  for (const l of lines) byProduct.set(l.productId, roundMoney((byProduct.get(l.productId) ?? 0) + l.qty));
  return [...byProduct].map(([productId, qty]) => ({ productId, qty }));
}
