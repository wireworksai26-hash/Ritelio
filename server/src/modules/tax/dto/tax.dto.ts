import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

export class RecordTaxPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Nominal pajak harus lebih dari 0.' })
  @Max(1_000_000_000_000)
  amount!: number;

  @IsOptional()
  @IsDateString()
  payDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  reference?: string;
}

const TAX_CATEGORIES = ['vat', 'withholding', 'other'] as const;
const TAX_DIRECTIONS = ['output', 'input'] as const;
const TAX_SOURCES = ['official', 'estimate'] as const;

export class TaxBracketDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lowerBound!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  upperBound?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  ratePercent!: number;
}

export class CreateTaxRuleDto {
  @IsString()
  @Length(2, 40)
  code!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEnum(TAX_CATEGORIES)
  category!: (typeof TAX_CATEGORIES)[number];

  @IsOptional()
  @IsEnum(TAX_DIRECTIONS)
  direction?: (typeof TAX_DIRECTIONS)[number];

  @IsString()
  @Length(2, 40)
  basisType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  rate?: number;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  sourceRef?: string;

  @IsOptional()
  @IsEnum(TAX_SOURCES)
  source?: (typeof TAX_SOURCES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TaxBracketDto)
  brackets?: TaxBracketDto[];
}

export class UpdateTaxRuleDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class CloseTaxRuleDto {
  @IsDateString()
  effectiveTo!: string;
}

export class QueryTaxComputationsDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  documentType?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}