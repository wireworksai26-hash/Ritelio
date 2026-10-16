import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { NimNotConfiguredError, NimService } from '../ai/nim.service';
import { roundMoney } from '../../common/utils/money';
import type { CreateBillDto } from '../payables/dto/payable.dto';
import { PayablesService } from '../payables/payables.service';

/** Di bawah ini hasil OCR dianggap perlu diperiksa manusia. */
const CONFIDENCE_THRESHOLD = 0.7;

/**
 * OCR struk/invoice.
 *
 * Hasil model TIDAK pernah langsung membuat dokumen akuntansi. Yang terjadi
 * hanya parsing tersimpan berstatus `needs_review`; pembuatan faktur tetap
 * keputusan manusia. Ini batas yang disengaja: tanpa itu, satu foto buram
 * bisa menciptakan kewajiban pajak fiktif.
 */
@Injectable()
export class OcrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nim: NimService,
    private readonly payables: PayablesService,
  ) {}

  async list(tenantId: string, status?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.ocrResult.findMany({
      where: { tenantId, companyId, ...(status ? { status: status as never } : {}) },
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async submit(
    tenantId: string,
    dto: { fileName: string; mimeType: string; dataBase64: string },
    userId?: string,
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (!dto.dataBase64) throw new BadRequestException('Gambar tidak boleh kosong.');
    if (!dto.mimeType.startsWith('image/')) {
      throw new BadRequestException('Hanya berkas gambar yang didukung (jpg/png/webp).');
    }
    // 8 MB setelah decode ≈ 11 MB base64.
    if (dto.dataBase64.length > 11_000_000) {
      throw new BadRequestException('Ukuran berkas melebihi 8 MB.');
    }

    const record = await this.prisma.ocrResult.create({
      data: {
        tenantId,
        companyId,
        source: 'upload',
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        status: 'pending',
        createdById: userId ?? null,
      },
    });

    try {
      const dataUrl = `data:${dto.mimeType};base64,${dto.dataBase64}`;
      const result = await this.nim.vision(dataUrl, 'invoice retail Indonesia');
      const fields = (result.raw ?? {}) as Record<string, unknown>;
      const confidence = scoreConfidence(fields);

      return this.prisma.ocrResult.update({
        where: { id: record.id },
        data: {
          status: confidence >= CONFIDENCE_THRESHOLD ? 'processed' : 'needs_review',
          rawText: result.text.slice(0, 20_000),
          fields: fields as Prisma.InputJsonValue,
          confidence: new Prisma.Decimal(confidence),
        },
      });
    } catch (error) {
      const failed = await this.prisma.ocrResult.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 500) : 'Kesalahan tidak diketahui',
        },
      });
      // Layanan OCR memang belum dipasang: itu kegagalan layanan (503) dengan pesan
      // yang jelas, bukan "berhasil" 201 berisi baris gagal yang mudah terlewat.
      if (error instanceof NimNotConfiguredError) {
        throw new ServiceUnavailableException(
          'Layanan OCR belum dikonfigurasi (NIM_API_KEY kosong). Hubungi admin untuk mengaktifkannya; berkas dicatat sebagai gagal (id ' + failed.id + ').',
        );
      }
      return failed;
    }
  }

  /** Koreksi hasil OCR oleh manusia lalu tetapkan sebagai final. */
  async review(tenantId: string, id: string, fields: Record<string, unknown>) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const record = await this.prisma.ocrResult.findFirst({ where: { id, tenantId, companyId } });
    if (!record) throw new NotFoundException('Hasil OCR tidak ditemukan.');
    if (record.status === 'failed') {
      throw new BadRequestException('Hasil OCR gagal diproses dan tidak bisa direview.');
    }
    return this.prisma.ocrResult.update({
      where: { id },
      data: {
        fields: fields as Prisma.InputJsonValue,
        status: 'processed',
        confidence: new Prisma.Decimal(1),
        reviewedAt: new Date(),
      },
    });
  }

  /**
   * Jadikan hasil OCR sebagai tagihan pemasok.
   *
   * Nilai tagihan SELALU berasal dari body (yang sudah dikoreksi pengguna),
   * bukan dari `fields` hasil model — sesuai batas di atas: model tidak pernah
   * membuat dokumen akuntansi. Hasil `needs_review` harus disimpan lewat review
   * dulu. Satu hasil OCR hanya boleh melahirkan satu tagihan: klaim atomik
   * lewat kunci `ocr-bill:<id>` di transaksi yang sama dengan tagihannya.
   */
  async createBill(tenantId: string, id: string, dto: CreateBillDto, userId?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const record = await this.prisma.ocrResult.findFirst({ where: { id, tenantId, companyId } });
    if (!record) throw new NotFoundException('Hasil OCR tidak ditemukan.');
    if (record.status === 'failed' || record.status === 'pending') {
      throw new BadRequestException('Hasil OCR belum berhasil diproses dan tidak bisa dijadikan tagihan.');
    }
    if (record.status === 'needs_review') {
      throw new BadRequestException('Hasil OCR belum diperiksa. Simpan koreksi Anda dulu sebelum membuat tagihan.');
    }
    const existing = (record.fields ?? {}) as Record<string, unknown>;
    if (typeof existing.billId === 'string') {
      throw new ConflictException(
        `Hasil OCR ini sudah dijadikan tagihan${typeof existing.billNumber === 'string' ? ` ${existing.billNumber}` : ''}.`,
      );
    }

    return this.payables.createBill(tenantId, dto, {
      actorId: userId,
      idempotencyKey: `ocr-bill:${id}`,
      source: `Dari OCR ${id.slice(0, 8)}`,
      onCreated: async (tx, bill) => {
        const current = await tx.ocrResult.findUniqueOrThrow({ where: { id }, select: { fields: true } });
        await tx.ocrResult.update({
          where: { id },
          data: {
            fields: {
              ...((current.fields ?? {}) as Record<string, unknown>),
              billId: bill.id,
              billNumber: bill.number,
            } as Prisma.InputJsonValue,
          },
        });
      },
    });
  }

  async detail(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.ocrResult.findFirst({ where: { id, tenantId, companyId } });
  }
}

/**
 * Keyakinan kasar: jumlah field wajib yang terbaca. Sengaja konservatif —
 * model sering mengisi field null sambil tetap terlihat yakin.
 */
function scoreConfidence(fields: Record<string, unknown>): number {
  const required = ['invoiceNumber', 'invoiceDate', 'total', 'supplierName'];
  const present = required.filter((key) => {
    const v = fields[key];
    return v !== null && v !== undefined && v !== '';
  });
  const total = Number(fields.total);
  const totalValid = Number.isFinite(total) && total > 0;
  return roundMoney((present.length / required.length) * (totalValid ? 1 : 0.6));
}