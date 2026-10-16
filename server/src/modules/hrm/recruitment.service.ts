import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { isUniqueViolation } from '../inventory/tx-retry';
import { ONBOARDING_TASKS, assertStageMove, summarizePipeline } from './recruitment-stage';

/**
 * Rekrutmen & onboarding.
 *
 * Jalur hire dibuat atomik: dari hire lalu ada Employee,
 * akun User, dan penugasan jabatan. Kalau dibuat terpisah, ada keadaan setengah
 * jadi (pelamar hired tapi belum punya Employee) yang tidak punya jalan keluar.
 */
@Injectable()
export class RecruitmentService {
  constructor(private readonly prisma: PrismaService) {}

  async listPostings(tenantId: string, status?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.jobPosting.findMany({
      take: 500,
      where: { tenantId, companyId, ...(status ? { status: status as never } : {}) },
      include: {
        department: { select: { name: true } },
        position: { select: { name: true } },
        _count: { select: { applicants: true } },
      },
      orderBy: [{ status: 'asc' }, { openedAt: 'desc' }],
    });
  }

  async createPosting(tenantId: string, dto: {
    title: string;
    departmentId?: string;
    positionId?: string;
    description?: string;
    employmentType?: string;
    salaryMin?: number;
    salaryMax?: number;
    openings?: number;
  }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    // null/angka ekstrem dari klien: kolom gaji Decimal(18,2); di luar batas = 400, bukan error DB.
    for (const [label, v] of [['minimum', dto.salaryMin], ['maksimum', dto.salaryMax]] as const) {
      if (v !== undefined && v !== null && (!Number.isFinite(v) || v < 0 || v > 999_999_999_999)) {
        throw new BadRequestException(`Gaji ${label} harus 0 sampai 999.999.999.999.`);
      }
    }
    if (dto.salaryMin && dto.salaryMax && dto.salaryMax < dto.salaryMin) {
      throw new BadRequestException('Gaji maksimum tidak boleh lebih kecil dari minimum.');
    }
    if (dto.departmentId) {
      const dep = await this.prisma.department.findFirst({ where: { id: dto.departmentId, tenantId, companyId }, select: { id: true } });
      if (!dep) throw new NotFoundException('Departemen tidak ditemukan.');
    }
    if (dto.positionId) {
      const pos = await this.prisma.position.findFirst({ where: { id: dto.positionId, tenantId, companyId }, select: { id: true } });
      if (!pos) throw new NotFoundException('Jabatan tidak ditemukan.');
    }
    return this.prisma.jobPosting.create({
      data: {
        tenantId,
        companyId,
        title: dto.title,
        departmentId: dto.departmentId ?? null,
        positionId: dto.positionId ?? null,
        description: dto.description ?? '',
        employmentType: dto.employmentType ?? 'full_time',
        salaryMin: dto.salaryMin != null ? new Prisma.Decimal(dto.salaryMin) : null,
        salaryMax: dto.salaryMax != null ? new Prisma.Decimal(dto.salaryMax) : null,
        openings: dto.openings ?? 1,
        status: 'open',
      },
    });
  }

