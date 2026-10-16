import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../decorators/public.decorator';
import { PrismaService } from '../prisma.service';

/**
 * Pemeriksaan hidup untuk Railway (healthcheck) dan diagnosis cepat: GET /v1/health.
 * Publik dan tidak ikut throttle. Sengaja tidak membuka versi, env, atau detail error database.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    return { status: 'ok', database: 'up' };
  }
}
