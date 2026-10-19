/**
 * Perencana absensi yang murni (tanpa database): menentukan, untuk satu karyawan dan daftar hari kerja,
 * jenis hari (normal, terlambat, lembur, setengah hari, alpa, sakit, cuti) beserta jam masuk/pulang WIB.
 * Hasilnya deterministik (hash nomor karyawan + tanggal) sehingga bisa diuji dan konsisten antar jalankan.
 */

export type AttendanceKind = 'normal' | 'late' | 'overtime' | 'half_day' | 'absent' | 'sick' | 'leave';

export interface PlannedDay {
  /** YYYY-MM-DD (tanggal kalender WIB) */
  date: string;
  kind: AttendanceKind;
  /** menit sejak 00:00 WIB; kosong untuk alpa/sakit/cuti */
  checkInMin?: number;
  checkOutMin?: number;
  note?: string;
}

export interface ScriptedDay {
  /** 0 = hari kerja terakhir, 1 = sebelumnya, dst. */
  idx: number;
  kind: Exclude<AttendanceKind, 'leave'>;
}

export interface PlanOptions {
  script?: ScriptedDay[];
  /** Hari yang tercakup cuti disetujui (YYYY-MM-DD). */
  leaveDays?: ReadonlySet<string>;
}

/** Hash string 32-bit (FNV-1a) lalu dipetakan ke [0,1). */
export function unitHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // pengacakan akhir supaya karakter terakhir ikut memengaruhi seluruh bit
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function isWeekday(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * `count` hari kerja (Senin-Jumat) terakhir SEBELUM `todayIso`, urut menaik. Berhenti di `notBeforeIso`
 * (awal tahun berjalan) sehingga tidak pernah keluar dari kalender fiskal.
 */
export function workdaysBefore(todayIso: string, count: number, notBeforeIso: string): string[] {
  const out: string[] = [];
  let cursor = addDaysIso(todayIso, -1);
  while (out.length < count && cursor >= notBeforeIso) {
    if (isWeekday(cursor)) out.push(cursor);
    cursor = addDaysIso(cursor, -1);
  }
  return out.reverse();
}

/** Mulai di hari kerja pada/ sesudah `startIso`; akhir di hari kerja pada/ sebelum rentang `spanDays` kalender. */
export function resolveLeaveWindow(startIso: string, spanDays: number): { start: string; end: string } {
  let start = startIso;
  while (!isWeekday(start)) start = addDaysIso(start, 1);
  let end = addDaysIso(start, Math.max(spanDays, 1) - 1);
  while (!isWeekday(end) && end > start) end = addDaysIso(end, -1);
  return { start, end };
}

export function weekdaysInRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  for (let d = startIso; d <= endIso; d = addDaysIso(d, 1)) if (isWeekday(d)) out.push(d);
  return out;
}

const spread = (r: number, lo: number, hi: number) => Math.round(lo + r * (hi - lo));

function timesFor(kind: AttendanceKind, seed: string): Pick<PlannedDay, 'checkInMin' | 'checkOutMin' | 'note'> {
  const a = unitHash(`${seed}|in`);
  const b = unitHash(`${seed}|out`);
  switch (kind) {
    case 'normal': {
      const inMin = spread(a, 7 * 60 + 40, 8 * 60 + 12); // 07:40-08:12, di dalam masa tenggang 15 menit
      return { checkInMin: inMin, checkOutMin: inMin + 8 * 60 + spread(b, 0, 25) };
    }
    case 'late': {
      const inMin = spread(a, 8 * 60 + 22, 9 * 60 + 25); // terlambat 7-70 menit lewat tenggang
      return { checkInMin: inMin, checkOutMin: inMin + 8 * 60 + spread(b, 0, 30), note: 'Terlambat: macet di jalan' };
    }
    case 'overtime': {
      const inMin = spread(a, 7 * 60 + 50, 8 * 60 + 8);
      // pulang 17:30-19:45: lembur 1,5 sampai 3,75 jam
      return { checkInMin: inMin, checkOutMin: spread(b, 17 * 60 + 30, 19 * 60 + 45), note: 'Lembur menyelesaikan pesanan' };
    }
    case 'half_day': {
      const inMin = spread(a, 7 * 60 + 50, 8 * 60 + 10);
      return { checkInMin: inMin, checkOutMin: inMin + 4 * 60 + spread(b, 0, 40), note: 'Izin setengah hari (keperluan keluarga)' };
    }
    case 'sick':
      return { note: 'Sakit (surat dokter menyusul)' };
    case 'absent':
      return { note: 'Tanpa keterangan' };
    case 'leave':
      return { note: 'Cuti tahunan disetujui' };
  }
}

export function planAttendance(employeeNo: string, days: string[], opts: PlanOptions = {}): PlannedDay[] {
  const scripted = new Map<number, ScriptedDay['kind']>((opts.script ?? []).map((s) => [s.idx, s.kind]));
  return days.map((date, i) => {
    const idx = days.length - 1 - i;
    let kind: AttendanceKind;
    if (opts.leaveDays?.has(date)) {
      kind = 'leave';
    } else if (scripted.has(idx)) {
      kind = scripted.get(idx)!;
    } else {
      const r = unitHash(`${employeeNo}|${date}`);
      kind = r < 0.015 ? 'absent' : r < 0.03 ? 'sick' : r < 0.05 ? 'half_day' : r < 0.15 ? 'late' : r < 0.32 ? 'overtime' : 'normal';
    }
    return { date, kind, ...timesFor(kind, `${employeeNo}|${date}`) };
  });
}

/** Menit WIB pada tanggal tertentu menjadi instan UTC. */
export function wibInstant(iso: string, minutes: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + (minutes - 7 * 60) * 60_000);
}
