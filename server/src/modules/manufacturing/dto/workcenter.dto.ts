import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const QC_STAGES = ['incoming', 'in_process', 'final'] as const;
const WORK_CENTER_KINDS = ['machine', 'facility', 'labor'] as const;

export class CreateWorkCenterDto {
  @IsString()
  @Length(2, 32)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsIn(WORK_CENTER_KINDS)
  kind?: (typeof WORK_CENTER_KINDS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999)
  capacityPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  capacityMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999)
  hourlyRate?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateScheduleDto {
  @IsString()
  workCenterId!: string;

  @IsString()
  productionOrderId!: string;

  @IsDateString()
  scheduledDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  startMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  /** Bypass guard kapasitas untuk keadaan darurat, tercatat lewat jadwal. */
  @IsOptional()
  @IsBoolean()
  allowOverCapacity?: boolean;
}

export class CapacityPlanDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class ProposeScheduleDto {
  @IsDateString()
  from!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days!: number;
}

export class CreateQcStageDto {
  @IsIn(QC_STAGES)
  stage!: (typeof QC_STAGES)[number];

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  minPassPct?: number;
}

export class ConfigureQcStagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CreateQcStageDto)
  stages!: CreateQcStageDto[];
}

export class RecordQcDto {
  @IsIn(QC_STAGES)
  stage!: (typeof QC_STAGES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999)
  checkedQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999)
  defectQty?: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

/** PATCH work center: semua field opsional (kode tidak bisa diubah). */
export class UpdateWorkCenterDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999)
  capacityPerDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  capacityMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999)
  hourlyRate?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
