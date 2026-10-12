import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { TaxModule } from '../tax/tax.module';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';

@Module({
  imports: [AccountingModule, TaxModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}