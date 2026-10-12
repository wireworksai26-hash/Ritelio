import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
  @IsEnum(WORK_CENTER_KINDS)
  kind?: (typeof WORK_CENTER_KINDS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
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
  @IsEnum(QC_STAGES)
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
  @IsEnum(QC_STAGES)
  stage!: (typeof QC_STAGES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  checkedQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defectQty?: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}