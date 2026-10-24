import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';
import { NimNotConfiguredError, NimService } from '../ai/nim.service';
import type { ListIntakeQueryDto, UpdateIntakeDto } from './dto/intake.dto';
import { buildAnalysisMessages, parseAnalysis, type IntakeAnalysis } from './intake-analysis';
import { extractKnownFields, type IntakeAnswer, type IntakePayload } from './intake-parse';

/** Pesan galat untuk disimpan: tanpa isi respons model dan dipotong, supaya tidak membocorkan detail. */
function briefError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Galat tidak dikenal';
  return message.slice(0, 200);
}

// Pengajuan calon klien berisi data pribadi: hanya superadmin platform yang boleh membaca dan mengubahnya.
function assertSuperadmin(actor: AuthUser): void {
  if (actor.role !== 'superadmin') {
    throw new ForbiddenException('Hanya superadmin platform yang dapat mengakses pengajuan calon klien.');
  }
}

@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nim: NimService,
  ) {}

  /**
   * Simpan satu pengajuan dari webhook. ID respons Google unik: pengiriman ulang (retry skrip) mengembalikan
   * data yang sama tanpa membuat baris ganda dan tanpa menganalisis ulang.
   */
  async ingest(payload: IntakePayload): Promise<{ id: string; duplicate: boolean }> {
    const known = extractKnownFields(payload.answers);
    try {
      const row = await this.prisma.intakeSubmission.create({
        data: {
          externalId: payload.responseId,
          formId: payload.formId,
          submittedAt: payload.submittedAt,
          ...known,
          answers: payload.answers as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      // Analisis berjalan di latar belakang: Google tidak boleh menunggu model AI (batas waktu skrip pendek).
      void this.runAnalysis(row.id).catch((err) => this.logger.warn(`Analisis pengajuan ${row.id} gagal: ${briefError(err)}`));
      return { id: row.id, duplicate: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.intakeSubmission.findUnique({
          where: { externalId: payload.responseId },
          select: { id: true },
        });
        if (existing) return { id: existing.id, duplicate: true };
      }
      throw err;
    }
  }

  /** Jalankan analisis AI dan simpan hasilnya. Tidak melempar bila model gagal: statusnya dicatat di baris. */
  private async runAnalysis(id: string) {
    const row = await this.prisma.intakeSubmission.findUnique({ where: { id }, select: { id: true, answers: true } });
    if (!row) throw new NotFoundException('Pengajuan tidak ditemukan.');
    const { system, user } = buildAnalysisMessages(row.answers as unknown as IntakeAnswer[]);

    try {
      const result = await this.nim.complete({ system, user, maxTokens: 700, temperature: 0.2 });
      const analysis = parseAnalysis(result.text);
      if (!analysis) {
        return this.saveAnalysis(id, { status: 'failed', error: 'Balasan AI tidak dapat dibaca. Coba analisis ulang.', model: result.model });
      }
      return this.saveAnalysis(id, { status: 'done', analysis, model: result.model });
    } catch (err) {
      if (err instanceof NimNotConfiguredError) {
        return this.saveAnalysis(id, { status: 'skipped', error: 'Analisis AI belum aktif: NIM_API_KEY belum diisi di server.' });
      }
      return this.saveAnalysis(id, { status: 'failed', error: briefError(err) });
    }
  }

  private saveAnalysis(
    id: string,
    result: { status: 'done' | 'skipped' | 'failed'; analysis?: IntakeAnalysis; model?: string; error?: string },
  ) {
    return this.prisma.intakeSubmission.update({
      where: { id },
      data: {
        analysisStatus: result.status,
        analysis: result.analysis ? (result.analysis as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        analysisModel: result.model ?? null,
        analysisError: result.error ?? null,
        analyzedAt: new Date(),
      },
    });
  }

  async list(actor: AuthUser, query: ListIntakeQueryDto) {
    assertSuperadmin(actor);
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const where: Prisma.IntakeSubmissionWhereInput = query.status ? { status: query.status } : {};
    const [data, total] = await Promise.all([
      this.prisma.intakeSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        // Daftar tidak membawa seluruh jawaban dan analisis lengkap; itu ada di detail.
        select: {
          id: true,
          createdAt: true,
          submittedAt: true,
          contactName: true,
          contactEmail: true,
          contactPhone: true,
          businessType: true,
          employeeRange: true,
          status: true,
          analysisStatus: true,
          analysis: true,
        },
      }),
      this.prisma.intakeSubmission.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async get(actor: AuthUser, id: string) {
    assertSuperadmin(actor);
    const row = await this.prisma.intakeSubmission.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pengajuan tidak ditemukan.');
    return row;
  }

  async update(actor: AuthUser, id: string, dto: UpdateIntakeDto) {
    assertSuperadmin(actor);
    await this.get(actor, id);
    return this.prisma.intakeSubmission.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
  }

  /** Analisis ulang atas permintaan superadmin (mis. setelah NIM_API_KEY diisi atau balasan sebelumnya gagal). */
  async reanalyze(actor: AuthUser, id: string) {
    assertSuperadmin(actor);
    await this.get(actor, id);
    return this.runAnalysis(id);
  }
}
