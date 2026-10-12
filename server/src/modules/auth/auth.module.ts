import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthThrottleService } from './auth-throttle.service';
import { RefreshSessionService } from './refresh-session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, RefreshSessionService, AuthThrottleService],
  exports: [RefreshSessionService],
})
export class AuthModule {}
