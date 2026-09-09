import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  NotEquals,
} from 'class-validator';

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

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

export class CreateProductDto {
  // SKU opsional: dibuat otomatis di service bila kosong
  @IsOptional()
  @IsString()
  @Length(1, 64)
  sku?: string;

  @IsString()
  @IsNotEmpty({ message: 'Nama produk wajib diisi.' })
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  unit?: string;

  @IsNumber()
  @Min(0, { message: 'Harga jual tidak boleh negatif.' })
  sellPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Harga beli tidak boleh negatif.' })
  costPrice?: number;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  barcode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Stok awal tidak boleh negatif.' })
  initialStock?: number;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}

// DTO update ditulis manual (bukan PartialType) sesuai kontrak
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  sku?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Harga jual tidak boleh negatif.' })
  sellPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Harga beli tidak boleh negatif.' })
  costPrice?: number;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  barcode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductLookupQueryDto {
  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  sku?: string;
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama kategori wajib diisi.' })
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama gudang wajib diisi.' })
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  outletId?: string;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  outletId?: string;
}

export class StockQueryDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;
}

export class AdjustStockDto {
  @IsString()
  productId!: string;

  @IsString()
  warehouseId!: string;

  // qty bertanda (positif = tambah, negatif = kurang), tidak boleh 0
  @IsNumber()
  @NotEquals(0, { message: 'Jumlah penyesuaian tidak boleh nol.' })
  qty!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class MovementQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;

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
