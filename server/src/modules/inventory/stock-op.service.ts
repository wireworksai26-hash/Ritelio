import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { JournalService } from '../accounting/journal.service';
import { postInventoryValueJournal, valueOfAdjustment } from './inventory-adjustment';
import { advisoryLock, retryOnConflict } from './tx-retry';
import type {
  CloseStockOpDto,
  CountStockOpLineDto,
  CreateStockOpDto,
  ListStockOpQueryDto,
} from './dto/stock-op.dto';

const OP_INCLUDE = {
  warehouse: { select: { id: true, code: true, name: true } },
  lines: { include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
} as const;

@Injectable()
export class StockOpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
  ) {}

  async list(tenantId: string, query: ListStockOpQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.stockOp.findMany({
      take: 500,
      where: {
        tenantId,
        companyId,
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: OP_INCLUDE,
      orderBy: { openedAt: 'desc' },
    });
  }

  async get(tenantId: string, id: string) {
    await this.assertOp(tenantId, id);
    return this.prisma.stockOp.findUnique({ where: { id }, include: OP_INCLUDE });
  }

  /**
   * Buka stock op. Snapshot qty sistem saat opening supaya selisih counting
   * bisa diaudit terhadap kondisi awal. Pengecekan "sudah ada sesi terbuka" dan
   * pengambilan snapshot berada dalam satu transaksi yang dikunci per gudang,
   * jadi dua klik bersamaan tidak membuka dua sesi untuk gudang yang sama.
   */
  async open(tenantId: string, dto: CreateStockOpDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, companyId },
      select: { id: true, code: true },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan.');
    if (!warehouse.code) {
      throw new BadRequestException('Gudang belum memiliki kode. Perbarui gudang terlebih dahulu.');
    }

    return this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, `stock-op-open:${warehouse.id}`);
      const existingOpen = await tx.stockOp.findFirst({
        where: { tenantId, warehouseId: dto.warehouseId, status: 'open' },
        select: { code: true },
      });
      if (existingOpen) {
        throw new ConflictException(
          `Gudang masih punya stock op terbuka (${existingOpen.code}). Tutup dulu sebelum membuka yang baru.`,
        );
      }

      const code = await this.nextCode(tx, tenantId, companyId);
      const stocks = await tx.inventoryStock.findMany({
        where: { tenantId, companyId, warehouseId: dto.warehouseId },
        select: { productId: true, quantity: true },
      });
      const op = await tx.stockOp.create({
        data: {
          tenantId,
          companyId,
          warehouseId: dto.warehouseId,
          code,
          note: dto.note ?? '',
        },
        include: OP_INCLUDE,
      });
      if (stocks.length > 0) {
        await tx.stockOpLine.createMany({
          data: stocks.map((s) => ({
            stockOpId: op.id,
            productId: s.productId,
            systemQty: s.quantity,
            countedQty: null,
            variance: new Prisma.Decimal(0),
          })),
        });
      }
      return { ...op, lines: undefined };
    });
  }

  /** Catat hasil hitung fisik untuk satu atau banyak produk. */
  async countLines(tenantId: string, id: string, lines: CountStockOpLineDto[]) {
    const op = await this.assertOp(tenantId, id);
    if (op.status !== 'open') {
      throw new BadRequestException('Stock op sudah ditutup, tidak bisa dihitung ulang.');
    }
    if (lines.length === 0) throw new BadRequestException('Tidak ada baris yang dihitung.');

    return this.prisma.$transaction(async (tx) => {
      // Mengunci baris sesi: counting dan close saling menunggu, jadi hasil
      // hitung tidak pernah tertulis setelah close selesai membaca barisnya.
      const locked = await tx.stockOp.updateMany({
        where: { id, tenantId, companyId: op.companyId, status: 'open' },
        data: { note: op.note },
      });
      if (locked.count !== 1) {
        throw new BadRequestException('Stock op sudah ditutup, tidak bisa dihitung ulang.');
      }
      const updated = [];
      for (const line of lines) {
        const existing = await tx.stockOpLine.findUnique({
          where: { stockOpId_productId: { stockOpId: id, productId: line.productId } },
          select: { id: true, systemQty: true },
        });
        if (!existing) {
          throw new NotFoundException(
            `Produk ${line.productId} tidak ada di stock op ini (produk baru setelah opening?).`,
          );
        }
        const variance = new Prisma.Decimal(line.countedQty).minus(existing.systemQty);
        const res = await tx.stockOpLine.update({
          where: { id: existing.id },
          data: { countedQty: new Prisma.Decimal(line.countedQty), variance },
        });
        updated.push({
          productId: line.productId,
          countedQty: res.countedQty,
          variance: res.variance,
        });
      }
      return { id, lines: updated };
    });
  }

  /**
   * Tutup stock op: hasil hitung fisik diterapkan ke stok, dicatat sebagai
   * StockMovement 'adjustment', dan selisih bernilai dijurnal ke akun Selisih
   * Persediaan — semuanya dalam SATU transaksi dengan klaim status, sehingga
   * penutupan ganda/paralel tidak pernah menerapkan selisih dua kali.
   *
   * Selisih yang diterapkan = hitung fisik - stok SAAT INI (dibaca di dalam
   * transaksi), bukan terhadap snapshot saat dibuka. Bila barang bergerak sejak
   * sesi dibuka (penjualan, penerimaan), memakai snapshot akan menggandakan
   * pergerakan itu. Nilai selisih = qty selisih x biaya moving-average gudang.
   */
  async close(tenantId: string, id: string, dto: CloseStockOpDto, actorId?: string) {
    const op = await this.assertOp(tenantId, id);
    if (op.status !== 'open') {
      throw new BadRequestException('Stock op sudah ditutup sebelumnya.');
    }

    return retryOnConflict(() =>
      this.prisma.$transaction(
        async (tx) => {
          const claimed = await tx.stockOp.updateMany({
            where: { id, tenantId, companyId: op.companyId, status: 'open' },
            data: { status: 'closed', closedAt: new Date(), note: dto.note ?? op.note },
          });
          if (claimed.count !== 1) {
            throw new ConflictException('Stock op sudah ditutup oleh permintaan lain.');
          }

          const lines = await tx.stockOpLine.findMany({ where: { stockOpId: id } });
          const uncounted = lines.filter((l) => l.countedQty === null);
          if (uncounted.length > 0 && !dto.force) {
            throw new BadRequestException(
              `${uncounted.length} produk belum dihitung. Selesaikan counting atau kirim force=true.`,
            );
          }

          let gain = 0;
          let loss = 0;
          let applied = 0;
          for (const line of lines) {
            if (line.countedQty === null) continue;
            const counted = new Prisma.Decimal(line.countedQty);
            const key = {
              tenantId_companyId_productId_warehouseId: {
                tenantId: op.tenantId,
                companyId: op.companyId,
                productId: line.productId,
                warehouseId: op.warehouseId,
              },
            };
            const stock = await tx.inventoryStock.findUnique({
              where: key,
              select: { quantity: true, avgCost: true, product: { select: { costPrice: true } } },
            });
            const current = new Prisma.Decimal(stock?.quantity ?? 0);
            const delta = counted.minus(current);
            if (delta.isZero()) continue;

            const avg = Number(stock?.avgCost ?? 0);
            const unitCost = avg > 0 ? avg : Number(stock?.product.costPrice ?? 0);
            const value = valueOfAdjustment(Number(delta), unitCost);
            if (value > 0) gain += value;
            else loss += -value;

            if (stock) {
              await tx.inventoryStock.update({
                where: key,
                data: {
                  quantity: counted,
                  // Stok yang tadinya tak bernilai kini punya biaya, supaya HPP penjualan berikutnya tidak nol.
                  ...(avg <= 0 && unitCost > 0 ? { avgCost: new Prisma.Decimal(unitCost) } : {}),
                },
              });
            } else {
              await tx.inventoryStock.create({
                data: {
                  tenantId: op.tenantId,
                  companyId: op.companyId,
                  productId: line.productId,
                  warehouseId: op.warehouseId,
                  quantity: counted,
                  avgCost: new Prisma.Decimal(unitCost),
                },
              });
            }
            await tx.stockMovement.create({
              data: {
                tenantId: op.tenantId,
                companyId: op.companyId,
                productId: line.productId,
                warehouseId: op.warehouseId,
                type: 'adjustment',
                quantity: delta,
                note: dto.note ?? `Stock op ${op.code}`,
                refId: op.id,
              },
            });
            applied += 1;
          }

          const journal = await postInventoryValueJournal(tx, this.journals, {
            tenantId: op.tenantId,
            companyId: op.companyId,
            sourceModule: 'stock-opname',
            sourceRefId: op.id,
            memo: `Selisih stock op ${op.code}`,
            gain,
            loss,
            actorId,
          });

          const closed = await tx.stockOp.findUniqueOrThrow({ where: { id }, include: OP_INCLUDE });
          return { ...closed, adjustmentsApplied: applied, journalId: journal?.id ?? null };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async assertOp(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const op = await this.prisma.stockOp.findFirst({ where: { id, tenantId, companyId } });
    if (!op) throw new NotFoundException('Stock op tidak ditemukan.');
    return op;
  }

  private async nextCode(tx: Prisma.TransactionClient, tenantId: string, companyId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const counter = await tx.documentSequence.upsert({
        where: { tenantId_companyId_kind: { tenantId, companyId, kind: 'stock-op' } },
        update: { nextValue: { increment: 1 } },
        create: { tenantId, companyId, kind: 'stock-op', nextValue: 2 },
      });
      const code = `SOP-${String(counter.nextValue - 1).padStart(5, '0')}`;
      const exists = await tx.stockOp.findFirst({
        where: { tenantId, companyId, code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    throw new BadRequestException('Gagal membuat kode stock op, coba lagi.');
  }
}
