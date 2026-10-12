import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @Length(2, 32)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Kode bank hanya huruf, angka, titik, strip, underscore.' })
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  bankName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  accountNumber?: string;

  /** Akun kas di COA yang dipakai. Default 1000. */
  @IsOptional()
  @IsString()
  accountCode?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currencyCode?: string;
}

export class CreateStatementDto {
  @IsString()
  bankAccountId!: string;

  @IsDateString()
  statementDate!: string;

  @IsString()
  @Length(1, 255)
  description!: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  reference?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(1_000_000_000_000)
  amount!: number;
}

export class ReconcileDto {
  @IsString()
  statementId!: string;

  @IsOptional()
  @IsBoolean()
  match?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount?: number;

  @IsOptional()
  @IsDateString()
  entryDate?: string;
}