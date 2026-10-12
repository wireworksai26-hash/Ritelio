import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { redactSecrets } from '../../common/utils/redact';

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  outcome?: 'success' | 'failure';
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

export interface AuditQuery {
  tenantId: string;
  entity?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  outcome?: 'success' | 'failure';
  from?: Date;
  to?: Date;
  take?: number;
  cursor?: string;
}

/**
 * Baca + tulis jejak audit. Semua service yang butuh mencatat peristiwa
 * non-HTTP (login gagal, settlement, sensor IoT) memakai `record()` di sini
 * supaya satu tempat yang menentukan bentuk catatannya.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        outcome: entry.outcome ?? 'success',
        reason: entry.reason ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
      },
    });
  }

  /** Versi non-blocking untuk interceptor: audit tidak boleh menggagalkan request. */
  recordSafe(entry: AuditEntry): void {
    this.record(entry).catch(() => undefined);
  }

  async list(query: AuditQuery) {
    const where = {
      tenantId: query.tenantId,
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lt: query.to } : {}),
            },
          }
        : {}),
    };

    const take = query.take ?? 50;
    const rows = await this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const total = await this.prisma.auditLog.count({ where });
    return {
      data: rows.map((row) => ({ ...row, after: redactSecrets(row.after) })),
      total,
      nextCursor: rows.length === take ? rows[rows.length - 1]?.id : null,
    };
  }

  async detail(tenantId: string, id: string) {
    return this.prisma.auditLog.findFirst({
      where: { id, tenantId },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });
  }

  /** Daftar entitas + aksi yang tercatat, untuk mengisi filter UI. */
  async facets(tenantId: string) {
    const [entities, actions] = await Promise.all([
      this.prisma.auditLog.groupBy({ by: ['entity'], where: { tenantId }, _count: true }),
      this.prisma.auditLog.groupBy({ by: ['action'], where: { tenantId }, _count: true }),
    ]);
    return {
      entities: entities
        .map((e) => ({ entity: e.entity, count: e._count }))
        .sort((a, b) => b.count - a.count),
      actions: actions.map((a) => ({ action: a.action, count: a._count })),
    };
  }
}