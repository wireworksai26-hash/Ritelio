import {
  ConflictException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { JournalService } from '../accounting/journal.service';
import { computeMovingAverage } from '../inventory/moving-average';
import { retryOnConflict } from '../inventory/tx-retry';
import { PayablesService } from '../payables/payables.service';
import type { CreatePODto, OrderQueryDto, POItemDto, UpdatePODto } from './dto/purchasing.dto';
import { buildPoShare } from './po-share';

// Include standar PO: pemasok, gudang, dan item beserta produknya
const PO_INCLUDE = {
  supplier: { select: { code: true, name: true, paymentTermDays: true } },
  warehouse: { select: { name: true } },
  items: { include: { product: { select: { id: true, name: true, unit: true } } } },
} as const;

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
    private readonly payables: PayablesService,
  ) {}

  private paging(page?: number, limit?: number) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    return { page: p, limit: l, skip: (p - 1) * l, take: l };
  }

  // Total nilai PO: jumlah qty x price seluruh item (Decimal -> Number)
  private withTotal<T extends { items: { qty: unknown; price: unknown }[] }>(po: T) {
    return {
      ...po,
      totalValue: roundMoney(po.items.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0)),
    };
  }

  // ============================== PEMASOK ==============================
  // Kelola supplier dipindah ke PartyService (modul parties). Method di bawah
  // sengaja dihapus agar hanya ada satu sumber kebenaran untuk master party.

  // ============================== PURCHASE ORDER ==============================

  async listOrders(tenantId: string, query: OrderQueryDto) {
    const { page, limit, skip, take } = this.paging(query.page, query.limit);
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const where = { tenantId, companyId, ...(query.status ? { status: query.status } : {}) };

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
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId, companyId },
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
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId, companyId },
    });
    if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan.');
    if (!supplier.isActive) {
      throw new BadRequestException(`Pemasok ${supplier.code} berstatus nonaktif.`);
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, companyId },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan.');

    await this.assertProducts(tenantId, dto.items);

    // Nomor urut PO memakai `documentSequence` yang di-increment secara atomik.
    // Versi lama memakai `count() + 1`, yang racy: dua pembuatan paralel bisa
    // membaca count yang sama dan menghasilkan kode kembar, dan karena
    // `attempt` ikut dijumlahkan, retry bisa melompati nomor.
    const tahun = new Date().getFullYear();
    const prefix = `PO-${tahun}-`;
    const counter = await this.prisma.documentSequence.upsert({
      where: { tenantId_companyId_kind: { tenantId, companyId, kind: 'purchase-order-number' } },
      update: { nextValue: { increment: 1 } },
      // Nilai awal 2 sama dengan jalur procurement: nomor pertama = 001 (bukan 000).
      create: { tenantId, companyId, kind: 'purchase-order-number', nextValue: 2 },
    });
    const code = `${prefix}${String(counter.nextValue - 1).padStart(3, '0')}`;

    try {
      return await this.prisma.purchaseOrder.create({
        data: {
          tenantId,
          companyId,
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
    } catch (err) {
      // Sequence sudah naik satu; satu nomor dilewati lebih baik
      // daripada PO gagal dibuat.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Nomor pesanan pembelian bentrok. Silakan coba lagi.', {
          cause: err.message,
        });
      }
      throw err;
    }
  }

  async updateOrder(tenantId: string, id: string, dto: UpdatePODto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!po) throw new NotFoundException('Pesanan pembelian tidak ditemukan.');
    if (po.status !== 'draft' && po.status !== 'ordered') {
      throw new BadRequestException('PO yang sudah diterima/dibatalkan tidak bisa diubah.');
    }

    if (dto.items) await this.assertProducts(tenantId, dto.items);

    // Ubah status dan/atau ganti item secara atomik. Klaim bersyarat di awal:
    // PO yang diterima/dibatalkan di tengah jalan tidak boleh lagi diubah itemnya.
    return this.prisma.$transaction(async (tx) => {
      const guard = await tx.purchaseOrder.updateMany({
        where: { id: po.id, tenantId, companyId, status: { in: ['draft', 'ordered'] } },
        data: { status: dto.status ?? po.status },
      });
      if (guard.count !== 1) {
        throw new ConflictException('PO sudah diterima/dibatalkan oleh proses lain dan tidak bisa diubah.');
      }
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

  /**
   * Kirim PO ke pemasok: draft → ordered, dan kembalikan bahan bagikan
   * (WhatsApp, email, data cetak). Server tidak mengirim apa pun sendiri.
   *
   * Transisi status diklaim atomik, jadi dua tap bersamaan hanya menandai satu
   * kali. PO yang sudah `ordered` boleh dibagikan ulang tanpa mengubah status.
   * Waktu kirim tidak punya kolom sendiri; ia tercatat di audit trail
   * (POST /purchasing/orders/:id/send) dan dikembalikan di `sentAt`.
   */
  async sendOrder(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const load = () =>
      this.prisma.purchaseOrder.findFirst({
        where: { id, tenantId, companyId },
        include: {
          supplier: { select: { code: true, name: true, email: true, phone: true, isActive: true } },
          warehouse: { select: { name: true } },
          items: { include: { product: { select: { id: true, name: true, unit: true } } } },
        },
      });

    const po = await load();
    if (!po) throw new NotFoundException('Pesanan pembelian tidak ditemukan.');
    if (po.status === 'received' || po.status === 'cancelled') {
      throw new ConflictException(`PO ${po.code} sudah ${po.status === 'received' ? 'diterima' : 'dibatalkan'}.`);
    }
    if (po.items.length === 0) throw new BadRequestException('PO tanpa item tidak bisa dikirim.');

    let alreadySent = po.status === 'ordered';
    if (po.status === 'draft') {
      if (!po.supplier.isActive) {
        throw new BadRequestException(`Pemasok ${po.supplier.code} berstatus nonaktif.`);
      }
      const claimed = await this.prisma.purchaseOrder.updateMany({
        where: { id: po.id, tenantId, companyId, status: 'draft' },
        data: { status: 'ordered' },
      });
      // Kalah balapan: request lain sudah menandai terkirim. Bukan kesalahan.
      alreadySent = claimed.count !== 1;
    }

    const fresh = (await load()) ?? po;
    const company = await this.prisma.company.findFirst({ where: { id: companyId }, select: { name: true } });
    const items = fresh.items.map((i) => ({
      name: i.product.name,
      unit: i.product.unit,
      qty: Number(i.qty),
      price: Number(i.price),
    }));
    const share = buildPoShare({
      code: fresh.code,
      companyName: company?.name ?? 'Perusahaan',
      warehouseName: fresh.warehouse.name,
      supplier: fresh.supplier,
      items,
    });

    return {
      purchaseOrder: this.withTotal(fresh),
      alreadySent,
      sentAt: new Date().toISOString(),
      share,
      print: {
        code: fresh.code,
        companyName: company?.name ?? 'Perusahaan',
        createdAt: fresh.createdAt,
        supplier: { name: fresh.supplier.name, email: fresh.supplier.email, phone: fresh.supplier.phone },
        warehouse: fresh.warehouse.name,
        items: items.map((i) => ({ ...i, subtotal: roundMoney(i.qty * i.price) })),
        total: share.total,
      },
    };
  }

  // Penerimaan barang: stok bertambah, movement tercatat, jurnal dibuat, status received.
  // Idempoten & race-safe: transisi status 'ordered' -> 'received' diklaim atomik
  // di dalam transaksi sehingga dua request bersamaan tidak pernah menaikkan stok dua kali.
  async receiveOrder(tenantId: string, id: string, rejections?: Record<string, number>) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId, companyId },
      include: { items: true, supplier: { select: { paymentTermDays: true } } },
    });
    if (!po) throw new NotFoundException('Pesanan pembelian tidak ditemukan.');
    if (po.status !== 'ordered') {
      throw new ConflictException('Hanya PO berstatus Dipesan yang bisa diterima.');
    }

    // Barang ditolak dicatat per baris supaya skor kualitas supplier punya
    // sumber data nyata. Penolakan penuh berarti barang sama sekali tidak
    // masuk stok, jadi nilai tagihan ikut berkurang.
    const rejectedByItem = new Map<string, number>();
    const itemIds = new Set(po.items.map((i) => i.id));
    for (const [key, value] of Object.entries(rejections ?? {})) {
      if (!itemIds.has(key)) {
        throw new BadRequestException(`Baris PO "${key.slice(0, 40)}" pada penolakan tidak dikenal.`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException('Jumlah barang ditolak harus berupa angka.');
      }
    }
    for (const item of po.items) {
      const raw = rejections?.[item.id] ?? 0;
      if (raw < 0) throw new BadRequestException('Jumlah barang ditolak tidak boleh negatif.');
      if (raw > Number(item.qty)) {
        throw new BadRequestException(
          `Barang ditolak (${raw}) melebihi jumlah dipesan (${Number(item.qty)}) pada satu baris.`,
        );
      }
      rejectedByItem.set(item.id, raw);
    }

    const totalValue = roundMoney(
      po.items.reduce((s, i) => s + (Number(i.qty) - rejectedByItem.get(i.id)!) * Number(i.price), 0),
    );
    if (totalValue <= 0) {
      throw new BadRequestException('Seluruh barang ditolak; tidak ada yang bisa diterima sebagai hutang.');
    }

    // Resolve COA in the default company until the app adds an explicit company selector.
    const [persediaan, hutang] = await Promise.all([
      this.prisma.chartOfAccount.findFirst({ where: { tenantId, companyId, code: '1100' } }),
      this.prisma.chartOfAccount.findFirst({ where: { tenantId, companyId, code: '2000' } }),
    ]);
    if (!persediaan || !hutang) {
      throw new InternalServerErrorException('COA perusahaan belum lengkap untuk posting penerimaan PO.');
    }
    const entryDate = new Date();

    return retryOnConflict(() => this.prisma.$transaction(
      async (tx) => {
        // Klaim transisi status secara kondisional = mutex terhadap request paralel.
        const claimed = await tx.purchaseOrder.updateMany({
          where: { id: po.id, tenantId, companyId, status: 'ordered' },
          data: { status: 'received' },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('Pesanan pembelian ini sudah diterima.');
        }

        for (const item of po.items) {
          // Moving average: barang baru menggeser rata-rata tertimbang dari
          // stok yang ada. Tanpa ini, HPP melenceng tiap harga beli berubah.
          const current = await tx.inventoryStock.findUnique({
            where: {
              tenantId_companyId_productId_warehouseId: {
                tenantId,
                companyId,
                productId: item.productId,
                warehouseId: po.warehouseId,
              },
            },
            select: { quantity: true, avgCost: true },
          });

          const currentQty = current ? Number(current.quantity) : 0;
          const currentCost = current ? Number(current.avgCost) : 0;
          // Barang yang ditolak tidak pernah menyentuh gudang.
          const incomingQty = Number(item.qty) - rejectedByItem.get(item.id)!;
          // Penolakan penuh tetap harus tercatat: skor kualitas vendor membacanya.
          await tx.purchaseOrderItem.update({
            where: { id: item.id },
            data: { qtyRejected: new Prisma.Decimal(rejectedByItem.get(item.id)!) },
          });
          if (incomingQty <= 0) continue;
          const incomingCost = Number(item.price);
          const avgCost = new Prisma.Decimal(
            computeMovingAverage({ currentQty, currentAvgCost: currentCost, incomingQty, incomingCost }),
          );

          await tx.inventoryStock.upsert({
            where: {
              tenantId_companyId_productId_warehouseId: {
                tenantId,
                companyId,
                productId: item.productId,
                warehouseId: po.warehouseId,
              },
            },
            create: {
              tenantId,
              companyId,
              productId: item.productId,
              warehouseId: po.warehouseId,
              quantity: new Prisma.Decimal(incomingQty),
              avgCost,
            },
            update: { quantity: { increment: new Prisma.Decimal(incomingQty) }, avgCost },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              companyId,
              productId: item.productId,
              warehouseId: po.warehouseId,
              type: 'purchase',
              quantity: new Prisma.Decimal(incomingQty),
              note: `Penerimaan ${po.code}`,
              refId: po.id,
            },
          });
        }

        const journal = await this.journals.post(tx, {
          tenantId,
          companyId,
          entryDate,
          sourceModule: 'purchasing',
          sourceRefId: po.id,
          memo: `Penerimaan pesanan ${po.code}`,
          lines: [
            { accountId: persediaan.id, direction: 'debit', amount: totalValue, memo: 'Persediaan diterima' },
            { accountId: hutang.id, direction: 'credit', amount: totalValue, memo: 'Utang usaha' },
          ],
        });

        // Faktur pembelian lahir saat barang diterima, memakai termin pembayaran
        // supplier. Tanpa dokumen ini, utang hanya ada di ledger dan tak ada
        // yang bisa dilunasi.
        const dueDays = po.supplier.paymentTermDays ?? 0;
        const dueDate = new Date(entryDate);
        dueDate.setDate(dueDate.getDate() + dueDays);
        const bill = await this.payables.createBillForReceipt(tx, {
          tenantId,
          companyId,
          supplierId: po.supplierId,
          purchaseOrderId: po.id,
          journalId: journal.id,
          total: totalValue,
          dueDate,
        });
        // Tidak ada lagi baris mirror ke `financial_entries`. Jurnal GL di
        // atas adalah satu-satunya catatan; menulis ke tabel legacy membuat
        // ada dua sumber kebenaran untuk angka yang sama.

        return {
          purchaseOrder: await tx.purchaseOrder.findUniqueOrThrow({
            where: { id: po.id },
            include: PO_INCLUDE,
          }),
          bill,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ));
  }
}
