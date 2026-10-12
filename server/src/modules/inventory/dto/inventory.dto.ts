import { Type } from 'class-transformer';
import { ToBoolean } from '../../../common/dto/to-boolean.transform';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';

// Batas atas sesuai kolom database: Decimal(14,2) dan Decimal(14,3).
// Nilai di atas ini akan overflow jadi 500 saat disimpan.
const MAX_MONEY = 999_999_999_999.99;
const MAX_QTY = 999_999_999.999;

const PRODUCT_TYPES = ['goods', 'raw_material', 'semi_finished', 'service'] as const;

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(PRODUCT_TYPES)
  productType?: (typeof PRODUCT_TYPES)[number];

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;

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
  @IsEnum(PRODUCT_TYPES)
  productType?: (typeof PRODUCT_TYPES)[number];

  @IsOptional()
  @IsString()
  @Length(1, 32)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Harga jual tidak boleh negatif.' })
  @Max(MAX_MONEY)
  sellPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Harga beli tidak boleh negatif.' })
  @Max(MAX_MONEY)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  reorderPoint?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  reorderQty?: number;

  @IsOptional()
  @IsString()
  preferredSupplierId?: string;
  @IsOptional()
  @IsString()
  @Length(1, 64)
  barcode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Stok awal tidak boleh negatif.' })
  @Max(MAX_QTY)
  initialStock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
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
  @IsEnum(PRODUCT_TYPES)
  productType?: (typeof PRODUCT_TYPES)[number];

  @IsOptional()
  @IsString()
  @Length(1, 32)
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Harga jual tidak boleh negatif.' })
  @Max(MAX_MONEY)
  sellPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Harga beli tidak boleh negatif.' })
  @Max(MAX_MONEY)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  reorderPoint?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  reorderQty?: number;

  @IsOptional()
  @IsString()
  preferredSupplierId?: string;
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
  @IsNotEmpty({ message: 'Kode gudang wajib diisi.' })
  @Length(2, 32)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'Kode gudang hanya boleh huruf, angka, titik, strip, dan underscore.',
  })
  code!: string;

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
  @Length(2, 32)
  @Matches(/^[A-Za-z0-9._-]+$/)
  code?: string;

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

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export class ListWarehouseQueryDto {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export class StockQueryDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;
}

export class AdjustStockDto {
  @IsString()
  @MaxLength(64)
  productId!: string;

  @IsString()
  @MaxLength(64)
  warehouseId!: string;

  // qty bertanda (positif = tambah, negatif = kurang), tidak boleh 0
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @NotEquals(0, { message: 'Jumlah penyesuaian tidak boleh nol.' })
  @Max(1_000_000_000)
  @Min(-1_000_000_000)
  qty!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
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
