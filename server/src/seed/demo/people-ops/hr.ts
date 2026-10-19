import { HrmService } from '../../../modules/hrm/hrm.service';
import { PerformanceService } from '../../../modules/hrm/performance.service';
import { RecruitmentService } from '../../../modules/hrm/recruitment.service';
import type { DemoContext } from '../context';
import { planAttendance, resolveLeaveWindow, unitHash, weekdaysInRange, wibInstant, workdaysBefore } from './attendance-plan';
import { dayIso, employeeIdOf, monthEnd, monthKey, redateJournal, tolerate } from './helpers';
import type { HrSeed, PostingSeed } from './types';

/** Jumlah hari kerja yang diisi absensinya (sekitar 6 minggu kalender). */
export const ATTENDANCE_WORKDAYS = 32;

const STAGES = ['applied', 'screening', 'interview', 'offer'] as const;

// ───────── Rekrutmen ─────────

async function seedPosting(ctx: DemoContext, p: PostingSeed): Promise<Array<{ applicantId: string; salary: number; hireAgo: number }>> {
  const rec = ctx.get(RecruitmentService);
  const { prisma, tenantId, companyId } = ctx;
  const hires: Array<{ applicantId: string; salary: number; hireAgo: number }> = [];

  let posting = await prisma.jobPosting.findFirst({ where: { tenantId, companyId, title: p.title } });
  if (!posting) {
    const dept = await prisma.department.findFirst({ where: { tenantId, companyId, code: p.departmentCode }, select: { id: true } });
    const position = await prisma.position.findFirst({ where: { tenantId, companyId, code: p.positionCode }, select: { id: true } });
    posting = await rec.createPosting(tenantId, {
      title: p.title,
      departmentId: dept?.id,
      positionId: position?.id,
      description: p.description,
      employmentType: p.employmentType,
      salaryMin: p.salaryMin,
      salaryMax: p.salaryMax,
      openings: p.openings,
    });
    // Kosmetik: service mengisi tanggal buka dengan "sekarang".
    await prisma.jobPosting.update({ where: { id: posting.id }, data: { openedAt: ctx.at(p.openedAgo, 9) } });
  }

  for (const a of p.applicants) {
    const email = a.email.toLowerCase();
    let applicant = await prisma.applicant.findFirst({ where: { tenantId, jobPostingId: posting.id, email } });
    if (!applicant) {
      if (posting.status !== 'open') {
        ctx.log(`lowongan "${p.title}" sudah ditutup, pelamar ${a.name} dilewati`);
        continue;
      }
      applicant = await rec.apply(tenantId, { jobPostingId: posting.id, fullName: a.name, email, phone: a.phone, coverNote: a.coverNote });
      // Kosmetik: tanggal melamar dan penilaian awal tidak diterima service apply().
      await prisma.applicant.update({ where: { id: applicant.id }, data: { appliedAt: ctx.at(a.appliedAgo, 10), rating: a.rating ?? null } });
    }
    if (applicant.stage === 'hired' || applicant.stage === 'rejected') continue;

    const targetIdx = a.path === 'rejected' ? STAGES.indexOf(a.rejectedAfter ?? 'screening') : a.path === 'hired' ? STAGES.indexOf('offer') : STAGES.indexOf(a.path);
    for (let i = STAGES.indexOf(applicant.stage as (typeof STAGES)[number]) + 1; i <= targetIdx; i++) {
      await rec.moveStage(tenantId, applicant.id, STAGES[i]);
    }
    if (a.path === 'rejected') await rec.moveStage(tenantId, applicant.id, 'rejected', a.rejectReason ?? 'Tidak sesuai kebutuhan');
    if (a.path === 'hired' && a.hire) hires.push({ applicantId: applicant.id, salary: a.hire.salary, hireAgo: a.hire.hireAgo });
  }
  return hires;
}

