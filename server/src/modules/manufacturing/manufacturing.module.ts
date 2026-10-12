import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ManufacturingController } from './manufacturing.controller';
import { ManufacturingService } from './manufacturing.service';
import { WorkCenterService } from './workcenter.service';

@Module({
  imports: [AccountingModule],
  controllers: [ManufacturingController],
  providers: [ManufacturingService, WorkCenterService],
  exports: [ManufacturingService, WorkCenterService],
})
export class ManufacturingModule {}