import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

const DOC_STATUSES = ['open', 'partial', 'paid', 'voided'] as const;

export class ListDocumentQueryDto {
  @IsOptional()
  @IsEnum(DOC_STATUSES)
  status?: (typeof DOC_STATUSES)[number];

  @IsOptional()
  @IsString()
  customerId?: string;
}

export class CreateReceiptDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Nominal penerimaan harus lebih dari 0.' })
  @Max(1_000_000_000_000)
  amount!: number;

  @IsOptional()
  @IsIn(['cash', 'qris', 'debit', 'transfer'])
  method?: 'cash' | 'qris' | 'debit' | 'transfer';

  @IsOptional()
  @IsDateString({}, { message: 'Tanggal terima tidak valid.' })
  payDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  note?: string;
}