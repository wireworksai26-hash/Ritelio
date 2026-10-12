import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CreateOpeningBalanceDto } from './dto/opening-balance.dto';
import { FiscalCalendarService } from './fiscal-calendar.service';

@Controller('finance')
export class FiscalCalendarController {
  constructor(private readonly fiscalCalendar: FiscalCalendarService) {}

  @Get('fiscal-periods')
  @RequirePermissions('finance:read')
  list(@Tenant() tenantId: string) {
    return this.fiscalCalendar.list(tenantId);
  }

  @Post('fiscal-periods/:id/close')
  @RequirePermissions('finance:write')
  close(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.fiscalCalendar.close(tenantId, id, user);
  }

  @Post('opening-balances')
  @RequirePermissions('finance:write')
  createOpeningBalance(
    @Tenant() tenantId: string,
    @Body() dto: CreateOpeningBalanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.fiscalCalendar.createOpeningBalance(tenantId, dto, user);
  }
}
