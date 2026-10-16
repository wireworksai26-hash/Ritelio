import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ToBoolean } from '../../../common/dto/to-boolean.transform';

export class CreateStockOpDto {
  @IsString()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  note?: string;
}

export class CountStockOpLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  countedQty!: number;
}

export class CountStockOpLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CountStockOpLineDto)
  lines!: CountStockOpLineDto[];
}

export class CloseStockOpDto {
  @IsOptional()
  @IsString()
  @Length(0, 255)
  note?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  force?: boolean;
}

const OP_STATUSES = ['open', 'closed'] as const;

export class ListStockOpQueryDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsIn(OP_STATUSES)
  status?: (typeof OP_STATUSES)[number];
}
