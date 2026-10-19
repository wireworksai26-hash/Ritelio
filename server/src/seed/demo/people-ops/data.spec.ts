import { describe, expect, it } from 'vitest';
import { ANNUAL_LEAVE_QUOTA, countWorkingDays } from '../../../modules/hrm/work-time';
import { BUSINESSES } from '../../businesses.data';
import { PEOPLE_OPS_SEEDS } from '../people-ops';
import { addDaysIso, resolveLeaveWindow } from './attendance-plan';
import { expandTimesheetPlan, stageOf } from './projects';
import type { ProjectSeed } from './types';

const TODAY = '2026-10-19';
const isoOf = (ago: number) => addDaysIso(TODAY, -ago);

describe('data seed people-ops per usaha', () => {
  it('tiga usaha seed punya data people-ops', () => {
    expect(Object.keys(PEOPLE_OPS_SEEDS).sort()).toEqual(BUSINESSES.map((b) => b.key).sort());
  });

  for (const biz of BUSINESSES) {
    const seed = PEOPLE_OPS_SEEDS[biz.key];
    const employees = new Set(biz.employees.map((e) => e.no));
    const skus = new Set(biz.products.map((p) => p.sku));

    describe(biz.businessName, () => {
      it('SDM: rujukan karyawan, departemen, dan jabatan valid', () => {
        for (const l of seed.hr.leaves) expect(employees, l.employee).toContain(l.employee);
        for (const t of seed.hr.kpiTargets) expect(employees, t.employee).toContain(t.employee);
        for (const r of seed.hr.reviews) expect(employees, r.employee).toContain(r.employee);
        for (const a of seed.hr.payrollAdjust) expect(employees, a.employee).toContain(a.employee);
        for (const s of seed.hr.attendanceScript) expect(employees, s.employee).toContain(s.employee);
        for (const p of seed.hr.postings) {
          expect(biz.departments.map((d) => d.code), p.title).toContain(p.departmentCode);
          expect(biz.positions.map((x) => x.code), p.title).toContain(p.positionCode);
          expect(p.salaryMax).toBeGreaterThanOrEqual(p.salaryMin);
        }
      });

      it('rekrutmen: judul unik, email pelamar unik, ada semua tahap pipeline, ada yang di-hire dan tidak melebihi kuota', () => {
        const titles = seed.hr.postings.map((p) => p.title);
        expect(new Set(titles).size).toBe(titles.length);
        const emails = seed.hr.postings.flatMap((p) => p.applicants.map((a) => a.email.toLowerCase()));
        expect(new Set(emails).size).toBe(emails.length);
        const paths = new Set(seed.hr.postings.flatMap((p) => p.applicants.map((a) => a.path)));
        for (const stage of ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const) expect(paths, stage).toContain(stage);
        for (const p of seed.hr.postings) {
          const hired = p.applicants.filter((a) => a.path === 'hired');
          expect(hired.length, p.title).toBeLessThanOrEqual(p.openings);
          for (const a of p.applicants) {
            expect(Boolean(a.hire), a.name).toBe(a.path === 'hired');
            if (a.path === 'rejected') expect(a.rejectedAfter && a.rejectReason, a.name).toBeTruthy();
            expect(a.appliedAgo).toBeLessThanOrEqual(p.openedAgo);
          }
          if (hired.length > 0) for (const a of hired) expect(a.hire!.hireAgo).toBeLessThan(a.appliedAgo);
        }
        expect(seed.hr.postings.some((p) => p.closeManually || p.applicants.some((a) => a.path === 'hired'))).toBe(true);
        expect(seed.hr.postings.some((p) => !p.closeManually && !p.applicants.some((a) => a.path === 'hired'))).toBe(true);
      });

      it('cuti: ada pending, disetujui, dan ditolak; tidak bertumpuk; saldo tahunan cukup', () => {
        const decisions = new Set(seed.hr.leaves.map((l) => l.decision));
        for (const d of ['pending', 'approved', 'rejected'] as const) expect(decisions, d).toContain(d);
        for (const no of employees) {
          const own = seed.hr.leaves.filter((l) => l.employee === no);
          const windows = own.filter((l) => l.decision !== 'rejected').map((l) => resolveLeaveWindow(isoOf(l.startAgo), l.spanDays));
          for (let i = 0; i < windows.length; i++) {
            for (let j = i + 1; j < windows.length; j++) {
              const overlap = windows[i].start <= windows[j].end && windows[j].start <= windows[i].end;
              expect(overlap, `${no}: cuti bertumpuk`).toBe(false);
            }
          }
          const used = windows.reduce((s, w) => s + countWorkingDays(new Date(w.start), new Date(w.end)), 0);
          expect(used, `${no}: saldo cuti`).toBeLessThanOrEqual(ANNUAL_LEAVE_QUOTA);
        }
        for (const l of seed.hr.leaves) if (l.decision !== 'pending') expect(l.decidedBy, l.reason).toBeTruthy();
      });

      it('KPI: target merujuk definisi, unik per karyawan, bobot positif, penilaian hanya untuk yang bertarget', () => {
        const codes = new Set(seed.hr.kpis.map((k) => k.code));
        expect(codes.size).toBe(seed.hr.kpis.length);
        const seen = new Set<string>();
        for (const t of seed.hr.kpiTargets) {
          expect(codes, t.kpi).toContain(t.kpi);
          expect(t.weight).toBeGreaterThan(0);
          expect(t.target).toBeGreaterThan(0);
          const key = `${t.employee}|${t.kpi}`;
          expect(seen.has(key), key).toBe(false);
          seen.add(key);
        }
        for (const r of seed.hr.reviews) expect(seed.hr.kpiTargets.some((t) => t.employee === r.employee), r.employee).toBe(true);
        const submittedNow = seed.hr.reviews.filter((r) => r.submitCurrent).length;
        expect(submittedNow).toBeGreaterThanOrEqual(2); // papan peringkat bulan berjalan tidak kosong
        expect(submittedNow).toBeLessThan(seed.hr.reviews.length); // dan ada yang masih draf
      });

      it('proyek: kode unik, pelanggan dan manajer ada, milestone dan dependensi sah, ada beragam status', () => {
        const codes = seed.projects.map((p) => p.code);
        expect(new Set(codes).size).toBe(codes.length);
        const statuses = new Set(seed.projects.map((p) => p.status));
        for (const s of ['planning', 'active', 'on_hold', 'completed'] as const) expect(statuses, s).toContain(s);
        for (const p of seed.projects) checkProject(p, employees, new Set(biz.customers.map((c) => c.name)));
        expect(seed.projects.some((p) => p.bill)).toBe(true);
        const states = new Set(seed.projects.flatMap((p) => p.milestones.map((m) => m.state)));
        for (const s of ['done', 'progress', 'todo'] as const) expect(states, s).toContain(s);
        // minimal satu milestone terlambat (lewat tenggat, belum selesai)
        expect(seed.projects.some((p) => p.milestones.some((m) => m.state !== 'done' && m.dueAgo > 0))).toBe(true);
      });

      it('timesheet: tidak ada karyawan ganda pada tanggal yang sama lintas proyek; alokasi tidak melebihi 100%', () => {
        const used = new Map<string, string>();
        for (const p of seed.projects) {
          for (const plan of p.timesheets) {
            for (const r of expandTimesheetPlan(plan, isoOf)) {
              const key = `${r.employee}|${r.date}`;
              expect(used.has(key) && used.get(key) !== p.code, `${key} bentrok ${used.get(key)} vs ${p.code}`).toBe(false);
              used.set(key, p.code);
            }
          }
        }
        for (const no of employees) {
          const allocs = seed.projects.flatMap((p) => p.allocations.filter((a) => a.employee === no).map((a) => ({ ...a, code: p.code, completed: p.status === 'completed' })));
          // alokasi proyek selesai dilepas setelah dibuat, jadi hanya bertumpuk sesaat saat pembuatan: periksa semuanya.
          for (const a of allocs) {
            const overlapping = allocs.filter((b) => b.startAgo >= (a.endAgo ?? -9999) && (b.endAgo ?? -9999) <= a.startAgo);
            const total = overlapping.reduce((s, b) => s + b.pct, 0);
            expect(total, `${no} di ${a.code}`).toBeLessThanOrEqual(100);
          }
        }
      });

      it('penagihan: proyek yang ditagih punya pelanggan dan timesheet billable yang disetujui', () => {
        for (const p of seed.projects.filter((x) => x.bill)) {
          expect(p.customer, p.code).toBeTruthy();
          const rows = p.timesheets.filter((t) => t.billable).flatMap((t) => expandTimesheetPlan(t, isoOf));
          expect(rows.filter((r) => stageOf(r.ago, p) === 'approved').length, p.code).toBeGreaterThan(0);
        }
        for (const p of seed.projects) if (!p.customer) for (const t of p.timesheets) expect(t.billable, `${p.code} tanpa pelanggan`).toBe(false);
      });

      it('armada: kendaraan, BBM, rencana, work order, dan pengiriman saling konsisten', () => {
        const f = seed.fleet;
        const plates = f.vehicles.map((v) => v.plateNumber);
        expect(new Set(plates).size).toBe(plates.length);
        for (const v of f.vehicles) {
          const byAgoDesc = [...v.fuel].sort((a, b) => b.ago - a.ago);
          for (let i = 1; i < byAgoDesc.length; i++) expect(byAgoDesc[i].odometerKm, `${v.plateNumber} odometer`).toBeGreaterThan(byAgoDesc[i - 1].odometerKm);
          expect(byAgoDesc[byAgoDesc.length - 1].odometerKm).toBeLessThanOrEqual(v.odometerKm);
        }
        const planDescs = f.plans.map((p) => p.description);
        expect(new Set(planDescs).size).toBe(planDescs.length);
        for (const p of f.plans) if (p.isVehicle) expect(plates, p.asset).toContain(p.asset);
        expect(f.plans.some((p) => p.dueAgo > 0)).toBe(true); // ada perawatan jatuh tempo
        const titles = f.workOrders.map((w) => w.title);
        expect(new Set(titles).size).toBe(titles.length);
        for (const w of f.workOrders) {
          expect(employees, w.title).toContain(w.assignee);
          if (w.vehicle) expect(plates, w.title).toContain(w.vehicle);
          if (w.plan) expect(planDescs, w.title).toContain(w.plan);
          if (w.state === 'completed' || w.state === 'closed') {
            expect(w.doneAgo, w.title).toBeDefined();
            expect((w.laborCost ?? 0) + (w.partsCost ?? 0), w.title).toBeGreaterThan(0);
          }
          if (w.state !== 'open') expect(w.startedAgo, w.title).toBeDefined();
        }
        const woStates = new Set(f.workOrders.map((w) => w.state));
        for (const s of ['open', 'in_progress', 'completed', 'closed'] as const) expect(woStates, s).toContain(s);

        const keys = f.shipments.map((s) => s.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const s of f.shipments) {
          expect(s.outletIndex).toBeLessThan(biz.outlets.length);
          if (s.vehicle) expect(plates, s.key).toContain(s.vehicle);
          for (const i of s.items) expect(skus, `${s.key} ${i.sku}`).toContain(i.sku);
          if (s.cancel) expect(s.events, `${s.key}: pengiriman batal tidak punya event`).toHaveLength(0);
          if (s.carrier) expect(s.vehicle, `${s.key}: kurir pihak ketiga tidak memakai kendaraan sendiri`).toBeUndefined();
          for (const [i, e] of s.events.entries()) {
            expect(e.ago, `${s.key} tidak boleh di masa depan`).toBeGreaterThanOrEqual(0);
            if (i > 0) {
              const prev = s.events[i - 1];
              const t = (x: typeof e) => -x.ago * 1440 + x.hour * 60 + x.minute;
              expect(t(e), `${s.key} urutan`).toBeGreaterThan(t(prev));
            }
            if (e.status === 'delivered') expect(i, `${s.key}: delivered harus terakhir`).toBe(s.events.length - 1);
          }
          if (s.events.length > 0) expect(s.createdAgo).toBeGreaterThanOrEqual(s.events[0].ago);
          if (s.events[s.events.length - 1]?.status === 'delivered' && !s.carrier) expect(s.receiver, s.key).toBeTruthy();
        }
        const kinds = new Set(f.shipments.map((s) => (s.cancel ? 'cancelled' : s.events.length === 0 ? 'pending' : s.events[s.events.length - 1].status === 'delivered' ? 'delivered' : 'in_transit')));
        expect(kinds.size).toBeGreaterThanOrEqual(3);
      });

      it('sensor: kode unik, rujukan gudang/work center valid, ada anomali, suhu hanya untuk rantai dingin', () => {
        const codes = seed.sensors.map((s) => s.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const s of seed.sensors) {
          if (s.warehouseOutletIndex !== undefined) expect(s.warehouseOutletIndex).toBeLessThan(biz.outlets.length);
          if (s.workCenterCode) expect((biz.workCenters ?? []).map((w) => w.code), s.code).toContain(s.workCenterCode);
          // detectAnomaly aplikasi memakai ambang rantai dingin 2-12 C: sensor suhu panas akan selalu memberi peringatan palsu
          if (s.type === 'temperature') expect(s.series.baseline).toBeGreaterThan(2);
          if (s.type === 'temperature') expect(s.series.baseline).toBeLessThan(12);
        }
        expect(seed.sensors.length).toBeGreaterThanOrEqual(4);
        expect(seed.sensors.some((s) => (s.series.anomalies ?? []).length > 0)).toBe(true);
      });
    });
  }
});

