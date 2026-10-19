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
import type {
  ClockDto,
  CreateDepartmentDto,
  CreateAttendanceDto,
  CreateEmployeeDto,
  CreatePayrollDto,
  CreatePositionDto,
  DecideLeaveDto,
} from './dto/hr.dto';
import { ensureAccount, type AccountSpec } from '../inventory/inventory-adjustment';
import { isUniqueViolation } from '../inventory/tx-retry';
import { computePph21 } from './pph21';
import {
  ANNUAL_LEAVE_QUOTA,
  businessDate,
  countWorkingDays,
  lateMinutesAt,
  prorateFactorFor,
  workedAndOvertime,
  workingDaysInYear,
} from './work-time';

// COA bawaan pendaftaran tenant tidak memuat akun-akun ini, jadi semuanya dibuat saat dibutuhkan (seperti Utang Gaji).
const SALARY_ACCOUNT: AccountSpec = { code: '6300', name: 'Beban Gaji', type: 'expense' };
// Utang PPh 21 =liability. Jangan tertukar dengan 2150 (Piutang PPN) yang
// bertipe aset — memakai nomor yang salah membuat jurnal tidak seimbang.
const PPH21_PAYABLE: AccountSpec = { code: '2160', name: 'Utang PPh 21', type: 'liability' };
const SOCIAL_PAYABLE: AccountSpec = { code: '2200', name: 'Utang BPJS', type: 'liability' };
/** Kewajiban gaji ke karyawan; COA seed tidak punya akun ini, jadi dibuat saat dibutuhkan. */
const WAGES_PAYABLE_ACCOUNT: AccountSpec = { code: '2300', name: 'Utang Gaji', type: 'liability' };

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
      take: 500,
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
   * Absen masuk. Tanggal kerja & keterlambatan dihitung pada zona WIB (lihat
   * work-time.ts) dan keterlambatan DISIMPAN saat masuk, supaya tidak hilang/tertimpa
   * saat absen pulang.
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

    const day = businessDate(now);
    const late = lateMinutesAt(now);
    let row;
    try {
      const existing = await this.prisma.attendance.findFirst({
        where: { tenantId, employeeId, date: day },
      });
      if (existing?.checkIn) {
        throw new ConflictException(`Anda sudah absen masuk hari ini pukul ${formatTime(existing.checkIn)}.`);
      }
      row = existing
        ? await this.prisma.attendance.update({
            where: { id: existing.id },
            data: { checkIn: now, status: 'present', lateMinutes: late },
          })
        : await this.prisma.attendance.create({
            data: { tenantId, companyId, employeeId, date: day, checkIn: now, status: 'present', lateMinutes: late },
          });
    } catch (error) {
      // Dua absen masuk bersamaan: unique (karyawan, tanggal) menahan yang kedua.
      if (isUniqueViolation(error)) throw new ConflictException('Anda sudah absen masuk hari ini.');
      throw error;
    }

    return {
      id: row.id,
      employeeNo: employee.employeeNo,
      date: day.toISOString().slice(0, 10),
      checkIn: row.checkIn,
      lateMinutes: late,
      message: late > 0 ? 'Terlambat tercatat.' : 'Absen masuk tercatat.',
    };
  }

  /**
   * Absen pulang. Durasi kerja dihitung di sini; lembur = durasi kerja
   * dikurangi jam standar, dibatasi 4 jam per hari sesuai praktik umum.
   * Klaim bersyarat (checkOut masih kosong) menolak absen pulang ganda.
   */
  async clockOut(tenantId: string, employeeId: string, at?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const now = at ? new Date(at) : new Date();
    if (Number.isNaN(now.getTime())) throw new BadRequestException('Waktu absen tidak valid.');
    if (now.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('Waktu absen tidak boleh di masa depan.');
    }
    const day = businessDate(now);
    // Employee harus milik tenant ini: tanpa cek, id asing dijawab "belum absen" (400) alih-alih 404.
    await this.assertEmployee(tenantId, companyId, employeeId);

    const row = await this.prisma.attendance.findFirst({
      where: { tenantId, companyId, employeeId, date: day },
    });
    if (!row?.checkIn) {
      throw new BadRequestException('Belum ada absen masuk hari ini.');
    }
    if (row.checkOut) {
      throw new ConflictException(`Anda sudah absen pulang pukul ${formatTime(row.checkOut)}.`);
    }

    const { worked, overtime } = workedAndOvertime(new Date(row.checkIn), now);
    if (worked < 0) throw new BadRequestException('Waktu pulang sebelum waktu masuk.');

    const claimed = await this.prisma.attendance.updateMany({
      where: { id: row.id, checkOut: null },
      data: {
        checkOut: now,
        workedHours: new Prisma.Decimal(roundMoney(worked)),
        overtimeHours: new Prisma.Decimal(roundMoney(overtime)),
      },
    });
    if (claimed.count !== 1) throw new ConflictException('Anda sudah absen pulang.');
    const updated = await this.prisma.attendance.findUniqueOrThrow({ where: { id: row.id } });

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
      take: 500,
      where: { tenantId, companyId },
      include: { department: { select: { id: true, code: true, name: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createPosition(tenantId: string, dto: CreatePositionDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertDepartment(tenantId, companyId, dto.departmentId);
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
      take: 500,
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
    // Referensi harus milik tenant/company ini; tanpa cek, FK gagal sebagai 500 atau menautkan data asing.
    await this.assertDepartment(tenantId, companyId, dto.departmentId);
    if (dto.positionId) {
      const pos = await this.prisma.position.findFirst({ where: { id: dto.positionId, tenantId, companyId }, select: { id: true } });
      if (!pos) throw new NotFoundException('Jabatan tidak ditemukan.');
    }
    if (dto.managerId) await this.assertEmployee(tenantId, companyId, dto.managerId);
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
    const when = new Date(date);
    if (when < employee.hireDate) {
      throw new BadRequestException('Tanggal berhenti tidak boleh sebelum tanggal masuk.');
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
    const claimed = await this.prisma.employee.updateMany({
      where: { id, tenantId, companyId, terminationDate: null },
      data: { terminationDate: when, isActive: false },
    });
    if (claimed.count !== 1) throw new ConflictException('Employee ini sudah dinonaktifkan.');
    return this.prisma.employee.findUniqueOrThrow({ where: { id } });
  }

  // ============================== ATTENDANCE & LEAVE ==============================

  async recordAttendance(tenantId: string, dto: CreateAttendanceDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertEmployee(tenantId, companyId, dto.employeeId);
    // Kolom date bertipe DATE: normalkan ke awal hari supaya cocok dengan kunci unik (karyawan, tanggal).
    const date = new Date(dto.date);
    date.setUTCHours(0, 0, 0, 0);
    return this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date } },
      update: {
        status: dto.status,
        overtimeHours: new Prisma.Decimal(dto.overtimeHours ?? 0),
        note: dto.note ?? '',
      },
      create: {
        tenantId,
        companyId,
        employeeId: dto.employeeId,
        date,
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

  /**
   * Saldo cuti tahunan: hak 12 hari kerja per tahun kalender; terpakai = cuti
   * `approved` pada tahun itu, menunggu = `pending`. Akhir pekan tidak memotong jatah.
   */
  async leaveBalance(tenantId: string, employeeId: string, year?: number) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertEmployee(tenantId, companyId, employeeId);
    const y = year ?? new Date().getUTCFullYear();
    const yearStart = new Date(Date.UTC(y, 0, 1));
    const yearEnd = new Date(Date.UTC(y, 11, 31));
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        tenantId,
        companyId,
        employeeId,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      select: { status: true, startDate: true, endDate: true },
    });
    let used = 0;
    let pending = 0;
    for (const r of rows) {
      const d = workingDaysInYear(r.startDate, r.endDate, y);
      if (r.status === 'approved') used += d;
      else pending += d;
    }
    return {
      employeeId,
      year: y,
      entitlement: ANNUAL_LEAVE_QUOTA,
      used,
      pending,
      remaining: ANNUAL_LEAVE_QUOTA - used - pending,
    };
  }

  async requestLeave(tenantId: string, employeeId: string, dto: { startDate: string; endDate: string; reason?: string }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const employee = await this.assertEmployee(tenantId, companyId, employeeId);
    if (!employee.isActive) throw new BadRequestException('Employee nonaktif tidak bisa mengajukan cuti.');
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(0, 0, 0, 0);
    if (end < start) throw new BadRequestException('Tanggal akhir tidak boleh sebelum tanggal mulai.');
    if (end.getTime() - start.getTime() > 366 * 86400000) {
      throw new BadRequestException('Rentang cuti maksimal satu tahun.');
    }
    const days = countWorkingDays(start, end);
    if (days === 0) {
      throw new BadRequestException('Rentang tanggal hanya berisi akhir pekan; tidak ada hari kerja yang diambil.');
    }

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

    // Saldo dicek per tahun kalender yang disentuh rentang cuti.
    for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
      const need = workingDaysInYear(start, end, y);
      const balance = await this.leaveBalance(tenantId, employeeId, y);
      if (need > balance.remaining) {
        throw new BadRequestException(
          `Saldo cuti ${y} tidak cukup: sisa ${balance.remaining} hari, diminta ${need} hari.`,
        );
      }
    }

    return this.prisma.leaveRequest.create({
      data: { tenantId, companyId, employeeId, startDate: start, endDate: end, days, reason: dto.reason ?? '' },
    });
  }

  async decideLeave(tenantId: string, id: string, approverId: string, dto: DecideLeaveDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId, companyId },
      include: { employee: { select: { userId: true } } },
    });
    if (!leave) throw new NotFoundException('Pengajuan cuti tidak ditemukan.');
    if (leave.status !== 'pending') throw new ConflictException('Pengajuan sudah diputuskan.');
    // Pemisahan kewenangan: pemohon tidak boleh memutuskan cutinya sendiri.
    if (leave.employee.userId && leave.employee.userId === approverId) {
      throw new ForbiddenException('Anda tidak boleh memutuskan pengajuan cuti Anda sendiri.');
    }
    const claimed = await this.prisma.leaveRequest.updateMany({
      where: { id, tenantId, companyId, status: 'pending' },
      data: {
        status: dto.approve ? 'approved' : 'rejected',
        decidedById: approverId,
        decidedAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new ConflictException('Pengajuan sudah diputuskan oleh permintaan lain.');
    return this.prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
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

    // Pegawai yang baru masuk SETELAH periode ini belum berhak digaji (faktor 0).
    const eligible = employees.filter((e) => this.prorateFactor(new Date(e.hireDate), periodStart) > 0);
    if (eligible.length === 0) {
      throw new BadRequestException('Tidak ada employee yang sudah aktif pada periode ini.');
    }
    const items = eligible.map((e) => {
      const o: PayrollOverrideShape = overrides.get(e.id) ?? EMPTY_OVERRIDE;
      // Pegawai yang baru masuk di tengah periode hanya dapat gaji prorata.
      const hire = new Date(e.hireDate);
      const prorate = this.prorateFactor(hire, periodStart);
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
      if (net < 0) {
        throw new BadRequestException(
          `Potongan melebihi gaji bruto untuk ${e.employeeNo}: bersih ${net}. Periksa potongan lain/BPJS.`,
        );
      }

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

    try {
    return await this.prisma.payrollRun.create({
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
    } catch (error) {
      // Dua perhitungan periode yang sama bersamaan: unique (company, period) menahan yang kedua.
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Payroll periode ${dto.period} sudah pernah dihitung.`);
      }
      throw error;
    }
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
   *
   * Sisi kredit gaji masuk ke akun kewajiban "Utang Gaji" (bukan akun Beban Gaji
   * yang didebet): mengkreditnya ke akun beban yang sama menghapus beban gaji
   * bersih dari laporan laba rugi dan tak meninggalkan utang ke karyawan.
   *
   * Klaim draft -> approved dilakukan atomik di dalam transaksi jurnal, jadi dua
   * posting bersamaan tidak pernah menerbitkan dua jurnal untuk satu payroll.
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
    const credit = roundMoney(payableToEmployee + pph21 + socialPayable);

    // Dibandingkan dalam sen: selisih floating point tidak boleh memblokir posting yang sah.
    if (Math.round(credit * 100) !== Math.round(debit * 100)) {
      throw new BadRequestException(`Jurnal payroll tidak seimbang (Dr ${debit} vs Cr ${credit}).`);
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payrollRun.updateMany({
        where: { id, tenantId, companyId, status: 'draft' },
        data: { status: 'approved' },
      });
      if (claimed.count !== 1) throw new ConflictException('Payroll sudah diposting oleh permintaan lain.');

      const [salaryAcc, pphAcc, socialAcc, wagesPayableAcc] = await Promise.all([
        ensureAccount(tx, tenantId, companyId, SALARY_ACCOUNT),
        ensureAccount(tx, tenantId, companyId, PPH21_PAYABLE),
        ensureAccount(tx, tenantId, companyId, SOCIAL_PAYABLE),
        ensureAccount(tx, tenantId, companyId, WAGES_PAYABLE_ACCOUNT),
      ]);

      const lines = [
        { accountId: salaryAcc.id, direction: 'debit' as const, amount: debit, memo: 'Beban gaji & tunjangan' },
        { accountId: wagesPayableAcc.id, direction: 'credit' as const, amount: payableToEmployee, memo: 'Utang gaji karyawan' },
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
        data: { journalId: journal.id },
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
      take: 500,
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

  private async assertDepartment(tenantId: string, companyId: string, departmentId?: string | null) {
    if (!departmentId) return;
    const dep = await this.prisma.department.findFirst({ where: { id: departmentId, tenantId, companyId }, select: { id: true } });
    if (!dep) throw new NotFoundException('Departemen tidak ditemukan.');
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

  /** Versi dari dalam transaksi, supaya akun & jurnal satu transaksi dengan klaim status. */
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
        `Akun ${code} (${label}) belum ada pada COA perusahaan. Tambahkan dulu sebelum memakai payroll.`,
      );
    }
    return account;
  }

  /** Pegawai baru di tengah bulan: gaji proporsional hari kalender; 0 bila masuk setelah periode. */
  private prorateFactor(hireDate: Date, periodStart: Date): number {
    return prorateFactorFor(hireDate, periodStart);
  }
}

/** Iuran sisi karyawan: 1% BPJS Kesehatan + 4% BPJS Ketenagakerjaan. */
export const DEFAULT_BPJS_EMPLOYMENT_RATE = 0.04;
export const DEFAULT_BPJS_HEALTH_RATE = 0.01;
/** Beban perusahaan: 4% ketenagakerjaan + 5% kesehatan (ATK). */
export const EMPLOYER_BPJS_RATE = 0.09;

function formatTime(d: Date): string {
  return new Date(d).toISOString().slice(11, 16);
}