  async closePosting(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const posting = await this.prisma.jobPosting.findFirst({ where: { id, tenantId, companyId } });
    if (!posting) throw new NotFoundException('Lowongan tidak ditemukan.');
    return this.prisma.jobPosting.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } });
  }

  async listApplicants(tenantId: string, jobPostingId?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.applicant.findMany({
      take: 500,
      where: { tenantId, companyId, ...(jobPostingId ? { jobPostingId } : {}) },
      include: { jobPosting: { select: { title: true, id: true } } },
      orderBy: { appliedAt: 'desc' },
    });
  }

  async apply(tenantId: string, dto: { jobPostingId: string; fullName: string; email: string; phone?: string; resumeUrl?: string; coverNote?: string }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const posting = await this.prisma.jobPosting.findFirst({ where: { id: dto.jobPostingId, tenantId, companyId } });
    if (!posting) throw new NotFoundException('Lowongan tidak ditemukan.');
    if (posting.status !== 'open') throw new BadRequestException('Lowongan sudah ditutup.');

    const email = dto.email.trim().toLowerCase();
    const hired = await this.prisma.applicant.count({ where: { jobPostingId: dto.jobPostingId, stage: 'hired' } });
    if (hired >= posting.openings) {
      throw new ConflictException(`Kuota lowongan sudah terisi (${posting.openings} orang).`);
    }

    try {
      return await this.prisma.applicant.create({
        data: {
          tenantId,
          companyId,
          jobPostingId: dto.jobPostingId,
          fullName: dto.fullName,
          email,
          phone: dto.phone ?? '',
          resumeUrl: dto.resumeUrl ?? '',
          coverNote: dto.coverNote ?? '',
          stage: 'applied',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`${dto.fullName} sudah melamar lowongan ini.`);
      }
      throw error;
    }
  }

  /**
   * Geser tahap seleksi. Urutannya dijaga supaya tidak bisa lompat dari
   * `applied` langsung ke `offer` tanpa pernah di-screening.
   */
  async moveStage(tenantId: string, applicantId: string, stage: string, note?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const applicant = await this.prisma.applicant.findFirst({ where: { id: applicantId, tenantId, companyId } });
    if (!applicant) throw new NotFoundException('Pelamar tidak ditemukan.');
    assertStageMove(applicant.stage, stage, note);

    // Klaim bersyarat pada tahap asal: dua pemindahan bersamaan tidak saling menimpa.
    const claimed = await this.prisma.applicant.updateMany({
      where: { id: applicantId, tenantId, companyId, stage: applicant.stage },
      data: { stage: stage as never, rejectReason: stage === 'rejected' ? (note ?? '') : applicant.rejectReason },
    });
    if (claimed.count !== 1) throw new ConflictException('Tahap pelamar baru saja diubah oleh permintaan lain.');
    return this.prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
  }

  /**
   * Hire: buat Employee dari pelamar, opsional buat akun User, dan tandai
   * onboarding berjalan. Semua dalam satu transaksi supaya tidak ada pelamar
   * yang tercatat hired tanpa Employee.
   */
  async hire(tenantId: string, applicantId: string, opts: { hireDate?: string; baseSalary: number; createUser?: boolean }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (!Number.isFinite(opts.baseSalary) || opts.baseSalary <= 0) throw new BadRequestException('Gaji pokok harus lebih dari 0.');

    const applicant = await this.prisma.applicant.findFirst({
      where: { id: applicantId, tenantId, companyId },
      include: { jobPosting: { include: { position: true, department: true } } },
    });
    if (!applicant) throw new NotFoundException('Pelamar tidak ditemukan.');
    if (applicant.stage === 'hired') throw new ConflictException('Pelamar sudah di-hire sebelumnya.');
    if (applicant.stage !== 'offer') {
      throw new ConflictException(`Pelamar harus sudah di tahap "offer" sebelum di-hire (sekarang: ${applicant.stage}).`);
    }

    const hireDate = opts.hireDate ? new Date(opts.hireDate) : new Date();
    if (Number.isNaN(hireDate.getTime())) throw new BadRequestException('Tanggal masuk tidak valid.');
    const employeeNo = await this.nextEmployeeNo(tenantId, companyId);

    try {
    return await this.prisma.$transaction(async (tx) => {
      // Klaim atomik: dua permintaan hire bersamaan tidak boleh sama-sama lolos dan
      // membuat dua Employee untuk satu pelamar.
      const claimed = await tx.applicant.updateMany({
        where: { id: applicantId, tenantId, companyId, stage: 'offer' },
        data: { stage: 'hired', hiredAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('Pelamar sudah di-hire atau statusnya baru saja berubah.');

      let userId: string | null = null;
      if (opts.createUser) {
        // roleId adalah FK ke peran tenant; string kosong membuat hire gagal 500. 'staff' = akses terendah.
        const role = await tx.accessRole.findFirst({ where: { tenantId, key: 'staff' }, select: { id: true } });
        if (!role) throw new BadRequestException('Peran "staff" belum dikonfigurasi pada tenant ini.');
        const user = await tx.user.create({
          data: {
            tenantId,
            name: applicant.fullName,
            email: applicant.email,
            passwordHash: '!pending-invite',
            role: 'staff',
            roleId: role.id,
          },
        });
        userId = user.id;
      }

      const employee = await tx.employee.create({
        data: {
          tenantId,
          companyId,
          employeeNo,
          fullName: applicant.fullName,
          email: applicant.email,
          phone: applicant.phone,
          hireDate,
          positionId: applicant.jobPosting.positionId,
          departmentId: applicant.jobPosting.departmentId,
          baseSalary: new Prisma.Decimal(opts.baseSalary),
          userId,
          isActive: true,
        },
      });

      await tx.applicant.update({
        where: { id: applicantId },
        data: { employeeId: employee.id },
      });

      // Kurangi kuota lowongan; tutup otomatis kalau sudah penuh.
      const hired = await tx.applicant.count({ where: { jobPostingId: applicant.jobPostingId, stage: 'hired' } });
      if (hired >= applicant.jobPosting.openings) {
        await tx.jobPosting.update({
          where: { id: applicant.jobPostingId },
          data: { status: 'closed', closedAt: new Date() },
        });
      }

      return {
        employee,
        userId,
        onboardingTasks: [...ONBOARDING_TASKS],
      };
    });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email pelamar sudah dipakai akun lain atau nomor employee bentrok; hire dibatalkan.');
      }
      throw error;
    }
  }

  async completeOnboarding(tenantId: string, applicantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const applicant = await this.prisma.applicant.findFirst({ where: { id: applicantId, tenantId, companyId } });
    if (!applicant) throw new NotFoundException('Pelamar tidak ditemukan.');
    if (!applicant.employeeId) throw new BadRequestException('Pelamar belum di-hire.');
    return this.prisma.applicant.update({ where: { id: applicantId }, data: { onboardingDone: true } });
  }

  /** Papan funnel rekrutmen per tahap. */
  async pipeline(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const grouped = await this.prisma.applicant.groupBy({
      by: ['stage'],
      where: { tenantId, companyId },
      _count: { stage: true },
    });
    return summarizePipeline(grouped.map((g) => ({ stage: g.stage, count: g._count.stage })));
  }

  private async nextEmployeeNo(tenantId: string, companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      const counter = await this.prisma.documentSequence.upsert({
        where: { tenantId_companyId_kind: { tenantId, companyId, kind: 'employee-no' } },
        update: { nextValue: { increment: 1 } },
        create: { tenantId, companyId, kind: 'employee-no', nextValue: 1 },
      });
      const candidate = `EMP-${year}-${String(counter.nextValue).padStart(4, '0')}`;
      const exists = await this.prisma.employee.findFirst({ where: { tenantId, companyId, employeeNo: candidate } });
      if (!exists) return candidate;
    }
    throw new ConflictException('Gagal membuat nomor employee, coba lagi.');
  }
}