async function seedRecruitment(ctx: DemoContext, postings: PostingSeed[]): Promise<void> {
  const rec = ctx.get(RecruitmentService);
  const { prisma, tenantId, companyId } = ctx;

  // Semua pelamar masuk dulu, baru yang diterima di-hire: hire() menutup lowongan yang kuotanya penuh,
  // dan lowongan tertutup tidak menerima pelamar lagi.
  const hiresByPosting = new Map<string, Array<{ applicantId: string; salary: number; hireAgo: number }>>();
  for (const p of postings) hiresByPosting.set(p.title, await seedPosting(ctx, p));

  for (const p of postings) {
    const posting = await prisma.jobPosting.findFirstOrThrow({ where: { tenantId, companyId, title: p.title } });
    for (const h of hiresByPosting.get(p.title) ?? []) {
      await rec.hire(tenantId, h.applicantId, { hireDate: dayIso(ctx, h.hireAgo), baseSalary: h.salary, createUser: false });
      // Kosmetik: hire() menandai waktu diterima dan menutup lowongan dengan "sekarang".
      await prisma.applicant.update({ where: { id: h.applicantId }, data: { hiredAt: ctx.at(h.hireAgo, 10) } });
      if (h.hireAgo >= 20) await rec.completeOnboarding(tenantId, h.applicantId);
    }
    const hires = hiresByPosting.get(p.title) ?? [];
    let fresh = await prisma.jobPosting.findFirstOrThrow({ where: { id: posting.id } });
    if (p.closeManually && fresh.status === 'open') {
      await rec.closePosting(tenantId, posting.id);
      fresh = await prisma.jobPosting.findFirstOrThrow({ where: { id: posting.id } });
    }
    // Kosmetik: lowongan yang baru ditutup bertanda "sekarang"; dikembalikan ke saat hire terakhir atau penutupan manual.
    // Penutupan lama (dari jalankan sebelumnya) tidak disentuh lagi.
    const justClosed = fresh.status === 'closed' && (!fresh.closedAt || Date.now() - fresh.closedAt.getTime() < 3_600_000);
    if (justClosed) {
      const closedAgo = hires.length > 0 ? Math.min(...hires.map((h) => h.hireAgo)) : Math.max(p.openedAgo - 35, 1);
      await prisma.jobPosting.update({ where: { id: posting.id }, data: { closedAt: ctx.at(Math.max(closedAgo, 1), 10) } });
    }
  }
}

// ───────── Cuti ─────────

async function seedLeaves(ctx: DemoContext, seed: HrSeed): Promise<void> {
  const hrm = ctx.get(HrmService);
  const { prisma, tenantId } = ctx;
  for (const l of seed.leaves) {
    const employeeId = await employeeIdOf(ctx, l.employee);
    const reason = `[demo] ${l.reason}`;
    if (await prisma.leaveRequest.findFirst({ where: { tenantId, employeeId, reason }, select: { id: true } })) continue;

    const { start, end } = resolveLeaveWindow(dayIso(ctx, l.startAgo), l.spanDays);
    const created = await tolerate(ctx, `cuti ${l.employee}`, () => hrm.requestLeave(tenantId, employeeId, { startDate: start, endDate: end, reason }));
    if (!created) continue;
    if (l.decision !== 'pending') {
      await hrm.decideLeave(tenantId, created.id, ctx.users[l.decidedBy ?? 'manager'].id, { approve: l.decision === 'approved' });
    }
    // Kosmetik: service mengisi waktu pengajuan dan keputusan dengan "sekarang".
    const filedAgo = Math.max(l.startAgo + 6, 2);
    await prisma.leaveRequest.update({
      where: { id: created.id },
      data: { createdAt: ctx.at(filedAgo, 9), ...(l.decision !== 'pending' ? { decidedAt: ctx.at(filedAgo - 1, 14) } : {}) },
    });
  }
}

// ───────── Absensi ─────────

