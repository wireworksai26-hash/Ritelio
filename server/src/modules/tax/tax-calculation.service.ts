import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { roundMoney } from '../../common/utils/money';

export interface TaxCalculationInput {
  tenantId: string;
  companyId: string;
  code: string;
  effectiveAt: Date;
  baseAmount: number;
  documentType: string;
  documentId: string;
}

@Injectable()
export class TaxCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a versioned rule, calculate without embedding statutory rates in
   * code, and persist the exact rule snapshot used for later audit/recalculation.
   * Rates are fractions (for example 0.11 means 11%). No rules are seeded until
   * their official source has been supplied and verified.
   */
  async calculate(input: TaxCalculationInput) {
    if (!Number.isFinite(input.baseAmount) || input.baseAmount < 0) {
      throw new BadRequestException('Dasar pengenaan pajak harus berupa angka non-negatif.');
    }

    const rule = await this.prisma.taxRule.findFirst({
      where: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        code: input.code,
        isActive: true,
        effectiveFrom: { lte: input.effectiveAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveAt } }],
      },
      include: { brackets: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!rule) throw new NotFoundException(`Aturan pajak aktif "${input.code}" tidak ditemukan.`);

    let tax = 0;
    if (rule.rate !== null) {
      tax = input.baseAmount * Number(rule.rate);
    } else if (rule.brackets.length > 0) {
      for (const bracket of rule.brackets) {
        const lower = Number(bracket.lowerBound);
        const upper = bracket.upperBound === null ? input.baseAmount : Number(bracket.upperBound);
        const taxableInBracket = Math.max(0, Math.min(input.baseAmount, upper) - lower);
        tax += taxableInBracket * Number(bracket.ratePercent);
      }
    } else {
      throw new ConflictException(`Aturan pajak "${input.code}" belum memiliki tarif atau bracket.`);
    }

    const amount = roundMoney(tax);
    const snapshot = {
      code: rule.code,
      name: rule.name,
      category: rule.category,
      basisType: rule.basisType,
      rate: rule.rate === null ? null : Number(rule.rate),
      source: rule.source,
      sourceRef: rule.sourceRef,
      effectiveFrom: rule.effectiveFrom.toISOString(),
      effectiveTo: rule.effectiveTo?.toISOString() ?? null,
      brackets: rule.brackets.map((bracket) => ({
        lowerBound: Number(bracket.lowerBound),
        upperBound: bracket.upperBound === null ? null : Number(bracket.upperBound),
        rate: Number(bracket.ratePercent),
      })),
    };

    const computation = await this.prisma.taxComputation.create({
      data: {
        tenantId: input.tenantId,
        companyId: input.companyId,
        taxRuleId: rule.id,
        documentType: input.documentType,
        documentId: input.documentId,
        baseAmount: new Prisma.Decimal(roundMoney(input.baseAmount)),
        taxAmount: new Prisma.Decimal(amount),
        source: rule.source,
        ruleSnapshot: snapshot,
      },
    });

    return { id: computation.id, baseAmount: roundMoney(input.baseAmount), taxAmount: amount, source: rule.source, snapshot };
  }
}
