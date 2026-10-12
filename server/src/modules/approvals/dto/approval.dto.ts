import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

export class ApprovalStepDto {
  /** Id role `AccessRole` yang harus menyetujui tahap ini. */
  @IsOptional()
  @IsString()
  approverRoleId?: string;

  /** Alternatif dari role: whoever punya permission ini boleh memutuskan. */
  @IsOptional()
  @IsString()
  requiredPermission?: string;
}

export class SubmitApprovalDto {
  /** Jenis dokumen yang meminta persetujuan, mis. `purchase_requisition`. */
  @IsString()
  @Length(2, 60)
  documentType!: string;

  @IsString()
  @Length(1, 64)
  documentId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDto)
  steps!: ApprovalStepDto[];
}

export class DecideApprovalDto {
  @IsEnum(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}