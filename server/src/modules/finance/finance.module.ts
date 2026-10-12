import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AccountsService } from './accounts.service';
import { FxService } from './fx.service';
import { FinanceController } from './finance.controller';
import { FiscalCalendarController } from './fiscal-calendar.controller';
import { FiscalCalendarService } from './fiscal-calendar.service';
import { FinanceService } from './finance.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AccountingModule],
  controllers: [FinanceController, FiscalCalendarController, ReportsController],
  providers: [FinanceService, FiscalCalendarService, AccountsService, ReportsService, FxService],
  exports: [FinanceService, AccountsService, ReportsService, FxService],
})
export class FinanceModule {}
