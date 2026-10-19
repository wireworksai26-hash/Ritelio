import { HttpException } from '@nestjs/common';
import type { DemoContext } from '../context';

/** YYYY-MM-DD untuk n hari lalu (negatif = ke depan), tidak sebelum awal tahun berjalan. */
export const dayIso = (ctx: DemoContext, ago: number): string => ctx.isoDay(ctx.daysAgo(ago));

/** Id karyawan dari nomor karyawan (peta konteks hanya berisi karyawan seed usaha; sisanya dicari ke database). */
export async function employeeIdOf(ctx: DemoContext, employeeNo: string): Promise<string> {
  const known = ctx.employeeIds.get(employeeNo);
  if (known) return known;
  const row = await ctx.prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, employeeNo }, select: { id: true } });
  if (!row) throw new Error(`Karyawan ${employeeNo} tidak ditemukan di ${ctx.biz.businessName}.`);
  ctx.employeeIds.set(employeeNo, row.id);
  return row.id;
}

/** "YYYY-MM" untuk bulan berjalan dikurangi `back` bulan. */
export function monthKey(ctx: DemoContext, back: number): string {
  const today = ctx.daysAgo(0);
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Akhir bulan (17.00 WIB) untuk periode "YYYY-MM". */
export function monthEnd(period: string): Date {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 10, 0, 0));
}

/**
 * Memindahkan tanggal sebuah jurnal yang sudah terbit ke tanggal sebenarnya dari peristiwanya (gaji akhir bulan,
 * penutupan work order). Service jurnal selalu memakai "hari ini" dan tidak menerima tanggal dari pemanggil, padahal
 * seed butuh riwayat berbulan-bulan agar grafik bulanan hidup. Yang digeser hanya tanggal, periode fiskal, dan nomor
 * jurnal (diambil dari urutan bulan tujuan lewat penghitung yang sama dengan JournalService, supaya tidak bentrok);
 * baris jurnal, nominal, dan keseimbangannya tidak disentuh.
 */
export async function redateJournal(ctx: DemoContext, journalId: string, when: Date): Promise<boolean> {
  const { tenantId, companyId } = ctx;
  const period = await ctx.prisma.fiscalPeriod.findFirst({
    where: { tenantId, companyId, startDate: { lte: when }, endDate: { gt: when } },
    select: { id: true },
  });
  if (!period) {
    ctx.log(`periode fiskal untuk ${ctx.isoDay(when)} tidak ada, tanggal jurnal dibiarkan`);
    return false;
  }
  const periodKey = `${when.getUTCFullYear()}${String(when.getUTCMonth() + 1).padStart(2, '0')}`;
  await ctx.prisma.$transaction(async (tx) => {
    const current = await tx.journalHeader.findUniqueOrThrow({ where: { id: journalId }, select: { number: true } });
    const data: { entryDate: Date; periodId: string; postedAt: Date; number?: string } = { entryDate: when, periodId: period.id, postedAt: when };
    if (!current.number.startsWith(`JRN-${periodKey}-`)) {
      await tx.journalSequence.createMany({ data: [{ tenantId, companyId, periodKey, lastNumber: 0 }], skipDuplicates: true });
      const seq = await tx.journalSequence.update({
        where: { tenantId_companyId_periodKey: { tenantId, companyId, periodKey } },
        data: { lastNumber: { increment: 1 } },
        select: { lastNumber: true },
      });
      data.number = `JRN-${periodKey}-${String(seq.lastNumber).padStart(6, '0')}`;
    }
    await tx.journalHeader.update({ where: { id: journalId }, data });
  });
  return true;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Menjalankan satu langkah yang bisa ditolak aturan bisnis (cuti bertumpuk, alokasi lewat 100%). Tanggal yang
 * terjepit awal tahun (dijalankan di Januari-Maret) membuat rentang yang di bulan Oktober terpisah menjadi bertumpuk;
 * penolakan 4xx dicatat dan dilewati, sedangkan kesalahan lain tetap menggagalkan seed.
 */
export async function tolerate<T>(ctx: DemoContext, what: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() < 500) {
      ctx.log(`${what}: dilewati (${error.message})`);
      return undefined;
    }
    throw error;
  }
}
