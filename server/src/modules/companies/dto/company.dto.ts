import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @Length(2, 80)
  code!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  legalName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 32)
  taxId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @IsString()
  @Length(3, 3)
  defaultCurrencyCode!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class CreateExchangeRateDto {
  @IsString()
  @Length(3, 3)
  baseCurrencyCode!: string;

  @IsString()
  @Length(3, 3)
  quoteCurrencyCode!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  @Max(1_000_000_000)
  rate!: number;

  @IsISO8601()
  effectiveDate!: string;
}
