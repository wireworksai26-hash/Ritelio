import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class TxItemDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.01)
  qty!: number;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateTransactionDto {
  @IsOptional()
  @IsString()
  outletId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  // Kunci idempotensi dari client — aman untuk retry Background Sync
  @IsString()
  clientGeneratedId!: string;

  @IsISO8601()
  clientTimestamp!: string;

  @IsIn(['cash', 'qris', 'debit', 'transfer'])
  paymentMethod!: 'cash' | 'qris' | 'debit' | 'transfer';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TxItemDto)
  items!: TxItemDto[];
}

export class BatchTransactionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionDto)
  transactions!: CreateTransactionDto[];
}

export interface SyncResultItem {
  clientId: string;
  serverId: string | null;
  status: 'confirmed' | 'conflict' | 'duplicate';
  message?: string;
}
