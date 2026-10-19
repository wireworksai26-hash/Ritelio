import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type {
  BroadcastPushDto,
  NotificationTypeValue,
  RegisterPushSubscriptionDto,
  TestPushDto,
  UpdateOneSignalConfigDto,
} from './dto/notification-push.dto';

export interface OneSignalChannelsConfig {
  lowStock: boolean;
  approval: boolean;
  aiDigest: boolean;
  syncConflict: boolean;
  broadcast: boolean;
}

export interface OneSignalRuntimeConfig {
  enabled: boolean;
  appId: string;
  restApiKey: string;
  safariWebId: string;
  channels: OneSignalChannelsConfig;
  updatedAt: string | null;
}

export interface PushBroadcastLogEntry {
  id: string;
  title: string;
  body: string;
  type: NotificationTypeValue;
  link: string;
  targetTenantId: string;
  targetRole: string;
  mode: 'onesignal_live' | 'inapp_fallback';
  oneSignalId: string | null;
  recipients: number;
  inAppCreated: number;
  sentBy: string;
  sentAt: string;
  status: 'delivered' | 'queued_inapp' | 'partial_error';
  errorMessage?: string;
}

export interface SubscribedDeviceRecord {
  userId: string;
  tenantId: string;
  subscriptionId: string;
  externalId: string;
  deviceType: string;
  permissionGranted: boolean;
  tags: Record<string, string>;
  updatedAt: string;
}

