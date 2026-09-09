import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { BatchTransactionDto, CreateTransactionDto } from './dto/transaction.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  // Transaksi tunggal dari POS
  @Post('transactions')
  @RequirePermissions('pos:write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTransactionDto) {
    return this.sales.processOne(user, dto);
  }

  // Batch sync antrean offline (Background Sync target)
  @Post('transactions/batch')
  @RequirePermissions('pos:write')
  batch(@CurrentUser() user: AuthUser, @Body() dto: BatchTransactionDto) {
    return this.sales.processBatch(user, dto.transactions);
  }

  @Get('transactions')
  @RequirePermissions('pos:read')
  list(
    @Tenant() tenantId: string,
    @Query('outletId') outletId?: string,
    @Query('syncStatus') syncStatus?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.sales.list(tenantId, { outletId, syncStatus, from, to, page, limit });
  }

  @Get('transactions/:id')
  @RequirePermissions('pos:read')
  detail(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.sales.detail(tenantId, id);
  }
}
