import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { CreateUserDto, UpdateUserDto } from './dto/user.dto';

// Field aman untuk API — passwordHash & twoFactorSecret TIDAK PERNAH dikembalikan.
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  permissions: true,
  isActive: true,
  twoFactorEnabled: true,
  createdAt: true,
  outlets: { select: { outlet: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validasi semua outletId milik tenant ini. */
  private async assertOutletsValid(tenantId: string, outletIds: string[]) {
    const found = await this.prisma.outlet.count({
      where: { tenantId, id: { in: outletIds } },
    });
    if (found !== outletIds.length) {
      throw new BadRequestException('Ada outlet yang tidak valid untuk tenant ini.');
    }
  }

  async list(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email sudah dipakai di tenant ini.');
    }

    if (dto.outletIds?.length) await this.assertOutletsValid(tenantId, dto.outletIds);

    // Password sementara 10 karakter heksadesimal (acak kriptografis).
    // CATATAN PRODUKSI: password ini HARUS dikirim via email/undangan,
    // bukan lewat response API — di sini dikembalikan hanya untuk kemudahan dev.
    const temporaryPassword = randomBytes(5).toString('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email,
        role: dto.role,
        permissions: (dto.permissions ?? {}) as Prisma.InputJsonValue,
        passwordHash,
        outlets: dto.outletIds?.length
          ? { create: dto.outletIds.map((outletId) => ({ outletId })) }
          : undefined,
      },
      select: USER_SELECT,
    });

    return { user, temporaryPassword };
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!target) throw new NotFoundException('Pengguna tidak ditemukan.');

    const { outletIds, ...fields } = dto;

    const data: Prisma.UserUpdateInput = {};
    if (fields.name !== undefined) data.name = fields.name;
    if (fields.role !== undefined) data.role = fields.role;
    if (fields.permissions !== undefined) {
      data.permissions = fields.permissions as Prisma.InputJsonValue;
    }
    if (fields.isActive !== undefined) data.isActive = fields.isActive;

    // Jika outletIds dikirim: hapus semua relasi lama lalu buat ulang (atomic)
    if (outletIds) {
      await this.assertOutletsValid(tenantId, outletIds);
      const [, user] = await this.prisma.$transaction([
        this.prisma.userOutlet.deleteMany({ where: { userId: id } }),
        this.prisma.user.update({
          where: { id },
          data: {
            ...data,
            outlets: outletIds.length
              ? { create: outletIds.map((outletId) => ({ outletId })) }
              : undefined,
          },
          select: USER_SELECT,
        }),
      ]);
      return user;
    }

    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }

  /** Soft delete: user tidak dihapus fisik, hanya dinonaktifkan. */
  async remove(tenantId: string, id: string, actor: AuthUser) {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!target) throw new NotFoundException('Pengguna tidak ditemukan.');

    if (target.id === actor.sub) {
      throw new ForbiddenException('Tidak bisa menghapus akun sendiri.');
    }

    if (target.role === 'owner') {
      const activeOwners = await this.prisma.user.count({
        where: { tenantId, role: 'owner', isActive: true },
      });
      if (activeOwners <= 1) {
        throw new ConflictException('Owner aktif terakhir tidak bisa dinonaktifkan.');
      }
    }

    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { id, isActive: false };
  }
}
