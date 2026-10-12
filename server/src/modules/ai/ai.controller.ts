import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { AiService } from './ai.service';
import { CashflowForecastQuery, ChatDto, FeedbackDto } from './dto/chat.dto';

@Controller('ai')
@RequirePermissions('ai:use')
export class AiController {
  constructor(private readonly ai: AiService) {}

  // Chat AI Assistant — router fast path (nol token) / slow path (NVIDIA NIM)
  @HttpCode(200)
  @Post('chat')
  // Panggilan LLM mahal (sampai 20 detik + biaya token): batasi terpisah dari
  // batas global agar user normal tetap bisa bertanya tanpa exhausting kuota.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  chat(@CurrentUser() user: AuthUser, @Body() dto: ChatDto) {
    return this.ai.chat(user, dto.question);
  }

  @Get('insights')
  insights(@Tenant() tenantId: string, @Query('module') module?: string) {
    return this.ai.insights(tenantId, module);
  }

  @Post('insights/:id/feedback')
  feedback(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: FeedbackDto) {
    return this.ai.feedback(tenantId, id, dto.feedback);
  }

  @Get('usage')
  usage(@Tenant() tenantId: string) {
    return this.ai.usageInfo(tenantId);
  }

  // Forecast arus kas — dihitung lokal (fast path), tanpa LLM
  @Get('forecast/cashflow')
  cashflowForecast(@Tenant() tenantId: string, @Query() query: CashflowForecastQuery) {
    return this.ai.cashflowForecast(tenantId, query.days ?? 30);
  }
}
