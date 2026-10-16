import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { advisoryLock } from '../inventory/tx-retry';
import type {
  CreateQcStageDto,
  CreateScheduleDto,
  CreateWorkCenterDto,
  RecordQcDto,
  UpdateWorkCenterDto,
} from './dto/workcenter.dto';

/**
 * Penjadwalan produksi dan alokasi mesin/work center.
 *
 * Kapasitas dijaga sebagai invariant, bukan saran: sebelum order ditempatkan,
 * kapasitas harian work center dicek terhadap penjadwalan yang sudah ada. Ini
 * yang membuat fitur ini berarti — schedule yang overload hanya bisa terjadi
 * bila orang memaksanya lewat `allowOverCapacity`.
 */
@Injectable()
export class WorkCenterService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Work center ────────────────────────────────────────────────────────

  async list(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.workCenter.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: {
        _count: { select: { schedules: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateWorkCenterDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    try {
      return await this.prisma.workCenter.create({
        data: {
          tenantId,
          companyId,
          code: dto.code,
          name: dto.name,
          kind: dto.kind ?? 'machine',
          capacityPerDay: new Prisma.Decimal(dto.capacityPerDay ?? 0),
          capacityMinutes: dto.capacityMinutes ?? 480,
          hourlyRate: new Prisma.Decimal(dto.hourlyRate ?? 0),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Kode work center "${dto.code}" sudah dipakai.`);
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateWorkCenterDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const wc = await this.prisma.workCenter.findFirst({ where: { id, tenantId, companyId } });
    if (!wc) throw new NotFoundException('Work center tidak ditemukan.');
    return this.prisma.workCenter.update({
      where: { id },
      data: {
        // null dari klien = "tidak diubah" (kolom NOT NULL; Decimal(null) akan gagal 500).
        ...(dto.capacityPerDay != null ? { capacityPerDay: new Prisma.Decimal(dto.capacityPerDay) } : {}),
        ...(dto.capacityMinutes != null ? { capacityMinutes: dto.capacityMinutes } : {}),
        ...(dto.hourlyRate != null ? { hourlyRate: new Prisma.Decimal(dto.hourlyRate) } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
        ...(dto.name != null ? { name: dto.name } : {}),
      },
    });
  }

  // ── Penjadwalan ────────────────────────────────────────────────────────

  /**
   * Tempatkan order pada work center di tanggal tertentu.
   * Menolak placement yang membuat kapasitas harian terlampaui.
   */
  async schedule(tenantId: string, dto: CreateScheduleDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const date = new Date(dto.scheduledDate);
    date.setUTCHours(0, 0, 0, 0);
    const duration = dto.durationMinutes ?? 0;
    if (duration < 1) {
      throw new BadRequestException('durationMinutes wajib diisi (minimal 1 menit).');
    }

    const [wc, order] = await Promise.all([
      this.prisma.workCenter.findFirst({ where: { id: dto.workCenterId, tenantId, companyId, isActive: true } }),
      this.prisma.productionOrder.findFirst({ where: { id: dto.productionOrderId, tenantId, companyId } }),
    ]);
    if (!wc) throw new NotFoundException('Work center tidak ditemukan atau nonaktif.');
    if (!order) throw new NotFoundException('Order produksi tidak ditemukan.');
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new ConflictException(`Order ${order.number} sudah selesai atau dibatalkan.`);
    }

    const start = dto.startMinutes ?? 0;
    const end = start + duration;

    // Cek kapasitas, cek bentrok, dan insert dalam satu transaksi yang dikunci per
    // work center + hari: dua permintaan bersamaan tidak bisa sama-sama lolos cek.
    return this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, `wc-schedule:${wc.id}:${date.toISOString().slice(0, 10)}`);

      // Bentrok jam: satu mesin/work center tidak bisa mengerjakan dua order di
      // rentang menit yang beririsan pada hari yang sama. Lembur (allowOverCapacity)
      // melewati batas kapasitas, tapi tetap tidak boleh menumpuk jam.
      const sameDay = await tx.productionSchedule.findMany({
        where: {
          tenantId,
          companyId,
          workCenterId: wc.id,
          scheduledDate: date,
          status: { not: 'cancelled' },
        },
        include: { productionOrder: { select: { number: true } } },
      });
      const clash = sameDay.find((s) => start < s.startMinutes + s.durationMinutes && s.startMinutes < end);
      if (clash) {
        throw new ConflictException(
          `Jadwal bentrok dengan ${clash.productionOrder.number} di ${wc.name} ` +
            `(menit ${clash.startMinutes}-${clash.startMinutes + clash.durationMinutes}).`,
        );
      }

      // allowOverCapacity melewati guard kapasitas harian dan rentang satu hari.
      if (!dto.allowOverCapacity) {
        const used = sameDay.reduce((sum, s) => sum + s.durationMinutes, 0);
        if (used + duration > wc.capacityMinutes) {
          throw new ConflictException(
            `Kapasitas ${wc.name} pada ${date.toISOString().slice(0, 10)} terlampaui: ` +
              `${used} menit terpakai + ${duration} menit diminta, kapasitas ${wc.capacityMinutes} menit. ` +
              'Pakai allowOverCapacity bila memang lembur.',
          );
        }
        if (end > wc.capacityMinutes) {
          throw new BadRequestException(
            `Waktu ${duration} menit mulai menit ke-${start} melewati kapasitas harian ${wc.capacityMinutes} menit.`,
          );
        }
      }

      return tx.productionSchedule.create({
        data: {
          tenantId,
          companyId,
          workCenterId: wc.id,
          productionOrderId: order.id,
          scheduledDate: date,
          startMinutes: start,
          durationMinutes: duration,
        },
        include: { workCenter: true, productionOrder: { select: { number: true, qtyPlanned: true } } },
      });
    });
  }

  async unschedule(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const schedule = await this.prisma.productionSchedule.findFirst({ where: { id, tenantId, companyId } });
    if (!schedule) throw new NotFoundException('Jadwal tidak ditemukan.');
    if (schedule.status === 'done') {
      throw new ConflictException('Jadwal yang sudah selesai tidak bisa dihapus.');
    }
    await this.prisma.productionSchedule.delete({ where: { id } });
    return { removed: true };
  }

  /** Beban kerja per work center untuk rentang tanggal — dasar Capacity Planning. */
  async capacityPlan(tenantId: string, from: string, to: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const start = new Date(from);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() + 1);

    const centers = await this.prisma.workCenter.findMany({
      where: { tenantId, companyId, isActive: true },
      orderBy: { code: 'asc' },
    });
    const schedules = await this.prisma.productionSchedule.findMany({
      where: {
        tenantId,
        companyId,
        scheduledDate: { gte: start, lt: end },
        status: { not: 'cancelled' },
      },
      include: { productionOrder: { select: { number: true } } },
      orderBy: { scheduledDate: 'asc' },
    });

    return centers.map((wc) => {
      const own = schedules.filter((s) => s.workCenterId === wc.id);
      const minutes = own.reduce((sum, s) => sum + s.durationMinutes, 0);
      return {
        workCenter: { id: wc.id, code: wc.code, name: wc.name, kind: wc.kind },
        days: daysBetween(start, end),
        availableMinutes: wc.capacityMinutes * daysBetween(start, end),
        bookedMinutes: minutes,
        utilizationPct: wc.capacityMinutes > 0 ? Math.round((minutes / (wc.capacityMinutes * daysBetween(start, end))) * 100) : 0,
        hourlyRate: Number(wc.hourlyRate),
        estimatedLaborCost: roundMoney((minutes / 60) * Number(wc.hourlyRate)),
        schedule: own.map((s) => ({
          id: s.id,
          date: s.scheduledDate.toISOString().slice(0, 10),
          order: s.productionOrder.number,
          startMinutes: s.startMinutes,
          durationMinutes: s.durationMinutes,
          status: s.status,
        })),
      };
    });
  }

  /**
   * Usulan jadwal otomatis: greedily assign order yang belum dijadwalkan ke
   * work center dengan ruang tersisa, diurutkan prioritas lalu tanggal target.
   */
  async proposeSchedule(tenantId: string, from: string, days: number) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (days < 1 || days > 90) throw new BadRequestException('Rentang harus 1–90 hari.');

    const orders = await this.prisma.productionOrder.findMany({
      where: {
        tenantId,
        companyId,
        status: 'planned',
        schedules: { none: {} },
      },
      include: { product: { select: { name: true } } },
      orderBy: [{ priority: 'asc' }, { scheduledDate: 'asc' }, { createdAt: 'asc' }],
    });
    const centers = await this.prisma.workCenter.findMany({
      where: { tenantId, companyId, isActive: true },
      orderBy: { capacityMinutes: 'desc' },
    });
    if (centers.length === 0) throw new BadRequestException('Belum ada work center aktif.');

    const booked = new Map<string, number>();
    const proposals: Array<{ orderId: string; orderNumber: string; product: string; workCenterId: string; workCenterCode: string; date: string; durationMinutes: number }> = [];

    for (const order of orders) {
      const duration = Math.max(30, Math.round(Number(order.qtyPlanned)));
      let placed = false;
      for (let offset = 0; offset < days && !placed; offset++) {
        const date = new Date(from);
        date.setUTCHours(0, 0, 0, 0);
        date.setUTCDate(date.getUTCDate() + offset);
        const key = date.toISOString().slice(0, 10);

        for (const wc of centers) {
          const used = (booked.get(`${wc.id}:${key}`) ?? 0);
          if (used + duration <= wc.capacityMinutes) {
            booked.set(`${wc.id}:${key}`, used + duration);
            proposals.push({
              orderId: order.id,
              orderNumber: order.number,
              product: order.product.name,
              workCenterId: wc.id,
              workCenterCode: wc.code,
              date: key,
              durationMinutes: duration,
            });
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        proposals.push({
          orderId: order.id,
          orderNumber: order.number,
          product: order.product.name,
          workCenterId: '',
          workCenterCode: '-',
          date: '',
          durationMinutes: duration,
        });
      }
    }

    return {
      horizonDays: days,
      unscheduled: orders.length,
      proposals,
      unplaceable: proposals.filter((p) => !p.workCenterId).map((p) => p.orderNumber),
    };
  }

  private async usedMinutes(tenantId: string, companyId: string, workCenterId: string, date: Date) {
    const agg = await this.prisma.productionSchedule.aggregate({
      where: {
        tenantId,
        companyId,
        workCenterId,
        scheduledDate: date,
        status: { not: 'cancelled' },
      },
      _sum: { durationMinutes: true },
    });
    return { minutes: agg._sum.durationMinutes ?? 0 };
  }

  // ── Quality control bertingkat ─────────────────────────────────────────

  async configureQcStages(tenantId: string, productId: string, stages: CreateQcStageDto[]) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Produk tidak ditemukan.');
    if (stages.length === 0) throw new BadRequestException('Minimal satu tahap QC.');

    const seen = new Set<string>();
    for (const s of stages) {
      if (seen.has(s.stage)) throw new BadRequestException(`Tahap ${s.stage} didaftarkan dua kali.`);
      seen.add(s.stage);
    }

    await this.prisma.qcStageConfig.deleteMany({ where: { tenantId, companyId, productId } });
    await this.prisma.qcStageConfig.createMany({
      data: stages.map((s, i) => ({
        tenantId,
        companyId,
        productId,
        stage: s.stage,
        sortOrder: i + 1,
        isRequired: s.isRequired ?? true,
        minPassPct: new Prisma.Decimal(s.minPassPct ?? 100),
      })),
    });
    return this.prisma.qcStageConfig.findMany({
      where: { tenantId, companyId, productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Catat hasil QC. Tahap hanya boleh diisi berurutan: tahap berikutnya tidak
   * bisa diperiksa sebelum tahap sebelumnya lulus. Inilah yang membuat QC
   * bertingkat benar-benar dipaksa, bukan sekadar field bebas.
   */
  async recordQc(tenantId: string, orderId: string, dto: RecordQcDto, inspectorId?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.prisma.productionOrder.findFirst({
      where: { id: orderId, tenantId, companyId },
      include: { qualityChecks: true },
    });
    if (!order) throw new NotFoundException('Order produksi tidak ditemukan.');
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new ConflictException(`Order ${order.status} tidak bisa di-QC lagi.`);
    }

    const config = await this.prisma.qcStageConfig.findMany({
      where: { tenantId, companyId, productId: order.productId, isRequired: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Tanpa konfigurasi tahap,Izinkan satu pemeriksaan bebas agar produk
    // sederhana tetap bisa lewat tanpa setup tambahan.
    if (config.length === 0) {
      return this.writeQc(order, dto, inspectorId);
    }

    const target = config.find((c) => c.stage === dto.stage);
    if (!target) {
      throw new BadRequestException(
        `Tahap "${dto.stage}" tidak wajib untuk produk ini. Tahap yang diminta: ${config.map((c) => c.stage).join(' → ')}.`,
      );
    }
    const index = config.indexOf(target);
    const prior = config.slice(0, index);
    const done = new Map(order.qualityChecks.map((q) => [q.stage, q]));
    for (const stage of prior) {
      const existing = done.get(stage.stage);
      if (!existing) {
        throw new ConflictException(`Tahap "${stage.stage}" belum diperiksa. QC wajib berurutan.`);
      }
      if (existing.result === 'failed') {
        throw new ConflictException(`Tahap "${stage.stage}" gagal, produksi tidak boleh lanjut.`);
      }
    }

    return this.writeQc(order, dto, inspectorId, Number(target.minPassPct));
  }

  private async writeQc(
    order: { id: string; tenantId: string; companyId: string; productId: string },
    dto: RecordQcDto,
    inspectorId?: string,
    minPassPct = 100,
  ) {
    const checkedQty = dto.checkedQty ?? 0;
    const defectQty = dto.defectQty ?? 0;
    if (checkedQty <= 0) throw new BadRequestException('Jumlah yang diperiksa harus lebih dari 0.');
    if (defectQty > checkedQty) {
      throw new BadRequestException('Jumlah cacat tidak boleh melebihi jumlah yang diperiksa.');
    }
    const passPct = ((checkedQty - defectQty) / checkedQty) * 100;
    // Ambang lulus per tahap (minPassPct) dihormati; tanpa konfigurasi = 100% (tanpa cacat).
    const result = defectQty === 0 || passPct >= minPassPct ? 'passed' : 'failed';

    return this.prisma.qualityCheck.upsert({
      where: { productionOrderId_stage: { productionOrderId: order.id, stage: dto.stage } },
      update: {
        result,
        checkedQty: new Prisma.Decimal(checkedQty),
        defectQty: new Prisma.Decimal(defectQty),
        note: dto.note ?? '',
        inspectedById: inspectorId ?? null,
        inspectedAt: new Date(),
      },
      create: {
        tenantId: order.tenantId,
        companyId: order.companyId,
        productionOrderId: order.id,
        stage: dto.stage,
        result,
        checkedQty: new Prisma.Decimal(checkedQty),
        defectQty: new Prisma.Decimal(defectQty),
        note: dto.note ?? '',
        inspectedById: inspectorId ?? null,
      },
    });
  }

  /** Sisa tahap yang masih wajib dilalui sebelum order bisa diselesaikan. */
  async qcProgress(tenantId: string, orderId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.prisma.productionOrder.findFirst({
      where: { id: orderId, tenantId, companyId },
      include: { qualityChecks: true },
    });
    if (!order) throw new NotFoundException('Order produksi tidak ditemukan.');

    const config = await this.prisma.qcStageConfig.findMany({
      where: { tenantId, companyId, productId: order.productId, isRequired: true },
      orderBy: { sortOrder: 'asc' },
    });
    const done = new Map(order.qualityChecks.map((q) => [q.stage, q.result]));
    const steps = config.map((c) => ({ stage: c.stage, result: done.get(c.stage) ?? 'pending' as const }));
    return {
      steps,
      pending: steps.filter((s) => s.result === 'pending').length,
      failed: steps.filter((s) => s.result === 'failed').length,
      readyToComplete: steps.every((s) => s.result !== 'pending' && s.result !== 'failed'),
    };
  }
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
}