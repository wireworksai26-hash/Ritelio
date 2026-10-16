import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @Length(0, 160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  source?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;
}

export class CreateCustomerDto {
  @IsOptional()
  @IsString()
  @Length(2, 32)
  @Matches(/^[A-Za-z0-9._-]+$/)
  code?: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  contact?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @Length(0, 160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermDays?: number;
}

const STAGES = [
  'prospecting',
  'qualification',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

export class CreateOpportunityDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  value?: number;

  @IsOptional()
  @IsIn(STAGES)
  stage?: (typeof STAGES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;
}

export class DocumentLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Jumlah harus lebih dari 0.' })
  @Max(999_999_999.999)
  qty!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Harga harus lebih dari 0.' })
  @Max(1_000_000_000)
  price!: number;
}

export class CreateQuotationDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  opportunityId?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineDto)
  lines!: DocumentLineDto[];
}

export class CreateSalesOrderDto {
  @IsString()
  customerId!: string;

  @IsString()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  quotationId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineDto)
  lines!: DocumentLineDto[];
}

const INTERACTION_TYPES = ['call', 'email', 'visit', 'meeting', 'note'] as const;

export class CreateInteractionDto {
  @IsOptional()
  @IsIn(INTERACTION_TYPES)
  type?: (typeof INTERACTION_TYPES)[number];

  @IsString()
  @Length(2, 255)
  summary!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  detail?: string;

  @IsOptional()
  @IsDateString()
  interactionDate?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  salesTransactionId?: string;
}

export class CreateComplaintDto {
  @IsString()
  customerId!: string;

  @IsString()
  @Length(3, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  salesTransactionId?: string;
}

export class ResolveComplaintDto {
  @IsOptional()
  @IsIn(['in_progress', 'resolved'])
  status?: 'in_progress' | 'resolved';

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  resolution?: string;
}

/** Transisi status prospek; lompatan tahap ditolak oleh service. */
export class MoveStageDto {
  @IsIn(['new', 'contacted', 'qualified', 'converted', 'lost'])
  status!: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}

/** Transisi tahap deal; urutan dijaga oleh service. */
export class MoveOpportunityDto {
  @IsIn(['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'])
  stage!: 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}

export class MoveQuotationDto {
  @IsIn(['sent', 'accepted', 'rejected', 'expired', 'converted'])
  status!: 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
}

/**
 * Konversi penawaran → pesanan. Baris TIDAK bisa dikirim dari klien: diambil
 * dari penawaran supaya yang ditagih persis yang disetujui pelanggan.
 */
export class ConvertQuotationDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;
}