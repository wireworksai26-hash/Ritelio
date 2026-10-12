import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  buildWorkload,
  evaluateCapacity,
  overlappingAllocations,
  parseAllocationWindow,
  withFreeCapacity,
  type ExistingAllocation,
} from './resource-calc';
import { ResourceService } from './resource.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const alloc = (code: string, pct: number, start: string, end: string | null, id = code): ExistingAllocation => ({
  allocationPct: pct,
  startDate: d(start),
  endDate: end ? d(end) : null,
  project: { id, code },
});

describe('parseAllocationWindow', () => {
  const ok = { allocationPct: 50, startDate: '2026-01-01' };

  it('menerima batas 1% dan 100%', () => {
    expect(parseAllocationWindow({ ...ok, allocationPct: 1 }).start).toEqual(d('2026-01-01'));
    expect(parseAllocationWindow({ ...ok, allocationPct: 100 }).end).toBeNull();
  });

  it.each([0, 101, -5, 50.5, Number.NaN])('menolak persen %s', (pct) => {
    expect(() => parseAllocationWindow({ ...ok, allocationPct: pct })).toThrow(BadRequestException);
  });

  it('menolak tanggal tidak valid dan selesai sebelum mulai', () => {
    expect(() => parseAllocationWindow({ ...ok, startDate: 'bukan-tanggal' })).toThrow(/mulai tidak valid/);
    expect(() => parseAllocationWindow({ ...ok, endDate: 'xx' })).toThrow(/selesai tidak valid/);
    expect(() => parseAllocationWindow({ ...ok, endDate: '2025-12-31' })).toThrow(/sebelum tanggal mulai/);
  });

  it('mengizinkan mulai = selesai (alokasi satu hari)', () => {
    expect(parseAllocationWindow({ ...ok, endDate: '2026-01-01' }).end).toEqual(d('2026-01-01'));
  });
});

describe('overlappingAllocations', () => {
  const existing = [alloc('A', 60, '2026-01-01', '2026-03-31')];

  it('inklusif di kedua ujung: mulai tepat pada hari terakhir alokasi lama tetap bertindih', () => {
    expect(overlappingAllocations(existing, d('2026-03-31'), d('2026-04-30'))).toHaveLength(1);
    expect(overlappingAllocations(existing, d('2026-04-01'), d('2026-04-30'))).toHaveLength(0);
    expect(overlappingAllocations(existing, d('2025-12-01'), d('2026-01-01'))).toHaveLength(1);
    expect(overlappingAllocations(existing, d('2025-12-01'), d('2025-12-31'))).toHaveLength(0);
  });

  it('alokasi tanpa batas akhir bertindih dengan semua periode setelah mulainya', () => {
    const open = [alloc('B', 30, '2026-01-01', null)];
    expect(overlappingAllocations(open, d('2030-01-01'), d('2030-02-01'))).toHaveLength(1);
    expect(overlappingAllocations(open, d('2025-01-01'), d('2025-12-31'))).toHaveLength(0);
  });

  it('periode baru tanpa batas akhir bertindih dengan alokasi lama yang berakhir kapan pun setelah mulainya', () => {
    expect(overlappingAllocations(existing, d('2026-03-01'), null)).toHaveLength(1);
    expect(overlappingAllocations(existing, d('2026-04-01'), null)).toHaveLength(0);
  });

  it('proyek yang sama ikut dihitung (tidak bisa 80% + 80% di proyek yang sama)', () => {
    const same = [alloc('A', 80, '2026-01-01', null, 'p1')];
    const overlapping = overlappingAllocations(same, d('2026-02-01'), null);
    expect(evaluateCapacity(overlapping, 80).overbooked).toBe(true);
  });
});

describe('evaluateCapacity', () => {
  it('tepat 100% masih boleh, 101% tidak', () => {
    const a = [alloc('A', 60, '2026-01-01', null)];
    expect(evaluateCapacity(a, 40)).toMatchObject({ totalPct: 100, overbooked: false });
    expect(evaluateCapacity(a, 41)).toMatchObject({ totalPct: 101, overbooked: true });
  });

  it('tanpa alokasi lama: detail "tidak ada"', () => {
    expect(evaluateCapacity([], 100)).toMatchObject({ overbooked: false, detail: 'tidak ada' });
  });

  it('detail menyebut kode proyek dan persennya', () => {
    const v = evaluateCapacity([alloc('PRJ-1', 70, '2026-01-01', null), alloc('PRJ-2', 20, '2026-01-01', null)], 20);
    expect(v.detail).toBe('PRJ-1 (70%), PRJ-2 (20%)');
    expect(v.overbooked).toBe(true);
  });
});

