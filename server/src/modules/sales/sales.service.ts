import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { CreateTransactionDto, SyncResultItem } from './dto/transaction.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private async accountId(tenantId: string, code: string): Promise<string | null> {
    const acc = await this.prisma.chartOfAccount.findFirst({ where: { tenantId, code } });
    return acc?.id ?? null;
  }

  /** Gudang tujuan transaksi: gudang milik outlet, fallback gudang pertama tenant. */
  private async resolveWarehouse(tenantId: string, outletId?: string): Promise<string | null> {
    if (outletId) {
      const wh = await this.prisma.warehouse.findFirst({ where: { tenantId, outletId } });
      if (wh) return wh.id;
    }
    const wh = await this.prisma.warehouse.findFirst({ where: { tenantId } });
    return wh?.id ?? null;
  }

  /**
   * Satu transaksi POS (offline-first):
   * - Idempoten via clientGeneratedId (retry sync aman)
   * - Stok cukup  -> confirmed: stok berkurang, movement tercatat, jurnal otomatis, poin loyalitas
   * - Stok kurang -> needs_review + notifikasi; TIDAK pernah auto-reject (TRD)
   */
  async processOne(user: AuthUser, dto: CreateTransactionDto): Promise<SyncResultItem> {
    const tenantId = user.tenantId;

    const existing = await this.prisma.salesTransaction.findFirst({
      where: { tenantId, clientGeneratedId: dto.clientGeneratedId },
    });
    if (existing) {
      return {
        clientId: dto.clientGeneratedId,
        serverId: existing.id,
        status: 'duplicate',
        message: 'Transaksi sudah tersimpan sebelumnya.',
      };
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { tenantId, id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const missing = productIds.filter((id) => !productMap.has(id));
    const total = dto.items.reduce((s, i) => s + i.qty * i.price, 0);
    const cogs = dto.items.reduce(
      (s, i) => s + i.qty * Number(productMap.get(i.productId)?.costPrice ?? 0),
      0,
    );
    const warehouseId = await this.resolveWarehouse(tenantId, dto.outletId);

    // Cek stok per item di gudang terkait
    let conflictReason: string | null = null;
    if (missing.length > 0) {
      conflictReason = 'Ada produk yang tidak ditemukan di katalog tenant ini.';
    } else if (warehouseId) {
      for (const item of dto.items) {
        const stock = await this.prisma.inventoryStock.findUnique({
          where: { productId_warehouseId: { productId: item.productId, warehouseId } },
        });
        const available = Number(stock?.quantity ?? 0);
        if (available < item.qty) {
          conflictReason = `Stok "${productMap.get(item.productId)?.name}" tidak cukup (tersedia ${available}, diminta ${item.qty}).`;
          break;
        }
      }
    }

    // ── Jalur konflik: simpan sebagai needs_review + notifikasi ──
    if (conflictReason) {
      const tx = await this.prisma.salesTransaction.create({
        data: {
          tenantId,
          outletId: dto.outletId ?? null,
          cashierId: user.sub,
          customerId: dto.customerId ?? null,
          clientGeneratedId: dto.clientGeneratedId,
          syncStatus: 'needs_review',
          clientTimestamp: new Date(dto.clientTimestamp),
          total,
          paymentMethod: dto.paymentMethod,
          items: {
            create: dto.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })),
          },
        },
      });
      await this.prisma.notification.create({
        data: {
          tenantId,
          type: 'sync_conflict',
          title: 'Transaksi perlu ditinjau',
          body: `${conflictReason} Transaksi ${dto.clientGeneratedId} menunggu review.`,
          link: '/app/pos',
        },
      });
      return {
        clientId: dto.clientGeneratedId,
        serverId: tx.id,
        status: 'conflict',
        message: conflictReason,
      };
    }

    // ── Jalur normal: atomic — transaksi + stok + movement + jurnal ──
    const [cashAcc, revenueAcc, cogsAcc, inventoryAcc] = await Promise.all([
      this.accountId(tenantId, '1000'),
      this.accountId(tenantId, '4000'),
      this.accountId(tenantId, '5000'),
      this.accountId(tenantId, '1100'),
    ]);

    const created = await this.prisma.$transaction(async (trx) => {
      const tx = await trx.salesTransaction.create({
        data: {
          tenantId,
          outletId: dto.outletId ?? null,
          cashierId: user.sub,
          customerId: dto.customerId ?? null,
          clientGeneratedId: dto.clientGeneratedId,
          syncStatus: 'synced',
          clientTimestamp: new Date(dto.clientTimestamp),
          serverTimestamp: new Date(),
          total,
          paymentMethod: dto.paymentMethod,
          items: {
            create: dto.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })),
          },
        },
      });

      if (warehouseId) {
        for (const item of dto.items) {
          await trx.inventoryStock.upsert({
            where: { productId_warehouseId: { productId: item.productId, warehouseId } },
            update: { quantity: { decrement: item.qty } },
            create: { tenantId, productId: item.productId, warehouseId, quantity: -item.qty },
          });
          await trx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              warehouseId,
              type: 'sale',
              quantity: -item.qty,
              note: 'Penjualan POS',
              refId: tx.id,
            },
          });
        }
      }

      // Jurnal otomatis: Kas/Pendapatan + HPP/Persediaan
      const entries: Prisma.FinancialEntryCreateManyInput[] = [];
      if (cashAcc && revenueAcc) {
        entries.push({
          tenantId,
          sourceModule: 'pos',
          sourceRefId: tx.id,
          debitAccountId: cashAcc,
          creditAccountId: revenueAcc,
          amount: total,
          entryDate: new Date(dto.clientTimestamp),
        });
      }
      if (cogsAcc && inventoryAcc && cogs > 0) {
        entries.push({
          tenantId,
          sourceModule: 'pos',
          sourceRefId: tx.id,
          debitAccountId: cogsAcc,
          creditAccountId: inventoryAcc,
          amount: cogs,
          entryDate: new Date(dto.clientTimestamp),
        });
      }
      if (entries.length > 0) await trx.financialEntry.createMany({ data: entries });

      // Poin loyalitas mini-CRM: 1 poin per Rp 10.000
      if (dto.customerId) {
        await trx.customer.updateMany({
          where: { id: dto.customerId, tenantId },
          data: { loyaltyPoints: { increment: Math.floor(total / 10000) } },
        });
      }

      return tx;
    });

    return { clientId: dto.clientGeneratedId, serverId: created.id, status: 'confirmed' };
  }

  /** Batch sync dari antrean offline client. */
  async processBatch(user: AuthUser, transactions: CreateTransactionDto[]) {
    const results: SyncResultItem[] = [];
    for (const dto of transactions) {
      results.push(await this.processOne(user, dto));
    }
    return {
      results,
      summary: {
        confirmed: results.filter((r) => r.status === 'confirmed').length,
        conflict: results.filter((r) => r.status === 'conflict').length,
        duplicate: results.filter((r) => r.status === 'duplicate').length,
      },
    };
  }

  async list(
    tenantId: string,
    query: { outletId?: string; syncStatus?: string; from?: string; to?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const where: Prisma.SalesTransactionWhereInput = {
      tenantId,
      ...(query.outletId ? { outletId: query.outletId } : {}),
      ...(query.syncStatus ? { syncStatus: query.syncStatus as never } : {}),
      ...(query.from || query.to
        ? {
            clientTimestamp: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.salesTransaction.findMany({
        where,
        include: { items: { include: { product: { select: { name: true } } } } },
        orderBy: { clientTimestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.salesTransaction.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async detail(tenantId: string, id: string) {
    return this.prisma.salesTransaction.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { product: true } },
        outlet: { select: { name: true } },
        cashier: { select: { name: true } },
        customer: { select: { name: true } },
      },
    });
  }
}
