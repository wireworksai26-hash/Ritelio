import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { Permission } from '../rbac/permissions';
import {
  READ_ONLY_CODE,
  SUSPENDED_CODE,
  accessFor,
  accessMessage,
  isReadOnlyExempt,
  isWriteMethod,
  tenantStatusOf,
} from '../subscription/access-state';

// Guard global RBAC: membaca @RequirePermissions('...') lalu cek role + override per-user.
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return true; // route publik — tidak ada izin yang dicek

    // Cek akun aktif untuk SEMUA route terproteksi, termasuk yang tidak memakai
    // @RequirePermissions. Kalau dicek setelah return awal, akun yang dinonaktifkan
    // masih bisa menekan endpoint tanpa anotasi izin.
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.sub, tenantId: user.tenantId },
      select: {
        permissions: true,
        isActive: true,
        role: true,
        tokensValidAfter: true,
        databaseRole: {
          select: {
            permissions: { select: { permissionKey: true, effect: true } },
          },
        },
        // Status tenant dan langganan terbaru untuk keadaan akses (baca saja / ditangguhkan), satu kueri.
        tenant: {
          select: {
            settings: true,
            subscriptions: { orderBy: { startedAt: 'desc' }, take: 1, select: { status: true, endsAt: true } },
          },
        },
      },
    });
    if (!dbUser || !dbUser.isActive) {
      throw new ForbiddenException('Akun Anda dinonaktifkan. Hubungi owner.');
    }

    // Access token yang terbit sebelum logout-all / pencabutan sesi ditolak segera,
    // tanpa menunggu kedaluwarsa. iat dalam detik, jadi bandingkan pada granularitas detik.
    if (
      dbUser.tokensValidAfter &&
      typeof user.iat === 'number' &&
      user.iat < Math.floor(dbUser.tokensValidAfter.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Sesi dicabut. Silakan login ulang.');
    }
    // Role di JWT bisa basi sampai 15 menit setelah diubah; pakai role dari DB
    // supaya pemeriksaan di service (canAssignRole, dsb.) selalu memakai role terkini.
    user.role = dbUser.role;

    // Keadaan akun: ditangguhkan = tolak semua; trial/langganan berakhir = baca saja. Superadmin platform
    // tidak pernah dikunci. Dicek sebelum izin peran dan berlaku juga di rute tanpa @RequirePermissions.
    if (dbUser.role !== 'superadmin') {
      const access = accessFor({
        tenantStatus: tenantStatusOf(dbUser.tenant?.settings),
        subscription: dbUser.tenant?.subscriptions[0] ?? null,
      });
      if (access.mode === 'suspended') {
        throw new ForbiddenException({ message: accessMessage(access), code: SUSPENDED_CODE });
      }
      if (access.mode === 'read_only' && isWriteMethod(req.method) && !isReadOnlyExempt(req.originalUrl ?? req.url ?? '')) {
        throw new ForbiddenException({ message: accessMessage(access), code: READ_ONLY_CODE });
      }
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    // Ambil override granular user dari DB (kolom permissions JSONB)
    const overrides = (dbUser.permissions ?? {}) as Record<string, boolean>;
    const roleRules = new Map(
      dbUser.databaseRole.permissions.map((rule) => [rule.permissionKey, rule.effect]),
    );

    const allowed = required.every((permission) => {
      const override = overrides[permission];
      if (override === false) return false;
      if (override === true) return true;
      return roleRules.get(permission) === 'allow';
    });
    if (!allowed) {
      this.logger.warn(
        `Akses ditolak: user=${user.sub} tenant=${user.tenantId} role=${user.role} butuh=${required.join(',')}`,
      );
      // Detail tidak dikembalikan ke klien agar model RBAC tidak bisa dipetakan.
      throw new ForbiddenException('Akses ditolak. Hubungi owner untuk izin tambahan.');
    }
    return true;
  }
}
