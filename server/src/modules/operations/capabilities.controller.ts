import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import {
  AllocateResourceDto,
  ApplyJobDto,
  CarrierWebhookDto,
  CreateKpiDto,
  CreatePostingDto,
  ForecastQueryDto,
  HireDto,
  IngestReadingDto,
  ManualTrackingDto,
  MoveStageDto,
  PeriodQueryDto,
  RecordActualDto,
  RegisterCarrierDto,
  RegisterSensorDto,
  ReviewDto,
  SensorHistoryDto,
  SetTargetsDto,
  SubmitOcrDto,
  WorkloadQueryDto,
} from '../../common/dto/capabilities.dto';
import { OcrService } from '../ai/ocr.service';
import { CreateBillDto } from '../payables/dto/payable.dto';
import { IotService } from '../iot/iot.service';
import { PerformanceService } from '../hrm/performance.service';
import { RecruitmentService } from '../hrm/recruitment.service';
import { CarrierService } from './carrier.service';
import { ResourceService } from './resource.service';

/**
 * Satu controller untuk kapabilitas yangTvanguardtumbuh di Fase 5. Dipisah
 * per domain (operations/hrm/iot) supaya tetap enak dibaca; ini hanya
 *groups semua endpoint-nya di satu tempat.
 */
@Controller()
export class CapabilitiesController {
  constructor(
    private readonly resources: ResourceService,
    private readonly carriers: CarrierService,
    private readonly iot: IotService,
    private readonly recruitment: RecruitmentService,
    private readonly performance: PerformanceService,
    private readonly ocr: OcrService,
  ) {}

  // ── Resource Allocation ───────────────────────────────────────────────

  @Get('projects/:id/allocations')
  @RequirePermissions('finance:read')
  listAllocations(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.resources.listAllocations(tenantId, id);
  }

  @Post('projects/:id/allocations')
  @RequirePermissions('finance:write')
  allocate(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: AllocateResourceDto) {
    return this.resources.allocate(tenantId, { ...dto, projectId: id });
  }

  @Patch('allocations/:id/release')
  @RequirePermissions('finance:write')
  releaseAllocation(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.resources.release(tenantId, id);
  }

  @Get('resources/workload')
  @RequirePermissions('finance:read')
  workload(@Tenant() tenantId: string, @Query() query: WorkloadQueryDto) {
    return this.resources.workload(tenantId, query.on);
  }

  @Get('resources/available')
  @RequirePermissions('finance:read')
  availableStaff(@Tenant() tenantId: string, @Query() query: WorkloadQueryDto) {
    return this.resources.availableStaff(tenantId, query.on);
  }

  // ── Demand Forecasting ─────────────────────────────────────────────────

  @Get('forecasting/demand')
  @RequirePermissions('finance:read')
  demandForecast(@Tenant() tenantId: string, @Query() query: ForecastQueryDto) {
    return this.resources.demandForecast(tenantId, {
      months: query.months,
      horizon: query.horizon,
      productId: query.productId,
    });
  }

  // ── Carrier / Ekspedisi ────────────────────────────────────────────────

  @Post('shipments/:id/carrier')
  @RequirePermissions('inventory:write')
  registerCarrier(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: RegisterCarrierDto) {
    return this.carriers.registerWebhook(tenantId, id, dto.carrierName, dto.webhookSecret);
  }

  @Post('shipments/:id/tracking')
  @RequirePermissions('inventory:write')
  manualTracking(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: ManualTrackingDto) {
    return this.carriers.recordManualTracking(tenantId, id, dto.status, dto.note);
  }

  @Get('shipments/:id/timeline')
  @RequirePermissions('inventory:read')
  timeline(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.carriers.timeline(tenantId, id);
  }

  /** Dipanggil kurir. Auth-nya signature, bukan JWT. */
  @Public()
  @Post('webhooks/carrier')
  carrierWebhook(
    @Tenant() tenantId: string,
    @Body() dto: CarrierWebhookDto,
    @Headers('x-retalio-signature') signature: string,
    @Headers('x-retalio-timestamp') timestamp: string,
  ) {
    return this.carriers.handleWebhook(tenantId, dto, signature ?? '', Number(timestamp));
  }

  // ── IoT Sensor ─────────────────────────────────────────────────────────

  @Get('iot/sensors')
  @RequirePermissions('inventory:read')
  listSensors(@Tenant() tenantId: string) {
    return this.iot.list(tenantId);
  }

  @Post('iot/sensors')
  @RequirePermissions('inventory:write')
  registerSensor(@Tenant() tenantId: string, @Body() dto: RegisterSensorDto) {
    return this.iot.register(tenantId, dto);
  }

  @Get('iot/sensors/:code')
  @RequirePermissions('inventory:read')
  sensorHistory(@Tenant() tenantId: string, @Param('code') code: string, @Query() query: SensorHistoryDto) {
    return this.iot.history(tenantId, code, query.hours ?? 24);
  }

  @Post('iot/sensors/:code/rotate-key')
  @RequirePermissions('inventory:write')
  rotateSensorKey(@Tenant() tenantId: string, @Param('code') code: string) {
    return this.iot.rotateKey(tenantId, code);
  }

