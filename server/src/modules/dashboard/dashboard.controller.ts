import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  // Ringkasan eksekutif: P&L, posisi kas, tren, produk terlaris, stok menipis
  @Get('summary')
  @RequirePermissions('finance:read')
  summary(@Tenant() tenantId: string, @Query('days') days?: string, @Query('currency') currency?: string) {
    const parsed = Number(days ?? 30);
    return this.dashboard.snapshot(tenantId, Number.isFinite(parsed) && parsed > 0 ? parsed : 30, currency);
  }
}