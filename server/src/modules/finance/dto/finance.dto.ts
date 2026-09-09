import {
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
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

// Query untuk arus kas + prakiraan sederhana
export class CashflowQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  forecast?: number;
}

// Query daftar jurnal; anomaly datang sebagai string 'true'/'false' dari query string
export class EntriesQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  anomaly?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
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

  @IsNumber()
  @Min(0.01)
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
  @IsString()
  format?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
