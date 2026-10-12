import { Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

// PrismaModule adalah @Global() sehingga PrismaService tersedia tanpa import.
@Module({
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class AccountingModule {}