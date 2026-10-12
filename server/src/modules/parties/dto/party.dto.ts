import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ToBoolean } from '../../../common/dto/to-boolean.transform';

export class CreatePartyDto {
  @IsOptional()
  @IsString()
  @Length(2, 32)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Kode hanya boleh huruf, angka, titik, strip, dan underscore' })
  code?: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  contact?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email tidak valid' })
  @Length(0, 160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  taxId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  creditLimit?: number;
}

export class UpdatePartyDto {
  @IsOptional()
  @IsString()
  @Length(2, 32)
  @Matches(/^[A-Za-z0-9._-]+$/)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  contact?: string;

  @IsOptional()
  @IsEmail({})
  @Length(0, 160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  taxId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  creditLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListPartyQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