  /** Dipanggil perangkat sensor. Auth-nya API key sensor, bukan JWT. */
  @Public()
  @Post('iot/readings')
  ingest(@Tenant() tenantId: string, @Body() dto: IngestReadingDto) {
    return this.iot.ingest(tenantId, dto);
  }

  // ── Recruitment & Onboarding ───────────────────────────────────────────

  @Get('recruitment/postings')
  @RequirePermissions('settings:write')
  listPostings(@Tenant() tenantId: string) {
    return this.recruitment.listPostings(tenantId);
  }

  @Post('recruitment/postings')
  @RequirePermissions('settings:write')
  createPosting(@Tenant() tenantId: string, @Body() dto: CreatePostingDto) {
    return this.recruitment.createPosting(tenantId, dto);
  }

  @Post('recruitment/postings/:id/close')
  @RequirePermissions('settings:write')
  closePosting(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.recruitment.closePosting(tenantId, id);
  }

  @Get('recruitment/applicants')
  @RequirePermissions('settings:write')
  listApplicants(@Tenant() tenantId: string, @Query('postingId') postingId?: string) {
    return this.recruitment.listApplicants(tenantId, postingId);
  }

  @Post('recruitment/applicants')
  @RequirePermissions('settings:write')
  apply(@Tenant() tenantId: string, @Body() dto: ApplyJobDto) {
    return this.recruitment.apply(tenantId, dto);
  }

  @Post('recruitment/applicants/:id/stage')
  @RequirePermissions('settings:write')
  moveStage(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: MoveStageDto) {
    return this.recruitment.moveStage(tenantId, id, dto.stage, dto.note);
  }

  @Post('recruitment/applicants/:id/hire')
  @RequirePermissions('settings:write')
  hire(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: HireDto) {
    return this.recruitment.hire(tenantId, id, dto);
  }

  @Post('recruitment/applicants/:id/onboarding-complete')
  @RequirePermissions('settings:write')
  completeOnboarding(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.recruitment.completeOnboarding(tenantId, id);
  }

  @Get('recruitment/pipeline')
  @RequirePermissions('settings:write')
  recruitmentPipeline(@Tenant() tenantId: string) {
    return this.recruitment.pipeline(tenantId);
  }

  // ── KPI & Performance ──────────────────────────────────────────────────

  @Get('performance/kpis')
  @RequirePermissions('settings:write')
  listKpis(@Tenant() tenantId: string) {
    return this.performance.listDefinitions(tenantId);
  }

  @Post('performance/kpis')
  @RequirePermissions('settings:write')
  createKpi(@Tenant() tenantId: string, @Body() dto: CreateKpiDto) {
    return this.performance.createDefinition(tenantId, dto);
  }

  @Get('performance/targets')
  @RequirePermissions('settings:write')
  listTargets(@Tenant() tenantId: string, @Query() query: PeriodQueryDto, @Query('employeeId') employeeId?: string) {
    return this.performance.listTargets(tenantId, query.period, employeeId);
  }

  @Post('performance/targets')
  @RequirePermissions('settings:write')
  setTargets(@Tenant() tenantId: string, @Body() dto: SetTargetsDto) {
    return this.performance.setTargets(tenantId, dto.period, dto.targets);
  }

  @Patch('performance/targets/:id/actual')
  @RequirePermissions('settings:write')
  recordActual(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: RecordActualDto) {
    return this.performance.recordActual(tenantId, id, dto.actual);
  }

  @Get('performance/score')
  @RequirePermissions('settings:write')
  employeeScore(@Tenant() tenantId: string, @Query() query: PeriodQueryDto & { employeeId: string }) {
    return this.performance.employeeScore(tenantId, query.employeeId, query.period ?? '');
  }

  @Post('performance/review')
  @RequirePermissions('settings:write')
  review(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewDto & { employeeId: string; period: string },
  ) {
    return this.performance.review(
      tenantId,
      dto.employeeId,
      dto.period,
      { strengths: dto.strengths, improvements: dto.improvements, submit: dto.submit },
      user.sub,
    );
  }

  @Get('performance/reviews')
  @RequirePermissions('settings:write')
  listReviews(@Tenant() tenantId: string, @Query() query: PeriodQueryDto) {
    return this.performance.listReviews(tenantId, query.period);
  }

  @Get('performance/leaderboard')
  @RequirePermissions('settings:write')
  leaderboard(@Tenant() tenantId: string, @Query() query: PeriodQueryDto) {
    return this.performance.leaderboard(tenantId, query.period ?? '', query.limit ?? 10);
  }

  // ── OCR ────────────────────────────────────────────────────────────────

  @Get('ocr/results')
  @RequirePermissions('finance:read')
  listOcr(@Tenant() tenantId: string, @Query('status') status?: string) {
    return this.ocr.list(tenantId, status);
  }

  @Post('ocr/scan')
  @RequirePermissions('finance:write')
  scanReceipt(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitOcrDto,
  ) {
    return this.ocr.submit(tenantId, dto, user.sub);
  }

  @Post('ocr/results/:id/create-bill')
  @RequirePermissions('finance:write')
  createBillFromOcr(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateBillDto,
  ) {
    return this.ocr.createBill(tenantId, id, dto, user.sub);
  }

  @Patch('ocr/results/:id')
  @RequirePermissions('finance:write')
  reviewOcr(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.ocr.review(tenantId, id, dto);
  }
}