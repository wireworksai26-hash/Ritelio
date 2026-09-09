import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { roleHasPermission, type Permission } from '../rbac/permissions';

// Guard global RBAC: membaca @RequirePermissions('...') lalu cek role + override per-user.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return true; // route publik — tidak ada izin yang dicek

    // Ambil override granular user dari DB (kolom permissions JSONB)
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.sub, tenantId: user.tenantId },
      select: { permissions: true, isActive: true },
    });
    if (dbUser && !dbUser.isActive) {
      throw new ForbiddenException('Akun Anda dinonaktifkan. Hubungi owner.');
    }
    const overrides = (dbUser?.permissions ?? {}) as Record<string, boolean>;

    const allowed = required.every((p) => roleHasPermission(user.role, overrides, p));
    if (!allowed) {
      throw new ForbiddenException(
        `Akses ditolak. Role "${user.role}" tidak punya izin: ${required.join(', ')}.`,
      );
    }
    return true;
  }
}
