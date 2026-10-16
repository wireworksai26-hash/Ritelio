/**
 * Aturan waktu kerja & cuti (murni, tanpa DB) supaya bisa diuji.
 *
 * Retalio melayani usaha Indonesia: jam kerja dinilai pada zona WIB (UTC+7).
 * Menghitung keterlambatan dari jam UTC membuat absen 09:00 WIB (02:00 UTC)
 * tidak pernah tercatat terlambat, dan absen jam 06:00 WIB jatuh ke tanggal kemarin.
 */
export const WORK_UTC_OFFSET_HOURS = 7;
export const WORKDAY_START_MINUTES = 8 * 60;
export const LATE_GRACE_MINUTES = 15;
export const STANDARD_WORK_HOURS = 8;
export const MAX_DAILY_OVERTIME = 4;
/** Hak cuti tahunan standar (UU Ketenagakerjaan: 12 hari kerja). */
export const ANNUAL_LEAVE_QUOTA = 12;

const HOUR_MS = 3_600_000;

/** Tanggal kerja (awal hari UTC dari tanggal kalender WIB) untuk satu instan waktu. */
export function businessDate(instant: Date): Date {
  const local = new Date(instant.getTime() + WORK_UTC_OFFSET_HOURS * HOUR_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** Menit keterlambatan terhadap 08:00 WIB + masa tenggang. */
export function lateMinutesAt(instant: Date): number {
  const local = new Date(instant.getTime() + WORK_UTC_OFFSET_HOURS * HOUR_MS);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return Math.max(minutes - (WORKDAY_START_MINUTES + LATE_GRACE_MINUTES), 0);
}

/** Jam kerja & lembur (dibatasi MAX_DAILY_OVERTIME) dari selisih masuk-pulang. */
export function workedAndOvertime(checkIn: Date, checkOut: Date): { worked: number; overtime: number } {
  const worked = (checkOut.getTime() - checkIn.getTime()) / HOUR_MS;
  const overtime = Math.min(Math.max(worked - STANDARD_WORK_HOURS, 0), MAX_DAILY_OVERTIME);
  return { worked, overtime };
}

/** Jumlah hari kerja (Senin-Jumat) pada rentang tanggal inklusif; akhir pekan tidak memotong jatah cuti. */
export function countWorkingDays(start: Date, end: Date): number {
  let days = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cursor.getTime() <= last) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Hari kerja yang jatuh DALAM tahun tertentu (cuti lintas tahun dipotong per tahun). */
export function workingDaysInYear(start: Date, end: Date, year: number): number {
  const yStart = new Date(Date.UTC(year, 0, 1));
  const yEnd = new Date(Date.UTC(year, 11, 31));
  const s = start > yStart ? start : yStart;
  const e = end < yEnd ? end : yEnd;
  if (s > e) return 0;
  return countWorkingDays(s, e);
}

/** Pegawai baru di tengah bulan: gaji proporsional hari kalender sejak tanggal masuk. */
export function prorateFactorFor(hireDate: Date, periodStart: Date): number {
  const daysInMonth = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (hireDate <= periodStart) return 1;
  const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0));
  if (hireDate > periodEnd) return 0;
  return (daysInMonth - hireDate.getUTCDate() + 1) / daysInMonth;
}
