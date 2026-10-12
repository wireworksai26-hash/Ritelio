import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [AccountingModule, ReceivablesModule],
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}