import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service';

const secretRow = {
  id: 'a1',
  tenantId: 't1',
  before: { name: 'Sensor', apiKey: 'KEY-BEFORE', passwordHash: '$2a$12$x' },
  after: { name: 'Sensor', apiKey: 'KEY-AFTER', refreshToken: 'rt-secret' },
  user: { id: 'u1', email: 'a@b.c', name: 'A', role: 'owner' },
};

function make(rows = [secretRow]) {
  const prisma = {
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(rows[0]),
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma, service: new AuditService(prisma as never) };
}

describe('AuditService redaksi', () => {
  it('detail() menyaring before DAN after', async () => {
    const { service } = make();
    const row = (await service.detail('t1', 'a1')) as any;
    const text = JSON.stringify(row);
    expect(text).not.toContain('KEY-BEFORE');
    expect(text).not.toContain('KEY-AFTER');
    expect(text).not.toContain('rt-secret');
    expect(row.before.apiKey).toBe('[redacted]');
    expect(row.after.refreshToken).toBe('[redacted]');
  });

  it('list() menyaring before dan after', async () => {
    const { service } = make();
    const res = await service.list({ tenantId: 't1' });
    expect(JSON.stringify(res)).not.toMatch(/KEY-BEFORE|KEY-AFTER|rt-secret/);
  });

  it('detail() mengembalikan null untuk id yang tidak ada', async () => {
    const { prisma, service } = make();
    prisma.auditLog.findFirst.mockResolvedValue(null);
    expect(await service.detail('t1', 'x')).toBeNull();
  });

  it('record() tidak pernah menyimpan rahasia', async () => {
    const { prisma, service } = make();
    await service.record({
      tenantId: 't1',
      action: 'update',
      entity: 'iot/sensors',
      before: { apiKey: 'KEY-1' },
      after: { passwordHash: 'h', password: 'p', ok: true },
    });
    const data = prisma.auditLog.create.mock.calls[0][0].data;
    expect(JSON.stringify(data)).not.toMatch(/KEY-1|"h"|"p"/);
    expect(data.after.ok).toBe(true);
  });
});
