import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import type {
  CreatePartyDto,
  ListPartyQueryDto,
  UpdatePartyDto,
} from './dto/party.dto';

const CODE_PREFIX = { supplier: 'SUPP', customer: 'CUST' } as const;
type PartyKind = keyof typeof CODE_PREFIX;

@Injectable()
export class PartyService {
  constructor(private readonly prisma: PrismaService) {}

  async listSuppliers(tenantId: string, query: ListPartyQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.supplier.findMany({
      where: {
        tenantId,
        companyId,
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { code: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async listCustomers(tenantId: string, query: ListPartyQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.customer.findMany({
      where: {
        tenantId,
        companyId,
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { code: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async createSupplier(tenantId: string, dto: CreatePartyDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.$transaction(async (tx) => {
      const code = dto.code?.trim()
        ? dto.code.trim().toUpperCase()
        : await this.nextCode(tx, 'supplier', tenantId, companyId);
      return tx.supplier.create({
        data: {
          tenantId,
          companyId,
          code,
          name: dto.name.trim(),
          contact: dto.contact ?? '',
          email: dto.email ?? '',
          phone: dto.phone ?? '',
          taxId: dto.taxId ?? null,
          address: dto.address ?? '',
          city: dto.city ?? '',
          paymentTermDays: dto.paymentTermDays ?? 0,
          creditLimit: dto.creditLimit != null ? new Prisma.Decimal(dto.creditLimit) : null,
        },
      });
    }).catch((error) => this.rethrowDuplicate(error, 'kode pemasok'));
  }

  async createCustomer(tenantId: string, dto: CreatePartyDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.$transaction(async (tx) => {
      const code = dto.code?.trim()
        ? dto.code.trim().toUpperCase()
        : await this.nextCode(tx, 'customer', tenantId, companyId);
      return tx.customer.create({
        data: {
          tenantId,
          companyId,
          code,
          name: dto.name.trim(),
          contact: dto.contact ?? '',
          email: dto.email ?? '',
          phone: dto.phone ?? '',
          taxId: dto.taxId ?? null,
          address: dto.address ?? '',
          city: dto.city ?? '',
          paymentTermDays: dto.paymentTermDays ?? 0,
          creditLimit: dto.creditLimit != null ? new Prisma.Decimal(dto.creditLimit) : null,
        },
      });
    }).catch((error) => this.rethrowDuplicate(error, 'kode pelanggan'));
  }

  async updateSupplier(tenantId: string, id: string, dto: UpdatePartyDto) {
    const { companyId } = await this.assertSupplier(tenantId, id);
    return this.prisma.supplier.update({
      where: { id },
      data: this.partyData(dto, companyId),
    });
  }

  async updateCustomer(tenantId: string, id: string, dto: UpdatePartyDto) {
    await this.assertCustomer(tenantId, id);
    return this.prisma.customer.update({ where: { id }, data: this.partyData(dto) });
  }

  /**
   * Soft delete: party yang sudah punya transaksi tidak boleh hilang dari
   * histori. Nonaktifkan (isActive=false) alih-alih menghapus baris.
   */
  async deactivateSupplier(tenantId: string, id: string) {
    await this.assertSupplier(tenantId, id);
    return this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
  }

  async deactivateCustomer(tenantId: string, id: string) {
    await this.assertCustomer(tenantId, id);
    return this.prisma.customer.update({ where: { id }, data: { isActive: false } });
  }

  /** Hapus fisik hanya bila belum pernah dipakai transaksi. */
  async deleteSupplier(tenantId: string, id: string) {
    await this.assertSupplier(tenantId, id);
    const used = await this.prisma.purchaseOrder.count({
      where: { tenantId, supplierId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        'Pemasok sudah dipakai pada pesanan pembelian. Nonaktifkan (soft delete) sebagai gantinya.',
      );
    }
    await this.prisma.supplier.delete({ where: { id } });
    return { ok: true };
  }

  async deleteCustomer(tenantId: string, id: string) {
    await this.assertCustomer(tenantId, id);
    const used = await this.prisma.salesTransaction.count({
      where: { tenantId, customerId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        'Pelanggan sudah dipakai pada transaksi penjualan. Nonaktifkan (soft delete) sebagai gantinya.',
      );
    }
    await this.prisma.customer.delete({ where: { id } });
    return { ok: true };
  }

  private partyData(dto: UpdatePartyDto, companyId?: string) {
    const data: Record<string, unknown> = {};
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.contact !== undefined) data.contact = dto.contact;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.taxId !== undefined) data.taxId = dto.taxId || null;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.paymentTermDays !== undefined) data.paymentTermDays = dto.paymentTermDays;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.creditLimit !== undefined) {
      data.creditLimit = dto.creditLimit === null ? null : new Prisma.Decimal(dto.creditLimit);
    }
    void companyId;
    return data;
  }

  private async assertSupplier(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId, companyId } });
    if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan.');
    return { companyId, supplier };
  }

  private async assertCustomer(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId, companyId } });
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan.');
    return { companyId, customer };
  }

  /** Nomor urut kosmetik, bukan dokumen legal, jadi retry P2002 cukup. */
  private async nextCode(
    tx: Prisma.TransactionClient,
    kind: PartyKind,
    tenantId: string,
    companyId: string,
  ): Promise<string> {
    const prefix = CODE_PREFIX[kind];
    for (let attempt = 0; attempt < 5; attempt++) {
      const count =
        kind === 'supplier'
          ? await tx.supplier.count({ where: { tenantId, companyId } })
          : await tx.customer.count({ where: { tenantId, companyId } });
      const code = `${prefix}-${String(count + 1 + attempt).padStart(5, '0')}`;
      const exists =
        kind === 'supplier'
          ? await tx.supplier.findFirst({ where: { tenantId, companyId, code }, select: { id: true } })
          : await tx.customer.findFirst({ where: { tenantId, companyId, code }, select: { id: true } });
      if (!exists) return code;
    }
    throw new BadRequestException('Gagal membuat kode party otomatis, coba lagi.');
  }

  private rethrowDuplicate(error: unknown, label: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${label} sudah dipakai pada company ini.`);
    }
    throw error;
  }
}