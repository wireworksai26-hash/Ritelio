import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PayablesModule } from '../payables/payables.module';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

@Module({
  imports: [AccountingModule, PayablesModule],
  controllers: [PurchasingController],
  providers: [PurchasingService],
})
export class PurchasingModule {}
