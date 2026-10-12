import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_TX_ITEMS = 200;
export const MAX_BATCH_TRANSACTIONS = 50;
export const MAX_ITEM_QTY = 100_000;
export const MAX_ITEM_PRICE = 1_000_000_000;

// Panjang maks ID: cukup untuk UUID (36) maupun ID semantik milik client POS
// (mis. "p-nb-1"). Batas ini mencegah ID raksasa dipakai untuk exhaust.
const MAX_ID_LENGTH = 64;

export class TxItemDto {
  @IsString()
  @MaxLength(MAX_ID_LENGTH)
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_ITEM_QTY)
  qty!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_ITEM_PRICE)
  price!: number;
}

export class CreateTransactionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID_LENGTH)
  outletId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID_LENGTH)
  customerId?: string;

  // Kunci idempotensi dari client — aman untuk retry Background Sync
  @IsString()
  @MaxLength(120)
  clientGeneratedId!: string;

  @IsISO8601()
  clientTimestamp!: string;

  @IsIn(['cash', 'qris', 'debit', 'transfer', 'credit'])
  paymentMethod!: 'cash' | 'qris' | 'debit' | 'transfer' | 'credit';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => TxItemDto)
  items!: TxItemDto[];
}

export class BatchTransactionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_TRANSACTIONS)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionDto)
  transactions!: CreateTransactionDto[];
}

export class SalesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID_LENGTH)
  outletId?: string;

  @IsOptional()
  @IsIn(['pending', 'synced', 'needs_review'])
  syncStatus?: 'pending' | 'synced' | 'needs_review';

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

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

export interface SyncResultItem {
  invoice?: { id: string; number: string } | null;
  clientId: string;
  serverId: string | null;
  status: 'confirmed' | 'conflict' | 'duplicate';
  message?: string;
}
