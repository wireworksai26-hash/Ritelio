import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateAssetDto {
  @IsString()
  @Length(2, 32)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Kode aset hanya huruf, angka, titik, strip, underscore.' })
  code!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  location?: string;

  @IsDateString({}, { message: 'Tanggal perolehan tidak valid.' })
  acquisitionDate!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Nilai perolehan harus lebih dari 0.' })
  @Max(1_000_000_000_000)
  acquisitionCost!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  salvageValue?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  usefulLifeMonths!: number;

  @IsOptional()
  @IsEnum(['straight_line', 'declining_balance'])
  depreciationMethod?: 'straight_line' | 'declining_balance';

  /** Untuk saldo menurun: 0.25 = 25% per tahun. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(0.9)
  decliningRate?: number;
}

export class RunDepreciationDto {
  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Format kode periode YYYY-MM.' })
  periodCode?: string;
}

export class DisposeAssetDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  proceeds?: number;

  @IsOptional()
  @IsDateString()
  disposalDate?: string;
}