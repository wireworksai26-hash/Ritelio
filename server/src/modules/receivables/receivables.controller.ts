import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CreateReceiptDto, ListDocumentQueryDto } from './dto/receivable.dto';
import { ReceivablesService } from './receivables.service';

@Controller('receivables')
export class ReceivablesController {
  constructor(private readonly receivables: ReceivablesService) {}

  // Daftar faktur penjualan beserta sisa tagihan
  @Get('invoices')
  @RequirePermissions('finance:read')
  listInvoices(@Tenant() tenantId: string, @Query() query: ListDocumentQueryDto) {
    return this.receivables.listInvoices(tenantId, query);
  }

  // Aging piutang usaha per umur jatuh tempo
  @Get('aging')
  @RequirePermissions('finance:read')
  aging(@Tenant() tenantId: string) {
    return this.receivables.aging(tenantId);
  }

  // Terima pembayaran pelanggan (penuh atau sebagian)
  @Post('invoices/:id/receive')
  @RequirePermissions('finance:write')
  receive(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateReceiptDto,
  ) {
    return this.receivables.receive(tenantId, id, dto);
  }
}