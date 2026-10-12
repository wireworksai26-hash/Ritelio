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
  CreateAccountDto,
  ReorderAccountDto,
  UpdateAccountDto,
} from './dto/account.dto';

/** Akun yang dipakai AkunModal di POS/laporan tidak boleh dihapus diam-diam. */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, companyId },
      include: { _count: { select: { journalLines: true, children: true } } },
      orderBy: { code: 'asc' },
    });
    return { data: accounts, companyId };
  }

  /** Pohon akun untuk UI tree, tanpa akun tanpa anak yang tidak punya saldo. */
  async tree(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, companyId },
      include: { _count: { select: { journalLines: true } } },
      orderBy: { code: 'asc' },
    });

    type Node = (typeof accounts)[number] & { children: Node[] };
    const nodes = new Map<string, Node>();
    for (const a of accounts) nodes.set(a.id, { ...a, children: [] });
    const roots: Node[] = [];
    for (const a of accounts) {
      const node = nodes.get(a.id)!;
      if (a.parentId && nodes.has(a.parentId)) nodes.get(a.parentId)!.children.push(node);
      else roots.push(node);
    }
    return { data: roots, companyId };
  }

  async create(tenantId: string, dto: CreateAccountDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const code = dto.code.trim();
    if (!/^\d{1,8}(\.\d{1,8})?$/.test(code)) {
      throw new BadRequestException('Kode akun harus numerik, boleh bertingkat (mis. 1.101).');
    }
    if (dto.parentId) await this.assertParent(tenantId, companyId, dto.parentId, null);

    try {
      return await this.prisma.chartOfAccount.create({
        data: {
          tenantId,
          companyId,
          code,
          name: dto.name.trim(),
          type: dto.type,
          parentId: dto.parentId ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Kode akun ${code} sudah dipakai pada company ini.`);
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateAccountDto) {
    const { companyId, account } = await this.assertAccount(tenantId, id);
    const nextParentId = dto.parentId === undefined ? account.parentId : dto.parentId;
    if (nextParentId) await this.assertParent(tenantId, companyId, nextParentId, id);

    if (dto.type && dto.type !== account.type) {
      const lines = await this.prisma.journalLine.count({ where: { accountId: id } });
      if (lines > 0) {
        throw new BadRequestException(
          'Tipe akun tidak bisa diubah setelah dipakai pada jurnal. Buat akun baru atau reversal.',
        );
      }
    }

    return this.prisma.chartOfAccount.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? account.name,
        type: dto.type ?? account.type,
        parentId: nextParentId,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const { account } = await this.assertAccount(tenantId, id);
    const [children, lines, openings] = await Promise.all([
      this.prisma.chartOfAccount.count({ where: { parentId: id } }),
      this.prisma.journalLine.count({ where: { accountId: id } }),
      this.prisma.openingBalance.count({ where: { accountId: id } }),
    ]);
    if (children > 0) throw new BadRequestException('Akun masih memiliki akun anak.');
    if (lines > 0 || openings > 0) {
      throw new BadRequestException(
        `Akun ${account.code} sudah dipakai pada jurnal/saldo awal dan tidak bisa dihapus. Gunakan akun koreksi atau reversal.`,
      );
    }
    await this.prisma.chartOfAccount.delete({ where: { id } });
    return { deleted: true, id };
  }

  /** Ubah kode akun tanpa menyentuh referensinya (id tetap). */
  async reorder(tenantId: string, dto: ReorderAccountDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const entries = dto.updates;
    if (entries.length === 0) throw new BadRequestException('Daftar perubahan kosong.');

    return this.prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        const account = await tx.chartOfAccount.findFirst({
          where: { id: entry.id, tenantId, companyId },
          select: { code: true },
        });
        if (!account) throw new NotFoundException('Akun tidak ditemukan pada company ini.');
        if (!/^\d{1,8}(\.\d{1,8})?$/.test(entry.code.trim())) {
          throw new BadRequestException(`Kode akun ${entry.code} tidak valid.`);
        }
      }
      for (const entry of entries) {
        await tx.chartOfAccount.update({
          where: { id: entry.id },
          data: { code: entry.code.trim() },
        });
      }
      return { updated: entries.length };
    });
  }

  private async assertAccount(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id, tenantId, companyId },
    });
    if (!account) throw new NotFoundException('Akun tidak ditemukan pada company ini.');
    return { companyId, account };
  }

  /** Parent harus satu company dan bukan descendant diri sendiri (mencegah siklus). */
  private async assertParent(
    tenantId: string,
    companyId: string,
    parentId: string,
    selfId: string | null,
  ): Promise<void> {
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === selfId) throw new BadRequestException('Akun tidak bisa menjadi induk dirinya sendiri.');
      if (seen.has(cursor)) throw new BadRequestException('Hierarki akun membentuk siklus.');
      seen.add(cursor);
      const parent: { parentId: string | null } | null = await this.prisma.chartOfAccount.findFirst({
        where: { id: cursor, tenantId, companyId },
        select: { parentId: true },
      });
      if (!parent) throw new NotFoundException('Akun induk tidak ditemukan pada company ini.');
      cursor = parent.parentId;
    }
  }
}