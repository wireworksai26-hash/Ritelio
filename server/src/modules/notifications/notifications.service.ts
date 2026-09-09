import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Scope notifikasi: milik tenant DAN (untuk semua user / khusus user ini)
  private scope(tenantId: string, userId: string): Prisma.NotificationWhereInput {
    return { tenantId, OR: [{ userId: null }, { userId }] };
  }

  async list(
    tenantId: string,
    user: AuthUser,
    query: { unread?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const where: Prisma.NotificationWhereInput = {
      ...this.scope(tenantId, user.sub),
      ...(query.unread === 'true' ? { read: false } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async unreadCount(tenantId: string, user: AuthUser) {
    const count = await this.prisma.notification.count({
      where: { ...this.scope(tenantId, user.sub), read: false },
    });
    return { count };
  }

  async markRead(tenantId: string, id: string) {
    const notif = await this.prisma.notification.findFirst({ where: { id, tenantId } });
    if (!notif) throw new NotFoundException('Notifikasi tidak ditemukan.');
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  async markAllRead(tenantId: string, user: AuthUser) {
    const result = await this.prisma.notification.updateMany({
      where: { ...this.scope(tenantId, user.sub), read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }
}
