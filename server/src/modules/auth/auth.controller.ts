import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto, TwoFactorCodeDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setup2fa(user);
  }

  @Post('2fa/enable')
  enable2fa(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.auth.enable2fa(user, dto.code);
  }

  @Post('2fa/disable')
  disable2fa(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.auth.disable2fa(user, dto.code);
  }
}
