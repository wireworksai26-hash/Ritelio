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
import { canAssignRole, roleHasPermission, roleRank, sanitizePermissionOverrides } from '../../common/rbac/permissions';
import { RefreshSessionService } from '../auth/refresh-session.service';
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

/** Owner aktif terakhir tidak boleh kehilangan role owner-nya. */
async function assertNotLastActiveOwner(
  prisma: PrismaService,
  tenantId: string,
  excludeUserId: string,
): Promise<void> {
  const activeOwners = await prisma.user.count({
    where: { tenantId, role: 'owner', isActive: true, id: { not: excludeUserId } },
  });
  if (activeOwners === 0) {
    throw new ConflictException('Owner aktif terakhir tidak boleh diubah perannya atau dinonaktifkan.');
  }
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: RefreshSessionService,
  ) {}

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

  async create(tenantId: string, dto: CreateUserDto, actor: AuthUser) {
    if (!canAssignRole(actor.role, dto.role)) {
      throw new ForbiddenException(
        'Anda tidak dapat membuat akun dengan peran setinggi atau di atas peran Anda.',
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email sudah dipakai di tenant ini.');
    }

    if (dto.outletIds?.length) await this.assertOutletsValid(tenantId, dto.outletIds);
    const role = await this.prisma.accessRole.findFirst({
      where: { tenantId, key: dto.role },
      select: { id: true },
    });
    if (!role) throw new BadRequestException('Peran belum dikonfigurasi pada tenant ini.');

    // Password sementara 12 karakter heksadesimal (acak kriptografis).
    // CATATAN PRODUKSI: password ini HARUS dikirim via email/undangan,
    // bukan lewat response API — di sini dikembalikan hanya untuk kemudahan dev.
    const temporaryPassword = randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email,
        role: dto.role,
        roleId: role.id,
        permissions: sanitizePermissionOverrides(dto.permissions) as Prisma.InputJsonValue,
        passwordHash,
        outlets: dto.outletIds?.length
          ? { create: dto.outletIds.map((outletId) => ({ outletId })) }
          : undefined,
      },
      select: USER_SELECT,
    });

    return { user, temporaryPassword };
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto, actor: AuthUser) {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!target) throw new NotFoundException('Pengguna tidak ditemukan.');

    // ── Otorisasi perubahan peran / izin / status aktif ──
    const touchesPrivileges =
      dto.role !== undefined || dto.permissions !== undefined || dto.isActive !== undefined;

    if (touchesPrivileges) {
      // Actor hanya boleh mengelola akun yang rank-nya STRICTLY di bawahnya,
      // sehingga admin tak pernah bisa menyentuh akun owner/admin lain.
      if (roleRank(target.role) >= roleRank(actor.role)) {
        throw new ForbiddenException(
          'Anda hanya dapat mengelola akun dengan peran di bawah peran Anda.',
        );
      }
      if (dto.role !== undefined && !canAssignRole(actor.role, dto.role)) {
        throw new ForbiddenException(
          'Anda tidak dapat memberikan peran setinggi atau di atas peran Anda.',
        );
      }
      // Override izin tidak boleh memberi izin yang tidak dimiliki actor sendiri.
      const override = sanitizePermissionOverrides(dto.permissions);
      for (const key of Object.keys(override)) {
        const perm = key as Parameters<typeof roleHasPermission>[2];
        if (override[key] === true && !roleHasPermission(actor.role, {}, perm)) {
          throw new ForbiddenException(
            `Anda tidak dapat memberi izin "${key}" karena tidak dimiliki oleh peran Anda.`,
          );
        }
      }
      const demotesLastOwner =
        (dto.role !== undefined && target.role === 'owner' && dto.role !== 'owner') ||
        (dto.isActive === false && target.role === 'owner');
      if (demotesLastOwner) {
        await assertNotLastActiveOwner(this.prisma, tenantId, target.id);
      }
    }

    const { outletIds, ...fields } = dto;

    const data: Prisma.UserUpdateInput = {};
    if (fields.name !== undefined) data.name = fields.name;
    if (fields.role !== undefined) {
      const role = await this.prisma.accessRole.findFirst({
        where: { tenantId, key: fields.role },
        select: { id: true },
      });
      if (!role) throw new BadRequestException('Peran belum dikonfigurasi pada tenant ini.');
      data.role = fields.role;
      data.databaseRole = {
        connect: { tenantId_id: { tenantId, id: role.id } },
      };
    }
    if (fields.permissions !== undefined) {
      data.permissions = sanitizePermissionOverrides(fields.permissions) as Prisma.InputJsonValue;
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
      await this.revokeIfPrivilegesChanged(id, fields);
      return user;
    }

    const result = await this.prisma.user.updateMany({ where: { id, tenantId }, data });
    if (result.count !== 1) throw new NotFoundException('Pengguna tidak ditemukan.');
    await this.revokeIfPrivilegesChanged(id, fields);
    return this.prisma.user.findFirstOrThrow({ where: { id, tenantId }, select: USER_SELECT });
  }

  /**
   * Menonaktifkan akun harus memutus sesi yang ada: refresh token dicabut dan
   * access token lama ditolak (tokensValidAfter). Perubahan role/izin tidak perlu
   * memutus sesi karena PermissionsGuard membaca role dan izin dari DB di tiap request.
   */
  private async revokeIfPrivilegesChanged(id: string, fields: { isActive?: boolean }): Promise<void> {
    if (fields.isActive === false) await this.sessions.revokeAllForUser(id, 'user_deactivated');
  }

  /** Soft delete: user tidak dihapus fisik, hanya dinonaktifkan. */
  async remove(tenantId: string, id: string, actor: AuthUser) {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!target) throw new NotFoundException('Pengguna tidak ditemukan.');

    if (target.id === actor.sub) {
      throw new ForbiddenException('Tidak bisa menghapus akun sendiri.');
    }
    if (!canAssignRole(actor.role, target.role)) {
      throw new ForbiddenException('Anda tidak dapat menonaktifkan pengguna dengan rank setinggi atau lebih tinggi.');
    }

    if (target.role === 'owner') {
      await assertNotLastActiveOwner(this.prisma, tenantId, target.id);
    }

    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    await this.sessions.revokeAllForUser(id, 'user_deactivated');
    return { id, isActive: false };
  }
}
