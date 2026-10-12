import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ComputeVendorPerformanceDto } from './dto/procurement.dto';
import { GenerateReorderPoDto } from './dto/procurement.dto';
import { Tenant } from '../../common/decorators/tenant.decorator';
import {
  ApproveRequisitionDto,
  ConvertRequisitionDto,
  CreateRequisitionDto,
  CreateTransferDto,
  ListRequisitionQueryDto,
} from './dto/procurement.dto';
import { ProcurementService } from './procurement.service';

@Controller('procurement')
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  // ===================== REQUISITION =====================

  @Get('requisitions')
  @RequirePermissions('purchasing:read')
  listRequisitions(@Tenant() tenantId: string, @Query() query: ListRequisitionQueryDto) {
    return this.procurement.listRequisitions(tenantId, query);
  }

  @Post('requisitions')
  @RequirePermissions('purchasing:write')
  createRequisition(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRequisitionDto,
  ) {
    return this.procurement.createRequisition(tenantId, user.sub, dto);
  }

  @Post('requisitions/:id/submit')
  @RequirePermissions('purchasing:write')
  submitRequisition(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.procurement.submitRequisition(tenantId, id);
  }

  @Post('requisitions/:id/approve')
  @RequirePermissions('purchasing:write')
  approveRequisition(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveRequisitionDto,
  ) {
    return this.procurement.approveRequisition(tenantId, id, user.sub, dto);
  }

  @Post('requisitions/:id/convert-po')
  @RequirePermissions('purchasing:write')
  convertRequisitionToPo(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ConvertRequisitionDto,
  ) {
    return this.procurement.convertRequisitionToPo(tenantId, id, dto);
  }

  // ===================== STOCK TRANSFER =====================

  @Get('transfers')
  @RequirePermissions('inventory:read')
  listTransfers(@Tenant() tenantId: string) {
    return this.procurement.listTransfers(tenantId);
  }

  @Post('transfers')
  @RequirePermissions('inventory:write')
  createTransfer(@Tenant() tenantId: string, @Body() dto: CreateTransferDto) {
    return this.procurement.createTransfer(tenantId, dto);
  }

  @Post('transfers/:id/ship')
  @RequirePermissions('inventory:write')
  shipTransfer(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.procurement.shipTransfer(tenantId, id);
  }

  @Post('transfers/:id/receive')
  @RequirePermissions('inventory:write')
  receiveTransfer(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.procurement.receiveTransfer(tenantId, id);
  }

  // ===================== REORDER POINT =====================

  @Get('reorder-suggestions')
  @RequirePermissions('purchasing:read')
  reorderSuggestions(@Tenant() tenantId: string) {
    return this.procurement.reorderSuggestions(tenantId);
  }

  /** Reorder Point Automation: ubah saran menjadi draf PO. */
  @Post('reorder-generate-po')
  @RequirePermissions('purchasing:write')
  generateReorderPO(@Tenant() tenantId: string, @Body() dto: GenerateReorderPoDto) {
    return this.procurement.generateReorderPurchaseOrders(tenantId, {
      notify: dto.notify ?? true,
      onlySupplierId: dto.supplierId,
    });
  }

  // ===================== VENDOR SCORECARD =====================

  @Get('vendor-scorecard')
  @RequirePermissions('purchasing:read')
  vendorScorecard(@Tenant() tenantId: string) {
    return this.procurement.vendorScorecard(tenantId);
  }

  /** Hitung ulang skor vendor (ketepatan waktu, kualitas, harga) & simpan. */
  @Post('vendor-performance/compute')
  @RequirePermissions('purchasing:write')
  computeVendorPerformance(@Tenant() tenantId: string, @Body() dto: ComputeVendorPerformanceDto) {
    return this.procurement.computeVendorPerformance(tenantId, dto.periodStart, dto.periodEnd);
  }

  @Get('vendor-performance/:supplierId')
  @RequirePermissions('purchasing:read')
  vendorHistory(@Tenant() tenantId: string, @Param('supplierId') supplierId: string, @Query('periods') periods?: string) {
    return this.procurement.vendorScorecardHistory(tenantId, supplierId, periods ? Number(periods) : 6);
  }
}
