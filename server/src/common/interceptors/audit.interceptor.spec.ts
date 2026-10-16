import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuditInterceptor } from './audit.interceptor';

function run(req: Record<string, unknown>, result: unknown = { id: 'new1' }) {
  const create = vi.fn().mockResolvedValue({});
  const prisma = { auditLog: { create } };
  const interceptor = new AuditInterceptor(prisma as never);
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) };
  const next = { handle: () => of(result) };
  return lastValueFrom(interceptor.intercept(ctx as never, next as never)).then(async () => {
    await new Promise((r) => setTimeout(r, 0));
    return create;
  });
}

const base = { method: 'POST', baseUrl: '/v1/iot', route: { path: '/sensors' }, params: {}, user: { sub: 'u1', tenantId: 't1' }, headers: {} };

describe('AuditInterceptor tidak menyimpan rahasia', () => {
  it('meredaksi apiKey/password/token di body sejak awal', async () => {
    const create = await run({
      ...base,
      body: { code: 'S1', apiKey: 'API-KEY-RAHASIA', nested: { password: 'p4ss', refreshToken: 'rt-rahasia' }, name: 'Sensor' },
    });
    const data = create.mock.calls[0][0].data;
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/API-KEY-RAHASIA|p4ss|rt-rahasia/);
    expect(data.after.name).toBe('Sensor');
    expect(data.after.code).toBe('S1');
  });

  it('rute /auth/* tidak mencatat body sama sekali (kata sandi, OTP)', async () => {
    const create = await run({
      ...base,
      baseUrl: '/v1/auth',
      route: { path: '/2fa/enable' },
      body: { password: 'Sandi-Rahasia-1', code: '123456' },
    });
    const data = create.mock.calls[0][0].data;
    expect(data.after).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/Sandi-Rahasia-1|123456/);
  });

  it('gambar base64 dan string panjang tidak disimpan utuh', async () => {
    const create = await run({
      ...base,
      baseUrl: '/v1',
      route: { path: '/ocr/scan' },
      body: { fileName: 'struk.jpg', dataBase64: 'A'.repeat(1_000_000) },
    });
    const data = create.mock.calls[0][0].data;
    expect(JSON.stringify(data).length).toBeLessThan(2000);
  });

  it('mencatat IP dari req.ip, bukan dari X-Forwarded-For yang bisa dipalsukan', async () => {
    const create = await run({ ...base, ip: '10.1.1.1', headers: { 'x-forwarded-for': '6.6.6.6' }, body: {} });
    expect(create.mock.calls[0][0].data.ipAddress).toBe('10.1.1.1');
  });
});
