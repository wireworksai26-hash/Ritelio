import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  sub: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'staff';
  email: string;
}

/** Ambil user terautentikasi dari request: @CurrentUser() user: AuthUser */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
