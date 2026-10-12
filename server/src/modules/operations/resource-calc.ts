import { BadRequestException } from '@nestjs/common';
import { roundMoney } from '../../common/utils/money';

/**
 * Logika murni alokasi sumber daya: tanpa Prisma, bisa diuji langsung.
 * ResourceService hanya mengambil data lalu memanggil fungsi-fungsi ini.
 */

export interface ExistingAllocation {
  allocationPct: number;
  startDate: Date;
  endDate: Date | null;
  project: { id: string; code: string };
}

/** Validasi input alokasi; mengembalikan tanggal yang sudah di-parse. */
export function parseAllocationWindow(input: {
  allocationPct: number;
  startDate: string;
  endDate?: string;
}): { start: Date; end: Date | null } {
  const pct = input.allocationPct;
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
    throw new BadRequestException('Alokasi harus bilangan bulat antara 1% dan 100%.');
  }
  const start = new Date(input.startDate);
  if (Number.isNaN(start.getTime())) throw new BadRequestException('Tanggal mulai tidak valid.');
  const end = input.endDate ? new Date(input.endDate) : null;
  if (end && Number.isNaN(end.getTime())) throw new BadRequestException('Tanggal selesai tidak valid.');
  if (end && end < start) {
    throw new BadRequestException('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  }
  return { start, end };
}

/**
 * Alokasi lama yang periodenya bertindih dengan [start, end] (inklusif; end null
 * = tanpa batas). Alokasi pada proyek yang sama ikut dihitung: orang yang sama
 * tidak bisa dialokasikan 80% + 80% pada proyek yang sama.
 */
export function overlappingAllocations(
  existing: ExistingAllocation[],
  start: Date,
  end: Date | null,
): ExistingAllocation[] {
  return existing.filter((a) => {
    const startsBeforeOtherEnds = !a.endDate || start <= a.endDate;
    const endsAfterOtherStarts = !end || end >= a.startDate;
    return startsBeforeOtherEnds && endsAfterOtherStarts;
  });
}

export interface CapacityVerdict {
  totalPct: number;
  overbooked: boolean;
  detail: string;
}

/** Total alokasi setelah menambah `newPct`; overbooked bila lewat 100%. */
export function evaluateCapacity(overlapping: ExistingAllocation[], newPct: number): CapacityVerdict {
  const totalPct = overlapping.reduce((sum, a) => sum + a.allocationPct, 0) + newPct;
  const detail = overlapping.map((a) => `${a.project.code} (${a.allocationPct}%)`).join(', ');
  return { totalPct, overbooked: totalPct > 100, detail: detail || 'tidak ada' };
}

export interface WorkloadAllocation {
  employeeId: string;
  employee: { employeeNo: string; fullName: string };
  project: { code: string; name: string };
  allocationPct: number;
  role: string;
}

export interface WorkloadEntry {
  employeeId: string;
  employeeNo: string;
  fullName: string;
  allocationPct: number;
  projects: Array<{ code: string; name: string; pct: number; role: string }>;
  approvedHours30d: number;
  weeklyHours: number;
  overloaded: boolean;
}

/** Dari 30 hari timesheet disetujui ke jam per minggu: 30 / 7 = 4,29 minggu. */
const WEEKS_IN_30_DAYS = 4.29;
/** 100% alokasi ~ 40 jam/minggu; toleransi 15% sebelum ditandai overload. */
const OVERLOAD_WEEKLY_HOURS = 46;

export function buildWorkload(
  allocations: WorkloadAllocation[],
  hoursByEmployee: Map<string, number>,
): WorkloadEntry[] {
  const byEmployee = new Map<string, WorkloadEntry>();
  for (const a of allocations) {
    const entry = byEmployee.get(a.employeeId) ?? {
      employeeId: a.employeeId,
      employeeNo: a.employee.employeeNo,
      fullName: a.employee.fullName,
      allocationPct: 0,
      projects: [],
      approvedHours30d: 0,
      weeklyHours: 0,
      overloaded: false,
    };
    entry.allocationPct += a.allocationPct;
    entry.projects.push({ code: a.project.code, name: a.project.name, pct: a.allocationPct, role: a.role });
    byEmployee.set(a.employeeId, entry);
  }

  for (const entry of byEmployee.values()) {
    const hours30 = hoursByEmployee.get(entry.employeeId) ?? 0;
    entry.approvedHours30d = roundMoney(hours30);
    entry.weeklyHours = roundMoney(hours30 / WEEKS_IN_30_DAYS);
    entry.overloaded = entry.weeklyHours > OVERLOAD_WEEKLY_HOURS && entry.allocationPct >= 100;
  }

  return [...byEmployee.values()].sort(
    (a, b) => b.allocationPct - a.allocationPct || a.employeeNo.localeCompare(b.employeeNo),
  );
}

/** Karyawan dengan sisa kapasitas (> 0%); yang sudah >= 100% tidak ditampilkan. */
export function withFreeCapacity<T extends { id: string }>(
  employees: T[],
  taken: Map<string, number>,
): Array<T & { allocatedPct: number; freePct: number }> {
  return employees
    .map((e) => {
      const allocatedPct = taken.get(e.id) ?? 0;
      return { ...e, allocatedPct, freePct: 100 - allocatedPct };
    })
    .filter((e) => e.freePct > 0);
}
