import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import {
  CashflowQueryDto,
  CreateEntryDto,
  EntriesQueryDto,
  ExportQueryDto,
  ProfitLossQueryDto,
  ResolveAnomalyDto,
} from './dto/finance.dto';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // Laporan laba rugi ringkas N hari terakhir
  @Get('profit-loss')
  @RequirePermissions('finance:read')
  profitLoss(@Tenant() tenantId: string, @Query() query: ProfitLossQueryDto) {
    return this.finance.profitLoss(tenantId, query.days ?? 30);
  }

  // Arus kas aktual + prakiraan sederhana
  @Get('cashflow')
  @RequirePermissions('finance:read')
  cashflow(@Tenant() tenantId: string, @Query() query: CashflowQueryDto) {
    return this.finance.cashflow(tenantId, query.days ?? 14, query.forecast ?? 30);
  }

  // Daftar jurnal (bisa difilter hanya anomali)
  @Get('entries')
  @RequirePermissions('finance:read')
  entries(@Tenant() tenantId: string, @Query() query: EntriesQueryDto) {
    return this.finance.entries(tenantId, query);
  }

  // Jurnal manual oleh pemilik usaha
  @Post('entries')
  @RequirePermissions('finance:write')
  createEntry(@Tenant() tenantId: string, @Body() dto: CreateEntryDto) {
    return this.finance.createEntry(tenantId, dto);
  }

  // Resolusi flag anomali: tidak valid (cabut flag) atau eskalasi
  @Post('entries/:id/resolve-anomaly')
  @RequirePermissions('finance:write')
  resolveAnomaly(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ResolveAnomalyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.finance.resolveAnomaly(tenantId, id, dto, user);
  }

  // Daftar bagan akun (COA) tenant
  @Get('accounts')
  @RequirePermissions('finance:read')
  accounts(@Tenant() tenantId: string) {
    return this.finance.accounts(tenantId);
  }

  // Ekspor jurnal ke CSV (PDF/Excel menyusul)
  @Get('export')
  @RequirePermissions('finance:read')
  async export(
    @Tenant() tenantId: string,
    @Query() query: ExportQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.finance.exportCsv(tenantId, query.format ?? 'csv', query.days ?? 30);
    const tgl = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-keuangan-${tgl}.csv"`);
    res.send(csv);
  }
}
