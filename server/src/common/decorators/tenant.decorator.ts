import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Ambil tenantId efektif (sudah divalidasi thd header X-Tenant-ID oleh JwtAuthGuard). */
export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.tenantId ?? req.user?.tenantId;
});
