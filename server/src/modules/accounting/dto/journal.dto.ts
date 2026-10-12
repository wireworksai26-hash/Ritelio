import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

const JOURNAL_STATUSES = ['draft', 'posted', 'voided'] as const;

export class ListJournalsDto {
  @IsOptional()
  @IsEnum(JOURNAL_STATUSES)
  status?: (typeof JOURNAL_STATUSES)[number];

  @IsOptional()
  @IsString()
  @Length(1, 64)
  sourceModule?: string;

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

  @IsOptional()
  @IsString()
  cursor?: string;
}

export class ReverseJournalDto {
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  memo?: string;
}

export class ManualJournalLineDto {
  @IsString()
  @Length(1, 64)
  accountId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  debit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  credit?: number;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  memo?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  partnerId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  projectId?: string;
}

export class CreateManualJournalDto {
  @IsDateString()
  entryDate!: string;

  @IsString()
  @Length(3, 500)
  memo!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ManualJournalLineDto)
  lines!: ManualJournalLineDto[];
}
