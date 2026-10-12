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
import { JournalService } from '../accounting/journal.service';
import { computeMovingAverage } from '../inventory/moving-average';
import type {
  BomLineInputDto,
  CreateBomDto,
  CreateProductionOrderDto,
  QualityCheckDto,
} from './dto/manufacturing.dto';

const INVENTORY_ACCOUNT = '1100';

export interface MrpRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  level: number;
  qtyPerUnit: number;
  requiredQty: number;
  onHand: number;
  shortageQty: number;
  avgCost: number;
  estimatedCost: number;
}

@Injectable()
export class ManufacturingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
  ) {}

  // ============================== BOM ==============================

  listBoms(tenantId: string) {
    return this.company(tenantId).then((companyId) =>
      this.prisma.billOfMaterials.findMany({
        where: { tenantId, companyId },
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true, productType: true } },
          lines: {
            include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
          },
        },
        orderBy: [{ product: { sku: 'asc' } }, { version: 'desc' }],
      }),
    );
  }

  async createBom(tenantId: string, dto: CreateBomDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId },
      select: { id: true, name: true },
    });
    if (!product) throw new NotFoundException('Produk jadi tidak ditemukan.');

    // BOM tidak boleh memakai produknya sendiri, dan siklus antar-BOM harus
    // ditolak supaya explode tidak berputar tanpa henti.
    const componentIds = dto.lines.map((l) => l.productId);
    if (componentIds.includes(dto.productId)) {
      throw new BadRequestException('Produk jadi tidak boleh menjadi komponen dirinya sendiri.');
    }
    const components = await this.prisma.product.count({
      where: { tenantId, id: { in: componentIds } },
    });
    if (components !== new Set(componentIds).size) {
      throw new NotFoundException('Ada komponen yang tidak ditemukan pada katalog.');
    }

    const version =
      (await this.prisma.billOfMaterials.findFirst({
        where: { tenantId, companyId, productId: dto.productId },
        orderBy: { version: 'desc' },
        select: { version: true },
      }))?.version ?? 0;

    const bom = await this.prisma.billOfMaterials.create({
      data: {
        tenantId,
        companyId,
        productId: dto.productId,
        name: dto.name,
        outputQty: new Prisma.Decimal(dto.outputQty ?? 1),
        version: version + 1,
        lines: {
          create: dto.lines.map((l) => ({
            productId: l.productId,
            qtyRequired: new Prisma.Decimal(l.qtyRequired),
            scrapPercent: new Prisma.Decimal(l.scrapPercent ?? 0),
          })),
        },
      },
      include: { lines: true },
    });

    const cycles = await this.findCycles(tenantId, companyId, bom.id);
    if (cycles.length > 0) {
      // Buang BOM yang baru dibuat supaya tidak menyisakan data tidak valid.
      await this.prisma.billOfMaterials.delete({ where: { id: bom.id } }).catch(() => undefined);
      throw new BadRequestException(
        `BOM ini menimbulkan siklus: ${cycles.join(' -> ')}.`,
      );
    }
    return bom;
  }

  async setBomActive(tenantId: string, id: string, isActive: boolean) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const bom = await this.prisma.billOfMaterials.findFirst({ where: { id, tenantId, companyId } });
    if (!bom) throw new NotFoundException('BOM tidak ditemukan.');
    return this.prisma.billOfMaterials.update({ where: { id }, data: { isActive } });
  }

  // ============================== MRP ==============================

  /**
   * Explode BOM untuk jumlah tertentu dan bandingkan dengan stok.
   *
   * `visited` mencegah eksplosi tak terbatas ketika datańya mengandung
   * siklus; BOM yang sudah pernah dilewati pada level yang sama dilewati lagi
   * dengan multiplier-nya digabung, bukan diulang.
   */
  async mrp(tenantId: string, productId: string, qty: number, warehouseId?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (qty <= 0) throw new BadRequestException('Jumlah produksi harus lebih dari 0.');

    const warehouse = warehouseId
      ? await this.prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId, companyId } })
      : null;
    if (warehouseId && !warehouse) throw new NotFoundException('Gudang tidak ditemukan.');

    const target = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, sku: true, name: true, unit: true },
    });
    if (!target) throw new NotFoundException('Produk jadi tidak ditemukan.');

    const byId = new Map<string, MrpRow>();
    const order: string[] = [];

    const record = (row: MrpRow) => {
      const existing = byId.get(row.productId);
      if (existing) {
        existing.requiredQty += row.requiredQty;
        existing.shortageQty = Math.max(0, existing.requiredQty - existing.onHand);
        existing.estimatedCost = roundMoney(existing.shortageQty * existing.avgCost);
        return;
      }
      byId.set(row.productId, row);
      order.push(row.productId);
    };

    const walk = async (pid: string, needed: number, level: number, seen: Set<string>) => {
      const stocks = warehouse
        ? await this.prisma.inventoryStock.findMany({
            where: { tenantId, companyId, warehouseId: warehouse.id, productId: pid },
            select: { quantity: true, avgCost: true },
          })
        : await this.prisma.inventoryStock.findMany({
            where: { tenantId, companyId, productId: pid },
            select: { quantity: true, avgCost: true },
          });

      const onHand = stocks.reduce((s, r) => s + Number(r.quantity), 0);
      const avgCost = stocks.length
        ? stocks.reduce((s, r) => s + Number(r.avgCost), 0) / stocks.length
        : 0;

      record({
        productId: pid,
        sku: '',
        name: '',
        unit: '',
        level,
        qtyPerUnit: 0,
        requiredQty: roundMoney(needed),
        onHand: roundMoney(onHand),
        shortageQty: roundMoney(Math.max(0, needed - onHand)),
        avgCost: roundMoney(avgCost),
        estimatedCost: roundMoney(Math.max(0, needed - onHand) * avgCost),
      });

      if (seen.has(pid) || level > 10) return;
      const bom = await this.prisma.billOfMaterials.findFirst({
        where: { tenantId, companyId, productId: pid, isActive: true },
        orderBy: { version: 'desc' },
        include: { lines: true },
      });
      if (!bom) return;

      const outputQty = Number(bom.outputQty) || 1;
      const multiplier = needed / outputQty;
      const nextSeen = new Set(seen).add(pid);
      for (const line of bom.lines) {
        const scrapFactor = 1 + Number(line.scrapPercent) / 100;
        await walk(
          line.productId,
          roundMoney(Number(line.qtyRequired) * multiplier * scrapFactor),
          level + 1,
          nextSeen,
        );
      }
    };

    await walk(productId, qty, 0, new Set());

    const products = await this.prisma.product.findMany({
      where: { tenantId, id: { in: order } },
      select: { id: true, sku: true, name: true, unit: true },
    });
    const meta = new Map(products.map((p) => [p.id, p]));

    const rows = order.map((id) => {
      const row = byId.get(id)!;
      const m = meta.get(id);
      return { ...row, sku: m?.sku ?? id, name: m?.name ?? '-', unit: m?.unit ?? '' };
    });

    return {
      product: { id: target.id, sku: target.sku, name: target.name, unit: target.unit },
      qty,
      warehouseId: warehouse?.id ?? null,
      rows,
      totalEstimatedCost: roundMoney(rows.reduce((s, r) => s + r.estimatedCost, 0)),
      shortages: rows.filter((r) => r.shortageQty > 0),
    };
  }

  // ============================== PRODUCTION ORDER ==============================

  async listProductionOrders(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.productionOrder.findMany({
      where: { tenantId, companyId },
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        warehouse: { select: { code: true, name: true } },
        consumptions: { include: { product: { select: { sku: true, name: true } } } },
        qualityChecks: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProductionOrder(tenantId: string, dto: CreateProductionOrderDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const [product, warehouse] = await Promise.all([
      this.prisma.product.findFirst({ where: { id: dto.productId, tenantId }, select: { id: true } }),
      this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, tenantId, companyId },
        select: { id: true },
      }),
    ]);
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan.');

    const bom = dto.bomId
      ? await this.prisma.billOfMaterials.findFirst({ where: { id: dto.bomId, tenantId, companyId } })
      : await this.prisma.billOfMaterials.findFirst({
          where: { tenantId, companyId, productId: dto.productId, isActive: true },
          orderBy: { version: 'desc' },
        });

    return this.prisma.productionOrder.create({
      data: {
        tenantId,
        companyId,
        number: await this.nextNumber(tenantId, companyId, 'production-order', 'MO'),
        productId: dto.productId,
        bomId: bom?.id ?? null,
        warehouseId: dto.warehouseId,
        priority: dto.priority ?? 5,
        qtyPlanned: new Prisma.Decimal(dto.qtyPlanned),
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        note: dto.note ?? '',
      },
      include: { product: true },
    });
  }

  /**
   * Rilis BOM multi-level: buat order sub-assembly lalu memproduksi urutan dari
   * paling dalam ke luar, baru order induk terakhir.
   *
   * Urutan ini wajib. Order barang jadi memakai barang setengah jadi sebagai
   * bahan; kalau induk dilepas lebih dulu, stok semi-finished masih nol dan
   * order gagal padahal bahan mentahnya tersedia.
   */
  async releaseMultiLevel(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.assertOrder(tenantId, id);
    if (order.status !== 'planned') {
      throw new ConflictException(`Order ${order.number} sudah berstatus ${order.status}.`);
    }

    // Post-order: subtree terdalam muncul lebih dulu sehingga urutannya sudah
    // siap tanpa perlu topological sort terpisah.
    const subOrderIds = await this.prisma.$transaction((tx) =>
      this.explodeSubOrders(tx, tenantId, companyId, order, 1),
    );

    // Release hanya menarik bahan; barang setengah jadi baru ada setelah order
    // sub diselesaikan. Kalau tidak diselesaikan di sini, order induk tetap
    // gagal karena stok semi-finished masih nol.
    for (const subId of subOrderIds) {
      await this.release(tenantId, subId);
      const sub = await this.prisma.productionOrder.findUniqueOrThrow({ where: { id: subId } });
      await this.complete(tenantId, subId, Number(sub.qtyPlanned));
    }
    await this.release(tenantId, id);

    return {
      parent: await this.prisma.productionOrder.findUniqueOrThrow({
        where: { id },
        include: { subOrders: { include: { product: true } } },
      }),
      subOrderIds,
    };
  }

  /**
   * Order anak untuk setiap baris BOM yang produknya punya BOM aktif.
   * Dikembalikan dalam urutan post-order (paling dalam lebih dulu).
   */
  private async explodeSubOrders(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    parent: { id: string; productId: string; warehouseId: string; qtyPlanned: unknown; priority: number },
    depth: number,
  ): Promise<string[]> {
    if (depth > 10) return [];

    const bom = await tx.billOfMaterials.findFirst({
      where: { tenantId, companyId, productId: parent.productId, isActive: true },
      include: { lines: true },
      orderBy: { version: 'desc' },
    });
    if (!bom) return [];

    const outputQty = Number(bom.outputQty) || 1;
    const parentQty = Number(parent.qtyPlanned);
    const multiplier = parentQty / outputQty;
    const created: string[] = [];

    for (const line of bom.lines) {
      const subBom = await tx.billOfMaterials.findFirst({
        where: { tenantId, companyId, productId: line.productId, isActive: true },
        select: { id: true, outputQty: true },
      });
      if (!subBom) continue; // bahan mentah, cukup ditarik saat release

      const scrap = Number(line.scrapPercent ?? 0) / 100;
      const qtyPlanned = Number(line.qtyRequired) * multiplier * (1 + scrap);
      const sub = await tx.productionOrder.create({
        data: {
          tenantId,
          companyId,
          number: await this.nextNumber(tenantId, companyId, 'production-order', 'MO'),
          productId: line.productId,
          bomId: subBom.id,
          warehouseId: parent.warehouseId,
          parentOrderId: parent.id,
          priority: parent.priority,
          qtyPlanned: new Prisma.Decimal(qtyPlanned),
          note: `Sub-order untuk ${parent.productId}`,
        },
      });

      created.push(...(await this.explodeSubOrders(tx, tenantId, companyId, sub, depth + 1)));
      created.push(sub.id);
    }
    return created;
  }

  /**
   * Mulai produksi: komponen ditarik dari gudang dan dicatat pada kartu stok.
   * Komponen yang tidak cukup menolak seluruh order (tidak ada partial).
   */
  async release(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.assertOrder(tenantId, id);
    if (order.status !== 'planned') {
      throw new ConflictException(`Order sudah berstatus ${order.status}.`);
    }
    if (!order.bomId) {
      throw new BadRequestException('Order ini tidak punya BOM, tidak ada bahan yang bisa ditarik.');
    }

    const bom = await this.prisma.billOfMaterials.findFirst({
      where: { id: order.bomId, tenantId, companyId },
      include: { lines: true },
    });
    if (!bom) throw new NotFoundException('BOM tidak ditemukan.');

    const outputQty = Number(bom.outputQty) || 1;
    const multiplier = Number(order.qtyPlanned) / outputQty;

    // Periksa seluruh bahan dulu sebelum ada yang dikurangi, supaya order
    // tidak gagal setengah jalan dengan sebagian bahan sudah keluar.
    const plan: Array<{ line: (typeof bom.lines)[number]; needed: number; onHand: number }> = [];
    for (const line of bom.lines) {
      const scrapFactor = 1 + Number(line.scrapPercent) / 100;
      const needed = roundMoney(Number(line.qtyRequired) * multiplier * scrapFactor);
      const stock = await this.prisma.inventoryStock.findUnique({
        where: {
          tenantId_companyId_productId_warehouseId: {
            tenantId,
            companyId,
            productId: line.productId,
            warehouseId: order.warehouseId,
          },
        },
        select: { quantity: true, avgCost: true, product: { select: { name: true } } },
      });
      const onHand = Number(stock?.quantity ?? 0);
      if (onHand < needed) {
        throw new BadRequestException(
          `Bahan "${stock?.product.name ?? line.productId}" tidak cukup (tersedia ${onHand}, dibutuhkan ${needed}).`,
        );
      }
      plan.push({ line, needed, onHand });
    }

    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.productionOrder.updateMany({
          where: { id, tenantId, companyId, status: 'planned' },
          data: { status: 'in_progress' },
        });
        if (claimed.count !== 1) throw new ConflictException('Order sudah dimulai.');

        let materialCost = 0;
        for (const item of plan) {
          const stock = await tx.inventoryStock.findUnique({
            where: {
              tenantId_companyId_productId_warehouseId: {
                tenantId,
                companyId,
                productId: item.line.productId,
                warehouseId: order.warehouseId,
              },
            },
            select: { avgCost: true },
          });
          const unitCost = Number(stock?.avgCost ?? 0);
          const totalCost = roundMoney(unitCost * item.needed);
          materialCost += totalCost;

          await tx.inventoryStock.update({
            where: {
              tenantId_companyId_productId_warehouseId: {
                tenantId,
                companyId,
                productId: item.line.productId,
                warehouseId: order.warehouseId,
              },
            },
            data: { quantity: { decrement: item.needed } },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              companyId,
              productId: item.line.productId,
              warehouseId: order.warehouseId,
              type: 'production',
              quantity: new Prisma.Decimal(item.needed).negated(),
              note: `Kmaterial ${order.number}`,
              refId: order.id,
            },
          });
          await tx.productionConsumption.create({
            data: {
              tenantId,
              companyId,
              productionOrderId: order.id,
              productId: item.line.productId,
              qty: new Prisma.Decimal(item.needed),
              unitCost: new Prisma.Decimal(unitCost),
              totalCost: new Prisma.Decimal(totalCost),
            },
          });
        }

        const total = roundMoney(materialCost);
        await tx.productionOrder.update({
          where: { id },
          data: { status: 'released', materialCost: new Prisma.Decimal(total) },
        });
        return { released: true, number: order.number, materialCost: total, components: plan.length };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Selesai produksi: barang jadi masuk gudang dan jurnal
   *   Dr Persediaan (barang jadi) / Cr Persediaan (bahan mentah)
   * memakai HPP moving average bahan yang benar-benar terpakai.
   */
  async complete(tenantId: string, id: string, qtyProduced?: number) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.prisma.productionOrder.findFirst({
      where: { id, tenantId, companyId },
      include: { consumptions: true },
    });
    if (!order) throw new NotFoundException('Order produksi tidak ditemukan.');
    if (order.status !== 'released' && order.status !== 'in_progress') {
      throw new ConflictException(`Order berstatus ${order.status}, tidak bisa diselesaikan.`);
    }

    const produced = roundMoney(qtyProduced ?? Number(order.qtyPlanned));
    if (produced <= 0) throw new BadRequestException('Jumlah produksi harus lebih dari 0.');

    // QC gagal berarti produksi tidak boleh dianggap selesai.
    const failedCheck = await this.prisma.qualityCheck.findFirst({
      where: { productionOrderId: id, result: 'failed' },
      select: { stage: true },
    });
    if (failedCheck) {
      throw new BadRequestException(
        `QC tahap "${failedCheck.stage}" gagal, produksi tidak bisa diselesaikan.`,
      );
    }

    const materialCost = Number(order.materialCost);
    const unitCost =
      produced > 0 ? roundMoney(materialCost / produced) : 0;

    const inventory = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, companyId, code: INVENTORY_ACCOUNT },
    });
    if (!inventory) {
      throw new NotFoundException('Akun 1100 (Persediaan) belum ada pada COA perusahaan.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.productionOrder.updateMany({
          where: { id, tenantId, companyId, status: { in: ['released', 'in_progress'] } },
          data: { status: 'completed', qtyProduced: new Prisma.Decimal(produced), completedAt: new Date() },
        });
        if (claimed.count !== 1) throw new ConflictException('Order sudah diselesaikan.');

        if (materialCost > 0) {
          const journal = await this.journals.post(tx, {
            tenantId,
            companyId,
            entryDate: new Date(),
            sourceModule: 'manufacturing',
            sourceRefId: order.id,
            memo: `Produksi ${order.number}`,
            lines: [
              { accountId: inventory.id, direction: 'debit', amount: materialCost, memo: 'Persediaan barang jadi' },
              { accountId: inventory.id, direction: 'credit', amount: materialCost, memo: 'Pengurangan bahan Baku' },
            ],
          });
          await tx.productionOrder.update({ where: { id }, data: { journalId: journal.id } });
        }

        const existing = await tx.inventoryStock.findUnique({
          where: {
            tenantId_companyId_productId_warehouseId: {
              tenantId,
              companyId,
              productId: order.productId,
              warehouseId: order.warehouseId,
            },
          },
          select: { quantity: true, avgCost: true },
        });
        await tx.inventoryStock.upsert({
          where: {
            tenantId_companyId_productId_warehouseId: {
              tenantId,
              companyId,
              productId: order.productId,
              warehouseId: order.warehouseId,
            },
          },
          create: {
            tenantId,
            companyId,
            productId: order.productId,
            warehouseId: order.warehouseId,
            quantity: new Prisma.Decimal(produced),
            avgCost: new Prisma.Decimal(unitCost),
          },
          update: {
            quantity: { increment: new Prisma.Decimal(produced) },
            // Barang jadi ikut memperbarui HPP-nya supaya HPP jual konsisten.
            avgCost: new Prisma.Decimal(
              computeMovingAverage({
                currentQty: Number(existing?.quantity ?? 0),
                currentAvgCost: Number(existing?.avgCost ?? 0),
                incomingQty: produced,
                incomingCost: unitCost,
              }),
            ),
          },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            companyId,
            productId: order.productId,
            warehouseId: order.warehouseId,
            type: 'production',
            quantity: new Prisma.Decimal(produced),
            note: `Produksi ${order.number}`,
            refId: order.id,
          },
        });

        return { completed: true, number: order.number, qtyProduced: produced, unitCost };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordQualityCheck(tenantId: string, id: string, dto: QualityCheckDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.assertOrder(tenantId, id);
    return this.prisma.qualityCheck.upsert({
      where: { productionOrderId_stage: { productionOrderId: order.id, stage: dto.stage as never } },
      update: {
        result: dto.result,
        checkedQty: new Prisma.Decimal(dto.checkedQty ?? 0),
        defectQty: new Prisma.Decimal(dto.defectQty ?? 0),
        note: dto.note ?? '',
        inspectedAt: new Date(),
      },
      create: {
        tenantId,
        companyId,
        productionOrderId: order.id,
        stage: dto.stage as never,
        result: dto.result,
        checkedQty: new Prisma.Decimal(dto.checkedQty ?? 0),
        defectQty: new Prisma.Decimal(dto.defectQty ?? 0),
        note: dto.note ?? '',
      },
    });
  }

  async cancel(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.assertOrder(tenantId, id);
    if (order.status === 'completed') {
      throw new ConflictException('Produksi yang sudah selesai tidak bisa dibatalkan.');
    }
    return this.prisma.productionOrder.update({ where: { id }, data: { status: 'cancelled' } });
  }

  // ============================== HELPERS ==============================

  /** Deteksi siklus BOM lewat DFS. */
  private async findCycles(tenantId: string, companyId: string, startBomId: string): Promise<string[]> {
    const path: string[] = [];
    const inPath = new Set<string>();
    let cycle: string[] | null = null;

    const visit = async (pid: string): Promise<void> => {
      if (cycle) return;
      if (inPath.has(pid)) {
        cycle = [...path.slice(path.indexOf(pid)), pid];
        return;
      }
      inPath.add(pid);
      path.push(pid);
      const bom = await this.prisma.billOfMaterials.findFirst({
        where: { tenantId, companyId, productId: pid, isActive: true },
        include: { lines: { select: { productId: true } } },
      });
      for (const line of bom?.lines ?? []) await visit(line.productId);
      path.pop();
      inPath.delete(pid);
    };

    const start = await this.prisma.billOfMaterials.findUnique({
      where: { id: startBomId },
      select: { productId: true },
    });
    if (start) await visit(start.productId);
    return cycle ?? [];
  }

  private async assertOrder(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.prisma.productionOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!order) throw new NotFoundException('Order produksi tidak ditemukan.');
    return order;
  }

  private async company(tenantId: string) {
    return defaultCompanyId(this.prisma, tenantId);
  }

  private async nextNumber(tenantId: string, companyId: string, kind: string, prefix: string) {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      const counter = await this.prisma.documentSequence.upsert({
        where: { tenantId_companyId_kind: { tenantId, companyId, kind } },
        update: { nextValue: { increment: 1 } },
        create: { tenantId, companyId, kind, nextValue: 2 },
      });
      const candidate = `${prefix}-${year}-${String(counter.nextValue - 1).padStart(5, '0')}`;
      const exists = await this.prisma.productionOrder.findFirst({
        where: { tenantId, companyId, number: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    throw new ConflictException('Gagal membuat nomor order, coba lagi.');
  }
}