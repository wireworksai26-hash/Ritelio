import type { Prisma } from '@prisma/client';

type FiscalCalendarClient = Pick<Prisma.TransactionClient, 'fiscalYear' | 'fiscalPeriod'>;

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

/** Ensure a calendar fiscal year and its twelve open periods exist. */
export async function ensureFiscalCalendar(
  db: FiscalCalendarClient,
  tenantId: string,
  companyId: string,
  year: number,
): Promise<void> {
  const fiscalYear = await db.fiscalYear.upsert({
    where: { companyId_name: { companyId, name: String(year) } },
    update: {},
    create: {
      tenantId,
      companyId,
      name: String(year),
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year + 1, 0, 1)),
    },
    select: { id: true },
  });

  await db.fiscalPeriod.createMany({
    data: MONTH_NAMES_ID.map((name, index) => {
      const month = index + 1;
      const monthCode = String(month).padStart(2, '0');
      return {
        tenantId,
        companyId,
        fiscalYearId: fiscalYear.id,
        code: `${year}-${monthCode}`,
        name,
        startDate: new Date(Date.UTC(year, index, 1)),
        endDate: new Date(Date.UTC(year, index + 1, 1)),
      };
    }),
    skipDuplicates: true,
  });
}