function maskSecret(secret: string): string {
  const clean = secret.trim();
  if (!clean) return '';
  if (clean.length <= 8) return '********';
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

@Injectable()
export class OneSignalService {
  private readonly logger = new Logger(OneSignalService.name);

  private config: OneSignalRuntimeConfig = {
    enabled: Boolean(process.env.ONESIGNAL_APP_ID?.trim()),
    appId: (process.env.ONESIGNAL_APP_ID ?? '').trim(),
    restApiKey: (process.env.ONESIGNAL_REST_API_KEY ?? '').trim(),
    safariWebId: (process.env.ONESIGNAL_SAFARI_WEB_ID ?? '').trim(),
    channels: {
      lowStock: true,
      approval: true,
      aiDigest: true,
      syncConflict: true,
      broadcast: true,
    },
    updatedAt: null,
  };

  private readonly devices = new Map<string, SubscribedDeviceRecord>();
  private readonly history: PushBroadcastLogEntry[] = [];

  constructor(private readonly prisma: PrismaService) {}

  getPublicConfig() {
    const hasAppId = Boolean(this.config.appId);
    const hasApiKey = Boolean(this.config.restApiKey);
    return {
      enabled: this.config.enabled,
      configured: hasAppId && hasApiKey,
      sdkReady: hasAppId,
      appId: this.config.appId || null,
      safariWebId: this.config.safariWebId || null,
      hasRestApiKey: hasApiKey,
      maskedRestApiKey: hasApiKey ? maskSecret(this.config.restApiKey) : null,
      channels: this.config.channels,
      subscribedDevicesCount: this.devices.size,
      updatedAt: this.config.updatedAt,
    };
  }

  getAdminConfig() {
    return {
      ...this.getPublicConfig(),
      history: this.history.slice(0, 30),
      devices: Array.from(this.devices.values()).slice(0, 50),
    };
  }

  async updateConfig(tenantId: string, dto: UpdateOneSignalConfigDto) {
    if (dto.appId !== undefined) this.config.appId = dto.appId.trim();
    if (dto.restApiKey !== undefined && !dto.restApiKey.includes('...')) {
      this.config.restApiKey = dto.restApiKey.trim();
    }
    if (dto.safariWebId !== undefined) this.config.safariWebId = dto.safariWebId.trim();
    if (dto.enabled !== undefined) this.config.enabled = dto.enabled;
    if (dto.channels) {
      this.config.channels = {
        lowStock: dto.channels.lowStock ?? this.config.channels.lowStock,
        approval: dto.channels.approval ?? this.config.channels.approval,
        aiDigest: dto.channels.aiDigest ?? this.config.channels.aiDigest,
        syncConflict: dto.channels.syncConflict ?? this.config.channels.syncConflict,
        broadcast: dto.channels.broadcast ?? this.config.channels.broadcast,
      };
    }
    this.config.updatedAt = new Date().toISOString();

    // Simpan metadata publik di settings tenant agar tetap bertahan saat reload
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });
      if (tenant) {
        const currentSettings =
          tenant.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings)
            ? (tenant.settings as Record<string, unknown>)
            : {};
        const nextSettings: Prisma.InputJsonValue = {
          ...currentSettings,
          onesignal: {
            enabled: this.config.enabled,
            appId: this.config.appId,
            safariWebId: this.config.safariWebId,
            hasRestApiKey: Boolean(this.config.restApiKey),
            channels: { ...this.config.channels },
            updatedAt: this.config.updatedAt,
          },
        };
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { settings: nextSettings },
        });
      }
    } catch (err) {
      this.logger.warn(`Gagal menyimpan metadata OneSignal ke tenant settings: ${String(err)}`);
    }

    return this.getAdminConfig();
  }

  registerSubscription(tenantId: string, userId: string, dto: RegisterPushSubscriptionDto) {
    const subId = (dto.subscriptionId ?? '').trim() || `sub-${userId}`;
    const record: SubscribedDeviceRecord = {
      userId,
      tenantId,
      subscriptionId: subId,
      externalId: (dto.externalId ?? '').trim() || userId,
      deviceType: (dto.deviceType ?? 'web').trim(),
      permissionGranted: dto.permissionGranted ?? true,
      tags: {
        tenant_id: tenantId,
        user_id: userId,
        ...(dto.tags ?? {}),
      },
      updatedAt: new Date().toISOString(),
    };
    this.devices.set(`${tenantId}:${userId}`, record);
    return {
      ok: true,
      subscription: record,
      oneSignalConfigured: Boolean(this.config.appId && this.config.restApiKey),
    };
  }

  private buildAuthHeader(apiKey: string): string {
    const clean = apiKey.trim();
    if (clean.startsWith('Key ') || clean.startsWith('Basic ')) return clean;
    if (clean.startsWith('os_v2_')) return `Key ${clean}`;
    return `Basic ${clean}`;
  }

  async sendOneSignalApi(payload: {
    title: string;
    body: string;
    link?: string;
    externalUserIds?: string[];
    subscriptionIds?: string[];
    tenantIdFilter?: string;
    roleFilter?: string;
    data?: Record<string, unknown>;
  }): Promise<{
    sent: boolean;
    oneSignalId: string | null;
    recipients: number;
    errorMessage?: string;
  }> {
    if (!this.config.enabled || !this.config.appId || !this.config.restApiKey) {
      return {
        sent: false,
        oneSignalId: null,
        recipients: 0,
        errorMessage: 'OneSignal App ID atau REST API Key belum diisi.',
      };
    }

    const requestBody: Record<string, unknown> = {
      app_id: this.config.appId,
      target_channel: 'push',
      headings: { en: payload.title, id: payload.title },
      contents: { en: payload.body, id: payload.body },
      data: {
        link: payload.link || '/app/notifications',
        ...(payload.data ?? {}),
      },
    };

    if (payload.subscriptionIds && payload.subscriptionIds.length > 0) {
      requestBody.include_subscription_ids = payload.subscriptionIds;
    } else if (payload.externalUserIds && payload.externalUserIds.length > 0) {
      requestBody.include_aliases = { external_id: payload.externalUserIds };
    } else {
      const filters: Array<Record<string, string>> = [];
      if (payload.tenantIdFilter && payload.tenantIdFilter !== 'all') {
        filters.push({
          field: 'tag',
          key: 'tenant_id',
          relation: '=',
          value: payload.tenantIdFilter,
        });
      }
      if (payload.roleFilter && payload.roleFilter !== 'all') {
        if (filters.length > 0) filters.push({ operator: 'AND' });
        filters.push({
          field: 'tag',
          key: 'role',
          relation: '=',
          value: payload.roleFilter,
        });
      }
      if (filters.length > 0) {
        requestBody.filters = filters;
      } else {
        requestBody.included_segments = ['Total Subscriptions'];
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: this.buildAuthHeader(this.config.restApiKey),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        recipients?: number;
        errors?: unknown;
      };
      if (!res.ok || !json.id) {
        const errStr = json.errors ? JSON.stringify(json.errors) : `HTTP ${res.status}`;
        return {
          sent: false,
          oneSignalId: null,
          recipients: 0,
          errorMessage: `OneSignal API menolak request: ${errStr}`,
        };
      }
      return {
        sent: true,
        oneSignalId: json.id,
        recipients: Number(json.recipients ?? 1),
      };
    } catch (err) {
      return {
        sent: false,
        oneSignalId: null,
        recipients: 0,
        errorMessage: err instanceof Error ? err.message : 'Gagal menghubungi server OneSignal.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendTestPush(tenantId: string, userId: string, dto: TestPushDto) {
    const title = dto.title?.trim() || 'Uji Push Notification Retalio';
    const body =
      dto.body?.trim() ||
      'Koneksi push notification OneSignal & in-app Retalio berjalan normal pada perangkat Anda.';
    const link = dto.link?.trim() || '/app/notifications';

    const created = await this.prisma.notification.create({
      data: {
        tenantId,
        userId,
        type: 'insight_digest',
        title,
        body,
        link,
      },
    });

    const knownSub = dto.subscriptionId?.trim() || this.devices.get(`${tenantId}:${userId}`)?.subscriptionId;
    const osResult = await this.sendOneSignalApi({
      title,
      body,
      link,
      subscriptionIds: knownSub && !knownSub.startsWith('sub-') ? [knownSub] : undefined,
      externalUserIds: [userId],
    });

    const entry: PushBroadcastLogEntry = {
      id: `push-${Date.now()}`,
      title,
      body,
      type: 'insight_digest',
      link,
      targetTenantId: tenantId,
      targetRole: 'self',
      mode: osResult.sent ? 'onesignal_live' : 'inapp_fallback',
      oneSignalId: osResult.oneSignalId,
      recipients: osResult.sent ? Math.max(1, osResult.recipients) : 1,
      inAppCreated: 1,
      sentBy: userId,
      sentAt: new Date().toISOString(),
      status: osResult.sent ? 'delivered' : 'queued_inapp',
      errorMessage: osResult.errorMessage,
    };
    this.history.unshift(entry);

    return {
      ok: true,
      notification: created,
      delivery: entry,
    };
  }

  async broadcast(
    callerTenantId: string,
    callerUserId: string,
    isSuperadmin: boolean,
    dto: BroadcastPushDto,
  ) {
    const type: NotificationTypeValue = dto.type ?? 'insight_digest';
    const link = dto.link?.trim() || '/app/notifications';
    const targetTenantId =
      isSuperadmin && dto.targetTenantId ? dto.targetTenantId.trim() : callerTenantId;
    const targetRole = dto.targetRole?.trim() || 'all';

    // Buat notifikasi di database untuk tenant sasaran
    let inAppCreated = 0;
    if (isSuperadmin && targetTenantId === 'all') {
      const tenants = await this.prisma.tenant.findMany({ select: { id: true }, take: 200 });
      if (tenants.length > 0) {
        const res = await this.prisma.notification.createMany({
          data: tenants.map((t) => ({
            tenantId: t.id,
            userId: null,
            type,
            title: dto.title.trim(),
            body: dto.body.trim(),
            link,
          })),
        });
        inAppCreated = res.count;
      }
    } else {
      const scopedTenantId = targetTenantId === 'all' ? callerTenantId : targetTenantId;
      if (dto.userIds && dto.userIds.length > 0) {
        const validUsers = await this.prisma.user.findMany({
          where: { tenantId: scopedTenantId, id: { in: dto.userIds } },
          select: { id: true },
        });
        if (validUsers.length > 0) {
          const res = await this.prisma.notification.createMany({
            data: validUsers.map((u) => ({
              tenantId: scopedTenantId,
              userId: u.id,
              type,
              title: dto.title.trim(),
              body: dto.body.trim(),
              link,
            })),
          });
          inAppCreated = res.count;
        }
      } else {
        await this.prisma.notification.create({
          data: {
            tenantId: scopedTenantId,
            userId: null,
            type,
            title: dto.title.trim(),
            body: dto.body.trim(),
            link,
          },
        });
        inAppCreated = 1;
      }
    }

    const osResult = await this.sendOneSignalApi({
      title: dto.title.trim(),
      body: dto.body.trim(),
      link,
      externalUserIds: dto.userIds?.length ? dto.userIds : undefined,
      tenantIdFilter: targetTenantId,
      roleFilter: targetRole,
      data: { type },
    });

    const entry: PushBroadcastLogEntry = {
      id: `bcast-${Date.now()}`,
      title: dto.title.trim(),
      body: dto.body.trim(),
      type,
      link,
      targetTenantId,
      targetRole,
      mode: osResult.sent ? 'onesignal_live' : 'inapp_fallback',
      oneSignalId: osResult.oneSignalId,
      recipients: osResult.sent ? Math.max(inAppCreated, osResult.recipients) : inAppCreated,
      inAppCreated,
      sentBy: callerUserId,
      sentAt: new Date().toISOString(),
      status: osResult.sent ? 'delivered' : 'queued_inapp',
      errorMessage: osResult.errorMessage,
    };
    this.history.unshift(entry);

    return {
      ok: true,
      delivery: entry,
    };
  }
}
