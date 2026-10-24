import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';
import type { ListOnboardingQueryDto, UpdateOnboardingDto } from './dto/intake.dto';
import { extractKnownFields, type IntakePayload } from './intake-parse';

// Data awal klien berisi data pribadi dan data usaha: hanya superadmin platform yang boleh membaca dan mengubahnya.
function assertSuperadmin(actor: AuthUser): void {
  if (actor.role !== 'superadmin') {
    throw new ForbiddenException('Hanya superadmin platform yang dapat mengakses data awal klien.');
  }
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cocokkan email yang diisi klien dengan akun Retalio. Hanya dipakai bila tepat satu tenant yang cocok (email tidak
   * unik antar tenant) dan bukan akun superadmin; hasilnya sekadar petunjuk untuk sales, bukan dasar akses apa pun.
   */
  private async matchTenant(email: string | null): Promise<string | null> {
    if (!email) return null;
    const users = await this.prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, role: { not: 'superadmin' } },
      select: { tenantId: true },
      take: 5,
    });
    const tenants = new Set(users.map((u) => u.tenantId));
    return tenants.size === 1 ? [...tenants][0] : null;
  }

  /** Simpan satu kiriman. ID respons Google unik: pengiriman ulang mengembalikan data yang sama tanpa baris ganda. */
  async ingest(payload: IntakePayload): Promise<{ id: string; duplicate: boolean }> {
    const known = extractKnownFields(payload.answers);
    const tenantId = await this.matchTenant(known.contactEmail);
    try {
      const row = await this.prisma.onboardingSubmission.create({
        data: {
          externalId: payload.responseId,
          formId: payload.formId,
          submittedAt: payload.submittedAt,
          contactName: known.contactName,
          contactEmail: known.contactEmail,
          contactPhone: known.contactPhone,
          tenantId,
          answers: payload.answers as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return { id: row.id, duplicate: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.onboardingSubmission.findUnique({
          where: { externalId: payload.responseId },
          select: { id: true },
        });
        if (existing) return { id: existing.id, duplicate: true };
      }
      throw err;
    }
  }

  /** Nama tenant untuk baris yang punya petunjuk tenantId; satu query untuk seluruh halaman. */
  private async tenantNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const tenants = await this.prisma.tenant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(tenants.map((t) => [t.id, t.name]));
  }

  async list(actor: AuthUser, query: ListOnboardingQueryDto) {
    assertSuperadmin(actor);
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const where: Prisma.OnboardingSubmissionWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.onboardingSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        // Daftar tidak membawa seluruh jawaban; itu ada di detail.
        select: {
          id: true,
          createdAt: true,
          submittedAt: true,
          contactName: true,
          contactEmail: true,
          contactPhone: true,
          tenantId: true,
          status: true,
        },
      }),
      this.prisma.onboardingSubmission.count({ where }),
    ]);
    const names = await this.tenantNames(rows.map((r) => r.tenantId));
    const data = rows.map((r) => ({ ...r, tenantName: r.tenantId ? (names.get(r.tenantId) ?? null) : null }));
    return { data, meta: { page, limit, total } };
  }

  async get(actor: AuthUser, id: string) {
    assertSuperadmin(actor);
    const row = await this.prisma.onboardingSubmission.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Data awal klien tidak ditemukan.');
    const names = await this.tenantNames([row.tenantId]);
    return { ...row, tenantName: row.tenantId ? (names.get(row.tenantId) ?? null) : null };
  }

  async update(actor: AuthUser, id: string, dto: UpdateOnboardingDto) {
    assertSuperadmin(actor);
    await this.get(actor, id);
    return this.prisma.onboardingSubmission.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
  }
}