async function seedAttendance(ctx: DemoContext, seed: HrSeed): Promise<number> {
  const hrm = ctx.get(HrmService);
  const { prisma, tenantId, companyId } = ctx;
  const today = dayIso(ctx, 0);
  const notBefore = `${today.slice(0, 4)}-01-02`;
  const days = workdaysBefore(today, ATTENDANCE_WORKDAYS, notBefore);
  if (days.length === 0) return 0;

  const employees = await prisma.employee.findMany({
    where: { tenantId, companyId, isActive: true },
    select: { id: true, employeeNo: true, hireDate: true },
    orderBy: { employeeNo: 'asc' },
  });
  const approved = await prisma.leaveRequest.findMany({ where: { tenantId, companyId, status: 'approved' }, select: { employeeId: true, startDate: true, endDate: true } });

  let written = 0;
  for (const e of employees) {
    const hireIso = e.hireDate.toISOString().slice(0, 10);
    const own = days.filter((d) => d >= hireIso);
    const leaveDays = new Set(
      approved.filter((l) => l.employeeId === e.id).flatMap((l) => weekdaysInRange(l.startDate.toISOString().slice(0, 10), l.endDate.toISOString().slice(0, 10))),
    );
    const script = seed.attendanceScript.filter((s) => s.employee === e.employeeNo).map(({ idx, kind }) => ({ idx, kind }));

    for (const day of planAttendance(e.employeeNo, own, { script, leaveDays })) {
      const date = new Date(`${day.date}T00:00:00Z`);
      if (await prisma.attendance.findFirst({ where: { tenantId, employeeId: e.id, date }, select: { id: true } })) continue;

      if (day.kind === 'normal' || day.kind === 'late' || day.kind === 'overtime') {
        await hrm.clockIn(tenantId, e.id, wibInstant(day.date, day.checkInMin!).toISOString());
        await hrm.clockOut(tenantId, e.id, wibInstant(day.date, day.checkOutMin!).toISOString());
        if (day.note) await prisma.attendance.updateMany({ where: { tenantId, employeeId: e.id, date }, data: { note: day.note } });
      } else {
        // Sakit tidak punya status sendiri di model absensi: dicatat sebagai "leave" dengan catatan.
        const status = day.kind === 'half_day' ? 'half_day' : day.kind === 'absent' ? 'absent' : 'leave';
        await hrm.recordAttendance(tenantId, { employeeId: e.id, date: day.date, status, note: day.note });
      }
      written++;
    }
  }
  return written;
}

// ───────── Kinerja ─────────

const round2 = (v: number) => Math.round(v * 100) / 100;

async function seedPerformance(ctx: DemoContext, seed: HrSeed): Promise<void> {
  const perf = ctx.get(PerformanceService);
  const { prisma, tenantId, companyId } = ctx;
  const reviewerId = ctx.users.manager.id;

  const kpiIds = new Map<string, string>();
  for (const k of seed.kpis) {
    const found = await prisma.kpiDefinition.findFirst({ where: { tenantId, companyId, code: k.code }, select: { id: true } });
    kpiIds.set(k.code, found ? found.id : (await perf.createDefinition(tenantId, k)).id);
  }

  const periods = [{ period: monthKey(ctx, 1), back: 1 }, { period: monthKey(ctx, 0), back: 0 }];
  const today = ctx.daysAgo(0);
  for (const { period, back } of periods) {
    if (period.slice(0, 4) !== String(today.getUTCFullYear())) continue; // tahun lalu: di luar kalender fiskal
    const dueDate = monthEnd(period).toISOString().slice(0, 10);
    await perf.setTargets(
      tenantId,
      period,
      await Promise.all(
        seed.kpiTargets.map(async (t) => ({
          kpiId: kpiIds.get(t.kpi)!,
          employeeId: await employeeIdOf(ctx, t.employee),
          target: t.target,
          weight: t.weight,
          dueDate,
        })),
      ),
    );
    for (const t of seed.kpiTargets) {
      const employeeId = await employeeIdOf(ctx, t.employee);
      const row = await prisma.kpiTarget.findFirstOrThrow({ where: { tenantId, kpiId: kpiIds.get(t.kpi)!, employeeId, period } });
      const actual = t.target >= 1000 ? Math.round(t.target * (back === 1 ? t.ratioPrev : t.ratioCur)) : round2(t.target * (back === 1 ? t.ratioPrev : t.ratioCur));
      if (row.actual === null || Number(row.actual) !== actual) await perf.recordActual(tenantId, row.id, actual);
    }

    for (const r of seed.reviews) {
      const employeeId = await employeeIdOf(ctx, r.employee);
      if (!seed.kpiTargets.some((t) => t.employee === r.employee)) continue;
      const submit = back === 1 ? true : r.submitCurrent;
      const existing = await prisma.performanceReview.findFirst({ where: { tenantId, companyId, employeeId, period }, select: { status: true } });
      if (existing && (existing.status === 'submitted' || !submit)) continue;
      const saved = await perf.review(tenantId, employeeId, period, { strengths: r.strengths, improvements: r.improvements, submit }, reviewerId);
      // Kosmetik: waktu penilaian dikirim memakai "sekarang"; penilaian bulan lalu jatuh di awal bulan ini.
      if (submit) {
        const sentAgo = back === 1 ? Math.max(today.getUTCDate() - 1, 2) : 1;
        await prisma.performanceReview.update({ where: { id: saved.id }, data: { reviewedAt: ctx.at(sentAgo, 15) } });
      }
    }
  }
}

