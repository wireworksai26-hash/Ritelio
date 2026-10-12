import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const DOC_STATUSES = ['open', 'partial', 'paid', 'voided'] as const;

export class ListDocumentQueryDto {
  @IsOptional()
  @IsEnum(DOC_STATUSES)
  status?: (typeof DOC_STATUSES)[number];

  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class CreatePaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Nominal pembayaran harus lebih dari 0.' })
  @Max(1_000_000_000_000)
  amount!: number;

  @IsOptional()
  @IsIn(['cash', 'qris', 'debit', 'transfer'])
  method?: 'cash' | 'qris' | 'debit' | 'transfer';

  @IsOptional()
  @IsDateString({}, { message: 'Tanggal bayar tidak valid.' })
  payDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  note?: string;
}

const MAX_MONEY = 999_999_999_999.99;

/** Satu baris beban/aset pada tagihan pemasok. Nilainya DPP (sebelum PPN). */
export class BillLineDto {
  @IsString()
  @IsNotEmpty({ message: 'Akun beban/aset wajib dipilih.' })
  @MaxLength(64)
  accountId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Nilai baris tagihan harus lebih dari 0.' })
  @Max(MAX_MONEY)
  amount!: number;
}

/** Input tagihan pemasok manual, juga dipakai saat tagihan dibuat dari hasil OCR. */
export class CreateBillDto {
  @IsString()
  @IsNotEmpty({ message: 'Pemasok wajib dipilih.' })
  @MaxLength(64)
  supplierId!: string;

  /** Nomor faktur yang tertera di dokumen pemasok; dipakai mencegah input ganda. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  supplierInvoiceNumber?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Tanggal tagihan tidak valid.' })
  billDate?: string;

  /** Kosong = tanggal tagihan + termin pembayaran pemasok. */
  @IsOptional()
  @IsDateString({}, { message: 'Tanggal jatuh tempo tidak valid.' })
  dueDate?: string;

  /** Default true: PPN masukan dihitung tax engine bila ada aturan aktif. */
  @IsOptional()
  @IsBoolean()
  applyTax?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  note?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Minimal satu baris tagihan.' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  lines!: BillLineDto[];
}
