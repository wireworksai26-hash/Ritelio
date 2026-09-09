import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama pemasok wajib diisi.' })
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  contact?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  contact?: string;
}

export class OrderQueryDto {
  @IsOptional()
  @IsIn(['draft', 'ordered', 'received', 'cancelled'])
  status?: 'draft' | 'ordered' | 'received' | 'cancelled';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class POItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.01, { message: 'Jumlah item minimal 0,01.' })
  qty!: number;

  @IsNumber()
  @Min(0, { message: 'Harga item tidak boleh negatif.' })
  price!: number;
}

export class CreatePODto {
  @IsString()
  supplierId!: string;

  @IsString()
  warehouseId!: string;

  // Status awal PO: default draft, boleh langsung ordered
  @IsOptional()
  @IsIn(['draft', 'ordered'])
  status?: 'draft' | 'ordered';

  @IsArray()
  @ArrayMinSize(1, { message: 'PO wajib memiliki minimal satu item.' })
  @ValidateNested({ each: true })
  @Type(() => POItemDto)
  items!: POItemDto[];
}

export class UpdatePODto {
  @IsOptional()
  @IsIn(['draft', 'ordered', 'cancelled'])
  status?: 'draft' | 'ordered' | 'cancelled';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'PO wajib memiliki minimal satu item.' })
  @ValidateNested({ each: true })
  @Type(() => POItemDto)
  items?: POItemDto[];
}
