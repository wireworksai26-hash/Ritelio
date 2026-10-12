import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { PrismaService } from '../prisma.service';
import { redactSecrets } from '../utils/redact';

const METHOD_ACTION: Record<string, string> = {
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
};

/** Kolom berat yang tidak pernah ditulis ke audit_logs. */
const HEAVY_FIELDS = new Set(['passwordHash', 'password', 'token', 'refreshToken', 'body']);

interface AuditRequest {
  method: string;
  baseUrl: string;
  route?: { path?: string };
  params?: Record<string, string>;
  body?: unknown;
  user?: { sub: string; tenantId: string };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Audit trail: setiap mutasi HTTP tercatat lengkap dengan before/after,
 * outcome, IP, dan user agent. Peristiwa non-HTTP (login/register/refresh/2FA)
 * dicatat langsung oleh AuthService karena route-nya @Public() dan tidak punya
 * req.user pada saat request berjalan.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuditRequest>();
    const action = METHOD_ACTION[req.method];
    const user = req.user;
    if (!action || !user) return next.handle();

    const route = routePath(req);
    const entityId = paramId(req);

    // before-image hanya mungkin untuk mutasi atas baris yang sudah ada.
    const before$ =
      req.method !== 'POST' && entityId
        ? from(this.captureBefore(user.tenantId, route, entityId))
        : of(undefined);

    return before$.pipe(
      switchMap((before) =>
        next
          .handle()
          .pipe(
            tap({
              next: (result) =>
                this.write(req, user.tenantId, user.sub, route, entityId, action, 'success', result, before),
              error: (error) =>
                this.write(req, user.tenantId, user.sub, route, entityId, action, 'failure', null, before, error),
            }),
          ),
      ),
    );
  }

  /**
   * Baca baris asal sebelum handler mengubahnya, supaya audit menyimpan diff
   * dan bukan hanya request. Kegagalan apa pun diabaikan: audit tidak boleh
   * menggagalkan atau memperlambat request.
   */
  private async captureBefore(
    tenantId: string,
    route: string,
    entityId: string,
  ): Promise<Prisma.InputJsonValue | undefined> {
    try {
      const delegate = delegateFor(this.prisma, route);
      if (!delegate) return undefined;
      const row = await delegate.findFirst({ where: { tenantId, id: entityId } });
      if (!row) return undefined;
      return redactSecrets(stripHeavy(row)) as Prisma.InputJsonValue;
    } catch {
      return undefined;
    }
  }

  private write(
    req: AuditRequest,
    tenantId: string,
    userId: string,
    route: string,
    entityId: string | null,
    action: string,
    outcome: 'success' | 'failure',
    result: unknown,
    before?: Prisma.InputJsonValue,
    error?: unknown,
  ): void {
    try {
      const after = this.serialize(redactSecrets(stripHeavy(req.body)));
      const createdId =
        outcome === 'success' && result && typeof result === 'object' && 'id' in result
          ? String((result as { id: unknown }).id).slice(0, 64)
          : null;

      this.prisma.auditLog
        .create({
          data: {
            tenantId,
            userId,
            action,
            entity: route,
            entityId: entityId ?? createdId,
            outcome,
            reason: error ? shortError(error) : null,
            ipAddress: clientIp(req),
            userAgent: headerValue(req, 'user-agent') ?? null,
            before: before ?? undefined,
            after: after ?? undefined,
          },
        })
        .catch(() => undefined);
    } catch {
      // gagal serialisasi -> audit dilewati, request tetap sukses.
    }
  }

  private serialize(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      return undefined;
    }
  }
}

/**
 * `entity` disimpan sebagai path route penuh (`crm/sales-orders/:id/fulfil`),
 * bukan hanya segmen pertama, supaya dua aksi berbeda pada modul yang sama
 * tidak tercampur jadi satu entitas.
 */
function routePath(req: AuditRequest): string {
  return (req.baseUrl + (req.route?.path ?? '')).replace(/^\/v1\//, '') || 'unknown';
}

function paramId(req: AuditRequest): string | null {
  const params = req.params;
  if (!params) return null;
  if (typeof params.id === 'string' && params.id) return params.id;
  for (const value of Object.values(params)) {
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

function headerValue(req: AuditRequest, name: string): string | null {
  const raw = req.headers?.[name];
  return Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
}

function clientIp(req: AuditRequest): string | null {
  const forwarded = headerValue(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip ?? null;
}

function stripHeavy(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => stripHeavy(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (HEAVY_FIELDS.has(key)) continue;
    out[key] = stripHeavy(val, depth + 1);
  }
  return out;
}

function shortError(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return message.slice(0, 300);
}

/**
 * Ambil delegate Prisma dari segmen kedua route (`crm/sales-orders/:id` ->
 * `salesOrder`). Delegat hanya dipakai kalau nama itu benar-benar model di
 * skema, jadi tidak ada akses ke tabel di luar yang diasumsikan.
 */
function delegateFor(prisma: PrismaService, route: string): Record<string, Function> | null {
  const segment = route.split('/')[1];
  if (!segment) return null;
  const camel = segment.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  const model = camel.charAt(0).toLowerCase() + camel.slice(1);
  const known = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));
  if (!known.has(model.charAt(0).toUpperCase() + model.slice(1))) return null;
  const delegate = (prisma as unknown as Record<string, unknown>)[model];
  return delegate && typeof delegate === 'object' ? (delegate as Record<string, Function>) : null;
}