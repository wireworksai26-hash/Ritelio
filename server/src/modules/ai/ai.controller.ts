import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
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

  // Smart Receipt OCR — butuh vision model
  @Post('ocr')
  ocr() {
    return this.ai.ocr();
  }
}
