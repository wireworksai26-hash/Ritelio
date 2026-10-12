import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateBillDto, CreatePaymentDto, ListDocumentQueryDto } from './dto/payable.dto';
import { PayablesService } from './payables.service';

@Controller('payables')
export class PayablesController {
  constructor(private readonly payables: PayablesService) {}

  // Daftar faktur pembelian beserta sisa tagihan
  @Get('bills')
  @RequirePermissions('finance:read')
  listBills(@Tenant() tenantId: string, @Query() query: ListDocumentQueryDto) {
    return this.payables.listBills(tenantId, query);
  }

  // Aging hutang usaha per umur jatuh tempo
  @Get('aging')
  @RequirePermissions('finance:read')
  aging(@Tenant() tenantId: string) {
    return this.payables.aging(tenantId);
  }

  // Catat tagihan pemasok manual (tanpa PO)
  @Post('bills')
  @RequirePermissions('finance:write')
  createBill(@Tenant() tenantId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateBillDto) {
    return this.payables.createBill(tenantId, dto, { actorId: user.sub });
  }

  // Bayar faktur (penuh atau sebagian)
  @Post('bills/:id/pay')
  @RequirePermissions('finance:write')
  payBill(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.payables.payBill(tenantId, id, dto);
  }
}