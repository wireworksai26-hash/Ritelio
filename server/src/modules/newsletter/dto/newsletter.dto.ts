import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const NEWSLETTER_STATUSES = ['pending', 'confirmed', 'unsubscribed'] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUSES)[number];

/** Batas panjang alamat email menurut RFC 5321. */
export const MAX_EMAIL_LENGTH = 254;

export class SubscribeDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Alamat email tidak valid.' })
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  /** Kolom jebakan untuk bot: pengunjung sungguhan tidak pernah mengisinya (disembunyikan di tampilan). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class ListSubscribersQueryDto {
  @IsOptional()
  @IsIn(NEWSLETTER_STATUSES)
  status?: NewsletterStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

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
