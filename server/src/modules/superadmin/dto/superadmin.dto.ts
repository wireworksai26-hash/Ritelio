import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export type TenantIndustry = 'retail' | 'manufacturing' | 'services';
export type TenantPlan = 'basic' | 'plus_ai' | 'custom';
export type TenantLifecycleStatus = 'active' | 'suspended' | 'trial';
export type GlobalUserRole = 'superadmin' | 'owner' | 'admin' | 'manager' | 'cashier' | 'staff';

const INDUSTRIES: TenantIndustry[] = ['retail', 'manufacturing', 'services'];
const PLANS: TenantPlan[] = ['basic', 'plus_ai', 'custom'];
const STATUSES: TenantLifecycleStatus[] = ['active', 'suspended', 'trial'];
const ROLES: GlobalUserRole[] = ['superadmin', 'owner', 'admin', 'manager', 'cashier', 'staff'];

export class CreateSuperadminTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @IsIn(INDUSTRIES)
  industryTemplate!: TenantIndustry;

  @IsOptional()
  @IsIn(PLANS)
  subscriptionPlan?: TenantPlan;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  outletName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  outletAddress?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  aiQuotaLimit?: number;
}

export class UpdateSuperadminTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name?: string;

  @IsOptional()
  @IsIn(INDUSTRIES)
  industryTemplate?: TenantIndustry;

  @IsOptional()
  @IsIn(PLANS)
  subscriptionPlan?: TenantPlan;

  @IsOptional()
  @IsIn(STATUSES)
  status?: TenantLifecycleStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  aiQuotaLimit?: number;

  @IsOptional()
  @IsBoolean()
  resetAiQuota?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyRevenue?: number;

  @IsOptional()
  @IsObject()
  modules?: Record<string, boolean>;
}

export class CreateSuperadminUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsIn(ROLES)
  role!: GlobalUserRole;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetTenantId?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  password?: string;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, boolean>;
}

export class UpdateSuperadminUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: GlobalUserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  newPassword?: string;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, boolean>;
}
