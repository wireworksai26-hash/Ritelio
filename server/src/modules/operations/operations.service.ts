import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { JournalService } from '../accounting/journal.service';
import { ApprovalService } from '../approvals/approval.service';
import { ReceivablesService } from '../receivables/receivables.service';
import { ensureAccount, type AccountSpec } from '../inventory/inventory-adjustment';
import { advisoryLock, isUniqueViolation } from '../inventory/tx-retry';
import { claimShipmentStatus, type ShipmentStatusValue } from './shipment-status';
import type {
  CreateProjectDto,
  CreateShipmentDto,
  CreateTimesheetDto,
  CreateVehicleDto,
  CreateWorkOrderDto,
  RecordFuelDto,
  UpdateWorkOrderDto,
} from './dto/operations.dto';

const REVENUE_ACCOUNT = '4000';
const CASH_ACCOUNT = '1000';
// COA bawaan pendaftaran tenant tidak memuat akun ini, jadi dibuat saat pertama dibutuhkan.
const MAINTENANCE_EXPENSE: AccountSpec = { code: '6400', name: 'Beban Pemeliharaan', type: 'expense' };
const RECEIVABLE_ACCOUNT = '1200';

@Injectable()
export class OperationsService {
  constructor(
private readonly prisma: PrismaService,
  private readonly journals: JournalService,
  private readonly receivables: ReceivablesService,
  private readonly approval: ApprovalService,
  ) {}

  // ══════════════════════ PROYEK ══════════════════════

  async listProjects(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.project.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: {
        customer: { select: { code: true, name: true } },
        manager: { select: { employeeNo: true, fullName: true } },
        milestones: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProject(tenantId: string, dto: CreateProjectDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId, companyId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan.');
    }
    if (dto.managerId) {
      const manager = await this.prisma.employee.findFirst({
        where: { id: dto.managerId, tenantId, companyId },
        select: { id: true },
      });
      if (!manager) throw new NotFoundException('Manajer proyek tidak ditemukan.');
    }
    if (dto.startDate && dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    }
    try {
    return await this.prisma.project.create({
      data: {
        tenantId,
        companyId,
        code: dto.code,
        name: dto.name,
        customerId: dto.customerId ?? null,
        managerId: dto.managerId ?? null,
        budget: new Prisma.Decimal(dto.budget ?? 0),
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        description: dto.description ?? '',
      },
      include: { milestones: true },
    });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`Kode proyek "${dto.code}" sudah dipakai.`);
      throw error;
    }
  }

