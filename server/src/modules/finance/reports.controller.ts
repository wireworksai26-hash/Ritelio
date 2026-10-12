import { Controller, Get, Param, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { ConsolidationQueryDto, ReportQueryDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@Controller('finance/reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
  ) {}

  // Neraca Saldo: total debit harus sama dengan total kredit
  @Get('trial-balance')
  @RequirePermissions('finance:read')
  trialBalance(@Tenant() tenantId: string, @Query() query: ReportQueryDto) {
    return this.reports.trialBalance(tenantId, query);
  }

  // Neraca: aset = kewajiban + ekuitas
  @Get('balance-sheet')
  @RequirePermissions('finance:read')
  balanceSheet(@Tenant() tenantId: string, @Query() query: ReportQueryDto) {
    return this.reports.balanceSheet(tenantId, query);
  }

  // Buku Besar satu akun dengan saldo berjalan
  @Get('general-ledger/:accountId')
  @RequirePermissions('finance:read')
  generalLedger(
    @Tenant() tenantId: string,
    @Param('accountId') accountId: string,
    @Query() query: ReportQueryDto,
  ) {
    return this.reports.generalLedger(tenantId, accountId, query);
  }

  /** Konsolidasi seluruh anak perusahaan dalam satu reporting currency. */
  @Get('consolidation')
  @RequirePermissions('finance:read')
  consolidate(@Tenant() tenantId: string, @Query() query: ConsolidationQueryDto) {
    return this.reports.consolidate(tenantId, query);
  }

  /** Kurs yang dipakai laporan, beserta pasangannya yang belum tersedia. */
  @Get('fx-rates')
  @RequirePermissions('finance:read')
  async fxRates(@Tenant() tenantId: string, @Query() query: ReportQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.reports.resolveFx(tenantId, companyId, new Date(), query.currency);
  }
}
