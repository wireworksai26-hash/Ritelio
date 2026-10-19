import { ApprovalService } from '../../../modules/approvals/approval.service';
import { OperationsService } from '../../../modules/operations/operations.service';
import { ResourceService } from '../../../modules/operations/resource.service';
import type { DemoContext } from '../context';
import { unitHash } from './attendance-plan';
import { dayIso, employeeIdOf, tolerate } from './helpers';
import type { ProjectSeed, TimesheetPlan } from './types';

/** Berapa timesheet "disetujui, belum ditagih" terbaru per proyek yang approval keuangannya sengaja dibiarkan menunggu. */
const PENDING_FINANCE_APPROVALS = 4;

export interface SheetRow {
  employee: string;
  date: string;
  ago: number;
  hours: number;
  rate: number;
  note: string;
  billable: boolean;
}

/** Baris timesheet dari satu rencana: hari kerja yang cocok, jam bervariasi sedikit (deterministik). */
export function expandTimesheetPlan(plan: TimesheetPlan, isoOf: (ago: number) => string): SheetRow[] {
  const rows: SheetRow[] = [];
  const seen = new Set<string>();
  for (let ago = plan.fromAgo; ago >= plan.toAgo; ago--) {
    const date = isoOf(ago);
    if (seen.has(date)) continue; // tanggal terjepit batas awal tahun
    seen.add(date);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!plan.weekdays.includes(dow)) continue;
    const r = unitHash(`${plan.employee}|${date}|hours`);
    const hours = Math.max(1, plan.hours + (r < 0.15 ? -1 : r > 0.88 ? 1 : 0));
    rows.push({ employee: plan.employee, date, ago, hours, rate: plan.rate, note: plan.note, billable: plan.billable });
  }
  return rows;
}

type Stage = 'approved' | 'approved-after' | 'submitted';

export function stageOf(ago: number, p: Pick<ProjectSeed, 'approveBeforeBillAgo' | 'approveAfterBillAgo'>): Stage {
  if (ago >= p.approveBeforeBillAgo) return 'approved';
  return ago >= p.approveAfterBillAgo ? 'approved-after' : 'submitted';
}

