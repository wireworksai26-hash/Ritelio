import { FiscalCalendarService } from '../../../modules/finance/fiscal-calendar.service';
import { isDomainDone, type DemoContext } from '../context';
import { monthCode } from './calendar';
import type { FinanceEnv } from './env';

/** Domain lain yang harus sudah selesai sebelum periode lama boleh dikunci. */
const OTHER_DOMAINS = ['supply', 'commercial', 'people-ops'];

/**
 * Menutup periode fiskal LAMA yang sudah berisi jurnal (paling banyak dua, minimal dua bulan sebelum bulan berjalan) lewat
 * FiscalCalendarService.close, yang memeriksa keseimbangan dan jurnal draft.
 *
 * Menutup periode mengunci jurnal baru di dalamnya. Karena tanggal domain lain bisa jatuh di periode lama
 * (tanggal dibatasi ke awal tahun), penutupan hanya dilakukan setelah semua domain lain selesai, atau bila
 * dipaksa lewat SEED_DEMO_CLOSE_PERIODS=yes (mis. saat menguji domain ini sendirian).
 */
export async function closeOldPeriods(env: FinanceEnv): Promise<{ closed: string[]; skippedReason?: string }> {
  const { ctx, today } = env;
  const forced = process.env.SEED_DEMO_CLOSE_PERIODS === 'yes';
  if (!forced) {
    const pending = await unfinishedDomains(ctx);
    if (pending.length > 0) {
      return { closed: [], skippedReason: `domain belum selesai: ${pending.join(', ')}` };
    }
  }

  // Hanya periode yang sudah berusia dua bulan lebih; di Januari-Februari belum ada yang memenuhi.
  if (today.m <= 2) return { closed: [], skippedReason: 'belum ada periode yang cukup lama' };
  // Idempoten: kalau sudah ada dua periode tertutup, jangan menutup lagi tiap kali dijalankan ulang.
  const alreadyClosed = await ctx.prisma.fiscalPeriod.count({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, status: 'closed', code: { startsWith: `${today.y}-` } },
  });
  if (alreadyClosed >= 2) return { closed: [], skippedReason: `${alreadyClosed} periode sudah tertutup` };
  const cutoff = monthCode(today.y, today.m - 2);
  const periods = await ctx.prisma.fiscalPeriod.findMany({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, status: 'open', code: { lte: cutoff, startsWith: `${today.y}-` }, journalHeaders: { some: {} } },
    orderBy: { startDate: 'asc' },
    take: 2 - alreadyClosed,
    select: { id: true, code: true },
  });
  const fiscal = ctx.get(FiscalCalendarService);
  const closed: string[] = [];
  for (const p of periods) {
    await fiscal.close(ctx.tenantId, p.id, ctx.actor('owner'));
    closed.push(p.code);
  }
  return { closed };
}

async function unfinishedDomains(ctx: DemoContext): Promise<string[]> {
  const out: string[] = [];
  for (const key of OTHER_DOMAINS) if (!(await isDomainDone(ctx, key))) out.push(key);
  return out;
}
