import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Role recognized by the API. 'superadmin' mirrors Prisma's Role enum (platform). */
export type AppRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'staff' | 'superadmin';

export interface AuthUser {
  sub: string;
  tenantId: string;
  role: AppRole;
  email: string;
}

/** Ambil user terautentikasi dari request: @CurrentUser() user: AuthUser */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
