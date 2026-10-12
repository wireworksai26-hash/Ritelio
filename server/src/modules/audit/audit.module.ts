import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

// Global supaya interceptor, auth, dan modul mana pun bisa mencatat peristiwa
// tanpa mengimpor modul satu per satu.
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}