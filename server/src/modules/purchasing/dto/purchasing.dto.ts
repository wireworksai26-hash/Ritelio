import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Batas atas sesuai kolom database (Decimal(14,2) / Decimal(14,3)).
const MAX_MONEY = 999_999_999_999.99;
const MAX_QTY = 999_999_999.999;

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
  @MaxLength(64)
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Jumlah item minimal 0,01.' })
  @Max(MAX_QTY)
  qty!: number;

  // Harga 0 ditolak: baris PO zeroes membuat jurnal penerimaan bernilai 0.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Harga item minimal 0,01.' })
  @Max(MAX_MONEY)
  price!: number;
}

export class CreatePODto {
  @IsString()
  @MaxLength(64)
  supplierId!: string;

  @IsString()
  @MaxLength(64)
  warehouseId!: string;

  // Status awal PO: default draft, boleh langsung ordered
  @IsOptional()
  @IsIn(['draft', 'ordered'])
  status?: 'draft' | 'ordered';

  @IsArray()
  @ArrayMinSize(1, { message: 'PO wajib memiliki minimal satu item.' })
  @ArrayMaxSize(100)
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
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => POItemDto)
  items?: POItemDto[];
}

/**
 * Penerimaan barang. `rejections` memetakan id baris PO ke jumlah yang
 * ditolak; dipakai untuk skor kualitas vendor dan mengurangi tagihan.
 */
export class ReceiveOrderDto {
  @IsOptional()
  @IsObject({ message: 'rejections harus berupa objek {idBaris: jumlah}.' })
  rejections?: Record<string, number>;
}