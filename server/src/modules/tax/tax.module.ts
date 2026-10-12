import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { TaxCalculationService } from './tax-calculation.service';
import { TaxDocumentsController } from './tax-documents.controller';
import { TaxDocumentsService } from './tax-documents.service';
import { TaxEngineService } from './tax-engine.service';
import { TaxRulesService } from './tax-rules.service';

@Module({
  imports: [AccountingModule],
  controllers: [TaxDocumentsController],
  providers: [TaxCalculationService, TaxDocumentsService, TaxEngineService, TaxRulesService],
  exports: [TaxCalculationService, TaxDocumentsService, TaxEngineService, TaxRulesService],
})
export class TaxModule {}