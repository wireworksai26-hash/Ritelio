import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOutletDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateOutletDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
