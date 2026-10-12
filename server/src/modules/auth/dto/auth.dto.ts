import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsStrongPassword } from './password-policy.decorator';

export class RegisterDto {
  @IsString()
  @Length(2, 80)
  businessName!: string;

  @IsIn(['retail', 'manufacturing', 'services'])
  industryTemplate!: 'retail' | 'manufacturing' | 'services';

  @IsString()
  @Length(2, 80)
  ownerName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsStrongPassword()
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;

  // Wajib jika user owner/admin dengan 2FA aktif
  @IsOptional()
  @IsString()
  @Length(6, 6)
  otp?: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(4096)
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  @MaxLength(4096)
  refreshToken!: string;
}

export class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Kode OTP harus 6 digit angka.' })
  code!: string;
}

/** Step-up auth: aktifkan/matikan 2FA wajib menyertakan OTP dan kata sandi saat ini. */
export class StepUpDto extends TwoFactorCodeDto {
  @IsString()
  @Length(1, 128)
  password!: string;
}