// ───────── Payroll ─────────

const OVERTIME_MULTIPLIER = 1.5;
const MONTHLY_HOURS = 173;

async function seedPayroll(ctx: DemoContext, seed: HrSeed): Promise<{ posted: number; drafts: number }> {
  const hrm = ctx.get(HrmService);
  const { prisma, tenantId, companyId } = ctx;
  const thisYear = String(ctx.daysAgo(0).getUTCFullYear());
  const stats = { posted: 0, drafts: 0 };

  const rules = await prisma.taxRule.count({ where: { tenantId, category: 'withholding', isActive: true } });
  if (rules === 0) ctx.log('PERINGATAN: aturan PPh 21 belum ada (jalankan domain foundation dulu), payroll terbit tanpa PPh 21');

  // Dari bulan terlama ke berjalan: bulan sebelum ini diposting (jurnal gaji), bulan berjalan dibiarkan draf.
  for (const back of [3, 2, 1, 0]) {
    const period = monthKey(ctx, back);
    if (period.slice(0, 4) !== thisYear) continue;

    let run = await prisma.payrollRun.findFirst({ where: { tenantId, companyId, period } });
    if (!run) {
      const [y, m] = period.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      const staff = await prisma.employee.findMany({ where: { tenantId, companyId, isActive: true, hireDate: { lt: end } }, select: { id: true, employeeNo: true, baseSalary: true } });
      const overrides = [];
      for (const e of staff) {
        const rows = await prisma.attendance.aggregate({
          where: { tenantId, employeeId: e.id, date: { gte: start, lt: end } },
          _sum: { overtimeHours: true },
          _count: true,
        });
        // Bulan tanpa data absensi (lebih tua dari jendela absensi) memakai jam lembur tiruan yang deterministik.
        const hours = rows._count > 0 ? Number(rows._sum.overtimeHours ?? 0) : Math.round(unitHash(`${e.employeeNo}|${period}|ot`) * 14);
        const adj = seed.payrollAdjust.find((a) => a.employee === e.employeeNo && a.monthsBack === back);
        overrides.push({
          employeeId: e.id,
          overtimeAmount: Math.round((hours * Number(e.baseSalary) * OVERTIME_MULTIPLIER) / MONTHLY_HOURS / 100) * 100,
          bonusAmount: adj?.bonus,
          otherEarning: adj?.otherEarning,
          otherDeduction: adj?.otherDeduction,
        });
      }
      run = await hrm.runPayroll(tenantId, { period, overrides });
      // Kosmetik: perhitungan payroll dicatat pada akhir periodenya, bukan hari ini.
      if (back > 0) await prisma.payrollRun.update({ where: { id: run.id }, data: { createdAt: monthEnd(period) } });
    }

    if (back === 0) {
      stats.drafts++;
      continue;
    }
    if (run.status === 'draft') await hrm.postPayroll(tenantId, run.id);
    const posted = await prisma.payrollRun.findFirstOrThrow({ where: { id: run.id }, select: { journalId: true } });
    if (posted.journalId) {
      const journal = await prisma.journalHeader.findFirstOrThrow({ where: { id: posted.journalId }, select: { entryDate: true } });
      const want = monthEnd(period);
      if (journal.entryDate.toISOString().slice(0, 7) !== period) await redateJournal(ctx, posted.journalId, want);
    }
    stats.posted++;
  }
  return stats;
}

// ───────── Gabungan ─────────

export async function seedHr(ctx: DemoContext, seed: HrSeed): Promise<void> {
  await seedRecruitment(ctx, seed.postings);
  await seedLeaves(ctx, seed);
  const attendance = await seedAttendance(ctx, seed);
  await seedPerformance(ctx, seed);
  const payroll = await seedPayroll(ctx, seed);
  const [emp, leaves, postings, applicants] = await Promise.all([
    ctx.prisma.employee.count({ where: { tenantId: ctx.tenantId } }),
    ctx.prisma.leaveRequest.count({ where: { tenantId: ctx.tenantId } }),
    ctx.prisma.jobPosting.count({ where: { tenantId: ctx.tenantId } }),
    ctx.prisma.applicant.count({ where: { tenantId: ctx.tenantId } }),
  ]);
  ctx.log(`SDM: ${emp} karyawan, ${attendance} absensi baru, ${leaves} cuti, ${postings} lowongan, ${applicants} pelamar, payroll ${payroll.posted} diposting + ${payroll.drafts} draf`);
}
