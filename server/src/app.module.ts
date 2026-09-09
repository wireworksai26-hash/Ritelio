import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
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

// Modular monolith (TRD): tiap domain = modul; guards & audit global.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    PrismaModule,
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
  ],
  providers: [
    // Urutan penting: JWT dulu (isi req.user), lalu RBAC
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
