import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { isValidKpiPeriod, rankLeaderboard, scoreKpiItems } from './kpi-score';

/**
 * KPI & Performance Evaluation.
 *
 * Skor penilaian dihitung dari pencapaian tiap target, dibobot, lalu dikalikan
 * `higherIsBetter` supaya KPI biaya (turun lebih baik) tidak otomatis dihargai
 * tinggi. Grade disimpan sebagai snapshot supaya nilai historis tidak berubah
 * saat definisi KPI diedit di kemudian hari.
 */
@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.kpiDefinition.findMany({
      where: { tenantId, companyId },
      include: { _count: { select: { targets: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createDefinition(tenantId: string, dto: {
    code: string;
    name: string;
    description?: string;
    unit?: string;
    higherIsBetter?: boolean;
  }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    try {
      return await this.prisma.kpiDefinition.create({
        data: {
          tenantId,
          companyId,
          code: dto.code,
          name: dto.name,
          description: dto.description ?? '',
          unit: dto.unit ?? 'number',
          higherIsBetter: dto.higherIsBetter ?? true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(`Kode KPI "${dto.code}" sudah dipakai.`);
      }
      throw error;
    }
  }

  async setTargets(tenantId: string, period: string, targets: Array<{ kpiId: string; employeeId: string; target: number; weight?: number; dueDate?: string }>) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (targets.length === 0) throw new BadRequestException('Daftar target kosong.');
    if (!isValidKpiPeriod(period)) {
      throw new BadRequestException('Format periode harus "YYYY-MM" atau "YYYY-Qn".');
    }

    const kpis = await this.prisma.kpiDefinition.findMany({
      where: { tenantId, companyId, id: { in: targets.map((t) => t.kpiId) } },
      select: { id: true },
    });
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, companyId, id: { in: targets.map((t) => t.employeeId) }, isActive: true },
      select: { id: true },
    });
    if (kpis.length !== new Set(targets.map((t) => t.kpiId)).size) {
      throw new BadRequestException('Ada KPI yang tidak ditemukan.');
    }
    if (employees.length !== new Set(targets.map((t) => t.employeeId)).size) {
      throw new BadRequestException('Ada employee yang tidak ditemukan atau nonaktif.');
    }

    const saved = [];
    for (const t of targets) {
      if (!Number.isFinite(t.target) || t.target < 0) throw new BadRequestException('Target harus angka tidak negatif.');
      if (t.weight !== undefined && (!Number.isFinite(t.weight) || t.weight < 0)) {
        throw new BadRequestException('Bobot harus angka tidak negatif.');
      }
      saved.push(
        await this.prisma.kpiTarget.upsert({
          where: {
            tenantId_kpiId_employeeId_period: {
              tenantId, kpiId: t.kpiId, employeeId: t.employeeId, period,
            },
          },
          update: {
            target: new Prisma.Decimal(t.target),
            weight: new Prisma.Decimal(t.weight ?? 1),
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
          },
          create: {
            tenantId,
            companyId,
            kpiId: t.kpiId,
            employeeId: t.employeeId,
            period,
            target: new Prisma.Decimal(t.target),
            weight: new Prisma.Decimal(t.weight ?? 1),
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
          },
        }),
      );
    }
    return saved;
  }

  /** Daftar target KPI per periode (dan karyawan bila diisi), lengkap dengan nama KPI dan pemiliknya. */
  async listTargets(tenantId: string, period?: string, employeeId?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.kpiTarget.findMany({
      where: {
        tenantId,
        companyId,
        ...(period ? { period } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      include: {
        employee: { select: { employeeNo: true, fullName: true } },
        kpi: { select: { code: true, name: true, unit: true, higherIsBetter: true } },
      },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  async recordActual(tenantId: string, targetId: string, actual: number) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (!Number.isFinite(actual)) throw new BadRequestException('Nilai aktual harus angka.');
    const target = await this.prisma.kpiTarget.findFirst({ where: { id: targetId, tenantId, companyId } });
    if (!target) throw new NotFoundException('Target KPI tidak ditemukan.');
    return this.prisma.kpiTarget.update({
      where: { id: targetId },
      data: { actual: new Prisma.Decimal(actual) },
    });
  }

  /** Progres satu employee pada satu periode, termasuk bobot dan pencapaian. */
  async employeeScore(tenantId: string, employeeId: string, period: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const targets = await this.prisma.kpiTarget.findMany({
      where: { tenantId, companyId, employeeId, period },
      include: { kpi: { select: { code: true, name: true, unit: true, higherIsBetter: true } } },
    });
    if (targets.length === 0) {
      return { employeeId, period, score: 0, grade: 'N/A', items: [], note: 'Belum ada target KPI pada periode ini.' };
    }

    const { items, score, grade, unreported } = scoreKpiItems(
      targets.map((t) => ({
        kpiCode: t.kpi.code,
        kpiName: t.kpi.name,
        unit: t.kpi.unit,
        higherIsBetter: t.kpi.higherIsBetter,
        target: Number(t.target),
        actual: t.actual === null ? null : Number(t.actual),
        weight: Number(t.weight),
      })),
    );

    return {
      employeeId,
      period,
      score,
      grade,
      items,
      note: unreported > 0 ? `${unreported} KPI belum diisi nilai aktualnya.` : undefined,
    };
  }

  /** Simpan hasil penilaian. Skor dihitung ulang di server, bukan dari klien. */
  async review(tenantId: string, employeeId: string, period: string, dto: {
    strengths?: string;
    improvements?: string;
    submit?: boolean;
  }, reviewerId?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, tenantId, companyId } });
    if (!employee) throw new NotFoundException('Employee tidak ditemukan.');

    const computed = await this.employeeScore(tenantId, employeeId, period);
    if (computed.items.length === 0) {
      throw new BadRequestException(`Belum ada target KPI untuk ${period}, penilaian tidak bisa dihitung.`);
    }
    if (computed.note) {
      throw new BadRequestException(computed.note);
    }

    return this.prisma.performanceReview.upsert({
      where: { tenantId_companyId_employeeId_period: { tenantId, companyId, employeeId, period } },
      update: {
        score: new Prisma.Decimal(computed.score),
        grade: computed.grade,
        strengths: dto.strengths ?? '',
        improvements: dto.improvements ?? '',
        reviewerId: reviewerId ?? null,
        status: dto.submit ? 'submitted' : 'draft',
        reviewedAt: dto.submit ? new Date() : null,
      },
      create: {
        tenantId,
        companyId,
        employeeId,
        period,
        score: new Prisma.Decimal(computed.score),
        grade: computed.grade,
        strengths: dto.strengths ?? '',
        improvements: dto.improvements ?? '',
        reviewerId: reviewerId ?? null,
        status: dto.submit ? 'submitted' : 'draft',
        reviewedAt: dto.submit ? new Date() : null,
      },
    });
  }

  async listReviews(tenantId: string, period?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.performanceReview.findMany({
      where: { tenantId, companyId, ...(period ? { period } : {}) },
      include: { employee: { select: { employeeNo: true, fullName: true, position: { select: { name: true } } } } },
      orderBy: [{ period: 'desc' }, { score: 'desc' }],
    });
  }

  /** Papan peringkat — dasar payroll bonus bila nanti dipakai. */
  async leaderboard(tenantId: string, period: string, limit = 10) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const take = Math.min(Math.max(Math.floor(Number(limit)) || 10, 1), 100);
    const reviews = await this.prisma.performanceReview.findMany({
      where: { tenantId, companyId, period, status: { not: 'draft' } },
      include: { employee: { select: { employeeNo: true, fullName: true } } },
      orderBy: { score: 'desc' },
      take,
    });
    return rankLeaderboard(
      reviews.map((r) => ({
        employeeNo: r.employee.employeeNo,
        fullName: r.employee.fullName,
        score: Number(r.score),
        grade: r.grade,
      })),
    );
  }
}
