import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto, StepUpDto } from './dto/auth.dto';

/** IP efektif (req.ip menghormati `trust proxy`) dan user agent untuk jejak sesi. */
function ctxOf(req: Request) {
  const ua = req.headers['user-agent'];
  return { ip: req.ip ?? null, userAgent: Array.isArray(ua) ? ua[0] : (ua ?? null) };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Per IP. Penguncian per akun+IP ada di AuthThrottleService (database).
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, ctxOf(req));
  }

  // Burst per IP; kegagalan beruntun per akun+IP / akun / IP dikunci oleh AuthThrottleService.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, ctxOf(req));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto, ctxOf(req));
  }

  // Publik: access token sering sudah kedaluwarsa saat pengguna menekan "Keluar".
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthUser, @Body() dto: StepUpDto) {
    return this.auth.setup2fa(user, dto.password, dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('2fa/enable')
  enable2fa(@CurrentUser() user: AuthUser, @Body() dto: StepUpDto) {
    return this.auth.enable2fa(user, dto.password, dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('2fa/disable')
  disable2fa(@CurrentUser() user: AuthUser, @Body() dto: StepUpDto) {
    return this.auth.disable2fa(user, dto.password, dto.code);
  }
}
