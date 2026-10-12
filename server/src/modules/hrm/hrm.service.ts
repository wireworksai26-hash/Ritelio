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
import type {
  ClockDto,
  CreateDepartmentDto,
  CreateAttendanceDto,
  CreateEmployeeDto,
  CreatePayrollDto,
  CreatePositionDto,
  DecideLeaveDto,
} from './dto/hr.dto';
import { computePph21 } from './pph21';

const SALARY_ACCOUNT = '6300';
// Utang PPh 21 =liability. Jangan tertukar dengan 2150 (Piutang PPN) yang
// bertipe aset — memakai nomor yang salah membuat jurnal tidak seimbang.
const PPH21_PAYABLE = '2160';
const SOCIAL_PAYABLE = '2200';

interface PayrollOverrideShape {
  overtimeAmount: number;
  bonusAmount: number;
  otherEarning: number;
  otherDeduction: number;
  bpjsKesehatan?: number;
  bpjsKetenagakerjaan?: number;
}

const EMPTY_OVERRIDE: PayrollOverrideShape = {
  overtimeAmount: 0,
  bonusAmount: 0,
  otherEarning: 0,
  otherDeduction: 0,
};

@Injectable()
export class HrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
  ) {}

  // ============================== MASTER ==============================

  async listDepartments(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.department.findMany({
      where: { tenantId, companyId },
      include: { _count: { select: { employees: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createDepartment(tenantId: string, dto: CreateDepartmentDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (dto.parentId) {
      const parent = await this.prisma.department.findFirst({
        where: { id: dto.parentId, tenantId, companyId },
        select: { id: true, code: true },
      });
      if (!parent) throw new NotFoundException('Departemen induk tidak ditemukan.');
      if (parent.id === dto.parentId) {
        throw new BadRequestException('Departemen tidak bisa menjadi induk dirinya sendiri.');
      }
      // Cegah siklus: induk baru tidak boleh berada di bawah subtree yang
      // akan menaipinya.
      let cursor = parent.id;
      for (let depth = 0; depth < 20 && cursor; depth++) {
        const node = await this.prisma.department.findFirst({
          where: { id: cursor, tenantId, companyId },
          select: { parentId: true },
        });
        if (!node) break;
        if (node.parentId === dto.parentId) {
          throw new BadRequestException('PenFatheran ini akan membentuk siklus departemen.');
        }
        cursor = node.parentId ?? '';
      }
    }
    try {
      return await this.prisma.department.create({
        data: {
          tenantId,
          companyId,
          code: dto.code,
          name: dto.name,
          parentId: dto.parentId ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Kode departemen "${dto.code}" sudah dipakai.`);
      }
      throw error;
    }
  }

  /**
   * Absen masuk. `overtimeHours` dihitung dari selisih jam kerja dengan
   * durasi standar, bukan diisi manual — kolom lama tidak pernah diisi karena
   * tidak ada endpoint yang bisa menghitungnya.
   */
  async clockIn(tenantId: string, employeeId: string, at?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId, companyId, isActive: true },
      select: { id: true, employeeNo: true },
    });
    if (!employee) throw new NotFoundException('Employee tidak ditemukan atau nonaktif.');

    const now = at ? new Date(at) : new Date();
    if (Number.isNaN(now.getTime())) throw new BadRequestException('Waktu absen tidak valid.');
    if (now.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('Waktu absen tidak boleh di masa depan.');
    }

    const day = startOfUtcDay(now);
    const existing = await this.prisma.attendance.findFirst({
      where: { tenantId, employeeId, date: day },
    });
    if (existing?.checkIn) {
      throw new ConflictException(`Anda sudah absen masuk hari ini pukul ${formatTime(existing.checkIn)}.`);
    }

    const row = existing
      ? await this.prisma.attendance.update({
          where: { id: existing.id },
          data: { checkIn: now, status: 'present' },
        })
      : await this.prisma.attendance.create({
          data: { tenantId, companyId, employeeId, date: day, checkIn: now, status: 'present' },
        });

    return {
      id: row.id,
      employeeNo: employee.employeeNo,
      date: day.toISOString().slice(0, 10),
      checkIn: row.checkIn,
      lateMinutes: minutesLate(now),
      message: minutesLate(now) > 0 ? 'Terlambat tercatat.' : 'Absen masuk tercatat.',
    };
  }

  /**
   * Absen pulang. Durasi kerja dihitung di sini; lembur = durasi kerja
   * dikurangi jam standar, dibatasi 4 jam per hari sesuai praktik umum.
   */
  async clockOut(tenantId: string, employeeId: string, at?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const now = at ? new Date(at) : new Date();
    const day = startOfUtcDay(now);

    const row = await this.prisma.attendance.findFirst({
      where: { tenantId, employeeId, date: day },
    });
    if (!row?.checkIn) {
      throw new BadRequestException('Belum ada absen masuk hari ini.');
    }
    if (row.checkOut) {
      throw new ConflictException(`Anda sudah absen pulang pukul ${formatTime(row.checkOut)}.`);
    }

    const workedHours = (now.getTime() - new Date(row.checkIn).getTime()) / 3_600_000;
    if (workedHours < 0) throw new BadRequestException('Waktu pulang sebelum waktu masuk.');
    // Lembur dihitung dari durasi kerja dikurangi jam standar kerja.
    const overtime = Math.min(Math.max(workedHours - STANDARD_WORK_HOURS, 0), MAX_DAILY_OVERTIME);
    const lateMinutes = Math.max(Math.round((workedHours - STANDARD_WORK_HOURS) * -60), 0);

    const updated = await this.prisma.attendance.update({
      where: { id: row.id },
      data: {
        checkOut: now,
        workedHours: new Prisma.Decimal(roundMoney(workedHours)),
        overtimeHours: new Prisma.Decimal(roundMoney(overtime)),
        lateMinutes,
      },
    });

    return {
      id: updated.id,
      date: day.toISOString().slice(0, 10),
      checkIn: updated.checkIn,
      checkOut: updated.checkOut,
      workedHours: Number(updated.workedHours),
      overtimeHours: Number(updated.overtimeHours),
      lateMinutes: updated.lateMinutes,
    };
  }

  async listPositions(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.position.findMany({
      where: { tenantId, companyId },
      include: { department: { select: { id: true, code: true, name: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createPosition(tenantId: string, dto: CreatePositionDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    try {
      return await this.prisma.position.create({
        data: {
          tenantId,
          companyId,
          code: dto.code,
          name: dto.name,
          departmentId: dto.departmentId ?? null,
          baseSalary: new Prisma.Decimal(dto.baseSalary ?? 0),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Kode jabatan "${dto.code}" sudah dipakai.`);
      }
      throw error;
    }
  }

  async listEmployees(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.employee.findMany({
      where: { tenantId, companyId },
      include: {
        department: { select: { code: true, name: true } },
        position: { select: { code: true, name: true } },
      },
      orderBy: { employeeNo: 'asc' },
    });
  }

  async createEmployee(tenantId: string, dto: CreateEmployeeDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: dto.userId, tenantId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('User tidak ditemukan pada tenant ini.');
      // Termasuk employee yang sudah nonaktif: relasinya tetap dijaga agar
      // User tidak bisa dipakai ulang oleh employee baru.
      const linked = await this.prisma.employee.findFirst({
        where: { tenantId, userId: dto.userId },
        select: { id: true },
      });
      if (linked) throw new ConflictException('User ini sudah terhubung ke employee lain.');
    }
    try {
      return await this.prisma.employee.create({
        data: {
          tenantId,
          companyId,
          userId: dto.userId ?? null,
          employeeNo: dto.employeeNo,
          fullName: dto.fullName,
          email: dto.email ?? '',
          phone: dto.phone ?? '',
          departmentId: dto.departmentId ?? null,
          positionId: dto.positionId ?? null,
          managerId: dto.managerId ?? null,
          employmentType: dto.employmentType ?? 'permanent',
          hireDate: new Date(dto.hireDate),
          baseSalary: new Prisma.Decimal(dto.baseSalary ?? 0),
          bankAccount: dto.bankAccount ?? '',
          taxId: dto.taxId ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `Nomor employee "${dto.employeeNo}" sudah dipakai.`,
        );
      }
      throw error;
    }
  }

  async terminate(tenantId: string, id: string, date: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const employee = await this.assertEmployee(tenantId, companyId, id);
    if (employee.terminationDate) {
      throw new ConflictException('Employee ini sudah dinonaktifkan.');
    }
    // Pegawai dengan laporan langsung tidak boleh berhenti duluan, supaya
    // struktur manajemen tidak menggantung.
    const reports = await this.prisma.employee.count({
      where: { tenantId, companyId, managerId: id, terminationDate: null },
    });
    if (reports > 0) {
      throw new BadRequestException(
        `Employee ini masih memiliki ${reports} bawahan. Pindahkan bawahan terlebih dahulu.`,
      );
    }
    return this.prisma.employee.update({
      where: { id },
      data: { terminationDate: new Date(date), isActive: false },
    });
  }

  // ============================== ATTENDANCE & LEAVE ==============================

  async recordAttendance(tenantId: string, dto: CreateAttendanceDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertEmployee(tenantId, companyId, dto.employeeId);
    return this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date: new Date(dto.date) } },
      update: {
        status: dto.status,
        overtimeHours: new Prisma.Decimal(dto.overtimeHours ?? 0),
        note: dto.note ?? '',
      },
      create: {
        tenantId,
        companyId,
        employeeId: dto.employeeId,
        date: new Date(dto.date),
        status: dto.status,
        overtimeHours: new Prisma.Decimal(dto.overtimeHours ?? 0),
        note: dto.note ?? '',
      },
    });
  }

  async attendanceSummary(tenantId: string, month: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const [year, mon] = month.split('-').map(Number);
    if (!year || !mon) throw new BadRequestException('Format periode harus YYYY-MM.');
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 1));

    const rows = await this.prisma.attendance.findMany({
      where: { tenantId, companyId, date: { gte: start, lt: end } },
      select: { employeeId: true, status: true, overtimeHours: true },
    });

    const byEmployee = new Map<string, { present: number; absent: number; leave: number; overtime: number }>();
    for (const r of rows) {
      const cur = byEmployee.get(r.employeeId) ?? { present: 0, absent: 0, leave: 0, overtime: 0 };
      if (r.status === 'present') cur.present += 1;
      else if (r.status === 'absent') cur.absent += 1;
      else if (r.status === 'leave') cur.leave += 1;
      cur.overtime += Number(r.overtimeHours);
      byEmployee.set(r.employeeId, cur);
    }

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, companyId, isActive: true },
      select: { id: true, employeeNo: true, fullName: true },
      orderBy: { employeeNo: 'asc' },
    });

    return {
      period: month,
      data: employees.map((e) => ({
        employeeId: e.id,
        employeeNo: e.employeeNo,
        fullName: e.fullName,
        ...(byEmployee.get(e.id) ?? { present: 0, absent: 0, leave: 0, overtime: 0 }),
      })),
    };
  }

  async requestLeave(tenantId: string, employeeId: string, dto: { startDate: string; endDate: string; reason?: string }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertEmployee(tenantId, companyId, employeeId);
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException('Tanggal akhir tidak boleh sebelum tanggal mulai.');
    const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        tenantId,
        companyId,
        employeeId,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true },
    });
    if (overlap) throw new ConflictException('Ada pengajuan cuti yang bertumpang tindih.');

    return this.prisma.leaveRequest.create({
      data: { tenantId, companyId, employeeId, startDate: start, endDate: end, days, reason: dto.reason ?? '' },
    });
  }

  async decideLeave(tenantId: string, id: string, approverId: string, dto: DecideLeaveDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const leave = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId, companyId } });
    if (!leave) throw new NotFoundException('Pengajuan cuti tidak ditemukan.');
    if (leave.status !== 'pending') throw new ConflictException('Pengajuan sudah diputuskan.');
    return this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: dto.approve ? 'approved' : 'rejected',
        decidedById: approverId,
        decidedAt: new Date(),
      },
    });
  }

  // ============================== PAYROLL ==============================

  /**
   * Hitung gaji satu periode.
   *
   * PPh 21 memakai TaxBracket kategori 'withholding'. Kalau tidak ada aturan
   * berlabel `official`, hasilnya ditandai `source = estimate` supaya UI bisa
   * menampilkan badge perkiraan — sesuai的风险 catatan di PRD.
   */
  async runPayroll(tenantId: string, dto: CreatePayrollDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (!/^\d{4}-\d{2}$/.test(dto.period)) {
      throw new BadRequestException('Format periode harus YYYY-MM.');
    }

    const existing = await this.prisma.payrollRun.findFirst({
      where: { tenantId, companyId, period: dto.period },
    });
    if (existing) throw new ConflictException(`Payroll periode ${dto.period} sudah pernah dihitung.`);

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, companyId, isActive: true },
      select: { id: true, employeeNo: true, fullName: true, baseSalary: true, hireDate: true },
      orderBy: { employeeNo: 'asc' },
    });
    if (employees.length === 0) {
      throw new BadRequestException('Belum ada employee aktif untuk diproses.');
    }

