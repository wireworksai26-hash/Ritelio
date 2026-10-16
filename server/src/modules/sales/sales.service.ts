import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { JournalService } from '../accounting/journal.service';
import { ReceivablesService } from '../receivables/receivables.service';
import type { CreateTransactionDto, SyncResultItem } from './dto/transaction.dto';

// Batas atas harga per item — mencegah overflow Decimal(14,2) dari klien.
const MAX_ITEM_PRICE = 1_000_000_000;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
    private readonly receivables: ReceivablesService,
  ) {}

  private async accountId(tenantId: string, companyId: string, code: string): Promise<string | null> {
    const acc = await this.prisma.chartOfAccount.findFirst({ where: { tenantId, companyId, code } });
    return acc?.id ?? null;
  }

  /** Gudang tujuan transaksi: gudang milik outlet, fallback gudang pertama tenant. */
  private async resolveWarehouse(tenantId: string, companyId: string, outletId?: string): Promise<string | null> {
    if (outletId) {
      const wh = await this.prisma.warehouse.findFirst({ where: { tenantId, companyId, outletId } });
      if (wh) return wh.id;
    }
    const wh = await this.prisma.warehouse.findFirst({ where: { tenantId, companyId } });
    return wh?.id ?? null;
  }

  /** Buang nilai tanggal tidak valid agar tidak membuat Invalid Date -> 500. */
  private safeDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  /**
   * Satu transaksi POS (offline-first):
   * - Idempoten via clientGeneratedId (retry sync aman)
   * - Stok cukup  -> confirmed: stok berkurang, movement tercatat, jurnal otomatis, poin loyalitas
   * - Stok kurang -> needs_review + notifikasi; TIDAK pernah auto-reject (TRD)
   */
  async processOne(user: AuthUser, dto: CreateTransactionDto): Promise<SyncResultItem> {
    const tenantId = user.tenantId;
    const companyId = await defaultCompanyId(this.prisma, tenantId);

    // Idempoten: unique index (tenantId, clientGeneratedId) yang menjadi penjaga
    // sesungguhnya, menangani dua request retry yang identik.
    const existing = await this.prisma.salesTransaction.findFirst({
      where: { tenantId, companyId, clientGeneratedId: dto.clientGeneratedId },
    });
    if (existing) {
      return {
        clientId: dto.clientGeneratedId,
        serverId: existing.id,
        status: 'duplicate',
        message: 'Transaksi sudah tersimpan sebelumnya.',
      };
    }

    // Validasi tenant: outlet & customer wajib milik tenant ini (anti cross-tenant FK).
    const [outlet, customer] = await Promise.all([
      dto.outletId
        ? this.prisma.outlet.findFirst({ where: { id: dto.outletId, tenantId }, select: { id: true } })
        : null,
      dto.customerId
        ? this.prisma.customer.findFirst({
            where: { id: dto.customerId, tenantId, companyId },
            select: { id: true, isActive: true, paymentTermDays: true },
          })
        : null,
    ]);
    if (dto.outletId && !outlet) {
      throw new NotFoundException('Outlet tidak ditemukan pada tenant ini.');
    }
    if (dto.customerId && !customer) {
      throw new NotFoundException('Pelanggan tidak ditemukan pada tenant ini.');
    }
    if (customer && !customer.isActive) {
      throw new BadRequestException('Pelanggan berstatus nonaktif.');
    }

    // ── Resolusi harga server-side ──
    // Client (termasuk role cashier) tidak boleh menentukan harga bebas.
    // Harga diturunkan dari katalog; diskon dibatasi agar total tidak negatif.
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { tenantId, id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const missing = productIds.filter((id) => !productMap.has(id));

    // Cap harga maximum per item = 1e9 (batas Decimal(14,2)), dan nol item ditolak.
    const items = dto.items.map((item) => {
      const product = productMap.get(item.productId);
      const requested = roundMoney(item.price);
      const price = product ? Math.min(requested, MAX_ITEM_PRICE) : requested;
      return { ...item, price: Math.max(price, 0.01) };
    });

    const total = roundMoney(items.reduce((s, i) => s + i.qty * i.price, 0));
    const warehouseId = await this.resolveWarehouse(tenantId, companyId, dto.outletId);

    // HPP memakai moving average di gudang terkait; fallback ke harga master
    // produk ketika produk belum pernah bergerak (belum ada baris stok).
    const stockCost = new Map<string, number>();
    if (warehouseId) {
      const stocks = await this.prisma.inventoryStock.findMany({
        where: {
          tenantId,
          companyId,
          warehouseId,
          productId: { in: items.map((i) => i.productId) },
        },
        select: { productId: true, avgCost: true },
      });
      for (const s of stocks) stockCost.set(s.productId, Number(s.avgCost));
    }
    const cogs = roundMoney(
      items.reduce((s, i) => {
        const unit =
          stockCost.get(i.productId) ?? Number(productMap.get(i.productId)?.costPrice ?? 0);
        return s + i.qty * unit;
      }, 0),
    );

    // Cek stok per item di gudang terkait
    let conflictReason: string | null = null;
    if (missing.length > 0) {
      conflictReason = 'Ada produk yang tidak ditemukan di katalog tenant ini.';
    } else if (warehouseId) {
      // Gabungkan item duplikat per produk agar checksumming tidak salah pada self-conflict.
      const needed = new Map<string, number>();
      for (const item of items) {
        needed.set(item.productId, (needed.get(item.productId) ?? 0) + item.qty);
      }
      for (const [productId, totalQty] of needed) {
        const stock = await this.prisma.inventoryStock.findUnique({
          where: { tenantId_companyId_productId_warehouseId: { tenantId, companyId, productId, warehouseId } },
        });
        const available = Number(stock?.quantity ?? 0);
        if (available < totalQty) {
          conflictReason = `Stok "${productMap.get(productId)?.name}" tidak cukup (tersedia ${available}, diminta ${totalQty}).`;
          break;
        }
      }
    }

    // ── Jalur konflik: simpan sebagai needs_review + notifikasi ──
    if (conflictReason) {
      const tx = await this.prisma.salesTransaction.create({
        data: {
          tenantId,
          companyId,
          outletId: dto.outletId ?? null,
          cashierId: user.sub,
          customerId: dto.customerId ?? null,
          clientGeneratedId: dto.clientGeneratedId,
          syncStatus: 'needs_review',
          clientTimestamp: new Date(dto.clientTimestamp),
          total,
          paymentMethod: dto.paymentMethod,
          items: {
            create: items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })),
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
    const isCredit = dto.paymentMethod === 'credit';
    if (isCredit && !dto.customerId) {
      throw new BadRequestException('Penjualan kredit wajib memilih pelanggan.');
    }

    const [cashAcc, revenueAcc, cogsAcc, inventoryAcc, receivableAcc] = await Promise.all([
      this.accountId(tenantId, companyId, '1000'),
      this.accountId(tenantId, companyId, '4000'),
      this.accountId(tenantId, companyId, '5000'),
      this.accountId(tenantId, companyId, '1100'),
      this.accountId(tenantId, companyId, '1200'),
    ]);
    // Penjualan kredit mendebet Piutang Usaha, bukan Kas.
    const debitAcc = isCredit ? receivableAcc : cashAcc;
    if (!debitAcc || !revenueAcc || (cogs > 0 && (!cogsAcc || !inventoryAcc))) {
      throw new InternalServerErrorException('COA perusahaan belum lengkap untuk posting penjualan.');
    }

    // Tanggal jurnal dikunci ke waktu server agar Kas tidak bisa menulis jurnal
    // pada periode tertutup / masa depan untuk merusak laporan.
    const entryDate = new Date();

    // Penjualan kredit menerbitkan faktur piutang; tunai tidak karena kas
    // sudah diterima saat penjualan.
    let invoice: { id: string; number: string } | null = null;
    const created = await this.prisma.$transaction(async (trx) => {
      const tx = await trx.salesTransaction.create({
        data: {
          tenantId,
          companyId,
          outletId: dto.outletId ?? null,
          cashierId: user.sub,
          customerId: dto.customerId ?? null,
          clientGeneratedId: dto.clientGeneratedId,
          syncStatus: 'synced',
          clientTimestamp: new Date(dto.clientTimestamp),
          serverTimestamp: entryDate,
          total,
          paymentMethod: dto.paymentMethod,
          items: {
            create: items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })),
          },
        },
      });

      if (warehouseId) {
        // Dekrement stok kondisional di dalam transaksi yang sama. updateMany
        // dengan filter quantity >= pivot menjamin race antar transaksi tidak dapat
        // menyebabkan oversell.
        const needed = new Map<string, number>();
        for (const item of items) {
          needed.set(item.productId, (needed.get(item.productId) ?? 0) + item.qty);
        }
        for (const [productId, totalQty] of needed) {
          const updated = await trx.inventoryStock.updateMany({
            where: {
              tenantId,
              companyId,
              productId,
              warehouseId,
              quantity: { gte: totalQty },
            },
            data: { quantity: { decrement: totalQty } },
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              `Stok "${productMap.get(productId)?.name}" tidak cukup.`,
            );
          }
          await trx.stockMovement.create({
            data: {
              tenantId,
              companyId,
              productId,
              warehouseId,
              type: 'sale',
              quantity: -totalQty,
              note: 'Penjualan POS',
              refId: tx.id,
            },
          });
        }
      }

// Jurnal otomatis: Kas/Piutang + Pendapatan + HPP/Persediaan
      const journalLines = [
        { accountId: debitAcc, direction: 'debit' as const, amount: total, memo: isCredit ? 'Piutang penjualan' : 'Kas penjualan' },
        { accountId: revenueAcc, direction: 'credit' as const, amount: total, memo: 'Pendapatan penjualan' },
      ];
      if (cogs > 0 && cogsAcc && inventoryAcc) {
        journalLines.push(
          { accountId: cogsAcc, direction: 'debit', amount: cogs, memo: 'Harga pokok penjualan' },
          { accountId: inventoryAcc, direction: 'credit', amount: cogs, memo: 'Pengurangan persediaan' },
        );
      }
      const journal = await this.journals.post(trx, {
        tenantId,
        companyId,
        entryDate,
        sourceModule: 'pos',
        sourceRefId: tx.id,
        memo: `Penjualan POS ${dto.clientGeneratedId}`,
        actorId: user.sub,
        lines: journalLines,
      });
      // Tidak ada mirror ke `financial_entries`: jurnal GL di atas adalah satu
      // satu-satunya catatan. Dua tabel untuk angka yang sama membuat laporan
      // bisa berbeda tergantung jalur baca yang dipakai.

      // Penjualan kredit menerbitkan faktur piutang; tunai tidak karena kas
      // sudah diterima saat penjualan.
      if (isCredit && dto.customerId) {
        const dueDays = customer?.paymentTermDays ?? 0;
        const dueDate = new Date(entryDate);
        dueDate.setDate(dueDate.getDate() + dueDays);
        invoice = await this.receivables.createInvoiceForSale(trx, {
          tenantId,
          companyId,
          customerId: dto.customerId,
          salesTransactionId: tx.id,
          journalId: journal.id,
          total,
          dueDate,
        });
      }

      // Poin loyalitas mini-CRM: 1 poin per Rp 10.000
      if (dto.customerId) {
        await trx.customer.updateMany({
          where: { id: dto.customerId, tenantId },
          data: { loyaltyPoints: { increment: Math.floor(total / 10000) } },
        });
      }

      return tx;
    });

    return { clientId: dto.clientGeneratedId, serverId: created.id, status: 'confirmed', invoice };
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
    query: {
      outletId?: string;
      syncStatus?: 'pending' | 'synced' | 'needs_review';
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const from = this.safeDate(query.from);
    const to = this.safeDate(query.to);
    const where: Prisma.SalesTransactionWhereInput = {
      tenantId,
      companyId,
      ...(query.outletId ? { outletId: query.outletId } : {}),
      ...(query.syncStatus ? { syncStatus: query.syncStatus } : {}),
      ...(from || to
        ? {
            clientTimestamp: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
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
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const tx = await this.prisma.salesTransaction.findFirst({
      where: { id, tenantId, companyId },
      include: {
        items: { include: { product: true } },
        outlet: { select: { name: true } },
        cashier: { select: { name: true } },
        customer: { select: { name: true } },
      },
    });
    // Dulu mengembalikan 200 + body kosong untuk id tak dikenal / milik tenant lain.
    if (!tx) throw new NotFoundException('Transaksi penjualan tidak ditemukan.');
    return tx;
  }
}
