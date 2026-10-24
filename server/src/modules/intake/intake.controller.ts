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
import { ListIntakeQueryDto, UpdateIntakeDto } from './dto/intake.dto';
import { parseIntakePayload } from './intake-parse';
import { IntakeService } from './intake.service';

@Controller('intake')
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

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
    const secret = process.env.INTAKE_WEBHOOK_SECRET?.trim();
    if (!secret) throw new ServiceUnavailableException('Penerimaan formulir belum dikonfigurasi di server.');
    verifyWebhookSignature({ secret, timestamp: Number(timestamp), body, signature: signature ?? '' });
    const result = await this.intake.ingest(parseIntakePayload(body));
    return { ok: true, id: result.id, duplicate: result.duplicate };
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
