import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { TaxModule } from '../tax/tax.module';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';

@Module({
  imports: [AccountingModule, TaxModule],
  controllers: [PayablesController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class PayablesModule {}