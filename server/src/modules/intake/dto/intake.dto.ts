import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const INTAKE_STATUSES = ['new', 'contacted', 'qualified', 'closed'] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export class ListIntakeQueryDto {
  @IsOptional()
  @IsIn(INTAKE_STATUSES)
  status?: IntakeStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateIntakeDto {
  @IsOptional()
  @IsIn(INTAKE_STATUSES)
  status?: IntakeStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export const ONBOARDING_STATUSES = ['new', 'in_progress', 'done'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export class ListOnboardingQueryDto {
  @IsOptional()
  @IsIn(ONBOARDING_STATUSES)
  status?: OnboardingStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateOnboardingDto {
  @IsOptional()
  @IsIn(ONBOARDING_STATUSES)
  status?: OnboardingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
