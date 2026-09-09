import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiRouterService } from './ai-router.service';
import { AiService } from './ai.service';
import { FastPathService } from './fast-path.service';
import { NimService } from './nim.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AiRouterService, FastPathService, NimService],
})
export class AiModule {}
