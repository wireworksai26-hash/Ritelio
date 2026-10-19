import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateConfig } from './common/config/env.validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { CompanyContextInterceptor } from './common/interceptors/company-context.interceptor';
import { HealthController } from './common/health/health.controller';
import { PrismaModule } from './common/prisma.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { FinanceModule } from './modules/finance/finance.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ModulesConfigModule } from './modules/modules-config/modules-config.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OutletsModule } from './modules/outlets/outlets.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { SalesModule } from './modules/sales/sales.module';
import { UsersModule } from './modules/users/users.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { TaxModule } from './modules/tax/tax.module';
import { AuditModule } from './modules/audit/audit.module';
import { IotModule } from './modules/iot/iot.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { PartiesModule } from './modules/parties/parties.module';
import { PayablesModule } from './modules/payables/payables.module';
import { ReceivablesModule } from './modules/receivables/receivables.module';
import { AssetsModule } from './modules/assets/assets.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { BankingModule } from './modules/banking/banking.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CrmModule } from './modules/crm/crm.module';
import { HrmModule } from './modules/hrm/hrm.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { OperationsModule } from './modules/operations/operations.module';
import { SuperadminModule } from './modules/superadmin/superadmin.module';

// Modular monolith (TRD): tiap domain = modul; guards & audit global.
@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    ThrottlerModule.forRoot([
      // Batas global: longgar untuk API normal, masih menyisakan ruang untuk polling.
      // Dapat diubah lewat THROTTLE_LIMIT (per IP per menit); rute auth punya batas sendiri.
      { ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT ?? 300) },
    ]),
    JwtModule.register({ global: true }),
    PrismaModule,
    AccountingModule,
    TaxModule,

    AuditModule,


    IotModule,
    ApprovalsModule,
    CompaniesModule,
    PartiesModule,
PayablesModule,
ReceivablesModule,
AssetsModule,
ProcurementModule,
BankingModule,
DashboardModule,
CrmModule,
HrmModule,
ManufacturingModule,
OperationsModule,
    AuthModule,
    UsersModule,
    OutletsModule,
    InventoryModule,
    PurchasingModule,
    SalesModule,
    FinanceModule,
    AiModule,
    NotificationsModule,
    ModulesConfigModule,
    SuperadminModule,
  ],
  providers: [
    // Samarkan error non-HTTP (Prisma/bug) agar stack & pesan internal tidak sampai ke klien.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Urutan penting: throttler dulu (hentikan abuse sebelum hash JWT), JWT (isi
    // req.user), lalu RBAC.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Company context dulu agar audit & handler berjalan di dalam konteks perusahaan terpilih.
    { provide: APP_INTERCEPTOR, useClass: CompanyContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
