import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, CreateExchangeRateDto } from './dto/company.dto';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @RequirePermissions('settings:write')
  list(@Tenant() tenantId: string) {
    return this.companies.list(tenantId);
  }

  @Get('currencies')
  @RequirePermissions('settings:write')
  currencies() {
    return this.companies.currencies();
  }

  @Post()
  @RequirePermissions('settings:write')
  create(@Tenant() tenantId: string, @Body() dto: CreateCompanyDto) {
    return this.companies.create(tenantId, dto);
  }

  @Get(':companyId/exchange-rates')
  @RequirePermissions('finance:read')
  exchangeRates(@Tenant() tenantId: string, @Param('companyId') companyId: string) {
    return this.companies.exchangeRates(tenantId, companyId);
  }

  @Post(':companyId/exchange-rates')
  @RequirePermissions('finance:write')
  setExchangeRate(
    @Tenant() tenantId: string,
    @Param('companyId') companyId: string,
    @Body() dto: CreateExchangeRateDto,
  ) {
    return this.companies.setExchangeRate(tenantId, companyId, dto);
  }
}