describe('buildWorkload', () => {
  const row = (employeeId: string, no: string, pct: number, code: string) => ({
    employeeId,
    employee: { employeeNo: no, fullName: `Nama ${no}` },
    project: { code, name: `Proyek ${code}` },
    allocationPct: pct,
    role: 'dev',
  });

  it('menjumlahkan alokasi lintas proyek per orang dan mengurutkan dari yang terpenuh', () => {
    const w = buildWorkload(
      [row('e1', 'E1', 30, 'A'), row('e2', 'E2', 100, 'A'), row('e1', 'E1', 50, 'B')],
      new Map(),
    );
    expect(w.map((x) => [x.employeeNo, x.allocationPct])).toEqual([['E2', 100], ['E1', 80]]);
    expect(w[1].projects).toHaveLength(2);
  });

  it('overloaded hanya bila jam mingguan > 46 DAN alokasi >= 100%', () => {
    const rows = [row('full', 'F', 100, 'A'), row('part', 'P', 50, 'A')];
    // 200 jam / 4,29 minggu = 46,62 jam/minggu
    const hours = new Map([['full', 200], ['part', 200]]);
    const w = Object.fromEntries(buildWorkload(rows, hours).map((x) => [x.employeeId, x]));
    expect(w.full.weeklyHours).toBeCloseTo(46.62, 2);
    expect(w.full.overloaded).toBe(true);
    expect(w.part.overloaded).toBe(false);
  });

  it('tepat 46 jam/minggu bukan overload (batas eksklusif)', () => {
    const w = buildWorkload([row('e', 'E', 100, 'A')], new Map([['e', 46 * 4.29]]));
    expect(w[0].weeklyHours).toBe(46);
    expect(w[0].overloaded).toBe(false);
  });

  it('tanpa timesheet: jam 0 dan tidak overloaded; daftar kosong -> kosong', () => {
    const w = buildWorkload([row('e', 'E', 100, 'A')], new Map());
    expect(w[0]).toMatchObject({ approvedHours30d: 0, weeklyHours: 0, overloaded: false });
    expect(buildWorkload([], new Map())).toEqual([]);
  });

  it('urutan stabil untuk persen yang sama (berdasarkan nomor karyawan)', () => {
    const w = buildWorkload([row('b', 'E2', 50, 'A'), row('a', 'E1', 50, 'A')], new Map());
    expect(w.map((x) => x.employeeNo)).toEqual(['E1', 'E2']);
  });
});

describe('withFreeCapacity', () => {
  it('hanya karyawan dengan sisa > 0; yang penuh atau kelebihan disaring', () => {
    const emps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const out = withFreeCapacity(emps, new Map([['b', 100], ['c', 70], ['d', 120]]));
    expect(out).toEqual([
      { id: 'a', allocatedPct: 0, freePct: 100 },
      { id: 'c', allocatedPct: 70, freePct: 30 },
    ]);
  });
});

describe('ResourceService.allocate (pembuktian guard di jalur layanan)', () => {
  function setup(existing: ExistingAllocation[], opts: { project?: boolean; employee?: boolean } = {}) {
    const created: unknown[] = [];
    const prisma = {
      company: { findFirst: async () => ({ id: 'c1' }) },
      project: { findFirst: async () => (opts.project === false ? null : { id: 'p-new', code: 'NEW' }) },
      employee: { findFirst: async () => (opts.employee === false ? null : { id: 'e1', fullName: 'Budi' }) },
      resourceAllocation: {
        findMany: async () => existing,
        create: async ({ data }: { data: unknown }) => {
          created.push(data);
          return data;
        },
      },
    };
    return { service: new ResourceService(prisma as never), created };
  }
  const dto = { projectId: 'p-new', employeeId: 'e1', allocationPct: 50, startDate: '2026-02-01', endDate: '2026-02-28' };

  it('overbooking ditolak 409 dan TIDAK membuat baris', async () => {
    const { service, created } = setup([alloc('OLD', 60, '2026-01-01', null, 'p-old')]);
    await expect(service.allocate('t1', dto)).rejects.toThrow(ConflictException);
    await expect(service.allocate('t1', dto)).rejects.toThrow(/110%.*OLD \(60%\)/);
    expect(created).toHaveLength(0);
  });

  it('alokasi lama yang sudah berakhir tidak menghalangi', async () => {
    const { service, created } = setup([alloc('OLD', 100, '2025-01-01', '2025-12-31', 'p-old')]);
    await service.allocate('t1', dto);
    expect(created).toHaveLength(1);
  });

  it('proyek atau karyawan tidak ada -> 404', async () => {
    await expect(setup([], { project: false }).service.allocate('t1', dto)).rejects.toThrow(NotFoundException);
    await expect(setup([], { employee: false }).service.allocate('t1', dto)).rejects.toThrow(NotFoundException);
  });

  it('input tidak valid ditolak sebelum menyentuh DB', async () => {
    const { service, created } = setup([]);
    await expect(service.allocate('t1', { ...dto, allocationPct: 150 })).rejects.toThrow(BadRequestException);
    expect(created).toHaveLength(0);
  });
});
