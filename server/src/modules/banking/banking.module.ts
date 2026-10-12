import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';

@Module({
  imports: [AccountingModule],
  controllers: [BankingController],
  providers: [BankingService],
  exports: [BankingService],
})
export class BankingModule {}