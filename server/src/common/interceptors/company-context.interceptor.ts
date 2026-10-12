import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { companyContext } from '../context/company-context';
import { PrismaService } from '../prisma.service';

const COMPANY_HEADER = 'x-company-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_TTL_MS = 30_000;

interface CompanyRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: { sub: string; tenantId: string };
}

/**
 * Memilih perusahaan aktif per request lewat header X-Company-Id.
 *
 * - Tanpa header: perilaku lama (perusahaan utama) — klien lama tetap jalan.
 * - Dengan header: wajib perusahaan aktif milik tenant token. Id perusahaan tenant
 *   lain diperlakukan sama seperti tidak ada (403), tidak membocorkan keberadaannya.
 */
@Injectable()
export class CompanyContextInterceptor implements NestInterceptor {
  private readonly verified = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<CompanyRequest>();
    const raw = req.headers[COMPANY_HEADER];
    const companyId = Array.isArray(raw) ? raw[0] : raw;
    const user = req.user;
    if (!companyId || !user) return next.handle();

    if (!UUID.test(companyId)) throw new ForbiddenException('X-Company-Id tidak valid.');

    return from(this.assertBelongs(user.tenantId, companyId)).pipe(
      switchMap(
        () =>
          new Observable<unknown>((subscriber) =>
            companyContext.run({ tenantId: user.tenantId, companyId }, () => {
              next.handle().subscribe(subscriber);
            }),
          ),
      ),
    );
  }

  private async assertBelongs(tenantId: string, companyId: string): Promise<void> {
    const key = `${tenantId}:${companyId}`;
    const expiresAt = this.verified.get(key);
    if (expiresAt && expiresAt > Date.now()) return;

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!company) throw new ForbiddenException('Perusahaan tidak ditemukan atau tidak aktif untuk akun Anda.');
    this.verified.set(key, Date.now() + CACHE_TTL_MS);
  }
}
