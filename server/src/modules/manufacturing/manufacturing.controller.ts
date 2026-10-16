import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import {
  CompleteProductionDto,
  CreateBomDto,
  CreateProductionOrderDto,
  MrpQueryDto,
  QualityCheckDto,
  SetBomActiveDto,
} from './dto/manufacturing.dto';
import {
  CapacityPlanDto,
  ConfigureQcStagesDto,
  CreateScheduleDto,
  CreateWorkCenterDto,
  ProposeScheduleDto,
  UpdateWorkCenterDto,
  RecordQcDto,
} from './dto/workcenter.dto';
import { ManufacturingService } from './manufacturing.service';
import { WorkCenterService } from './workcenter.service';

@Controller('manufacturing')
export class ManufacturingController {
  constructor(
    private readonly manufacturing: ManufacturingService,
    private readonly workCenters: WorkCenterService,
  ) {}

  // ============================== BOM ==============================

  @Get('boms')
  @RequirePermissions('inventory:read')
  listBoms(@Tenant() tenantId: string) {
    return this.manufacturing.listBoms(tenantId);
  }

  @Post('boms')
  @RequirePermissions('inventory:write')
  createBom(@Tenant() tenantId: string, @Body() dto: CreateBomDto) {
    return this.manufacturing.createBom(tenantId, dto);
  }

  @Patch('boms/:id')
  @RequirePermissions('inventory:write')
  setBomActive(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: SetBomActiveDto,
  ) {
    return this.manufacturing.setBomActive(tenantId, id, dto.isActive);
  }

  // ============================== MRP ==============================

  @Get('mrp')
  @RequirePermissions('inventory:read')
  mrp(@Tenant() tenantId: string, @Query() query: MrpQueryDto) {
    return this.manufacturing.mrp(tenantId, query.productId, query.qty, query.warehouseId);
  }

  // ============================== PRODUCTION ORDER ==============================

  @Get('orders')
  @RequirePermissions('inventory:read')
  listOrders(@Tenant() tenantId: string) {
    return this.manufacturing.listProductionOrders(tenantId);
  }

  @Post('orders')
  @RequirePermissions('inventory:write')
  createOrder(@Tenant() tenantId: string, @Body() dto: CreateProductionOrderDto) {
    return this.manufacturing.createProductionOrder(tenantId, dto);
  }

  // Mulai produksi: tarik bahan dari gudang
  @Post('orders/:id/release')
  @RequirePermissions('inventory:write')
  release(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.manufacturing.release(tenantId, id);
  }

  @Post('orders/:id/complete')
  @RequirePermissions('inventory:write')
  complete(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CompleteProductionDto,
  ) {
    return this.manufacturing.complete(tenantId, id, dto.qtyProduced);
  }

  @Post('orders/:id/quality-check')
  @RequirePermissions('inventory:write')
  qualityCheck(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: QualityCheckDto,
  ) {
    return this.manufacturing.recordQualityCheck(tenantId, id, dto);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions('inventory:write')
  cancel(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.manufacturing.cancel(tenantId, id);
  }

  // ====================== WORK CENTER & MESIN ======================

  @Get('work-centers')
  @RequirePermissions('inventory:read')
  listWorkCenters(@Tenant() tenantId: string) {
    return this.workCenters.list(tenantId);
  }

  @Post('work-centers')
  @RequirePermissions('inventory:write')
  createWorkCenter(@Tenant() tenantId: string, @Body() dto: CreateWorkCenterDto) {
    return this.workCenters.create(tenantId, dto);
  }

  @Patch('work-centers/:id')
  @RequirePermissions('inventory:write')
  updateWorkCenter(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateWorkCenterDto) {
    return this.workCenters.update(tenantId, id, dto);
  }

  @Post('schedules')
  @RequirePermissions('inventory:write')
  createSchedule(@Tenant() tenantId: string, @Body() dto: CreateScheduleDto) {
    return this.workCenters.schedule(tenantId, dto);
  }

  @Post('schedules/:id/remove')
  @RequirePermissions('inventory:write')
  removeSchedule(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.workCenters.unschedule(tenantId, id);
  }

  @Get('capacity-plan')
  @RequirePermissions('inventory:read')
  capacityPlan(@Tenant() tenantId: string, @Query() query: CapacityPlanDto) {
    return this.workCenters.capacityPlan(tenantId, query.from, query.to);
  }

  @Get('schedule/proposal')
  @RequirePermissions('inventory:read')
  proposeSchedule(@Tenant() tenantId: string, @Query() query: ProposeScheduleDto) {
    return this.workCenters.proposeSchedule(tenantId, query.from, query.days);
  }

  // ====================== QC BERTINGKAT ======================

  @Put('products/:productId/qc-stages')
  @RequirePermissions('inventory:write')
  configureQc(@Tenant() tenantId: string, @Param('productId') productId: string, @Body() dto: ConfigureQcStagesDto) {
    return this.workCenters.configureQcStages(tenantId, productId, dto.stages);
  }

  @Post('orders/:id/qc')
  @RequirePermissions('inventory:write')
  recordQc(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordQcDto,
  ) {
    return this.workCenters.recordQc(tenantId, id, dto, user.sub);
  }

  @Get('orders/:id/qc-progress')
  @RequirePermissions('inventory:read')
  qcProgress(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.workCenters.qcProgress(tenantId, id);
  }

  @Post('orders/:id/release-multi-level')
  @RequirePermissions('inventory:write')
  releaseMultiLevel(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.manufacturing.releaseMultiLevel(tenantId, id);
  }
}
