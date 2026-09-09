import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export type UserRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'staff';

const ROLES: UserRole[] = ['owner', 'admin', 'manager', 'cashier', 'staff'];

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsIn(ROLES)
  role!: UserRole;

  // Override izin granular per user (JSONB), contoh: {"finance:read": true}
  @IsOptional()
  @IsObject()
  permissions?: Record<string, boolean>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outletIds?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, boolean>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Jika dikirim, daftar outlet user diganti total (hapus lalu buat ulang)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outletIds?: string[];
}
