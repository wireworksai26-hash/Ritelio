import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { computeDemandForecast, forecastWindowStart } from './demand-forecast';
import {
  buildWorkload,
  evaluateCapacity,
  overlappingAllocations,
  parseAllocationWindow,
  withFreeCapacity,
} from './resource-calc';

/**
 * Resource Allocation: memastikan orang tidak dipakai lebih dari 100% dan proyek
 * tidak punya orang yang sama di dua proyek dengan periode yang bertindih.
 *
 * Kedua guard itu yang membedakan fitur ini dari sekadar catatan. Tanpa
 * keduanya, "resource allocation" hanya kolom yang tidak pernah diisi.
 */
@Injectable()
export class ResourceService {
  constructor(private readonly prisma: PrismaService) {}

  async listAllocations(tenantId: string, projectId?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (projectId) {
      // Proyek harus milik tenant ini: id asing dijawab 404, bukan 200 berisi daftar kosong.
      const project = await this.prisma.project.findFirst({ where: { id: projectId, tenantId, companyId }, select: { id: true } });
      if (!project) throw new NotFoundException('Proyek tidak ditemukan.');
    }
    return this.prisma.resourceAllocation.findMany({
      take: 500,
      where: { tenantId, companyId, ...(projectId ? { projectId } : {}) },
      include: {
        employee: { select: { employeeNo: true, fullName: true, position: { select: { name: true } } } },
        project: { select: { code: true, name: true, status: true } },
      },
      orderBy: [{ startDate: 'desc' }],
    });
  }

  async allocate(tenantId: string, dto: {
    projectId: string;
    employeeId: string;
    allocationPct: number;
    hoursPerWeek?: number;
    startDate: string;
    endDate?: string;
    role?: string;
  }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const { start, end } = parseAllocationWindow(dto);

    const [project, employee] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: dto.projectId, tenantId, companyId }, select: { id: true, code: true } }),
      this.prisma.employee.findFirst({ where: { id: dto.employeeId, tenantId, companyId, isActive: true }, select: { id: true, fullName: true } }),
    ]);
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');
    if (!employee) throw new NotFoundException('Employee tidak ditemukan atau nonaktif.');

    const conflicts = await this.prisma.resourceAllocation.findMany({
      where: {
        tenantId,
        companyId,
        employeeId: dto.employeeId,
        isActive: true,
        id: { not: '' },
        // periode tumpang tindih: mulai yang baru < selesai yang lama (atau tanpa
        // batas), dan selesai yang baru > mulai yang lama
        startDate: end ? { lte: end } : undefined,
        ...(end ? {} : {}),
      },
      select: { allocationPct: true, startDate: true, endDate: true, project: { select: { id: true, code: true } } },
    });

    const overlapping = overlappingAllocations(conflicts, start, end);
    const verdict = evaluateCapacity(overlapping, dto.allocationPct);
    if (verdict.overbooked) {
      throw new ConflictException(
        `Total alokasi ${employee.fullName} jadi ${verdict.totalPct}% — melebihi 100%. Sudah terpakai: ${verdict.detail}.`,
      );
    }

    try {
      return await this.prisma.resourceAllocation.create({
        data: {
          tenantId,
          companyId,
          projectId: dto.projectId,
          employeeId: dto.employeeId,
          allocationPct: dto.allocationPct,
          hoursPerWeek: new Prisma.Decimal(dto.hoursPerWeek ?? 40),
          startDate: start,
          endDate: end,
          role: dto.role ?? '',
        },
        include: { project: { select: { code: true, name: true } }, employee: { select: { fullName: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Karyawan sudah dialokasikan ke proyek ini dengan tanggal mulai yang sama.');
      }
      throw error;
    }
  }

  async release(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const allocation = await this.prisma.resourceAllocation.findFirst({ where: { id, tenantId, companyId } });
    if (!allocation) throw new NotFoundException('Alokasi tidak ditemukan.');
    return this.prisma.resourceAllocation.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * Beban kerja per orang. Hours dari timesheet yang sudah disetujui menjadi
   * sinyal overloaded, bukan tebakan: orang dengan alokasi aktif 100% tapi
   * menagih lebih dari capacity mingguan memang perlu ditinjau.
   */
  async workload(tenantId: string, on?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const at = on ? new Date(on) : new Date();

    const allocations = await this.prisma.resourceAllocation.findMany({
      where: {
        tenantId,
        companyId,
        isActive: true,
        startDate: { lte: at },
        OR: [{ endDate: null }, { endDate: { gte: at } }],
      },
      include: {
        employee: { select: { id: true, employeeNo: true, fullName: true } },
        project: { select: { id: true, code: true, name: true, status: true } },
      },
    });

    const since = new Date(at);
    since.setUTCDate(since.getUTCDate() - 30);
    const sheets = await this.prisma.timesheet.findMany({
      where: {
        tenantId,
        companyId,
        workDate: { gte: since, lte: at },
        status: 'approved',
      },
      select: { employeeId: true, hours: true },
    });
    const hoursByEmployee = new Map<string, number>();
    for (const s of sheets) {
      hoursByEmployee.set(s.employeeId, (hoursByEmployee.get(s.employeeId) ?? 0) + Number(s.hours));
    }

    return buildWorkload(allocations, hoursByEmployee);
  }

  /** Orang yang belum dialokasikan tetapi punya kapasitas tersisa. */
  async availableStaff(tenantId: string, on?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const at = on ? new Date(on) : new Date();
    const used = await this.prisma.resourceAllocation.groupBy({
      by: ['employeeId'],
      where: {
        tenantId,
        companyId,
        isActive: true,
        startDate: { lte: at },
        OR: [{ endDate: null }, { endDate: { gte: at } }],
      },
      _sum: { allocationPct: true },
    });
    const taken = new Map(used.map((u) => [u.employeeId, u._sum.allocationPct ?? 0]));

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, companyId, isActive: true },
      select: { id: true, employeeNo: true, fullName: true, position: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });
    return withFreeCapacity(employees, taken);
  }

  /**
   * Demand forecasting dari histori penjualan.
   *
   * Metodenya sengaja simpel dan bisa dijelaskan: moving average berbobot
   * (recency-weighted) atas qty terjual per periode, dengan buffer 5%. Prakiraan
   * musiman butuh data berbulan-bulan yang belum tentu ada, jadi tidak diklaim di sini.
   */
  async demandForecast(tenantId: string, opts: { months?: number; horizon?: number; productId?: string }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const months = opts.months ?? 6;
    const horizon = opts.horizon ?? 3;
    const now = new Date();
    const from = forecastWindowStart(now, Math.max(1, Math.floor(months)));

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        companyId,
        type: 'sale',
        createdAt: { gte: from },
        ...(opts.productId ? { productId: opts.productId } : {}),
      },
      select: {
        productId: true,
        quantity: true,
        createdAt: true,
        product: { select: { sku: true, name: true, unit: true, reorderPoint: true, reorderQty: true } },
      },
    });

    const { from: _from, ...forecast } = computeDemandForecast(movements, { months, horizon, now });
    return { ...forecast, generatedAt: now };
  }
}