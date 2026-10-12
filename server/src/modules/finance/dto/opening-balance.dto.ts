import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OpeningBalanceLineDto {
  @IsString()
  @MaxLength(64)
  accountCode!: string;

  @IsIn(['debit', 'credit'])
  direction!: 'debit' | 'credit';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999_999_999_999.99)
  amount!: number;
}

export class CreateOpeningBalanceDto {
  @IsString()
  @MaxLength(64)
  periodId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceLineDto)
  lines!: OpeningBalanceLineDto[];
}
