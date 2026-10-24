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
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';
import { ensureTenantRoles } from '../../common/rbac/ensure-tenant-roles';
import { canAssignRole, roleRank, sanitizePermissionOverrides } from '../../common/rbac/permissions';
import { ensureFiscalCalendar } from '../../common/utils/fiscal-calendar';
import { RefreshSessionService } from '../auth/refresh-session.service';
import type { UpdateOneSignalConfigDto } from '../notifications/dto/notification-push.dto';
import { OneSignalService } from '../notifications/onesignal.service';
import type {
  CreateSuperadminTenantDto,
  CreateSuperadminUserDto,
  UpdateSuperadminTenantDto,
  UpdateSuperadminUserDto,
} from './dto/superadmin.dto';
import { platformOnlyFieldsIn } from './tenant-change-policy';

const DEFAULT_MODULES = [
  { key: 'inventory', label: 'Inventori', description: 'Stok, gudang, stok opname' },
  { key: 'pos', label: 'Kasir (POS)', description: 'Transaksi penjualan dan cetak struk' },
  { key: 'finance', label: 'Keuangan', description: 'Laba rugi dan arus kas' },
  { key: 'assistant', label: 'Retalio Intelligence', description: 'Asisten bisnis dan analisis AI' },
  { key: 'production', label: 'Produksi', description: 'BOM, batch, dan work order' },
  { key: 'booking', label: 'Booking & Jadwal', description: 'Penjadwalan layanan pelanggan' },
];

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class SuperadminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: RefreshSessionService,
    private readonly oneSignal: OneSignalService,
  ) {}

  async overview(callerTenantId: string, actor: AuthUser) {
    const isSuperadmin = actor.role === 'superadmin';
    const tenantWhere: Prisma.TenantWhereInput = isSuperadmin ? {} : { id: callerTenantId };
    const monthKey = currentYearMonth();

    const dbStart = Date.now();
    const [tenantsRaw, usersRaw, auditRaw, activeSessionsCount] = await Promise.all([
      this.prisma.tenant.findMany({
        where: tenantWhere,
        include: {
          _count: { select: { outlets: true, users: true } },
          usageCounters: { where: { month: monthKey }, select: { count: true }, take: 1 },
          modulesConfig: { select: { moduleKey: true, isActive: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.user.findMany({
        where: isSuperadmin ? {} : { tenantId: callerTenantId },
        select: {
          id: true,
          tenantId: true,
          name: true,
          email: true,
          role: true,
          permissions: true,
          isActive: true,
          twoFactorEnabled: true,
          createdAt: true,
          outlets: { select: { outletId: true }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take: 250,
      }),
      this.prisma.auditLog.findMany({
        where: isSuperadmin ? {} : { tenantId: callerTenantId },
        include: {
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 80,
      }),
      this.prisma.refreshSession.count({
        where: {
          ...(isSuperadmin ? {} : { tenantId: callerTenantId }),
          revokedAt: null,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    const dbLatencyMs = Math.max(1, Date.now() - dbStart);

    const tenants = tenantsRaw.map((t) => {
      const settingsObj =
        t.settings && typeof t.settings === 'object' && !Array.isArray(t.settings)
          ? (t.settings as Record<string, unknown>)
          : {};
      const defaultLimit =
        t.subscriptionPlan === 'basic' ? 0 : t.subscriptionPlan === 'plus_ai' ? 3000 : 25000;
      const aiQuotaLimit =
        typeof settingsObj.aiQuotaLimit === 'number' ? settingsObj.aiQuotaLimit : defaultLimit;
      const monthlyRevenue =
        typeof settingsObj.monthlyRevenue === 'number' ? settingsObj.monthlyRevenue : 0;
      const status =
        settingsObj.status === 'suspended' || settingsObj.status === 'trial'
          ? settingsObj.status
          : 'active';
      const modulesMap: Record<string, boolean> = {};
      for (const m of t.modulesConfig) {
        modulesMap[m.moduleKey] = m.isActive;
      }

      return {
        id: t.id,
        name: t.name,
        industry_template: t.industryTemplate,
        subscription_plan: t.subscriptionPlan,
        status,
        created_at: t.createdAt.toISOString(),
        monthly_revenue: monthlyRevenue,
        outlets_count: t._count.outlets,
        users_count: t._count.users,
        ai_quota_used: t.usageCounters[0]?.count ?? 0,
        ai_quota_limit: aiQuotaLimit,
        modules: modulesMap,
        settings: settingsObj,
      };
    });

    const users = usersRaw.map((u) => ({
      id: u.id,
      tenant_id: u.tenantId,
      name: u.name,
      email: u.email,
      role: u.role,
      permissions:
        u.permissions && typeof u.permissions === 'object' && !Array.isArray(u.permissions)
          ? (u.permissions as Record<string, boolean>)
          : {},
      is_active: u.isActive,
      two_factor_enabled: u.twoFactorEnabled,
      outlet_id: u.outlets[0]?.outletId ?? null,
      created_at: u.createdAt.toISOString(),
    }));

    const auditLogs = auditRaw.map((a) => ({
      id: a.id,
      tenant_id: a.tenantId,
      user_id: a.userId ?? 'system',
      user_name: a.user?.name || a.user?.email || 'Sistem Retalio',
      action: `${a.entity.toUpperCase()}_${a.action.toUpperCase()}`,
      category:
        a.entity.includes('auth') || a.action === 'login' || a.action === 'refresh'
          ? 'auth'
          : a.entity.includes('sale') || a.entity.includes('pos')
            ? 'transaction'
            : a.entity.includes('product') || a.entity.includes('stock') || a.entity.includes('inventory')
              ? 'inventory'
              : a.entity.includes('bill') || a.entity.includes('journal') || a.entity.includes('finance')
                ? 'billing'
                : 'system',
      details: a.reason || `Operasi ${a.action} pada entitas ${a.entity}${a.entityId ? ` (${a.entityId})` : ''}`,
      ip_address: a.ipAddress ?? '127.0.0.1',
      timestamp: a.createdAt.toISOString(),
      status: a.outcome === 'failure' ? 'error' : 'success',
    }));

    return {
      tenants,
      users,
      auditLogs,
      oneSignal: this.oneSignal.getAdminConfig(),
      diagnostics: {
        databaseStatus: 'up',
        dbLatencyMs,
        activeSessionsCount,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        nimConfigured: Boolean(process.env.NIM_API_KEY?.trim()),
        nimBaseUrl: process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
        nimModel: process.env.NIM_MODEL || 'meta/llama-3.1-8b-instruct',
        oneSignalConfigured: this.oneSignal.getPublicConfig().configured,
        checkedAt: new Date().toISOString(),
      },
    };
  }

  async createTenant(callerTenantId: string, actor: AuthUser, dto: CreateSuperadminTenantDto) {
    // Tenant baru lengkap dengan paket dan kuota AI-nya hanya boleh dibuat superadmin platform. Sebelumnya owner
    // dan admin pun boleh, sehingga tenant bisa dibuat sebanyak-banyaknya dengan paket custom (AI tak terbatas).
    if (actor.role !== 'superadmin') {
      throw new ForbiddenException('Hanya superadmin platform yang dapat membuat tenant baru.');
    }
    const plan = dto.subscriptionPlan ?? 'plus_ai';
    const defaultQuota = plan === 'basic' ? 0 : plan === 'plus_ai' ? 3000 : 25000;
    const aiQuotaLimit = dto.aiQuotaLimit ?? defaultQuota;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.currency.upsert({
        where: { code: 'IDR' },
        update: {},
        create: { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimalPlaces: 0 },
      });

      for (const m of DEFAULT_MODULES) {
        await tx.moduleCatalog.upsert({
          where: { key: m.key },
          update: {},
          create: m,
        });
      }

      const tenant = await tx.tenant.create({
        data: {
          name: dto.name.trim(),
          industryTemplate: dto.industryTemplate,
          subscriptionPlan: plan,
          settings: {
            currency: 'IDR',
            timezone: 'Asia/Jakarta',
            status: 'active',
            aiQuotaLimit,
            monthlyRevenue: 0,
            createdByTenantId: callerTenantId,
          } as Prisma.InputJsonValue,
        },
      });

      const company = await tx.company.create({
        data: {
          tenantId: tenant.id,
          code: 'MAIN',
          name: tenant.name,
          legalName: tenant.name,
          defaultCurrencyCode: 'IDR',
        },
      });

      await ensureFiscalCalendar(tx, tenant.id, company.id, new Date().getUTCFullYear());
      await ensureTenantRoles(tx, tenant.id);

      const trialEnds = new Date();
      trialEnds.setUTCDate(trialEnds.getUTCDate() + 14);
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan,
          status: 'trialing',
          aiQuota: aiQuotaLimit,
          endsAt: trialEnds,
        },
      });

      const outlet = await tx.outlet.create({
        data: {
          tenantId: tenant.id,
          name: dto.outletName?.trim() || `${tenant.name} - Pusat`,
          address: dto.outletAddress?.trim() || 'Kantor Pusat',
        },
      });

      await tx.warehouse.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          code: 'WH-MAIN',
          outletId: outlet.id,
          name: `Gudang Utama ${tenant.name}`,
          location: outlet.address,
        },
      });

      for (const m of DEFAULT_MODULES) {
        await tx.moduleConfig.create({
          data: {
            tenantId: tenant.id,
            moduleKey: m.key,
            isActive: m.key === 'assistant' ? plan !== 'basic' : true,
          },
        });
      }

      return tenant;
    });

    return {
      id: created.id,
      name: created.name,
      industry_template: created.industryTemplate,
      subscription_plan: created.subscriptionPlan,
      status: 'active',
      created_at: created.createdAt.toISOString(),
      monthly_revenue: 0,
      outlets_count: 1,
      users_count: 0,
      ai_quota_used: 0,
      ai_quota_limit: aiQuotaLimit,
    };
  }

  async updateTenant(
    callerTenantId: string,
    id: string,
    actor: AuthUser,
    dto: UpdateSuperadminTenantDto,
  ) {
    const isSuperadmin = actor.role === 'superadmin';
    if (!isSuperadmin && id !== callerTenantId) {
      throw new NotFoundException('Tenant tidak ditemukan.');
    }
    if (!isSuperadmin) {
      const platformOnly = platformOnlyFieldsIn(dto);
      if (platformOnly.length > 0) {
        throw new ForbiddenException(`Hanya superadmin platform yang dapat mengubah ${platformOnly.join(', ')}.`);
      }
    }

    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tenant tidak ditemukan.');

    const currentSettings =
      existing.settings && typeof existing.settings === 'object' && !Array.isArray(existing.settings)
        ? (existing.settings as Record<string, unknown>)
        : {};

    const nextSettings: Record<string, unknown> = { ...currentSettings };
    if (dto.status !== undefined) nextSettings.status = dto.status;
    if (dto.aiQuotaLimit !== undefined) nextSettings.aiQuotaLimit = dto.aiQuotaLimit;
    if (dto.monthlyRevenue !== undefined) nextSettings.monthlyRevenue = dto.monthlyRevenue;

    const updated = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.industryTemplate !== undefined ? { industryTemplate: dto.industryTemplate } : {}),
          ...(dto.subscriptionPlan !== undefined ? { subscriptionPlan: dto.subscriptionPlan } : {}),
          settings: nextSettings as Prisma.InputJsonValue,
        },
      });

      if (dto.resetAiQuota) {
        const month = currentYearMonth();
        await tx.aiUsageCounter.upsert({
          where: { tenantId_month: { tenantId: id, month } },
          update: { count: 0 },
          create: { tenantId: id, month, count: 0 },
        });
      }

      if (dto.modules && typeof dto.modules === 'object') {
        for (const [moduleKey, isActive] of Object.entries(dto.modules)) {
          if (typeof isActive !== 'boolean') continue;
          const cat = await tx.moduleCatalog.findUnique({ where: { key: moduleKey } });
          if (!cat) continue;
          await tx.moduleConfig.upsert({
            where: { tenantId_moduleKey: { tenantId: id, moduleKey } },
            update: { isActive },
            create: { tenantId: id, moduleKey, isActive },
          });
        }
      }

      return tenant;
    });

    return {
      ok: true,
      tenant: {
        id: updated.id,
        name: updated.name,
        industry_template: updated.industryTemplate,
        subscription_plan: updated.subscriptionPlan,
        settings: nextSettings,
      },
    };
  }

  async createUser(callerTenantId: string, actor: AuthUser, dto: CreateSuperadminUserDto) {
    const isSuperadmin = actor.role === 'superadmin';
    if (!canAssignRole(actor.role, dto.role)) {
      throw new ForbiddenException(
        'Anda tidak dapat membuat akun dengan peran setinggi atau di atas peran Anda.',
      );
    }

    const targetTenantId =
      isSuperadmin && dto.targetTenantId ? dto.targetTenantId.trim() : callerTenantId;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: targetTenantId } });
    if (!tenant) throw new NotFoundException('Tenant tujuan tidak ditemukan.');

    const cleanEmail = dto.email.trim().toLowerCase();
    const duplicate = await this.prisma.user.findFirst({
      where: { tenantId: targetTenantId, email: cleanEmail },
    });
    if (duplicate) {
      throw new ConflictException('Email sudah terdaftar pada tenant tersebut.');
    }

    let accessRole = await this.prisma.accessRole.findFirst({
      where: { tenantId: targetTenantId, key: dto.role },
      select: { id: true },
    });
    if (!accessRole) {
      const roleIds = await this.prisma.$transaction((tx) => ensureTenantRoles(tx, targetTenantId));
      const newRoleId = roleIds[dto.role];
      if (!newRoleId) throw new BadRequestException('Peran tidak valid.');
      accessRole = { id: newRoleId };
    }

    const plainPassword = dto.password?.trim() || randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        tenantId: targetTenantId,
        name: dto.name.trim(),
        email: cleanEmail,
        role: dto.role,
        roleId: accessRole.id,
        passwordHash,
        permissions: sanitizePermissionOverrides(dto.permissions) as Prisma.InputJsonValue,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        permissions: true,
        createdAt: true,
      },
    });

    return {
      user,
      temporaryPassword: plainPassword,
    };
  }

  async updateUser(
    callerTenantId: string,
    id: string,
    actor: AuthUser,
    dto: UpdateSuperadminUserDto,
  ) {
    const isSuperadmin = actor.role === 'superadmin';
    const target = await this.prisma.user.findFirst({
      where: isSuperadmin ? { id } : { id, tenantId: callerTenantId },
    });
    if (!target) throw new NotFoundException('Pengguna tidak ditemukan.');

    if (!isSuperadmin) {
      if (roleRank(target.role) >= roleRank(actor.role)) {
        throw new ForbiddenException(
          'Anda hanya dapat mengelola akun dengan peran di bawah peran Anda.',
        );
      }
      if (dto.role !== undefined && !canAssignRole(actor.role, dto.role)) {
        throw new ForbiddenException(
          'Anda tidak dapat menetapkan peran setinggi atau di atas peran Anda.',
        );
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.permissions !== undefined) {
      data.permissions = sanitizePermissionOverrides(dto.permissions) as Prisma.InputJsonValue;
    }
    if (dto.newPassword !== undefined && dto.newPassword.trim().length >= 6) {
      data.passwordHash = await bcrypt.hash(dto.newPassword.trim(), 10);
      data.tokensValidAfter = new Date();
    }

    if (dto.role !== undefined) {
      let accessRole = await this.prisma.accessRole.findFirst({
        where: { tenantId: target.tenantId, key: dto.role },
        select: { id: true },
      });
      if (!accessRole) {
        const roleIds = await this.prisma.$transaction((tx) =>
          ensureTenantRoles(tx, target.tenantId),
        );
        if (roleIds[dto.role]) accessRole = { id: roleIds[dto.role] };
      }
      if (accessRole) {
        data.role = dto.role;
        data.databaseRole = {
          connect: { tenantId_id: { tenantId: target.tenantId, id: accessRole.id } },
        };
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data,
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        permissions: true,
        createdAt: true,
      },
    });

    if (dto.isActive === false || dto.newPassword !== undefined) {
      await this.sessions.revokeAllForUser(target.id, 'superadmin_security_update');
    }

    return { ok: true, user: updated };
  }

  async revokeUserSessions(callerTenantId: string, id: string, actor: AuthUser) {
    const isSuperadmin = actor.role === 'superadmin';
    const target = await this.prisma.user.findFirst({
      where: isSuperadmin ? { id } : { id, tenantId: callerTenantId },
      select: { id: true, tenantId: true, role: true, email: true },
    });
    if (!target) throw new NotFoundException('Pengguna tidak ditemukan.');

    if (!isSuperadmin && roleRank(target.role) >= roleRank(actor.role)) {
      throw new ForbiddenException(
        'Anda hanya dapat mencabut sesi akun dengan peran di bawah peran Anda.',
      );
    }

    await this.sessions.revokeAllForUser(target.id, 'superadmin_force_logout');
    return {
      ok: true,
      userId: target.id,
      email: target.email,
      revokedAt: new Date().toISOString(),
    };
  }

  async updateOneSignalConfig(callerTenantId: string, dto: UpdateOneSignalConfigDto) {
    return this.oneSignal.updateConfig(callerTenantId, dto);
  }
}
