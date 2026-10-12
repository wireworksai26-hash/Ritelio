import { IsOptional, IsString, Length, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

export class ReportQueryDto {
  /** Tanggal cutoff laporan (YYYY-MM-DD). Default: hari ini. */
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'Format tanggal harus YYYY-MM-DD.' })
  asOf?: string;

  /** Awal periode untuk buku besar. */
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'Format tanggal harus YYYY-MM-DD.' })
  from?: string;

  /**
   * Mata uang tampilan laporan (IDR/USD/SGD). Nominal dikonversi memakai
   * kurs yang berlaku pada `asOf`. Kosongkan untuk memakai mata uang dasar
   * perusahaan.
   */
  @IsOptional()
  @IsString()
  @Matches(CURRENCY, { message: 'Kode mata uang harus 3 huruf kapital, misal IDR.' })
  currency?: string;
}

/** Reporting satu mata uang yang sudah dikonversi dari semua company dalam grup. */
export class ConsolidationQueryDto {
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'Format tanggal harus YYYY-MM-DD.' })
  asOf?: string;

  @IsOptional()
  @IsString()
  @Matches(CURRENCY, { message: 'Kode mata uang harus 3 huruf kapital, misal IDR.' })
  currency?: string;

  /** Batasi ke anak perusahaan tertentu; kosongkan untuk seluruh grup. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  companyId?: string;
}