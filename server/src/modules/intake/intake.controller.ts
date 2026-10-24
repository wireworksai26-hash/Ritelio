import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
// Skema tanda tangan yang sama dengan webhook kurir: HMAC-SHA256(secret, `${timestamp}.${JSON.stringify(body)}`).
import { verifyWebhookSignature } from '../operations/carrier-webhook';
import { ListIntakeQueryDto, ListOnboardingQueryDto, UpdateIntakeDto, UpdateOnboardingDto } from './dto/intake.dto';
import { ONBOARDING_LIMITS, parseIntakePayload } from './intake-parse';
import { IntakeService } from './intake.service';
import { OnboardingService } from './onboarding.service';

@Controller('intake')
export class IntakeController {
  constructor(
    private readonly intake: IntakeService,
    private readonly onboarding: OnboardingService,
  ) {}

  /** Rahasia bersama dan tanda tangan diperiksa sama persis untuk kedua formulir. */
  private verify(body: unknown, signature: string | undefined, timestamp: string | undefined): void {
    const secret = process.env.INTAKE_WEBHOOK_SECRET?.trim();
    if (!secret) throw new ServiceUnavailableException('Penerimaan formulir belum dikonfigurasi di server.');
    verifyWebhookSignature({ secret, timestamp: Number(timestamp), body, signature: signature ?? '' });
  }

  /**
   * Penerima jawaban Google Form. Tidak memakai JWT: yang dibuktikan adalah tanda tangan skrip Google Apps Script
   * dengan rahasia bersama INTAKE_WEBHOOK_SECRET. Tanpa rahasia itu di server, endpoint menolak semua permintaan.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(202)
  @Post('google-form')
  async receive(
    @Body() body: unknown,
    @Headers('x-retalio-signature') signature: string | undefined,
    @Headers('x-retalio-timestamp') timestamp: string | undefined,
  ) {
    this.verify(body, signature, timestamp);
    const result = await this.intake.ingest(parseIntakePayload(body));
    return { ok: true, id: result.id, duplicate: result.duplicate };
  }

  /** Penerima Google Form 2 (data awal klien setelah berlangganan). Aturan keamanannya sama dengan `google-form`. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(202)
  @Post('onboarding-form')
  async receiveOnboarding(
    @Body() body: unknown,
    @Headers('x-retalio-signature') signature: string | undefined,
    @Headers('x-retalio-timestamp') timestamp: string | undefined,
  ) {
    this.verify(body, signature, timestamp);
    const result = await this.onboarding.ingest(parseIntakePayload(body, new Date(), ONBOARDING_LIMITS));
    return { ok: true, id: result.id, duplicate: result.duplicate };
  }

  @Get('onboarding')
  @RequirePermissions('settings:write')
  listOnboarding(@CurrentUser() user: AuthUser, @Query() query: ListOnboardingQueryDto) {
    return this.onboarding.list(user, query);
  }

  @Get('onboarding/:id')
  @RequirePermissions('settings:write')
  getOnboarding(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.onboarding.get(user, id);
  }

  @Patch('onboarding/:id')
  @RequirePermissions('settings:write')
  updateOnboarding(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOnboardingDto) {
    return this.onboarding.update(user, id, dto);
  }

  @Get('submissions')
  @RequirePermissions('settings:write')
  list(@CurrentUser() user: AuthUser, @Query() query: ListIntakeQueryDto) {
    return this.intake.list(user, query);
  }

  @Get('submissions/:id')
  @RequirePermissions('settings:write')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.intake.get(user, id);
  }

  @Patch('submissions/:id')
  @RequirePermissions('settings:write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateIntakeDto) {
    return this.intake.update(user, id, dto);
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('submissions/:id/analyze')
  @RequirePermissions('settings:write')
  analyze(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.intake.reanalyze(user, id);
  }
}
