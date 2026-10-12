import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { ensureFiscalCalendar } from '../../common/utils/fiscal-calendar';
import type { CreateCompanyDto, CreateExchangeRateDto } from './dto/company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.company.findMany({
      where: { tenantId },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        defaultCurrency: true,
      },
      orderBy: [{ parentId: 'asc' }, { code: 'asc' }],
    });
  }

  currencies() {
    return this.prisma.currency.findMany({ orderBy: { code: 'asc' } });
  }

  async create(tenantId: string, dto: CreateCompanyDto) {
    const code = dto.code.trim().toUpperCase();
    const defaultCurrencyCode = dto.defaultCurrencyCode.trim().toUpperCase();
    const currency = await this.prisma.currency.findUnique({ where: { code: defaultCurrencyCode } });
    if (!currency) throw new NotFoundException('Mata uang tidak terdaftar.');
    if (dto.parentId) {
      const parent = await this.prisma.company.findFirst({ where: { id: dto.parentId, tenantId } });
      if (!parent) throw new NotFoundException('Perusahaan induk tidak ditemukan pada tenant ini.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            tenantId,
            code,
            name: dto.name.trim(),
            legalName: dto.legalName?.trim() ?? null,
            taxId: dto.taxId?.trim() ?? null,
            countryCode: dto.countryCode?.toUpperCase() ?? 'ID',
            defaultCurrencyCode,
            parentId: dto.parentId ?? null,
          },
          include: { defaultCurrency: true },
        });

        await ensureFiscalCalendar(tx, tenantId, company.id, new Date().getUTCFullYear());

        // A new accounting entity starts with the tenant's main company chart of
        // accounts. Account codes remain company-local and can then diverge.
        const main = await tx.company.findFirst({
          where: { tenantId, code: 'MAIN' },
          select: { id: true },
        });
        if (main) {
          const mainAccounts = await tx.chartOfAccount.findMany({
            where: { tenantId, companyId: main.id },
            orderBy: { code: 'asc' },
          });
          const accountIds = new Map(mainAccounts.map((account) => [account.id, randomUUID()]));
          if (mainAccounts.length > 0) {
            await tx.chartOfAccount.createMany({
              data: mainAccounts.map((account) => ({
                id: accountIds.get(account.id)!,
                tenantId,
                companyId: company.id,
                code: account.code,
                name: account.name,
                type: account.type,
                parentId: account.parentId ? accountIds.get(account.parentId) ?? null : null,
              })),
            });
          }
        }
        return company;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Kode perusahaan "${code}" sudah digunakan.`);
      }
      throw error;
    }
  }

  async exchangeRates(tenantId: string, companyId: string) {
    await this.assertCompany(tenantId, companyId);
    return this.prisma.exchangeRate.findMany({
      where: { tenantId, companyId },
      include: { baseCurrency: true, quoteCurrency: true },
      orderBy: [{ effectiveDate: 'desc' }, { baseCurrencyCode: 'asc' }],
    });
  }

  async setExchangeRate(tenantId: string, companyId: string, dto: CreateExchangeRateDto) {
    await this.assertCompany(tenantId, companyId);
    const baseCurrencyCode = dto.baseCurrencyCode.toUpperCase();
    const quoteCurrencyCode = dto.quoteCurrencyCode.toUpperCase();
    if (baseCurrencyCode === quoteCurrencyCode) {
      throw new BadRequestException('Mata uang asal dan tujuan harus berbeda.');
    }
    const currencies = await this.prisma.currency.count({
      where: { code: { in: [baseCurrencyCode, quoteCurrencyCode] } },
    });
    if (currencies !== 2) throw new NotFoundException('Mata uang asal atau tujuan tidak terdaftar.');

    return this.prisma.exchangeRate.upsert({
      where: {
        tenantId_companyId_baseCurrencyCode_quoteCurrencyCode_effectiveDate: {
          tenantId,
          companyId,
          baseCurrencyCode,
          quoteCurrencyCode,
          effectiveDate: new Date(`${dto.effectiveDate.slice(0, 10)}T00:00:00.000Z`),
        },
      },
      update: { rate: new Prisma.Decimal(dto.rate), source: 'manual' },
      create: {
        tenantId,
        companyId,
        baseCurrencyCode,
        quoteCurrencyCode,
        rate: new Prisma.Decimal(dto.rate),
        effectiveDate: new Date(`${dto.effectiveDate.slice(0, 10)}T00:00:00.000Z`),
        source: 'manual',
      },
      include: { baseCurrency: true, quoteCurrency: true },
    });
  }

  private async assertCompany(tenantId: string, companyId: string): Promise<void> {
    const exists = await this.prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Perusahaan tidak ditemukan pada tenant ini.');
  }
}
