import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import type { CreateTaxRuleDto, UpdateTaxRuleDto } from './dto/tax.dto';

/**
 * CRUD aturan dan bracket pajak. Angka tarif adalah data — bukan konstanta di
 * kode — supaya perubahan regulasi cukup lewat seed/UI, bukan deploy ulang.
 * `source: 'official'` menandai angka yang siap produksi; `estimate` hanya
 * boleh dipakai untuk simulasi dan selalu diberi badge di response.
 */
@Injectable()
export class TaxRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.taxRule.findMany({
      where: { tenantId, companyId },
      include: { brackets: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateTaxRuleDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (dto.brackets && dto.brackets.length > 0 && dto.rate !== undefined && dto.rate !== null) {
      throw new BadRequestException('Aturan dengan bracket tidak boleh juga punya tarif tetap.');
    }
    if (dto.category !== 'withholding' && (!dto.brackets || dto.brackets.length === 0) && dto.rate === undefined) {
      throw new BadRequestException('Tarif wajib diisi untuk pajak bukan bracket.');
    }

    try {
      return await this.prisma.taxRule.create({
        data: {
          tenantId,
          companyId,
          code: dto.code,
          name: dto.name,
          category: dto.category,
          direction: dto.direction ?? (dto.category === 'vat' ? 'output' : 'output'),
          basisType: dto.basisType,
          rate: dto.rate === undefined || dto.rate === null ? null : new Prisma.Decimal(dto.rate),
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
          sourceRef: dto.sourceRef ?? null,
          source: dto.source ?? 'estimate',
          brackets: dto.brackets?.length
            ? {
                // tenantId/companyId sengaja tidak diisi: FK komposit (tenantId, companyId, taxRuleId)
                // diturunkan Prisma dari rule induk, dan menyertakannya membuat create ditolak.
                create: dto.brackets.map((b, i) => ({
                  sortOrder: i + 1,
                  lowerBound: new Prisma.Decimal(b.lowerBound),
                  upperBound: b.upperBound === undefined || b.upperBound === null ? null : new Prisma.Decimal(b.upperBound),
                  ratePercent: new Prisma.Decimal(b.ratePercent),
                  effectiveFrom: new Date(dto.effectiveFrom),
                })),
              }
            : undefined,
        },
        include: { brackets: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `Aturan "${dto.code}" dengan tanggal berlaku sama sudah ada. Gunakan tanggal berbeda untuk versi baru.`,
        );
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateTaxRuleDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const rule = await this.prisma.taxRule.findFirst({ where: { id, tenantId, companyId } });
    if (!rule) throw new NotFoundException('Aturan pajak tidak ditemukan.');

    return this.prisma.taxRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.effectiveTo !== undefined
          ? { effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null }
          : {}),
      },
      include: { brackets: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /**
   * Menutup versi aktif dengan tanggal tertentu alih-alih mengubah tarifnya.
   * Aturan yang sudah dipakai perhitungan tidak boleh berubah nilainya, karena
   * `TaxComputation.ruleSnapshot` harus tetap bisa dibaca apa adanya.
   */
  async closeVersion(tenantId: string, id: string, effectiveTo: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const rule = await this.prisma.taxRule.findFirst({ where: { id, tenantId, companyId } });
    if (!rule) throw new NotFoundException('Aturan pajak tidak ditemukan.');

    const to = new Date(effectiveTo);
    if (to <= rule.effectiveFrom) {
      throw new BadRequestException('Tanggal berakhir harus setelah tanggal mulai berlaku.');
    }
    const used = await this.prisma.taxComputation.count({ where: { taxRuleId: id } });
    if (used > 0) {
      throw new ConflictException(
        `Aturan ini sudah dipakai ${used} perhitungan. Buat versi baru, jangan mengubah nilai yang sudah terpakai.`,
      );
    }
    return this.prisma.taxRule.update({ where: { id }, data: { effectiveTo: to, isActive: false } });
  }

  /** Riwayat perhitungan pajak — jejak audit untuk pemeriksaan. */
  async computations(tenantId: string, filter: { documentType?: string; from?: Date; to?: Date; take?: number }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.taxComputation.findMany({
      where: {
        tenantId,
        companyId,
        ...(filter.documentType ? { documentType: filter.documentType } : {}),
        ...(filter.from || filter.to
          ? {
              computedAt: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lt: filter.to } : {}),
              },
            }
          : {}),
      },
      include: { taxRule: { select: { code: true, name: true, source: true, rate: true } } },
      orderBy: { computedAt: 'desc' },
      take: filter.take ?? 50,
    });
  }
}