  async listMilestones(tenantId: string, projectId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, companyId },
      select: { id: true, code: true, name: true, status: true },
    });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');

    const milestones = await this.prisma.projectMilestone.findMany({
      where: { tenantId, companyId, projectId },
      include: {
        // `dependsOn` menunjuk ke baris dependensi, bukan langsung ke
        // milestone-nya — jadi harus satu tingkat lagi ke bawah.
        dependsOn: {
          select: { dependsOn: { select: { id: true, name: true, completedAt: true } } },
        },
        blocks: {
          select: { milestone: { select: { id: true, name: true, completedAt: true } } },
        },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });

    const done = milestones.filter((m) => m.completedAt !== null);
    const overdue = milestones.filter(
      (m) => !m.completedAt && m.dueDate && new Date(m.dueDate) < new Date(),
    );

    return {
      project,
      summary: {
        total: milestones.length,
        completed: done.length,
        inProgress: milestones.filter((m) => m.progress > 0 && !m.completedAt).length,
        notStarted: milestones.filter((m) => m.progress === 0 && !m.completedAt).length,
        overdue: overdue.length,
        progressPct:
          milestones.length > 0
            ? Math.round(milestones.reduce((s, m) => s + (m.completedAt ? 100 : m.progress), 0) / milestones.length)
            : 0,
      },
      milestones: milestones.map((m) => ({
        ...m,
        overdue: !m.completedAt && !!m.dueDate && new Date(m.dueDate) < new Date(),
        daysLate:
          !m.completedAt && m.dueDate
            ? Math.floor((Date.now() - new Date(m.dueDate).getTime()) / 86_400_000)
            : 0,
      })),
    };
  }

  async addMilestone(
    tenantId: string,
    id: string,
    name: string,
    dueDate?: string,
    startDate?: string,
    dependsOnIds?: string[],
  ) {
    const project = await this.assertProject(tenantId, id);
    if (startDate && dueDate && new Date(dueDate) < new Date(startDate)) {
      throw new BadRequestException('Tenggat tidak boleh sebelum tanggal mulai.');
    }
    const depIds = [...new Set(dependsOnIds ?? [])];
    if (depIds.length > 0) {
      // Dependensi harus milestone di PROYEK YANG SAMA; id asing/lintas proyek ditolak.
      const found = await this.prisma.projectMilestone.count({
        where: { id: { in: depIds }, tenantId: project.tenantId, companyId: project.companyId, projectId: project.id },
      });
      if (found !== depIds.length) {
        throw new BadRequestException('Ada dependensi yang bukan milestone pada proyek ini.');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.projectMilestone.create({
        data: {
          tenantId: project.tenantId,
          companyId: project.companyId,
          projectId: project.id,
          name,
          startDate: startDate ? new Date(startDate) : null,
          dueDate: dueDate ? new Date(dueDate) : null,
        },
      });
      if (depIds.length > 0) {
        await tx.milestoneDependency.createMany({
          data: depIds.map((depId) => ({
            tenantId: project.tenantId,
            companyId: project.companyId,
            projectId: project.id,
            milestoneId: created.id,
            dependsOnId: depId,
          })),
        });
      }
      return created;
    });
  }

  /** Selesaikan milestone; dependensi yang belum selesai menghalangi. */
  async completeMilestone(tenantId: string, milestoneId: string, progress = 100) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const milestone = await this.prisma.projectMilestone.findFirst({
      where: { id: milestoneId, tenantId, companyId },
      include: { dependsOn: { select: { dependsOn: { select: { name: true, completedAt: true } } } } },
    });
    if (!milestone) throw new NotFoundException('Milestone tidak ditemukan.');
    if (milestone.completedAt) throw new ConflictException(`Milestone "${milestone.name}" sudah selesai.`);

    const pending = milestone.dependsOn.filter((d) => !d.dependsOn.completedAt);
    if (pending.length > 0) {
      throw new ConflictException(
        `Milestone bergantung pada yang belum selesai: ${pending.map((p) => p.dependsOn.name).join(', ')}.`,
      );
    }
    if (progress < 0 || progress > 100) {
      throw new BadRequestException('Progres harus antara 0 dan 100.');
    }

    // Klaim bersyarat: dua penyelesaian bersamaan hanya berhasil sekali.
    const claimed = await this.prisma.projectMilestone.updateMany({
      where: { id: milestoneId, tenantId, companyId, completedAt: null },
      data: { progress, completedAt: progress === 100 ? new Date() : null },
    });
    if (claimed.count !== 1) throw new ConflictException(`Milestone "${milestone.name}" sudah selesai.`);
    return this.prisma.projectMilestone.findUniqueOrThrow({ where: { id: milestoneId } });
  }

  async updateMilestone(
    tenantId: string,
    milestoneId: string,
    dto: { startDate?: string; dueDate?: string; progress?: number; note?: string },
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const milestone = await this.prisma.projectMilestone.findFirst({
      where: { id: milestoneId, tenantId, companyId },
    });
    if (!milestone) throw new NotFoundException('Milestone tidak ditemukan.');

    const start = dto.startDate ? new Date(dto.startDate) : milestone.startDate;
    const due = dto.dueDate ? new Date(dto.dueDate) : milestone.dueDate;
    if (start && due && due < start) {
      throw new BadRequestException('Tenggat tidak boleh sebelum tanggal mulai.');
    }
    if (dto.progress !== undefined && (dto.progress < 0 || dto.progress > 100)) {
      throw new BadRequestException('Progres harus antara 0 dan 100.');
    }

    const progress = dto.progress ?? milestone.progress;
    if (progress === 100 && !milestone.completedAt) {
      // Jalur ini juga bisa menyelesaikan milestone; dependensinya wajib dicek sama seperti complete.
      const pending = await this.prisma.milestoneDependency.findMany({
        where: { milestoneId, dependsOn: { completedAt: null } },
        select: { dependsOn: { select: { name: true } } },
      });
      if (pending.length > 0) {
        throw new ConflictException(
          `Milestone bergantung pada yang belum selesai: ${pending.map((p) => p.dependsOn.name).join(', ')}.`,
        );
      }
    }
    return this.prisma.projectMilestone.update({
      where: { id: milestoneId },
      data: {
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        progress,
        completedAt: progress === 100 && !milestone.completedAt ? new Date() : undefined,
        note: dto.note ?? undefined,
      },
    });
  }

  async recordTimesheet(tenantId: string, dto: CreateTimesheetDto) {
    const project = await this.assertProject(tenantId, dto.projectId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, tenantId: project.tenantId, companyId: project.companyId, isActive: true },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee tidak aktif atau tidak ditemukan.');

    // Kolom work_date bertipe DATE: samakan ke awal hari UTC supaya kunci unik
    // (karyawan, tanggal) cocok walau klien mengirim jam.
    const workDate = new Date(dto.workDate);
    workDate.setUTCHours(0, 0, 0, 0);
    const where = { employeeId_workDate: { employeeId: dto.employeeId, workDate } };

    // Timesheet yang sudah disetujui/ditagihkan tidak boleh ditimpa: menimpanya
    // mengubah jam yang sudah jadi faktur (atau mereset persetujuannya).
    const existing = await this.prisma.timesheet.findUnique({ where });
    if (existing && (existing.status === 'approved' || existing.billedAt)) {
      throw new ConflictException(
        existing.billedAt
          ? 'Timesheet tanggal ini sudah ditagihkan dan tidak bisa diubah.'
          : 'Timesheet tanggal ini sudah disetujui dan tidak bisa diubah.',
      );
    }
    if (existing && existing.projectId !== project.id && existing.status !== 'rejected') {
      throw new ConflictException('Karyawan sudah mencatat jam untuk proyek lain pada tanggal ini.');
    }

    return this.prisma.timesheet.upsert({
      where,
      update: {
        projectId: project.id,
        hours: new Prisma.Decimal(dto.hours),
        hourlyRate: new Prisma.Decimal(dto.hourlyRate ?? 0),
        billable: dto.billable ?? true,
        note: dto.note ?? '',
        status: 'submitted',
      },
      create: {
        tenantId: project.tenantId,
        companyId: project.companyId,
        projectId: project.id,
        employeeId: dto.employeeId,
        workDate,
        hours: new Prisma.Decimal(dto.hours),
        hourlyRate: new Prisma.Decimal(dto.hourlyRate ?? 0),
        billable: dto.billable ?? true,
        note: dto.note ?? '',
      },
    });
  }

  async approveTimesheet(tenantId: string, id: string, approverId: string) {
    const sheet = await this.assertTimesheet(tenantId, id);
    if (sheet.status !== 'submitted') {
      throw new ConflictException(`Timesheet sudah berstatus ${sheet.status}.`);
    }
    // Pemisahan kewenangan: pemilik timesheet (karyawan yang tertaut ke akun penyetuju) tidak menyetujui jamnya sendiri.
    const owner = await this.prisma.employee.findFirst({
      where: { id: sheet.employeeId, tenantId: sheet.tenantId },
      select: { userId: true },
    });
    if (owner?.userId && owner.userId === approverId) {
      throw new ForbiddenException('Anda tidak boleh menyetujui timesheet Anda sendiri.');
    }

    // Timesheet billable ikut alur approval supaya tidak bisa ditagihkan ke
    // klien hanya karena satu orang menyetujui. Setelah disetujui, tagihan
    // sendiri tetap butuh izin finance (lihat controller `bill`).
    if (sheet.billable) {
      await this.approval
        .submit({
          tenantId: sheet.tenantId,
          companyId: sheet.companyId,
          documentType: 'timesheet',
          documentId: sheet.id,
          submittedById: approverId,
          note: 'Persetujuan timesheet proyek',
          steps: [{ requiredPermission: 'finance:write' }],
        })
        .catch((error: unknown) => {
          if (error instanceof ConflictException) throw error;
          // Approval sementara gagal tidak boleh memblokir pencatatan jam;
          // status timesheet tetap jadi approved dan bisa diaudit terpisah.
          return undefined;
        });
    }

    const claimed = await this.prisma.timesheet.updateMany({
      where: { id, tenantId, status: 'submitted' },
      data: { status: 'approved', approvedById: approverId, approvedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ConflictException('Timesheet sudah diputuskan oleh permintaan lain.');
    return this.prisma.timesheet.findUniqueOrThrow({ where: { id } });
  }

  /** Rekap biaya proyek dari timesheet yang sudah disetujui. */
  async projectCosting(tenantId: string, id: string) {
    const project = await this.assertProject(tenantId, id);
    const sheets = await this.prisma.timesheet.findMany({
      where: { tenantId: project.tenantId, companyId: project.companyId, projectId: project.id },
      include: { employee: { select: { employeeNo: true, fullName: true } } },
    });

    const billable = sheets.filter((s) => s.status === 'approved' && s.billable);
    const unbilled = billable.filter((s) => !s.billedAt);
    const totalHours = sheets.reduce((s, r) => s + Number(r.hours), 0);
    const billableHours = billable.reduce((s, r) => s + Number(r.hours), 0);
    const billableAmount = billable.reduce(
      (s, r) => s + Number(r.hours) * Number(r.hourlyRate),
      0,
    );
    const unbilledAmount = unbilled.reduce((s, r) => s + Number(r.hours) * Number(r.hourlyRate), 0);

    return {
      project: { id: project.id, code: project.code, name: project.name, budget: Number(project.budget) },
      budget: roundMoney(Number(project.budget)),
      totalHours: roundMoney(totalHours),
      billableHours: roundMoney(billableHours),
      billableAmount: roundMoney(billableAmount),
      // Yang akan terbit kalau billProject dipanggil sekarang. Dipisah dari
      // billableAmount supaya operator tahu sisa tagihan, bukan total historis.
      unbilledAmount: roundMoney(unbilledAmount),
      unbilledSheets: unbilled.length,
      utilizationPct:
        totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
      // Kalau total billable sudah lewat anggaran, selisihnya dikembalikan
      // supaya terlihat sebelum tagihan terbit.
      overBudget:
        billableAmount > Number(project.budget) && Number(project.budget) > 0
          ? roundMoney(billableAmount - Number(project.budget))
          : 0,
      entries: billable.map((s) => ({
        employeeNo: s.employee.employeeNo,
        name: s.employee.fullName,
        hours: Number(s.hours),
        rate: Number(s.hourlyRate),
        amount: roundMoney(Number(s.hours) * Number(s.hourlyRate)),
        billed: !!s.billedAt,
        workDate: s.workDate.toISOString().slice(0, 10),
      })),
    };
  }

/**
 * Daftar timesheet untuk grid mingguan. Endpoint ini tidak ada sebelumnya —
 * hanya ada POST — sehingga frontend tidak bisa menampilkan apa pun.
 */
  async listTimesheets(
    tenantId: string,
    filter: { projectId?: string; employeeId?: string; status?: string; from?: string; to?: string; take?: number },
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    // Status 'draft' diterima DTO tapi tidak ada pada enum DB (timesheet langsung 'submitted'):
    // hasilnya selalu kosong, bukan error Prisma.
    if (filter.status === 'draft') {
      return {
        data: [],
        totals: { hours: 0, billableHours: 0, billableAmount: 0, unbilledAmount: 0, sheets: 0, pending: 0, billed: 0 },
      };
    }
    const rows = await this.prisma.timesheet.findMany({
      where: {
        tenantId,
        companyId,
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(filter.from || filter.to
          ? {
              workDate: {
                ...(filter.from ? { gte: new Date(filter.from) } : {}),
                ...(filter.to ? { lte: new Date(filter.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        employee: { select: { employeeNo: true, fullName: true } },
        project: { select: { code: true, name: true } },
      },
      orderBy: [{ workDate: 'desc' }, { employee: { employeeNo: 'asc' } }],
      take: Math.min(filter.take ?? 100, 500),
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.hours += Number(r.hours);
        if (r.status === 'approved' && r.billable) {
          acc.billableHours += Number(r.hours);
          acc.billableAmount += Number(r.hours) * Number(r.hourlyRate);
          if (!r.billedAt) acc.unbilledAmount += Number(r.hours) * Number(r.hourlyRate);
        }
        return acc;
      },
      { hours: 0, billableHours: 0, billableAmount: 0, unbilledAmount: 0 },
    );

    return {
      data: rows.map((r) => ({
        ...r,
        hours: Number(r.hours),
        hourlyRate: Number(r.hourlyRate),
        amount: roundMoney(Number(r.hours) * Number(r.hourlyRate)),
      })),
      totals: {
        ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, roundMoney(v)])),
        sheets: rows.length,
        pending: rows.filter((r) => r.status === 'submitted').length,
        billed: rows.filter((r) => r.billedAt !== null).length,
      },
    };
  }

  /**
   * Billing proyek ke klien: Dr Piutang / Cr Pendapatan dari timesheet yang
   * disetujui, lalu faktur piutang terbit otomatis.
   *
   * Yang membuat ini idempoten adalah penanda `billedAt` per timesheet, bukan
   * status proyek. Sebelumnya penjaganya menunjuk `project.status`, dan status
   * itu tidak pernah ditulis siapa pun — sehingga endpoint ini bisa dipanggil
   * berulang atas jam yang sama dan menerbitkan pendapatan serta faktur dobel.
   */
  async billProject(tenantId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId },
      include: {
        customer: true,
        timesheets: {
          where: { status: 'approved', billable: true, billedAt: null },
          orderBy: { workDate: 'asc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');
    if (!project.customerId) {
      throw new BadRequestException('Proyek tanpa pelanggan tidak bisa ditagihkan.');
    }
    const customer = project.customer;
    if (!customer) throw new BadRequestException('Data pelanggan proyek tidak ditemukan.');

    const preview = roundMoney(
      project.timesheets.reduce((s, r) => s + Number(r.hours) * Number(r.hourlyRate), 0),
    );
    if (preview <= 0) {
      throw new BadRequestException(
        'Tidak ada timesheet billable yang sudah disetujui dan belum pernah ditagihkan.',
      );
    }

    const companyId = project.companyId;
    const [revenue, receivable] = await Promise.all([
      this.account(tenantId, companyId, REVENUE_ACCOUNT, 'Pendapatan Usaha'),
      this.account(tenantId, companyId, RECEIVABLE_ACCOUNT, 'Piutang Usaha'),
    ]);

    return this.prisma.$transaction(async (tx) => {
      // Klaim baris secara atomik per timesheet supaya dua permintaan yang
      // bersamaan tidak bisa memilih set jam yang sama. Nilai tagihan dihitung
      // dari baris yang BENAR-BENAR diklaim, bukan dari daftar yang dibaca sebelum
      // transaksi (yang bisa sudah ditagih permintaan lain).
      const claimed: string[] = [];
      let claimedAmount = 0;
      for (const sheet of project.timesheets) {
        const result = await tx.timesheet.updateMany({
          where: { id: sheet.id, billedAt: null, status: 'approved', billable: true },
          data: { billedAt: new Date() },
        });
        if (result.count === 1) {
          claimed.push(sheet.id);
          claimedAmount += roundMoney(Number(sheet.hours) * Number(sheet.hourlyRate));
        }
      }
      if (claimed.length === 0) {
        throw new ConflictException('Seluruh timesheet proyek ini sudah pernah ditagihkan.');
      }
      const amount = roundMoney(claimedAmount);
      if (amount <= 0) {
        throw new BadRequestException('Tarif per jam timesheet bernilai 0, tidak ada yang bisa ditagihkan.');
      }

      const entryDate = new Date();
      const journal = await this.journals.post(tx, {
        tenantId,
        companyId,
        entryDate,
        sourceModule: 'project',
        sourceRefId: project.id,
        memo: `Tagihan proyek ${project.code}`,
        lines: [
          { accountId: receivable.id, direction: 'debit', amount, memo: 'Piutang usaha' },
          { accountId: revenue.id, direction: 'credit', amount, memo: 'Pendapatan proyek' },
        ],
      });

      const dueDays = customer.paymentTermDays ?? 0;
      const dueDate = new Date(entryDate);
      dueDate.setDate(dueDate.getDate() + dueDays);
      const invoice = await this.receivables.createInvoiceForSale(tx, {
        tenantId,
        companyId,
        customerId: customer.id,
        projectId: project.id,
        journalId: journal.id,
        total: amount,
        dueDate,
      });

      await tx.timesheet.updateMany({
        where: { id: { in: claimed } },
        data: { billedInvoiceId: invoice.id },
      });
      await tx.project.update({
        where: { id },
        data: { invoices: { connect: { id: invoice.id } } },
      });
      return { billed: true, amount, billedSheets: claimed.length, invoice };
    });
  }

  /** Timesheet yang siap ditagihkan vs yang sudah pernah ikut difakturkan. */
  async billingReadiness(tenantId: string, id: string) {
    const project = await this.assertProject(tenantId, id);
    const [unbilled, billed] = await Promise.all([
      this.prisma.timesheet.count({
        where: { tenantId, projectId: project.id, status: 'approved', billable: true, billedAt: null },
      }),
      this.prisma.timesheet.count({
        where: { tenantId, projectId: project.id, billedAt: { not: null } },
      }),
    ]);
    return { projectId: project.id, code: project.code, unbilledSheets: unbilled, billedSheets: billed };
  }

  // ══════════════════════ SCM ══════════════════════

  async listShipments(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.shipment.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: {
        outlet: { select: { name: true } },
        vehicle: { select: { plateNumber: true, name: true } },
        items: { include: { product: { select: { sku: true, name: true, unit: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createShipment(tenantId: string, dto: CreateShipmentDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    // Validasi DTO sudah menolak ini, tapi service dipanggil dari beberapa
    // jalur internal sehingga tidak boleh bergantung pada ValidationPipe saja.
    if (dto.items.length === 0) throw new BadRequestException('Shipment minimal satu item.');
    await this.assertProducts(tenantId, dto.items.map((i) => i.productId));
    if (dto.outletId) {
      const outlet = await this.prisma.outlet.findFirst({ where: { id: dto.outletId, tenantId }, select: { id: true } });
      if (!outlet) throw new NotFoundException('Outlet tidak ditemukan.');
    }
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, tenantId, companyId }, select: { id: true } });
      if (!vehicle) throw new NotFoundException('Kendaraan tidak ditemukan.');
    }
    // Produk ganda di dua baris digabung: baris pengiriman unik per produk.
    const merged = new Map<string, number>();
    for (const i of dto.items) merged.set(i.productId, roundMoney((merged.get(i.productId) ?? 0) + i.qty));
    return this.prisma.shipment.create({
      data: {
        tenantId,
        companyId,
        number: await this.nextNumber(tenantId, companyId, 'shipment', 'SHP'),
        outletId: dto.outletId ?? null,
        vehicleId: dto.vehicleId ?? null,
        origin: dto.origin ?? '',
        destination: dto.destination,
        note: dto.note ?? '',
        items: {
          create: [...merged].map(([productId, qty]) => ({
            productId,
            qty: new Prisma.Decimal(qty),
          })),
        },
      },
      include: { items: true },
    });
  }

  /**
   * Ubah status pengiriman. Tidak menyentuh stok/jurnal — lihat shipment-status.ts
   * untuk alasannya (stok keluar sudah dicatat saat SO di-fulfil).
   */
  async updateShipmentStatus(tenantId: string, id: string, status: string, receiverName?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const to = status as ShipmentStatusValue;
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const { changed } = await claimShipmentStatus(tx, { tenantId, companyId, shipmentId: id, to, at: now, receiverName });
      // Timeline harus sama dengan jalur kurir: satu event per perubahan status.
      if (changed) {
        await tx.shipmentEvent.create({
          data: {
            tenantId,
            companyId,
            shipmentId: id,
            status: to,
            description: receiverName ? `Diterima oleh ${receiverName}` : '',
            occurredAt: now,
            source: 'manual',
          },
        });
      }
      return tx.shipment.findFirstOrThrow({ where: { id, tenantId, companyId } });
    });
  }

  async listVehicles(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.vehicle.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: { _count: { select: { shipments: true, maintenanceSchedules: true } } },
      orderBy: { plateNumber: 'asc' },
    });
  }

  async createVehicle(tenantId: string, dto: CreateVehicleDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    try {
      return await this.prisma.vehicle.create({
        data: {
          tenantId,
          companyId,
          plateNumber: dto.plateNumber,
          name: dto.name,
          type: dto.type ?? 'van',
          capacityKg: new Prisma.Decimal(dto.capacityKg ?? 0),
          odometerKm: new Prisma.Decimal(dto.odometerKm ?? 0),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Nomor polisi "${dto.plateNumber}" sudah terdaftar.`);
      }
      throw error;
    }
  }

  async recordFuel(tenantId: string, vehicleId: string, dto: RecordFuelDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId, companyId } });
    if (!vehicle) throw new NotFoundException('Kendaraan tidak ditemukan.');
    const total = roundMoney(Number(dto.liters) * Number(dto.pricePerLiter));
    const log = await this.prisma.fuelLog.create({
      data: {
        tenantId,
        companyId,
        vehicleId,
        date: new Date(dto.date),
        liters: new Prisma.Decimal(dto.liters),
        pricePerLiter: new Prisma.Decimal(dto.pricePerLiter),
        totalCost: new Prisma.Decimal(total),
        odometerKm: new Prisma.Decimal(dto.odometerKm ?? 0),
        station: dto.station ?? '',
      },
    });
    // Odometer hanya boleh maju: catatan isi BBM lama (backfill) tidak boleh memundurkan odometer kendaraan.
    if (dto.odometerKm && dto.odometerKm > Number(vehicle.odometerKm)) {
      await this.prisma.vehicle.updateMany({
        where: { id: vehicleId, odometerKm: { lt: new Prisma.Decimal(dto.odometerKm) } },
        data: { odometerKm: new Prisma.Decimal(dto.odometerKm) },
      });
    }
    return { ...log, totalCost: total };
  }

  // ══════════════════════ EAM ══════════════════════

  async listWorkOrders(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.workOrder.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: { assignee: { select: { employeeNo: true, fullName: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createWorkOrder(tenantId: string, dto: CreateWorkOrderDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (dto.assigneeId) {
      const emp = await this.prisma.employee.findFirst({ where: { id: dto.assigneeId, tenantId, companyId }, select: { id: true } });
      if (!emp) throw new NotFoundException('Penanggung jawab tidak ditemukan.');
    }
    if (dto.maintenancePlanId) {
      const plan = await this.prisma.maintenancePlan.findFirst({ where: { id: dto.maintenancePlanId, tenantId, companyId }, select: { id: true } });
      if (!plan) throw new NotFoundException('Rencana perawatan tidak ditemukan.');
    }
    if (dto.vehicleRef) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleRef, tenantId, companyId }, select: { id: true } });
      if (!vehicle) throw new NotFoundException('Kendaraan tidak ditemukan.');
    }
    return this.prisma.workOrder.create({
      data: {
        tenantId,
        companyId,
        number: await this.nextNumber(tenantId, companyId, 'work-order', 'WO'),
        title: dto.title,
        description: dto.description ?? '',
        assetRef: dto.assetRef ?? '',
        vehicleRef: dto.vehicleRef ?? null,
        maintenancePlanId: dto.maintenancePlanId ?? null,
        priority: dto.priority ?? 'medium',
        assigneeId: dto.assigneeId ?? null,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
      },
    });
  }

  /**
   * Ubah work order; status `closed` merugikan biayanya ke GL.
   *
   * Dr Beban Pemeliharaan / Cr Kas. Suku cadang sengaja tidak dicatat
   * sebagai pengeluaran di sini: persediaan hanya boleh berkurang lewat StockOp,
   * jadi kalau work order ikut mengurangi stok, satu suku cadang terpotong
   * dua kali.
   *
   * Penutupan diklaim secara atomik (status != closed -> closed) di dalam
   * transaksi yang sama dengan jurnalnya: dua penutupan bersamaan tidak menerbitkan
   * jurnal biaya dobel.
   */
  async updateWorkOrder(tenantId: string, id: string, dto: UpdateWorkOrderDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const wo = await this.prisma.workOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!wo) throw new NotFoundException('Work order tidak ditemukan.');
    if (wo.status === 'closed') throw new ConflictException('Work order yang sudah ditutup tidak bisa diubah.');
    if (dto.assigneeId) {
      const emp = await this.prisma.employee.findFirst({ where: { id: dto.assigneeId, tenantId, companyId }, select: { id: true } });
      if (!emp) throw new NotFoundException('Penanggung jawab tidak ditemukan.');
    }

    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.laborCost !== undefined) data.laborCost = new Prisma.Decimal(dto.laborCost);
    if (dto.partsCost !== undefined) data.partsCost = new Prisma.Decimal(dto.partsCost);
    if (dto.resolution !== undefined) data.resolution = dto.resolution;
    if (dto.status === 'in_progress' && !wo.startedAt) data.startedAt = new Date();
    if (dto.status === 'completed' || dto.status === 'closed') data.completedAt = new Date();

    const closing = dto.status === 'closed';
    if (!closing) {
      const claimed = await this.prisma.workOrder.updateMany({
        where: { id, tenantId, companyId, status: { not: 'closed' } },
        data,
      });
      if (claimed.count !== 1) throw new ConflictException('Work order sudah ditutup oleh permintaan lain.');
      return this.prisma.workOrder.findUniqueOrThrow({ where: { id } });
    }

    // Jurnal dibuat di dalam transaksi yang sama dengan perubahan status;
    // kalau jurnal gagal, work order tetap terbuka dan bisa dicoba lagi.
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.workOrder.updateMany({
        where: { id, tenantId, companyId, status: { not: 'closed' } },
        data,
      });
      if (claimed.count !== 1) throw new ConflictException('Work order sudah ditutup oleh permintaan lain.');

      const labor = roundMoney(dto.laborCost ?? Number(wo.laborCost ?? 0));
      const parts = roundMoney(dto.partsCost ?? Number(wo.partsCost ?? 0));
      const total = roundMoney(labor + parts);

      if (total > 0) {
        const [expenseAccount, cashAccount] = await Promise.all([
          ensureAccount(tx, tenantId, companyId, MAINTENANCE_EXPENSE),
          this.accountIn(tx, tenantId, companyId, CASH_ACCOUNT, 'Kas'),
        ]);
        await this.journals.post(tx, {
          tenantId,
          companyId,
          entryDate: new Date(),
          sourceModule: 'eam',
          sourceRefId: wo.id,
          memo: `Biaya work order ${wo.number}`,
          lines: [
            { accountId: expenseAccount.id, direction: 'debit', amount: total, memo: 'Beban pemeliharaan' },
            { accountId: cashAccount.id, direction: 'credit', amount: total, memo: 'Pembayaran biaya pemeliharaan' },
          ],
        });
      }

      // Jadwal perawatan dimajukan setiap work order selesai, jadi rencana
      // berikutnya tidak langsung kedaluwarsa begitu siklus pertama lewat.
      await this.advanceSchedules(tx, tenantId, companyId, wo);
      return tx.workOrder.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Majukan jadwal perawatan yang terkait work order ini: rencana yang ditautkan
   * langsung, atau yang cocok pada aset/kendaraan yang sama. Filter yang kosong
   * TIDAK boleh dianggap "semua rencana" (assetRef kosong / vehicleRef null).
   */
  private async advanceSchedules(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    wo: { maintenancePlanId: string | null; assetRef: string; vehicleRef: string | null },
  ) {
    const or: Prisma.MaintenancePlanWhereInput[] = [];
    if (wo.maintenancePlanId) or.push({ id: wo.maintenancePlanId });
    if (wo.assetRef) or.push({ assetRef: wo.assetRef });
    if (wo.vehicleRef) or.push({ vehicleRefId: wo.vehicleRef });
    if (or.length === 0) return 0;

    const plans = await tx.maintenancePlan.findMany({
      where: { tenantId, companyId, isActive: true, OR: or },
    });
    const doneAt = new Date();
    for (const plan of plans) {
      const next = new Date(doneAt);
      next.setDate(next.getDate() + plan.intervalDays);
      await tx.maintenancePlan.update({ where: { id: plan.id }, data: { lastDoneAt: doneAt, nextDueAt: next } });
    }
    return plans.length;
  }

  /** Preventive maintenance yang sudah jatuh tempo. */
  async dueMaintenance(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const today = new Date();
    const plans = await this.prisma.maintenancePlan.findMany({
      where: { tenantId, companyId, isActive: true },
      include: { _count: { select: { workOrders: true } } },
      orderBy: { nextDueAt: 'asc' },
    });
    return plans
      .filter((p) => p.nextDueAt && new Date(p.nextDueAt) <= today)
      .map((p) => ({
        id: p.id,
        assetRef: p.assetRef,
        description: p.description,
        intervalDays: p.intervalDays,
        nextDueAt: p.nextDueAt,
        daysOverdue: Math.floor((today.getTime() - new Date(p.nextDueAt!).getTime()) / 86400000),
        openWorkOrders: p._count.workOrders,
      }));
  }

  async listMaintenancePlans(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const plans = await this.prisma.maintenancePlan.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: {
        vehicle: { select: { plateNumber: true, name: true } },
        _count: { select: { workOrders: true } },
      },
      orderBy: [{ isActive: 'desc' }, { nextDueAt: 'asc' }],
    });
    const now = Date.now();
    return plans.map((p) => ({
      id: p.id,
      assetRef: p.assetRef,
      description: p.description,
      intervalDays: p.intervalDays,
      lastDoneAt: p.lastDoneAt,
      nextDueAt: p.nextDueAt,
      isActive: p.isActive,
      vehicle: p.vehicle,
      workOrders: p._count.workOrders,
      daysOverdue:
        p.isActive && p.nextDueAt && new Date(p.nextDueAt).getTime() <= now
          ? Math.floor((now - new Date(p.nextDueAt).getTime()) / 86400000)
          : 0,
    }));
  }

  async createMaintenancePlan(
    tenantId: string,
    dto: { assetRef: string; description: string; intervalDays: number; vehicleRefId?: string; firstDueAt?: string },
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (dto.intervalDays < 1) throw new BadRequestException('Interval minimal 1 hari.');
    if (dto.vehicleRefId) {
      // Tanpa pengecekan ini FK komposit gagal sebagai 500 dan kendaraan tenant lain
      // tidak pernah ditolak dengan pesan yang jelas.
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleRefId, tenantId, companyId },
        select: { id: true },
      });
      if (!vehicle) throw new NotFoundException('Kendaraan tidak ditemukan.');
    }
    const nextDue = dto.firstDueAt ? new Date(dto.firstDueAt) : new Date();
    if (Number.isNaN(nextDue.getTime())) throw new BadRequestException('Tanggal jatuh tempo pertama tidak valid.');
    if (!dto.firstDueAt) nextDue.setDate(nextDue.getDate() + dto.intervalDays);
    return this.prisma.maintenancePlan.create({
      data: {
        tenantId,
        companyId,
        assetRef: dto.assetRef,
        description: dto.description,
        intervalDays: dto.intervalDays,
        nextDueAt: nextDue,
        vehicleRefId: dto.vehicleRefId ?? null,
      },
    });
  }

  // ══════════════════════ HELPERS ══════════════════════

  private async assertProject(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const project = await this.prisma.project.findFirst({ where: { id, tenantId, companyId } });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');
    return project;
  }

  private async assertTimesheet(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const sheet = await this.prisma.timesheet.findFirst({ where: { id, tenantId, companyId } });
    if (!sheet) throw new NotFoundException('Timesheet tidak ditemukan.');
    return sheet;
  }

  private async assertProducts(tenantId: string, productIds: string[]) {
    const unique = [...new Set(productIds)];
    const found = await this.prisma.product.count({ where: { tenantId, id: { in: unique } } });
    if (found !== unique.length) throw new NotFoundException('Ada produk yang tidak ditemukan.');
  }

  private async account(tenantId: string, companyId: string, code: string, label: string) {
const account = await this.prisma.chartOfAccount.findFirst({ where: { tenantId, companyId, code } });
    if (!account) throw new NotFoundException(`Akun ${code} (${label}) belum ada pada COA perusahaan.`);
    return account;
  }

  /** Versi dari dalam transaksi, untuk jurnal seiris dengan perubahan status. */
  private async accountIn(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    code: string,
    label: string,
  ) {
    const account = await tx.chartOfAccount.findFirst({ where: { tenantId, companyId, code } });
    if (!account) {
      throw new NotFoundException(
        `Akun ${code} (${label}) belum ada pada COA perusahaan. Tambahkan dulu sebelum menutup work order.`,
      );
    }
    return account;
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
      const exists =
        kind === 'shipment'
          ? await this.prisma.shipment.findFirst({
              where: { tenantId, companyId, number: candidate },
              select: { id: true },
            })
          : await this.prisma.workOrder.findFirst({
              where: { tenantId, companyId, number: candidate },
              select: { id: true },
            });
      if (!exists) return candidate;
    }
    throw new ConflictException('Gagal membuat nomor dokumen, coba lagi.');
  }
}