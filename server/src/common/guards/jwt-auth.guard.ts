import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Guard global: verifikasi Bearer JWT + isolasi tenant via header X-Tenant-ID.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token tidak ditemukan. Silakan login.');
    }

    try {
      const payload = await this.jwt.verifyAsync(header.slice(7), {
        secret: process.env.JWT_SECRET,
      });
      if (payload.type === 'refresh') {
        throw new UnauthorizedException('Refresh token tidak bisa dipakai untuk endpoint ini.');
      }
      req.user = payload;

      // Isolasi tenant: header X-Tenant-ID (jika ada) wajib sama dengan tenant di token
      const tenantHeader = req.headers['x-tenant-id'] as string | undefined;
      if (tenantHeader && tenantHeader !== payload.tenantId) {
        throw new ForbiddenException('X-Tenant-ID tidak sesuai dengan akun Anda.');
      }
      req.tenantId = payload.tenantId;
      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new UnauthorizedException('Sesi tidak valid atau kedaluwarsa. Silakan login ulang.');
    }
  }
}
