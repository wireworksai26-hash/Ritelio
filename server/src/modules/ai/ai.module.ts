import { Module } from '@nestjs/common';
import { PayablesModule } from '../payables/payables.module';
import { AiController } from './ai.controller';
import { AiRouterService } from './ai-router.service';
import { AiService } from './ai.service';
import { FastPathService } from './fast-path.service';
import { NimService } from './nim.service';
import { OcrService } from './ocr.service';

@Module({
  imports: [PayablesModule],
  controllers: [AiController],
  providers: [AiService, AiRouterService, FastPathService, NimService, OcrService],
  exports: [OcrService],
})
export class AiModule {}
