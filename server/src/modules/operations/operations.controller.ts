import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import {
  AddMilestoneDto,
  CompleteMilestoneDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
  ListTimesheetsDto,
  CreateMaintenancePlanDto,
  CreateProjectDto,
  CreateShipmentDto,
  CreateTimesheetDto,
  CreateVehicleDto,
  CreateWorkOrderDto,
  RecordFuelDto,
  UpdateShipmentStatusDto,
  UpdateWorkOrderDto,
} from './dto/operations.dto';
import { OperationsService } from './operations.service';

@Controller('operations')
export class OperationsController {
  constructor(private readonly ops: OperationsService) {}

  // ══════════════════════ PROYEK ══════════════════════

  @Get('projects')
  @RequirePermissions('finance:read')
  listProjects(@Tenant() tenantId: string) {
    return this.ops.listProjects(tenantId);
  }

  @Post('projects')
  @RequirePermissions('finance:write')
  createProject(@Tenant() tenantId: string, @Body() dto: CreateProjectDto) {
    return this.ops.createProject(tenantId, dto);
  }

  /** Milestone + garis waktu proyek (Gantt). */
  @Get('projects/:id/milestones')
  @RequirePermissions('finance:read')
  listMilestones(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.ops.listMilestones(tenantId, id);
  }

  @Post('projects/:id/milestones')
  @RequirePermissions('finance:write')
  addMilestone(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: CreateMilestoneDto) {
    return this.ops.addMilestone(tenantId, id, dto.name, dto.dueDate, dto.startDate, dto.dependsOn);
  }

  @Patch('milestones/:milestoneId')
  @RequirePermissions('finance:write')
  updateMilestone(
    @Tenant() tenantId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.ops.updateMilestone(tenantId, milestoneId, dto);
  }

  @Post('milestones/:milestoneId/complete')
  @RequirePermissions('finance:write')
  completeMilestone(
    @Tenant() tenantId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: CompleteMilestoneDto,
  ) {
    return this.ops.completeMilestone(tenantId, milestoneId, dto.progress ?? 100);
  }

  @Post('timesheets')
  @RequirePermissions('settings:write')
  recordTimesheet(@Tenant() tenantId: string, @Body() dto: CreateTimesheetDto) {
    return this.ops.recordTimesheet(tenantId, dto);
  }

  @Post('timesheets/:id/approve')
  @RequirePermissions('settings:write')
  approveTimesheet(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.ops.approveTimesheet(tenantId, id, user.sub);
  }

  @Get('projects/:id/costing')
  @RequirePermissions('finance:read')
  projectCosting(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.ops.projectCosting(tenantId, id);
  }

  @Post('projects/:id/bill')
  @RequirePermissions('finance:write')
  billProject(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.ops.billProject(tenantId, id);
  }

  @Get('projects/:id/billing-readiness')
  @RequirePermissions('finance:read')
  billingReadiness(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.ops.billingReadiness(tenantId, id);
  }

  // ══════════════════════ SCM ══════════════════════

  @Get('shipments')
  @RequirePermissions('inventory:read')
  listShipments(@Tenant() tenantId: string) {
    return this.ops.listShipments(tenantId);
  }

  @Post('shipments')
  @RequirePermissions('inventory:write')
  createShipment(@Tenant() tenantId: string, @Body() dto: CreateShipmentDto) {
    return this.ops.createShipment(tenantId, dto);
  }

  @Post('shipments/:id/status')
  @RequirePermissions('inventory:write')
  updateShipment(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateShipmentStatusDto,
  ) {
    return this.ops.updateShipmentStatus(tenantId, id, dto.status, dto.receiverName);
  }

  @Get('vehicles')
  @RequirePermissions('inventory:read')
  listVehicles(@Tenant() tenantId: string) {
    return this.ops.listVehicles(tenantId);
  }

  @Post('vehicles')
  @RequirePermissions('inventory:write')
  createVehicle(@Tenant() tenantId: string, @Body() dto: CreateVehicleDto) {
    return this.ops.createVehicle(tenantId, dto);
  }

  @Post('vehicles/:id/fuel')
  @RequirePermissions('inventory:write')
  recordFuel(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: RecordFuelDto,
  ) {
    return this.ops.recordFuel(tenantId, id, dto);
  }

  // ══════════════════════ EAM ══════════════════════

  @Get('work-orders')
  @RequirePermissions('settings:write')
  listWorkOrders(@Tenant() tenantId: string) {
    return this.ops.listWorkOrders(tenantId);
  }

  @Post('work-orders')
  @RequirePermissions('settings:write')
  createWorkOrder(@Tenant() tenantId: string, @Body() dto: CreateWorkOrderDto) {
    return this.ops.createWorkOrder(tenantId, dto);
  }

  @Patch('work-orders/:id')
  @RequirePermissions('settings:write')
  updateWorkOrder(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderDto,
  ) {
    return this.ops.updateWorkOrder(tenantId, id, dto);
  }

  @Get('maintenance-plans')
  @RequirePermissions('settings:write')
  listMaintenancePlans(@Tenant() tenantId: string) {
    return this.ops.listMaintenancePlans(tenantId);
  }

  @Post('maintenance-plans')
  @RequirePermissions('settings:write')
  createMaintenancePlan(@Tenant() tenantId: string, @Body() dto: CreateMaintenancePlanDto) {
    return this.ops.createMaintenancePlan(tenantId, dto);
  }

  @Get('maintenance/due')
  @RequirePermissions('settings:write')
  dueMaintenance(@Tenant() tenantId: string) {
    return this.ops.dueMaintenance(tenantId);
  }

  @Get('timesheets')
  @RequirePermissions('finance:read')
  listTimesheets(@Tenant() tenantId: string, @Query() query: ListTimesheetsDto) {
    return this.ops.listTimesheets(tenantId, query);
  }
}
