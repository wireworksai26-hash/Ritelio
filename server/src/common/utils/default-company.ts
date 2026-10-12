import { NotFoundException } from '@nestjs/common';
import { activeCompanyId } from '../context/company-context';
import type { PrismaService } from '../prisma.service';

/**
 * Perusahaan yang dipakai request ini: pilihan klien (header X-Company-Id, sudah
 * divalidasi CompanyContextInterceptor) bila ada, selain itu perusahaan utama
 * tenant ('MAIN'). Pemanggilan di luar request HTTP (job, seed) tetap memakai MAIN.
 */
export async function defaultCompanyId(prisma: PrismaService, tenantId: string): Promise<string> {
  const selected = activeCompanyId(tenantId);
  if (selected) return selected;
  const company = await prisma.company.findFirst({
    where: { tenantId, code: 'MAIN', isActive: true },
    select: { id: true },
  });
  if (!company) {
    throw new NotFoundException('Perusahaan utama belum disiapkan untuk tenant ini.');
  }
  return company.id;
}
