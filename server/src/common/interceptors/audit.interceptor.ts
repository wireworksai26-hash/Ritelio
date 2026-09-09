import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma.service';

const METHOD_ACTION: Record<string, string> = {
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
};

// Audit trail sederhana: setiap mutasi tercatat ke audit_logs (TRD: audit trail).
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const action = METHOD_ACTION[req.method as string];
    const user = req.user;

    if (!action || !user) return next.handle();

    const entity = (req.baseUrl + (req.route?.path ?? ''))
      .replace(/^\/v1\//, '')
      .split('/')[0] || 'unknown';

    return next.handle().pipe(
      tap({
        next: () => {
          this.prisma.auditLog
            .create({
              data: {
                tenantId: user.tenantId,
                userId: user.sub,
                action,
                entity,
                after: req.body ? JSON.parse(JSON.stringify(req.body)) : undefined,
              },
            })
            .catch(() => undefined); // audit tidak boleh menggagalkan request
        },
      }),
    );
  }
}