function checkProject(p: ProjectSeed, employees: Set<string>, customers: Set<string>) {
  if (p.customer) expect(customers, p.code).toContain(p.customer);
  expect(employees, p.code).toContain(p.manager);
  expect(p.startAgo, p.code).toBeGreaterThan(p.endAgo);
  const names = new Map<string, ProjectSeed['milestones'][number]>();
  for (const m of p.milestones) {
    expect(names.has(m.name), `${p.code}: milestone ganda ${m.name}`).toBe(false);
    expect(m.startAgo, m.name).toBeGreaterThanOrEqual(m.dueAgo);
    for (const d of m.dependsOn ?? []) {
      const dep = names.get(d);
      expect(dep, `${m.name} bergantung pada "${d}" yang harus dideklarasikan lebih dulu`).toBeDefined();
      if (m.state === 'done') expect(dep!.state, `${m.name} selesai tapi prasyarat belum`).toBe('done');
    }
    if (m.state === 'progress') expect(m.progress ?? 0, m.name).toBeGreaterThan(0);
    if (m.state === 'progress') expect(m.progress ?? 0, m.name).toBeLessThan(100);
    if (m.state === 'done') expect(m.doneAgo ?? m.dueAgo, m.name).toBeGreaterThanOrEqual(0);
    names.set(m.name, m);
  }
  if (p.status === 'completed') expect(p.milestones.every((m) => m.state === 'done'), `${p.code}: proyek selesai`).toBe(true);
  const allocated = new Set(p.allocations.map((a) => a.employee));
  for (const a of p.allocations) {
    expect(employees, a.employee).toContain(a.employee);
    expect(a.pct).toBeGreaterThan(0);
    expect(a.pct).toBeLessThanOrEqual(100);
  }
  for (const t of p.timesheets) {
    expect(allocated, `${p.code}: ${t.employee} mencatat jam tanpa alokasi`).toContain(t.employee);
    expect(t.fromAgo).toBeGreaterThanOrEqual(t.toAgo);
    expect(t.toAgo).toBeGreaterThanOrEqual(1); // jam hari ini belum lengkap
  }
}
