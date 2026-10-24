import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [AiModule],
  controllers: [IntakeController],
  providers: [IntakeService, OnboardingService],
})
export class IntakeModule {}