export async function seedProjects(ctx: DemoContext, projects: ProjectSeed[]): Promise<void> {
  const ops = ctx.get(OperationsService);
  const res = ctx.get(ResourceService);
  const approvals = ctx.get(ApprovalService);
  const { prisma, tenantId, companyId } = ctx;
  const iso = (ago: number) => dayIso(ctx, ago);
  const approverId = ctx.users.manager.id;
  const financeId = ctx.users.owner.id;
  let billedCount = 0;

  for (const p of projects) {
    const customerId = p.customer ? ctx.customerIds.get(p.customer) : undefined;
    if (p.customer && !customerId) throw new Error(`Pelanggan "${p.customer}" tidak ada di ${ctx.biz.businessName}.`);

    let project = await prisma.project.findFirst({ where: { tenantId, companyId, code: p.code } });
    if (!project) {
      project = await ops.createProject(tenantId, {
        code: p.code,
        name: p.name,
        customerId,
        managerId: await employeeIdOf(ctx, p.manager),
        budget: p.budget,
        startDate: iso(p.startAgo),
        endDate: iso(p.endAgo),
        description: p.description,
      });
    }
    // Status proyek tidak punya service pengubah (kolom hanya dibaca aplikasi); nilainya murni informasi tampilan.
    if (project.status !== p.status) await prisma.project.update({ where: { id: project.id }, data: { status: p.status } });
    const projectId = project.id;

    // Milestone: urut sesuai deklarasi supaya dependensi sudah ada dan yang selesai tidak terhalang.
    const milestoneIds = new Map<string, string>();
    for (const m of p.milestones) {
      let row = await prisma.projectMilestone.findFirst({ where: { projectId, name: m.name } });
      if (!row) {
        const deps = (m.dependsOn ?? []).map((n) => {
          const id = milestoneIds.get(n);
          if (!id) throw new Error(`Dependensi "${n}" untuk milestone "${m.name}" belum ada.`);
          return id;
        });
        row = await ops.addMilestone(tenantId, projectId, m.name, iso(m.dueAgo), iso(m.startAgo), deps);
      }
      milestoneIds.set(m.name, row.id);
      if (m.state === 'done' && !row.completedAt) {
        await ops.completeMilestone(tenantId, row.id, 100);
        // Kosmetik: service menandai selesai dengan "sekarang".
        await prisma.projectMilestone.update({ where: { id: row.id }, data: { completedAt: ctx.at(m.doneAgo ?? m.dueAgo, 16) } });
      } else if (m.state === 'progress' && m.progress !== undefined && row.progress !== m.progress) {
        await ops.updateMilestone(tenantId, row.id, { progress: m.progress });
      }
    }

    // Alokasi: penjaga 100% di service dihormati; proyek selesai dilepas.
    for (const a of p.allocations) {
      const employeeId = await employeeIdOf(ctx, a.employee);
      const startDate = iso(a.startAgo);
      let alloc = await prisma.resourceAllocation.findFirst({ where: { projectId, employeeId, startDate: new Date(startDate) } });
      if (!alloc) {
        alloc =
          (await tolerate(ctx, `alokasi ${a.employee} di ${p.code}`, () =>
            res.allocate(tenantId, {
              projectId,
              employeeId,
              allocationPct: a.pct,
              hoursPerWeek: a.hoursPerWeek,
              startDate,
              endDate: a.endAgo !== undefined ? iso(a.endAgo) : undefined,
              role: a.role,
            }),
          )) ?? null;
      }
      if (!alloc) continue;
      if (p.status === 'completed' && alloc.isActive) await res.release(tenantId, alloc.id);
    }

    // Timesheet: catat, setujui sebelum tagihan, tagih sekali, lalu setujui sisanya.
    const rows = p.timesheets.flatMap((plan) => expandTimesheetPlan(plan, iso));
    const sheets: Array<{ id: string; ago: number; stage: Stage; billable: boolean; date: string }> = [];
    for (const r of rows) {
      const employeeId = await employeeIdOf(ctx, r.employee);
      const workDate = new Date(`${r.date}T00:00:00Z`);
      let sheet = await prisma.timesheet.findUnique({ where: { employeeId_workDate: { employeeId, workDate } } });
      if (sheet && sheet.projectId !== projectId) continue; // sudah dipakai proyek lain pada hari itu
      if (!sheet) {
        sheet = await ops.recordTimesheet(tenantId, { projectId, employeeId, workDate: r.date, hours: r.hours, hourlyRate: r.rate, billable: r.billable, note: r.note });
        // Kosmetik: waktu pencatatan mengikuti hari kerjanya.
        await prisma.timesheet.update({ where: { id: sheet.id }, data: { createdAt: ctx.at(r.ago, 18) } });
      }
      sheets.push({ id: sheet.id, ago: r.ago, stage: stageOf(r.ago, p), billable: sheet.billable, date: r.date });
    }

    const approve = async (stage: Stage) => {
      for (const s of sheets.filter((x) => x.stage === stage)) {
        const current = await prisma.timesheet.findUniqueOrThrow({ where: { id: s.id }, select: { status: true } });
        if (current.status !== 'submitted') continue;
        await ops.approveTimesheet(tenantId, s.id, approverId);
        // Kosmetik: persetujuan sehari setelah jam dicatat (service memakai "sekarang").
        await prisma.timesheet.update({ where: { id: s.id }, data: { approvedAt: ctx.at(Math.max(s.ago - 1, 0), 10) } });
      }
    };
    await approve('approved');

    if (p.bill && customerId) {
      const alreadyBilled = await prisma.timesheet.count({ where: { tenantId, projectId, billedAt: { not: null } } });
      const ready = await prisma.timesheet.count({ where: { tenantId, projectId, status: 'approved', billable: true, billedAt: null } });
      if (alreadyBilled === 0 && ready > 0) {
        const billed = await ops.billProject(tenantId, projectId);
        billedCount++;
        ctx.log(`proyek ${p.code}: ditagih Rp ${billed.amount.toLocaleString('id-ID')} (${billed.billedSheets} timesheet), faktur ${billed.invoice.number}`);
      }
    }
    await approve('approved-after');

    // Approval keuangan untuk timesheet billable: yang sudah selesai diputuskan, hanya beberapa terbaru yang menunggu.
    const billableApproved = sheets.filter((s) => s.billable && s.stage !== 'submitted').sort((a, b) => a.date.localeCompare(b.date));
    const keepPending = new Set(billableApproved.filter((s) => s.stage === 'approved-after').slice(-PENDING_FINANCE_APPROVALS).map((s) => s.id));
    const toDecide = billableApproved.filter((s) => !keepPending.has(s.id)).map((s) => s.id);
    if (toDecide.length > 0) {
      const open = await prisma.approvalRequest.findMany({
        where: { tenantId, documentType: 'timesheet', documentId: { in: toDecide }, status: 'pending' },
        select: { id: true },
      });
      for (const req of open) await approvals.decide(tenantId, companyId, req.id, financeId, 'approved', 'Jam kerja sesuai kontrak');
    }
  }

  const [n, m, t, al] = await Promise.all([
    prisma.project.count({ where: { tenantId } }),
    prisma.projectMilestone.count({ where: { tenantId } }),
    prisma.timesheet.count({ where: { tenantId } }),
    prisma.resourceAllocation.count({ where: { tenantId } }),
  ]);
  ctx.log(`proyek: ${n} proyek, ${m} milestone, ${t} timesheet, ${al} alokasi, ${billedCount} penagihan baru`);
}
