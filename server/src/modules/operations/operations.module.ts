import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AiModule } from '../ai/ai.module';
import { HrmModule } from '../hrm/hrm.module';
import { IotModule } from '../iot/iot.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { TaxModule } from '../tax/tax.module';
import { CapabilitiesController } from './capabilities.controller';
import { CarrierService } from './carrier.service';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { ResourceService } from './resource.service';

/**
 * Proyek & SCM + endpoint kapabilitas Fase 5.
 *
 * Service milik domain lain (HRM, IoT, AI) diambil dari modulnya masing-masing
 * lewat import, bukan didaftarkan ulang sebagai provider — satu instance per
 * aplikasi, jadi tidak ada keadaan yang terduplikasi diam-diam.
 */
@Module({
  imports: [AccountingModule, ApprovalsModule, ReceivablesModule, TaxModule, AiModule, HrmModule, IotModule],
  controllers: [OperationsController, CapabilitiesController],
  providers: [OperationsService, ResourceService, CarrierService],
  exports: [OperationsService, ResourceService, CarrierService],
})
export class OperationsModule {}