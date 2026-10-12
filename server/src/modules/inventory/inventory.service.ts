import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { JournalService } from '../accounting/journal.service';
import {
  OPENING_EQUITY_ACCOUNT,
  postInventoryValueJournal,
  valueOfAdjustment,
} from './inventory-adjustment';
import { isUniqueViolation } from './tx-retry';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
  ) {}

  // Normalisasi paginasi: page >= 1, limit 1..100 (default 20)
  private paging(page?: number, limit?: number) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    return { page: p, limit: l, skip: (p - 1) * l, take: l };
  }

  // ============================== PRODUK ==============================

  async listProducts(tenantId: string, query: ProductQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const { page, limit, skip, take } = this.paging(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.productType ? { productType: query.productType } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { sku: { contains: query.q, mode: 'insensitive' as const } },
              { barcode: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: true, stocks: { where: { tenantId, companyId } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    // Tambahkan totalStock: jumlah quantity seluruh gudang (Decimal -> Number)
    const data = rows.map((p) => ({
      ...p,
      totalStock: p.stocks.reduce((s, st) => s + Number(st.quantity), 0),
      avgCost: p.stocks.length
        ? p.stocks.reduce((s, st) => s + Number(st.avgCost) * Number(st.quantity), 0) /
          Math.max(
            p.stocks.reduce((s, st) => s + Number(st.quantity), 0),
            Number.EPSILON,
          )
        : 0,
    }));

    return { data, meta: { page, limit, total } };
  }

  async createProduct(tenantId: string, dto: CreateProductDto, actorId?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const sku = dto.sku?.trim() || `SKU-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;

    const dup = await this.prisma.product.findFirst({ where: { tenantId, sku } });
    if (dup) throw new ConflictException('SKU sudah digunakan produk lain.');

    const barcode = dto.barcode?.trim() || null;
    if (barcode) {
      const dupBarcode = await this.prisma.product.findFirst({
        where: { tenantId, barcode },
        select: { sku: true },
      });
      if (dupBarcode) {
        throw new ConflictException(`Barcode sudah dipakai produk ${dupBarcode.sku}.`);
      }
    }

    if (dto.categoryId) {
      const cat = await this.prisma.productCategory.findFirst({
        where: { id: dto.categoryId, tenantId },
      });
      if (!cat) throw new NotFoundException('Kategori tidak ditemukan.');
    }
    await this.assertSupplierValid(tenantId, companyId, dto.preferredSupplierId);

    const initialStock = dto.initialStock && dto.initialStock > 0 ? dto.initialStock : 0;
    if (initialStock > 0 && !dto.warehouseId) {
      throw new BadRequestException('Stok awal membutuhkan gudang tujuan (warehouseId).');
    }
    if (initialStock > 0) {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, tenantId, companyId },
      });
      if (!wh) throw new NotFoundException('Gudang tidak ditemukan.');
    }

    try {
      // Produk, stok awal, StockMovement, dan jurnal modal awal satu transaksi:
      // stok awal bernilai tidak boleh ada di subledger tanpa jejak di GL.
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            tenantId,
            sku,
            name: dto.name,
            categoryId: dto.categoryId ?? null,
            productType: dto.productType ?? 'goods',
            unit: dto.unit ?? 'pcs',
            sellPrice: dto.sellPrice,
            costPrice: dto.costPrice ?? 0,
            reorderPoint: dto.reorderPoint ?? 0,
            reorderQty: dto.reorderQty ?? 0,
            preferredSupplierId: dto.preferredSupplierId || null,
            barcode,
          },
        });

        if (initialStock > 0 && dto.warehouseId) {
          const unitCost = dto.costPrice ?? 0;
          const refId = randomUUID();
          await tx.inventoryStock.create({
            data: {
              tenantId,
              companyId,
              productId: product.id,
              warehouseId: dto.warehouseId,
              quantity: initialStock,
              avgCost: unitCost,
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              companyId,
              productId: product.id,
              warehouseId: dto.warehouseId,
              type: 'adjustment',
              quantity: initialStock,
              note: 'Stok awal produk baru',
              refId,
            },
          });
          await postInventoryValueJournal(tx, this.journals, {
            tenantId,
            companyId,
            sourceModule: 'inventory-adjustment',
            sourceRefId: refId,
            memo: `Stok awal ${sku}`,
            gain: valueOfAdjustment(initialStock, unitCost),
            loss: 0,
            counter: OPENING_EQUITY_ACCOUNT,
            actorId,
          });
        }
        return product;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('SKU atau barcode sudah digunakan produk lain.');
      }
      throw error;
    }
  }

  // Lookup cepat untuk scan di POS: by barcode ATAU sku
  async lookupProduct(tenantId: string, query: ProductLookupQueryDto) {
    if (!query.barcode && !query.sku) {
      throw new BadRequestException('Parameter barcode atau sku wajib diisi.');
    }
    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        isActive: true,
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
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        stocks: { where: { companyId }, include: { warehouse: true } },
        movements: { where: { companyId }, orderBy: { createdAt: 'desc' }, take: 10 },
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

    if (dto.barcode !== undefined && dto.barcode && dto.barcode !== product.barcode) {
      const dup = await this.prisma.product.findFirst({
        where: { tenantId, barcode: dto.barcode, id: { not: id } },
        select: { sku: true },
      });
      if (dup) {
        throw new ConflictException(`Barcode sudah dipakai produk ${dup.sku}.`);
      }
    }

    if (dto.categoryId) {
      const cat = await this.prisma.productCategory.findFirst({
        where: { id: dto.categoryId, tenantId },
      });
      if (!cat) throw new NotFoundException('Kategori tidak ditemukan.');
    }
    if (dto.preferredSupplierId) {
      await this.assertSupplierValid(tenantId, await defaultCompanyId(this.prisma, tenantId), dto.preferredSupplierId);
    }

    try {
      return await this.prisma.product.update({
      where: { id: product.id },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.productType !== undefined ? { productType: dto.productType } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.sellPrice !== undefined ? { sellPrice: dto.sellPrice } : {}),
        ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
      ...(dto.reorderPoint !== undefined ? { reorderPoint: dto.reorderPoint } : {}),
      ...(dto.reorderQty !== undefined ? { reorderQty: dto.reorderQty } : {}),
      ...(dto.preferredSupplierId !== undefined ? { preferredSupplierId: dto.preferredSupplierId || null } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('SKU atau barcode sudah digunakan produk lain.');
      throw error;
    }
  }

  /** Pemasok utama harus milik tenant & company yang sama; tanpa ini FK komposit gagal sebagai 500. */
  private async assertSupplierValid(tenantId: string, companyId: string, supplierId?: string | null) {
    if (!supplierId) return;
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId, companyId },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Pemasok utama tidak ditemukan.');
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

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    await this.assertCategoryParentValid(tenantId, null, dto.parentId);
    return this.prisma.productCategory.create({
      data: { tenantId, name: dto.name, parentId: dto.parentId ?? null },
    });
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateCategoryDto) {
    const cat = await this.prisma.productCategory.findFirst({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Kategori tidak ditemukan.');
    if (dto.parentId !== undefined) {
      await this.assertCategoryParentValid(tenantId, cat.id, dto.parentId);
    }
    return this.prisma.productCategory.update({
      where: { id: cat.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
    });
  }

  /**
   * parentId harus menunjuk kategori milik tenant yang sama dan tidak boleh
   * membentuk siklus (A -> B -> A), yang membuat hierarki tak terhingga.
   */
  private async assertCategoryParentValid(
    tenantId: string,
    selfId: string | null,
    parentId: string | undefined,
  ): Promise<void> {
    if (parentId === undefined || parentId === null) return;
    if (selfId && parentId === selfId) {
      throw new BadRequestException('Kategori tidak dapat menjadi induk dirinya sendiri.');
    }
    const parent = await this.prisma.productCategory.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new BadRequestException('Kategori induk tidak ditemukan pada tenant ini.');

    if (selfId) {
      let cursor: string | null = parent.parentId;
      const seen = new Set<string>([selfId]);
      while (cursor) {
        if (cursor === selfId) {
          throw new BadRequestException('Perubahan kategori induk akan membentuk siklus.');
        }
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const next: { parentId: string | null } | null = await this.prisma.productCategory.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = next?.parentId ?? null;
      }
    }
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

  async listWarehouses(tenantId: string, isActive?: boolean) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.warehouse.findMany({
      where: {
        tenantId,
        companyId,
        ...(isActive === undefined ? {} : { isActive }),
      },
      include: { outlet: true },
      orderBy: { code: 'asc' },
    });
  }

  async createWarehouse(tenantId: string, dto: CreateWarehouseDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertOutletValid(tenantId, dto.outletId);
    try {
      return await this.prisma.warehouse.create({
        data: {
          tenantId,
          companyId,
          code: dto.code,
          name: dto.name,
          location: dto.location ?? '',
          outletId: dto.outletId ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Kode gudang "${dto.code}" sudah dipakai.`);
      }
      throw error;
    }
  }

  async updateWarehouse(tenantId: string, id: string, dto: UpdateWarehouseDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const wh = await this.prisma.warehouse.findFirst({ where: { id, tenantId, companyId } });
    if (!wh) throw new NotFoundException('Gudang tidak ditemukan.');
    if (dto.outletId !== undefined) {
      await this.assertOutletValid(tenantId, dto.outletId);
    }
    return this.prisma.warehouse.update({
      where: { id: wh.id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.outletId !== undefined ? { outletId: dto.outletId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /** outletId harus milik tenant yang sama — mencegah FK lintas tenant. */
  private async assertOutletValid(tenantId: string, outletId?: string | null): Promise<void> {
    if (outletId === undefined || outletId === null) return;
    const found = await this.prisma.outlet.findFirst({
      where: { id: outletId, tenantId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Outlet tidak ditemukan pada tenant ini.');
  }

  // ============================== STOK ==============================

  async listStock(tenantId: string, query: StockQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const rows = await this.prisma.inventoryStock.findMany({
      where: { tenantId, companyId, ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true, sellPrice: true } },
        warehouse: true,
      },
    });
    // Flag low: stok di bawah/ sama dengan ambang minimum
    return rows.map((s) => ({ ...s, low: Number(s.quantity) <= Number(s.minThreshold) }));
  }

  async lowStock(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    // Ambang minimum disimpan per baris stok, jadi filter dilakukan di JS
    const rows = await this.prisma.inventoryStock.findMany({
      where: { tenantId, companyId },
      include: { product: true, warehouse: true },
    });
    return rows
      .filter((s) => Number(s.quantity) <= Number(s.minThreshold))
      .sort((a, b) => Number(a.quantity) - Number(b.quantity));
  }

  /**
   * Penyesuaian stok manual (qty bertanda). Mengubah NILAI persediaan, jadi
   * dijurnal (Dr/Cr Persediaan vs Selisih Persediaan) dalam transaksi yang sama.
   * Stok tidak boleh menjadi negatif: pengurangan memakai update bersyarat
   * sehingga dua penyesuaian paralel tidak bisa sama-sama lolos.
   */
  async adjustStock(tenantId: string, dto: AdjustStockDto, actorId?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (dto.qty === 0) {
      throw new BadRequestException('Jumlah penyesuaian tidak boleh nol.');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId },
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, companyId },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan.');

    const key = {
      tenantId_companyId_productId_warehouseId: {
        tenantId,
        companyId,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
      },
    };
    const refId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.inventoryStock.findUnique({
        where: key,
        select: { quantity: true, avgCost: true },
      });
      const avg = Number(current?.avgCost ?? 0);
      const unitCost = avg > 0 ? avg : Number(product.costPrice);

      let stock;
      if (dto.qty < 0) {
        const taken = await tx.inventoryStock.updateMany({
          where: {
            tenantId,
            companyId,
            productId: dto.productId,
            warehouseId: dto.warehouseId,
            quantity: { gte: new Prisma.Decimal(-dto.qty) },
          },
          data: { quantity: { decrement: new Prisma.Decimal(-dto.qty) } },
        });
        if (taken.count !== 1) {
          throw new BadRequestException(
            `Stok tidak cukup untuk dikurangi ${-dto.qty} (tersedia ${Number(current?.quantity ?? 0)}).`,
          );
        }
        stock = await tx.inventoryStock.findUniqueOrThrow({ where: key });
      } else {
        stock = await tx.inventoryStock.upsert({
          where: key,
          create: {
            tenantId,
            companyId,
            productId: dto.productId,
            warehouseId: dto.warehouseId,
            quantity: dto.qty,
            avgCost: unitCost,
          },
          update: {
            quantity: { increment: dto.qty },
            // Stok tak bernilai yang kini bertambah memakai harga pokok master.
            ...(avg <= 0 && unitCost > 0 ? { avgCost: unitCost } : {}),
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          tenantId,
          companyId,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          type: 'adjustment',
          quantity: dto.qty,
          note: dto.note ?? 'Penyesuaian manual',
          refId,
        },
      });

      const value = valueOfAdjustment(dto.qty, unitCost);
      await postInventoryValueJournal(tx, this.journals, {
        tenantId,
        companyId,
        sourceModule: 'inventory-adjustment',
        sourceRefId: refId,
        memo: `Penyesuaian stok ${product.sku}: ${dto.note ?? 'manual'}`,
        gain: value > 0 ? value : 0,
        loss: value < 0 ? -value : 0,
        actorId,
      });
      return stock;
    });
  }

  // ============================== PERGERAKAN STOK ==============================

  async listMovements(tenantId: string, query: MovementQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const { page, limit, skip, take } = this.paging(query.page, query.limit);
    const where = { tenantId, companyId, ...(query.productId ? { productId: query.productId } : {}) };

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
