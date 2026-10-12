import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const SENSOR_TYPES = ['temperature', 'humidity', 'counter', 'weight', 'vibration', 'power'] as const;
const APPLICANT_STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;

export class RegisterSensorDto {
  @IsString()
  @Length(2, 48)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEnum(SENSOR_TYPES)
  type!: (typeof SENSOR_TYPES)[number];

  @IsOptional()
  @IsString()
  @Length(0, 20)
  unit?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  workCenterId?: string;
}

export class IngestReadingDto {
  @IsString()
  @Length(2, 48)
  deviceCode!: string;

  @IsString()
  @Length(16, 128)
  apiKey!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  value!: number;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class SensorHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  hours?: number;
}

export class AllocateResourceDto {
  @IsString()
  projectId!: string;

  @IsString()
  employeeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  allocationPct!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(168)
  hoursPerWeek?: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  role?: string;
}

export class WorkloadQueryDto {
  @IsOptional()
  @IsDateString()
  on?: string;
}

export class ForecastQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  horizon?: number;

  @IsOptional()
  @IsString()
  productId?: string;
}

export class RegisterCarrierDto {
  @IsString()
  carrierName!: string;

  @IsString()
  @Length(16, 200)
  webhookSecret!: string;
}

export class CarrierWebhookDto {
  @IsString()
  @Length(1, 120)
  trackingNumber!: string;

  @IsString()
  @Length(1, 40)
  status!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  location?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class ManualTrackingDto {
  @IsString()
  @Length(1, 40)
  status!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  note?: string;
}

export class SubmitOcrDto {
  @IsString()
  @Length(1, 200)
  fileName!: string;

  @IsString()
  @Length(1, 100)
  mimeType!: string;

  @IsString()
  @Length(1, 11_000_000)
  dataBase64!: string;
}

export class CreatePostingDto {
  @IsString()
  @Length(2, 160)
  title!: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  employmentType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  openings?: number;
}

export class ApplyJobDto {
  @IsString()
  jobPostingId!: string;

  @IsString()
  @Length(2, 120)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  resumeUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  coverNote?: string;
}

export class MoveStageDto {
  @IsEnum(APPLICANT_STAGES)
  stage!: (typeof APPLICANT_STAGES)[number];

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class HireDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Gaji pokok harus lebih dari 0.' })
  baseSalary!: number;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsBoolean()
  createUser?: boolean;
}

export class CreateKpiDto {
  @IsString()
  @Length(2, 40)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  unit?: string;

  @IsOptional()
  @IsBoolean()
  higherIsBetter?: boolean;
}

export class KpiTargetInputDto {
  @IsString()
  kpiId!: string;

  @IsString()
  employeeId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  target!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class SetTargetsDto {
  @IsString()
  @Length(4, 10)
  period!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((t: KpiTargetInputDto) => `${t.kpiId}:${t.employeeId}`)
  @ValidateNested({ each: true })
  @Type(() => KpiTargetInputDto)
  targets!: KpiTargetInputDto[];
}

export class RecordActualDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  actual!: number;
}

export class ReviewDto {
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  strengths?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  improvements?: string;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class PeriodQueryDto {
  @IsOptional()
  @IsString()
  @Length(4, 10)
  period?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}