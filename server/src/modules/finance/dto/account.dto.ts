import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
export type AccountTypeInput = (typeof ACCOUNT_TYPES)[number];

export class CreateAccountDto {
  @IsString()
  @Length(1, 17)
  code!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsEnum(ACCOUNT_TYPES)
  type!: AccountTypeInput;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @IsOptional()
  @IsEnum(ACCOUNT_TYPES)
  type?: AccountTypeInput;

  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class ReorderAccountDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReorderAccountItemDto)
  updates!: ReorderAccountItemDto[];
}

export class ReorderAccountItemDto {
  @IsString()
  id!: string;

  @IsString()
  @Length(1, 17)
  code!: string;
}