const brackets = await this.bracketsFor(tenantId, companyId, 'withholding', dto.period);
    const overrides = new Map<string, PayrollOverrideShape>(
      (dto.overrides ?? []).map((o) => [
        o.employeeId,
        {
          overtimeAmount: o.overtimeAmount ?? 0,
          bonusAmount: o.bonusAmount ?? 0,
          otherEarning: o.otherEarning ?? 0,
          otherDeduction: o.otherDeduction ?? 0,
          bpjsKesehatan: o.bpjsKesehatan,
          bpjsKetenagakerjaan: o.bpjsKetenagakerjaan,
        },
      ]),
    );

    const [year, mon] = dto.period.split('-').map(Number);
    const periodStart = new Date(Date.UTC(year, mon - 1, 1));

    const items = employees.map((e) => {
      const o: PayrollOverrideShape = overrides.get(e.id) ?? EMPTY_OVERRIDE;
      // Pegawai yang baru masuk di tengah periode hanya dapat gaji prorata.
      const hire = new Date(e.hireDate);
      const prorate = hire > periodStart ? this.prorateFactor(hire, periodStart) : 1;
      const base = roundMoney(Number(e.baseSalary) * prorate);

      const overtime = roundMoney(o.overtimeAmount ?? 0);
      const bonus = roundMoney(o.bonusAmount ?? 0);
      const otherEarning = roundMoney(o.otherEarning ?? 0);
      const gross = roundMoney(base + overtime + bonus + otherEarning);

      const taxable = roundMoney(gross);
      const pph21 = computePph21(taxable, brackets);

      const health = roundMoney(
        o.bpjsKesehatan ?? gross * DEFAULT_BPJS_HEALTH_RATE,
      );
      const employment = roundMoney(
        o.bpjsKetenagakerjaan ?? gross * DEFAULT_BPJS_EMPLOYMENT_RATE,
      );
      const otherDeduction = roundMoney(o.otherDeduction ?? 0);
      const totalDeduction = roundMoney(pph21.amount + health + employment + otherDeduction);
      const net = roundMoney(gross - totalDeduction);

      return {
        employeeId: e.id,
        baseSalary: new Prisma.Decimal(base),
        overtimeAmount: new Prisma.Decimal(overtime),
        bonusAmount: new Prisma.Decimal(bonus),
        otherEarning: new Prisma.Decimal(otherEarning),
        gross: new Prisma.Decimal(gross),
        pph21Base: new Prisma.Decimal(taxable),
        pph21Amount: new Prisma.Decimal(pph21.amount),
        pph21Source: pph21.source,
        bpjsKesehatan: new Prisma.Decimal(health),
        bpjsKetenagakerjaan: new Prisma.Decimal(employment),
        otherDeduction: new Prisma.Decimal(otherDeduction),
        totalDeduction: new Prisma.Decimal(totalDeduction),
        net: new Prisma.Decimal(net),
        // Beban perusahaan dihitung terpisah dari iuran yang dipotong dari
        // gaji; kalau disamakan, jurnal jadi tidak seimbang.
        employerCost: new Prisma.Decimal(roundMoney(gross * EMPLOYER_BPJS_RATE)),
        note: e.employeeNo,
      };
    });

    const totals = items.reduce(
      (acc, i) => ({
        gross: acc.gross + Number(i.gross),
        deduction: acc.deduction + Number(i.totalDeduction),
        net: acc.net + Number(i.net),
        employerCost: acc.employerCost + Number(i.employerCost),
      }),
      { gross: 0, deduction: 0, net: 0, employerCost: 0 },
    );

    return this.prisma.payrollRun.create({
      data: {
        tenantId,
        companyId,
        period: dto.period,
        status: 'draft',
        totalGross: new Prisma.Decimal(roundMoney(totals.gross)),
        totalDeduction: new Prisma.Decimal(roundMoney(totals.deduction)),
        totalNet: new Prisma.Decimal(roundMoney(totals.net)),
        totalEmployerCost: new Prisma.Decimal(roundMoney(totals.employerCost)),
        items: {
          create: items.map((i) => ({
            ...i,
            tenantId,
            companyId,
          })),
        },
      },
      include: {
        items: {
          include: { employee: { select: { employeeNo: true, fullName: true } } },
          orderBy: { employee: { employeeNo: 'asc' } },
        },
      },
    });
  }

  /**
   * Posting jurnal payroll. Keseimbangan:
   *
   *   Dr Beban Gaji   = bruto + beban perusahaan
   *     Cr Utang Gaji   = bersih + potongan lain   (kewajiban ke karyawan)
   *     Cr Utang PPh 21 = PPh 21 terpotong
   *     Cr Utang BPJS   = iuran karyawan + iuran perusahaan
   *
   * Utang gaji memakai (bersih + potongan lain), bukan bersih saja —
   * kalau potongan lain ikut hilang dari sisi kredit, jurnal tidak
   * seimbang karena barangnya tidak muncul di sisi debit.
   */
  async postPayroll(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId, companyId },
      include: { items: true },
    });
    if (!run) throw new NotFoundException('Payroll run tidak ditemukan.');
    if (run.status !== 'draft') {
      throw new ConflictException(`Payroll sudah berstatus ${run.status}.`);
    }

    const [salaryAcc, pphAcc, socialAcc] = await Promise.all([
      this.account(tenantId, companyId, SALARY_ACCOUNT, 'Beban Gaji'),
      this.account(tenantId, companyId, PPH21_PAYABLE, 'Utang PPh 21'),
      this.account(tenantId, companyId, SOCIAL_PAYABLE, 'Utang BPJS'),
    ]);

    const gross = Number(run.totalGross);
    const employerCost = Number(run.totalEmployerCost);
    const net = Number(run.totalNet);

    const pph21 = roundMoney(run.items.reduce((s, i) => s + Number(i.pph21Amount), 0));
    const social = roundMoney(
      run.items.reduce((s, i) => s + Number(i.bpjsKesehatan) + Number(i.bpjsKetenagakerjaan), 0),
    );
    const otherDeduction = roundMoney(
      run.items.reduce((s, i) => s + Number(i.otherDeduction), 0),
    );

    const payableToEmployee = roundMoney(net + otherDeduction);
    const socialPayable = roundMoney(social + employerCost);
    const debit = roundMoney(gross + employerCost);

    if (payableToEmployee + pph21 + socialPayable !== debit) {
      throw new BadRequestException(
        `Jurnal payroll tidak seimbang (Dr ${debit} vs Cr ${payableToEmployee + pph21 + socialPayable}).`,
      );
    }

    const lines = [
      { accountId: salaryAcc.id, direction: 'debit' as const, amount: debit, memo: 'Beban gaji & tunjangan' },
      { accountId: salaryAcc.id, direction: 'credit' as const, amount: payableToEmployee, memo: 'Utang gaji karyawan' },
      { accountId: socialAcc.id, direction: 'credit' as const, amount: socialPayable, memo: 'Utang BPJS' },
    ];
    // PPh 21 bisa nol (mis. belum ada bracket aktif); baris nol diabaikan
    // karena JournalService menolak jurnal yang tidak menyeimbangkan.
    if (pph21 > 0) {
      lines.push({
        accountId: pphAcc.id,
        direction: 'credit' as const,
        amount: pph21,
        memo: 'Utang PPh 21',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const journal = await this.journals.post(tx, {
        tenantId,
        companyId,
        entryDate: new Date(),
        sourceModule: 'hr',
        sourceRefId: run.id,
        memo: `Payroll periode ${run.period}`,
        lines,
      });

      const updated = await tx.payrollRun.update({
        where: { id },
        data: { status: 'approved', journalId: journal.id },
      });
      return { payroll: updated, journalId: journal.id, net, employerCost };
    });
  }

  /** Daftar pengajuan cuti beserta pemohonnya; terbaru lebih dulu. */
  listLeaves(tenantId: string, status?: 'pending' | 'approved' | 'rejected' | 'cancelled') {
    return this.companyOf(tenantId).then((companyId) =>
      this.prisma.leaveRequest.findMany({
        where: { tenantId, companyId, ...(status ? { status } : {}) },
        include: { employee: { select: { employeeNo: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  /** Rincian satu payroll run: item per karyawan termasuk sumber tarif PPh 21 (official / estimate). */
  async getPayrollRun(tenantId: string, id: string) {
    const companyId = await this.companyOf(tenantId);
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId, companyId },
      include: {
        items: {
          include: { employee: { select: { employeeNo: true, fullName: true } } },
          orderBy: { employee: { employeeNo: 'asc' } },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll tidak ditemukan.');
    return run;
  }

  listPayrollRuns(tenantId: string) {
    return this.companyOf(tenantId).then((companyId) =>
      this.prisma.payrollRun.findMany({
        where: { tenantId, companyId },
        include: { _count: { select: { items: true } } },
        orderBy: { period: 'desc' },
      }),
    );
  }

  // ============================== HELPERS ==============================

  /** Ambil bracket PPh 21 untuk periode tertentu. */
  private async bracketsFor(
    tenantId: string,
    companyId: string,
    category: 'withholding' | 'vat' | 'other',
    period: string,
  ) {
    const [year, mon] = period.split('-').map(Number);
    const on = new Date(Date.UTC(year, mon, 0));
    const rule = await this.prisma.taxRule.findFirst({
      where: {
        tenantId,
        companyId,
        category,
        isActive: true,
        effectiveFrom: { lte: on },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: on } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!rule) return [];
    return this.prisma.taxBracket.findMany({
      where: { taxRuleId: rule.id, effectiveFrom: { lte: on } },
      orderBy: { sortOrder: 'asc' },
      select: {
        lowerBound: true,
        upperBound: true,
        ratePercent: true,
        taxRule: { select: { source: true, code: true } },
      },
    }).then((rows) =>
      rows.map((r) => ({
        lowerBound: Number(r.lowerBound),
        upperBound: r.upperBound === null ? null : Number(r.upperBound),
        ratePercent: Number(r.ratePercent),
        rule: r.taxRule,
      })),
    );
  }

  private async assertEmployee(tenantId: string, companyId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId, companyId },
    });
    if (!employee) throw new NotFoundException('Employee tidak ditemukan.');
    return employee;
  }

  private async companyOf(tenantId: string) {
    return defaultCompanyId(this.prisma, tenantId);
  }

  private async account(tenantId: string, companyId: string, code: string, label: string) {
    const account = await this.prisma.chartOfAccount.findFirst({ where: { tenantId, companyId, code } });
    if (!account) {
      throw new NotFoundException(
        `Akun ${code} (${label}) belum ada pada COA perusahaan. Tambahkan dulu sebelum memakai payroll.`,
      );
    }
    return account;
  }

  /** Pegawai baru di tengah bulan: gaji proporsional hari kerja. */
  private prorateFactor(hireDate: Date, periodStart: Date): number {
    const daysInMonth = new Date(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth() + 1,
      0,
    ).getUTCDate();
    const dayOfMonth = hireDate.getUTCDate();
    return Math.max(1, daysInMonth - dayOfMonth + 1) / daysInMonth;
  }
}

/** Iuran sisi karyawan: 1% BPJS Kesehatan + 4% BPJS Ketenagakerjaan. */
export const DEFAULT_BPJS_EMPLOYMENT_RATE = 0.04;
export const DEFAULT_BPJS_HEALTH_RATE = 0.01;
/** Beban perusahaan: 4% ketenagakerjaan + 5% kesehatan (ATK). */
export const EMPLOYER_BPJS_RATE = 0.09;

/** Jam kerja standar per hari; lembur dihitung dari kelebihan ini. */
const STANDARD_WORK_HOURS = 8;
/** Batas lembur harian sesuai praktik umum perusahaan. */
const MAX_DAILY_OVERTIME = 4;
/** Batas keterlambatan sebelum tercatat, dalam menit. */
const GRACE_MINUTES = 15;

function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function formatTime(d: Date): string {
  return new Date(d).toISOString().slice(11, 16);
}

/** Menit keterlambatan dihitung dari 08:00 + masa tenggang. */
function minutesLate(now: Date): number {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const scheduled = 8 * 60 + GRACE_MINUTES;
  return Math.max(minutes - scheduled, 0);
}