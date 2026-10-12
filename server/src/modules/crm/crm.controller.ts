import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CrmService } from './crm.service';
import {
  ConvertQuotationDto,
  CreateComplaintDto,
  CreateCustomerDto,
  CreateInteractionDto,
  CreateLeadDto,
  CreateOpportunityDto,
  CreateQuotationDto,
  CreateSalesOrderDto,
  MoveOpportunityDto,
  MoveQuotationDto,
  MoveStageDto,
  ResolveComplaintDto,
} from './dto/crm.dto';

@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  // ============================== LEAD ==============================

  @Get('leads')
  @RequirePermissions('pos:read')
  listLeads(@Tenant() tenantId: string) {
    return this.crm.listLeads(tenantId);
  }

  @Post('leads')
  @RequirePermissions('pos:write')
  createLead(@Tenant() tenantId: string, @Body() dto: CreateLeadDto) {
    return this.crm.createLead(tenantId, dto);
  }

  @Post('leads/:id/convert')
  @RequirePermissions('pos:write')
  convertLead(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.crm.convertLead(tenantId, id, dto);
  }

  // ============================== OPPORTUNITY ==============================

  @Get('opportunities')
  @RequirePermissions('pos:read')
  listOpportunities(@Tenant() tenantId: string) {
    return this.crm.listOpportunities(tenantId);
  }

  @Post('opportunities')
  @RequirePermissions('pos:write')
  createOpportunity(@Tenant() tenantId: string, @Body() dto: CreateOpportunityDto) {
    return this.crm.createOpportunity(tenantId, dto);
  }

  @Get('pipeline')
  @RequirePermissions('pos:read')
  pipeline(@Tenant() tenantId: string) {
    return this.crm.pipeline(tenantId);
  }

  // ============================== QUOTATION ==============================

  @Get('quotations')
  @RequirePermissions('pos:read')
  listQuotations(@Tenant() tenantId: string) {
    return this.crm.listQuotations(tenantId);
  }

  @Post('quotations')
  @RequirePermissions('pos:write')
  createQuotation(@Tenant() tenantId: string, @Body() dto: CreateQuotationDto) {
    return this.crm.createQuotation(tenantId, dto);
  }

  // ============================== SALES ORDER ==============================

  @Get('sales-orders')
  @RequirePermissions('pos:read')
  listSalesOrders(@Tenant() tenantId: string) {
    return this.crm.listSalesOrders(tenantId);
  }

  @Post('sales-orders')
  @RequirePermissions('pos:write')
  createSalesOrder(@Tenant() tenantId: string, @Body() dto: CreateSalesOrderDto) {
    return this.crm.createSalesOrder(tenantId, dto);
  }

  // Konfirmasi pesanan (draft -> confirmed) sebelum bisa di-fulfil
  @Post('sales-orders/:id/confirm')
  @RequirePermissions('pos:write')
  confirm(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.crm.confirm(tenantId, id);
  }

  @Post('sales-orders/:id/cancel')
  @RequirePermissions('pos:write')
  cancel(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.crm.cancel(tenantId, id);
  }

  // Fulfil: kurangi stok, posting jurnal, terbitkan faktur piutang
  @Post('sales-orders/:id/fulfil')
  @RequirePermissions('pos:write')
  fulfil(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.crm.fulfil(tenantId, id);
  }

  // ============================== HISTORY & KELUHAN ==============================

  @Get('customers/:id/history')
  @RequirePermissions('pos:read')
  customerHistory(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.crm.listCustomerHistory(tenantId, id);
  }

  @Post('customers/:id/interactions')
  @RequirePermissions('pos:write')
  createInteraction(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateInteractionDto,
  ) {
    return this.crm.createInteraction(tenantId, id, user.sub, dto);
  }

  @Get('complaints')
  @RequirePermissions('pos:read')
  listComplaints(@Tenant() tenantId: string) {
    return this.crm.listComplaints(tenantId);
  }

  @Post('complaints')
  @RequirePermissions('pos:write')
  createComplaint(@Tenant() tenantId: string, @Body() dto: CreateComplaintDto) {
    return this.crm.createComplaint(tenantId, dto);
  }

  @Post('complaints/:id/resolve')
  @RequirePermissions('pos:write')
  resolveComplaint(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ResolveComplaintDto,
  ) {
    return this.crm.resolveComplaint(tenantId, id, dto);
  }

  // ====================== PROSPEK & DEAL ======================

  @Post('leads/:id/stage')
  @RequirePermissions('pos:write')
  moveLeadStage(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: MoveStageDto) {
    return this.crm.moveLeadStage(tenantId, id, dto);
  }

  @Post('opportunities/:id/stage')
  @RequirePermissions('pos:write')
  moveOpportunity(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: MoveOpportunityDto) {
    return this.crm.moveOpportunity(tenantId, id, dto);
  }

  @Post('quotations/:id/status')
  @RequirePermissions('pos:write')
  moveQuotation(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: MoveQuotationDto) {
    return this.crm.moveQuotation(tenantId, id, dto);
  }

  /** Penawaran yang disetujui menjadi pesanan; baris diambil dari penawaran. */
  @Post('quotations/:id/convert')
  @RequirePermissions('pos:write')
  convertQuotation(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: ConvertQuotationDto) {
    return this.crm.convertQuotation(tenantId, id, dto);
  }
}
