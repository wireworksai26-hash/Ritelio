import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AccountingModule, ReceivablesModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
