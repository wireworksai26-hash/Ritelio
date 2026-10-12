import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BomLineInputDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.000001, { message: 'Jumlah komponen harus lebih dari 0.' })
  @Max(999_999_999.999)
  qtyRequired!: number;

  /** Contoh: 5 berarti ada 5% bahan terbuang. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  scrapPercent?: number;
}

export class CreateBomDto {
  @IsString()
  productId!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.000001)
  @Max(999_999_999.999)
  outputQty?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BomLineInputDto)
  lines!: BomLineInputDto[];
}

export class SetBomActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

export class CreateProductionOrderDto {
  @IsString()
  productId!: string;

  @IsString()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  bomId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Jumlah produksi harus lebih dari 0.' })
  @Max(999_999_999.999)
  qtyPlanned!: number;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  /** 1 = paling Tinggi. Dipakai Capacity Planning untuk mengurutkan antrean. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  priority?: number;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;
}

export class CompleteProductionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999_999_999.999)
  qtyProduced?: number;
}

const QUALITY_RESULTS = ['pending', 'passed', 'failed'] as const;

export class QualityCheckDto {
  @IsString()
  @Length(2, 80)
  stage!: string;

  @IsEnum(QUALITY_RESULTS)
  result!: (typeof QUALITY_RESULTS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999.999)
  checkedQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999.999)
  defectQty?: number;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;
}

export class MrpQueryDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999_999_999.999)
  qty!: number;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}