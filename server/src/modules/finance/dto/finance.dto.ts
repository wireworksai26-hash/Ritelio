import { Type } from 'class-transformer';
import {
  Matches,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Query untuk laporan laba rugi
export class ProfitLossQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'Kode mata uang harus 3 huruf kapital, misal IDR.' })
  currency?: string;
}

// Query untuk arus kas + prakiraan sederhana
export class CashflowQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  forecast?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'Kode mata uang harus 3 huruf kapital, misal IDR.' })
  currency?: string;
}

// Query daftar jurnal; anomaly datang sebagai string 'true'/'false' dari query string
export class EntriesQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  anomaly?: string;

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

// Jurnal manual oleh pemilik usaha
export class CreateEntryDto {
  @IsString()
  debitAccountCode!: string;

  @IsString()
  creditAccountCode!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999_999_999_999.99)
  amount!: number;

  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

// Keputusan pengguna atas flag anomali
export class ResolveAnomalyDto {
  @IsBoolean()
  valid!: boolean;
}

// Query ekspor laporan
export class ExportQueryDto {
  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
