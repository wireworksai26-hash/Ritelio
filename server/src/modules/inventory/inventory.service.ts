import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type {
  AdjustStockDto,
  CreateCategoryDto,
  CreateProductDto,
  CreateWarehouseDto,
  MovementQueryDto,
  ProductLookupQueryDto,
  ProductQueryDto,
  StockQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateWarehouseDto,
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // Normalisasi paginasi: page >= 1, limit 1..100 (default 20)
  private paging(page?: number, limit?: number) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    return { page: p, limit: l, skip: (p - 1) * l, take: l };
  }

  // ============================== PRODUK ==============================

  async listProducts(tenantId: string, query: ProductQueryDto) {
    const { page, limit, skip, take } = this.paging(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { sku: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: true, stocks: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    // Tambahkan totalStock: jumlah quantity seluruh gudang (Decimal -> Number)
    const data = rows.map((p) => ({
      ...p,
      totalStock: p.stocks.reduce((s, st) => s + Number(st.quantity), 0),
    }));

    return { data, meta: { page, limit, total } };
  }

  async createProduct(tenantId: string, dto: CreateProductDto) {
    const sku = dto.sku?.trim() || `SKU-${Date.now().toString(36).toUpperCase()}`;

    const dup = await this.prisma.product.findFirst({ where: { tenantId, sku } });
    if (dup) throw new ConflictException('SKU sudah digunakan produk lain.');

    if (dto.categoryId) {
      const cat = await this.prisma.productCategory.findFirst({
        where: { id: dto.categoryId, tenantId },
      });
      if (!cat) throw new NotFoundException('Kategori tidak ditemukan.');
    }

    if (dto.initialStock && dto.initialStock > 0 && dto.warehouseId) {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, tenantId },
      });
      if (!wh) throw new NotFoundException('Gudang tidak ditemukan.');
    }

    const product = await this.prisma.product.create({
      data: {
        tenantId,
        sku,
        name: dto.name,
        categoryId: dto.categoryId ?? null,
        unit: dto.unit ?? 'pcs',
        sellPrice: dto.sellPrice,
        costPrice: dto.costPrice ?? 0,
        barcode: dto.barcode ?? null,
      },
    });

    if (dto.initialStock && dto.initialStock > 0 && dto.warehouseId) {
      await this.prisma.inventoryStock.create({
        data: {
          tenantId,
          productId: product.id,
          warehouseId: dto.warehouseId,
          quantity: dto.initialStock,
        },
      });
    }

    return product;
  }

  // Lookup cepat untuk scan di POS: by barcode ATAU sku
  async lookupProduct(tenantId: string, query: ProductLookupQueryDto) {
    if (!query.barcode && !query.sku) {
      throw new BadRequestException('Parameter barcode atau sku wajib diisi.');
    }
    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        OR: [
          ...(query.barcode ? [{ barcode: query.barcode }] : []),
          ...(query.sku ? [{ sku: query.sku }] : []),
        ],
      },
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');
    return product;
  }

  async getProduct(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        stocks: { include: { warehouse: true } },
        movements: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');
    return product;
  }

  async updateProduct(tenantId: string, id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');

    if (dto.sku && dto.sku !== product.sku) {
      const dup = await this.prisma.product.findFirst({
        where: { tenantId, sku: dto.sku, id: { not: id } },
      });
      if (dup) throw new ConflictException('SKU sudah digunakan produk lain.');
    }

    if (dto.categoryId) {
      const cat = await this.prisma.productCategory.findFirst({
        where: { id: dto.categoryId, tenantId },
      });
      if (!cat) throw new NotFoundException('Kategori tidak ditemukan.');
    }

    return this.prisma.product.update({
      where: { id: product.id },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.sellPrice !== undefined ? { sellPrice: dto.sellPrice } : {}),
        ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeProduct(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, tenantId } });
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');
    // Soft delete: produk dinonaktifkan, riwayat tetap terjaga
    await this.prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
    return { ok: true };
  }

  // ============================== KATEGORI ==============================

  listCategories(tenantId: string) {
    return this.prisma.productCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  createCategory(tenantId: string, dto: CreateCategoryDto) {
    return this.prisma.productCategory.create({
      data: { tenantId, name: dto.name, parentId: dto.parentId ?? null },
    });
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateCategoryDto) {
    const cat = await this.prisma.productCategory.findFirst({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Kategori tidak ditemukan.');
    return this.prisma.productCategory.update({
      where: { id: cat.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
    });
  }

  async removeCategory(tenantId: string, id: string) {
    const cat = await this.prisma.productCategory.findFirst({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Kategori tidak ditemukan.');
    const used = await this.prisma.product.count({ where: { tenantId, categoryId: id } });
    if (used > 0) throw new ConflictException('Kategori masih dipakai produk.');
    await this.prisma.productCategory.delete({ where: { id: cat.id } });
    return { ok: true };
  }

  // ============================== GUDANG ==============================

  listWarehouses(tenantId: string) {
    return this.prisma.warehouse.findMany({
      where: { tenantId },
      include: { outlet: true },
      orderBy: { name: 'asc' },
    });
  }

  createWarehouse(tenantId: string, dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: {
        tenantId,
        name: dto.name,
        location: dto.location ?? '',
        outletId: dto.outletId ?? null,
      },
    });
  }

  async updateWarehouse(tenantId: string, id: string, dto: UpdateWarehouseDto) {
    const wh = await this.prisma.warehouse.findFirst({ where: { id, tenantId } });
    if (!wh) throw new NotFoundException('Gudang tidak ditemukan.');
    return this.prisma.warehouse.update({
      where: { id: wh.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.outletId !== undefined ? { outletId: dto.outletId } : {}),
      },
    });
  }

  // ============================== STOK ==============================

  async listStock(tenantId: string, query: StockQueryDto) {
    const rows = await this.prisma.inventoryStock.findMany({
      where: { tenantId, ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true, sellPrice: true } },
        warehouse: true,
      },
    });
    // Flag low: stok di bawah/ sama dengan ambang minimum
    return rows.map((s) => ({ ...s, low: Number(s.quantity) <= Number(s.minThreshold) }));
  }

  async lowStock(tenantId: string) {
    // Ambang minimum disimpan per baris stok, jadi filter dilakukan di JS
    const rows = await this.prisma.inventoryStock.findMany({
      where: { tenantId },
      include: { product: true, warehouse: true },
    });
    return rows
      .filter((s) => Number(s.quantity) <= Number(s.minThreshold))
      .sort((a, b) => Number(a.quantity) - Number(b.quantity));
  }

  async adjustStock(tenantId: string, dto: AdjustStockDto) {
    if (dto.qty === 0) {
      throw new BadRequestException('Jumlah penyesuaian tidak boleh nol.');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId },
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan.');

    const [stock] = await this.prisma.$transaction([
      this.prisma.inventoryStock.upsert({
        where: {
          productId_warehouseId: { productId: dto.productId, warehouseId: dto.warehouseId },
        },
        create: { tenantId, productId: dto.productId, warehouseId: dto.warehouseId, quantity: dto.qty },
        update: { quantity: { increment: dto.qty } },
      }),
      this.prisma.stockMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          type: 'adjustment',
          quantity: dto.qty,
          note: dto.note ?? 'Penyesuaian manual',
          refId: null,
        },
      }),
    ]);

    return stock;
  }

  // ============================== PERGERAKAN STOK ==============================

  async listMovements(tenantId: string, query: MovementQueryDto) {
    const { page, limit, skip, take } = this.paging(query.page, query.limit);
    const where = { tenantId, ...(query.productId ? { productId: query.productId } : {}) };

    const [total, data] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { name: true } },
          warehouse: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return { data, meta: { page, limit, total } };
  }
}
