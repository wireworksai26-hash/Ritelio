import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type {
  CreatePODto,
  CreateSupplierDto,
  OrderQueryDto,
  POItemDto,
  UpdatePODto,
  UpdateSupplierDto,
} from './dto/purchasing.dto';

// Include standar PO: pemasok, gudang, dan item beserta produknya
const PO_INCLUDE = {
  supplier: { select: { name: true } },
  warehouse: { select: { name: true } },
  items: { include: { product: { select: { id: true, name: true, unit: true } } } },
} as const;

@Injectable()
export class PurchasingService {
  constructor(private readonly prisma: PrismaService) {}

  private paging(page?: number, limit?: number) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    return { page: p, limit: l, skip: (p - 1) * l, take: l };
  }

  // Total nilai PO: jumlah qty x price seluruh item (Decimal -> Number)
  private withTotal<T extends { items: { qty: unknown; price: unknown }[] }>(po: T) {
    return {
      ...po,
      totalValue: po.items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0),
    };
  }

  // ============================== PEMASOK ==============================

  listSuppliers(tenantId: string) {
    return this.prisma.supplier.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  createSupplier(tenantId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: { tenantId, name: dto.name, contact: dto.contact ?? '' },
    });
  }

  async updateSupplier(tenantId: string, id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan.');
    return this.prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.contact !== undefined ? { contact: dto.contact } : {}),
      },
    });
  }

  async removeSupplier(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan.');
    const used = await this.prisma.purchaseOrder.count({ where: { tenantId, supplierId: id } });
    if (used > 0) throw new ConflictException('Pemasok masih memiliki pesanan pembelian.');
    await this.prisma.supplier.delete({ where: { id: supplier.id } });
    return { ok: true };
  }

  // ============================== PURCHASE ORDER ==============================

  async listOrders(tenantId: string, query: OrderQueryDto) {
    const { page, limit, skip, take } = this.paging(query.page, query.limit);
    const where = { tenantId, ...(query.status ? { status: query.status } : {}) };

    const [total, rows] = await Promise.all([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        include: PO_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return { data: rows.map((po) => this.withTotal(po)), meta: { page, limit, total } };
  }

  async getOrder(tenantId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: PO_INCLUDE,
    });
    if (!po) throw new NotFoundException('Pesanan pembelian tidak ditemukan.');
    return this.withTotal(po);
  }

  // Validasi seluruh item produk milik tenant, melempar error bila ada yang asing
  private async assertProducts(tenantId: string, items: POItemDto[]) {
    const ids = [...new Set(items.map((i) => i.productId))];
    const found = await this.prisma.product.count({ where: { tenantId, id: { in: ids } } });
    if (found !== ids.length) {
      throw new NotFoundException('Ada produk yang tidak ditemukan.');
    }
  }

  async createOrder(tenantId: string, dto: CreatePODto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId },
    });
    if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan.');

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan.');

    await this.assertProducts(tenantId, dto.items);

    // Nomor urut PO per tahun per tenant: PO-<tahun>-001, dst.
    const tahun = new Date().getFullYear();
    const prefix = `PO-${tahun}-`;
    const countTahunIni = await this.prisma.purchaseOrder.count({
      where: { tenantId, code: { startsWith: prefix } },
    });
    const code = `${prefix}${String(countTahunIni + 1).padStart(3, '0')}`;

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        code,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        status: dto.status ?? 'draft',
        items: {
          create: dto.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })),
        },
      },
      include: PO_INCLUDE,
    });
  }

  async updateOrder(tenantId: string, id: string, dto: UpdatePODto) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
    if (!po) throw new NotFoundException('Pesanan pembelian tidak ditemukan.');
    if (po.status !== 'draft' && po.status !== 'ordered') {
      throw new BadRequestException('PO yang sudah diterima/dibatalkan tidak bisa diubah.');
    }

    if (dto.items) await this.assertProducts(tenantId, dto.items);

    // Ubah status dan/atau ganti item secara atomik
    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.purchaseOrderItem.deleteMany({ where: { poId: po.id } });
        await tx.purchaseOrderItem.createMany({
          data: dto.items.map((i) => ({
            poId: po.id,
            productId: i.productId,
            qty: i.qty,
            price: i.price,
          })),
        });
      }
      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: { ...(dto.status !== undefined ? { status: dto.status } : {}) },
        include: PO_INCLUDE,
      });
    });
  }

  // Penerimaan barang: stok bertambah, movement tercatat, jurnal dibuat, status received
  async receiveOrder(tenantId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('Pesanan pembelian tidak ditemukan.');
    if (po.status !== 'ordered') {
      throw new BadRequestException('Hanya PO berstatus Dipesan yang bisa diterima.');
    }

    const totalValue = po.items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);

    // Akun jurnal opsional: jurnal hanya dibuat bila kedua akun tersedia di tenant
    const [persediaan, hutang] = await Promise.all([
      this.prisma.chartOfAccount.findFirst({ where: { tenantId, code: '1100' } }),
      this.prisma.chartOfAccount.findFirst({ where: { tenantId, code: '2000' } }),
    ]);

    return this.prisma.$transaction(async (tx) => {
      for (const item of po.items) {
        await tx.inventoryStock.upsert({
          where: {
            productId_warehouseId: { productId: item.productId, warehouseId: po.warehouseId },
          },
          create: {
            tenantId,
            productId: item.productId,
            warehouseId: po.warehouseId,
            quantity: item.qty,
          },
          update: { quantity: { increment: item.qty } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId: po.warehouseId,
            type: 'purchase',
            quantity: item.qty,
            note: `Penerimaan ${po.code}`,
            refId: po.id,
          },
        });
      }

      if (persediaan && hutang) {
        await tx.financialEntry.create({
          data: {
            tenantId,
            sourceModule: 'inventory',
            sourceRefId: po.id,
            debitAccountId: persediaan.id,
            creditAccountId: hutang.id,
            amount: totalValue,
            entryDate: new Date(),
          },
        });
      }

      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: 'received' },
        include: PO_INCLUDE,
      });
    });
  }
}
