import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { HrmController } from './hrm.controller';
import { HrmService } from './hrm.service';
import { PerformanceService } from './performance.service';
import { RecruitmentService } from './recruitment.service';

@Module({
  imports: [AccountingModule],
  controllers: [HrmController],
  providers: [HrmService, RecruitmentService, PerformanceService],
  exports: [HrmService, RecruitmentService, PerformanceService],
})
export class HrmModule {}