import { Type } from 'class-transformer';
import {
  IsDateString,
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

export class RequisitionLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Jumlah diminta harus lebih dari 0.' })
  @Max(999_999_999.999)
  qty!: number;
}

export class CreateRequisitionDto {
  @IsOptional()
  @IsString()
  @Length(0, 255)
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines!: RequisitionLineDto[];
}

export class ApproveRequisitionDto {
  @IsBoolean()
  approve!: boolean;
}

export class TransferLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Jumlah transfer harus lebih dari 0.' })
  @Max(999_999_999.999)
  qty!: number;
}

export class CreateTransferDto {
  @IsString()
  fromWarehouseId!: string;

  @IsString()
  toWarehouseId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}

const REQUISITION_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'converted'] as const;

export class ListRequisitionQueryDto {
  @IsOptional()
  @IsIn(REQUISITION_STATUSES)
  status?: (typeof REQUISITION_STATUSES)[number];
}

/** Override per produk saat requisition dikonversi menjadi PO. */
export class ConvertLineOverrideDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Harga minimal 0,01.' })
  @Max(999_999_999_999.99)
  price?: number;
}

export class ConvertRequisitionDto {
  /** Gudang tujuan penerimaan; requisition sendiri tidak menyimpan gudang. */
  @IsString()
  warehouseId!: string;

  /** Dipakai untuk produk yang belum punya pemasok utama. */
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConvertLineOverrideDto)
  lines?: ConvertLineOverrideDto[];
}

export interface ReorderSuggestion {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reorderPoint: number;
  suggestedQty: number;
  estimatedCost: number;
  /** Null bila produk belum punya supplier default. */
  supplierId?: string | null;
}
export class GenerateReorderPoDto {
  /** Kirim notifikasi ke tenant bahwa ada draft PO baru menunggu persetujuan. */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;

  /** Batasi ke satu supplier; kosongkan untuk semua supplier. */
  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class ComputeVendorPerformanceDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}