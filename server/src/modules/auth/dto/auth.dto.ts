import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

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
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' })
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  // Wajib jika user owner/admin dengan 2FA aktif
  @IsOptional()
  @IsString()
  @Length(6, 6)
  otp?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Kode OTP harus 6 digit angka.' })
  code!: string;
}
