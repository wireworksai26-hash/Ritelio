import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter, toErrorPayload } from './all-exceptions.filter';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(
    'Invalid `prisma.user.create()` invocation in /srv/app/secret/path.ts: Unique constraint failed on the fields: (`password_hash`)',
    { code, clientVersion: 'x' },
  );
}

describe('toErrorPayload', () => {
  it('meneruskan HttpException apa adanya', () => {
    const p = toErrorPayload(new ForbiddenException('Akses ditolak.'));
    expect(p.status).toBe(403);
    expect(p.body.message).toBe('Akses ditolak.');
    const bad = toErrorPayload(new BadRequestException(['a harus string']));
    expect(bad.body.message).toEqual(['a harus string']);
  });

  it('memetakan galat Prisma ke 4xx tanpa membocorkan pesan internal', () => {
    expect(toErrorPayload(prismaError('P2002')).status).toBe(409);
    expect(toErrorPayload(prismaError('P2003')).status).toBe(409);
    expect(toErrorPayload(prismaError('P2025')).status).toBe(404);
    for (const code of ['P2002', 'P2003', 'P2025']) {
      expect(JSON.stringify(toErrorPayload(prismaError(code)).body)).not.toMatch(/prisma|password_hash|secret|\.ts/i);
    }
  });

  it('galat Prisma yang tak dikenal dan Error biasa menjadi 500 generik', () => {
    for (const err of [prismaError('P9999'), new Error('connect ECONNREFUSED 10.0.0.5:5432 at /srv/app/db.ts'), 'string aneh']) {
      const p = toErrorPayload(err);
      expect(p.status).toBe(500);
      expect(p.logAsError).toBe(true);
      expect(JSON.stringify(p.body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|\/srv/);
    }
  });

  it('body terlalu besar -> 413, JSON rusak -> 400', () => {
    expect(toErrorPayload(Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large' })).status).toBe(413);
    expect(toErrorPayload(Object.assign(new SyntaxError('Unexpected token'), { status: 400, type: 'entity.parse.failed' })).status).toBe(400);
  });
});

describe('AllExceptionsFilter', () => {
  it('mengirim 500 generik ke klien dan mencatat stack di server', () => {
    const filter = new AllExceptionsFilter();
    const logged = vi.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined);
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }), setHeader: vi.fn() };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'GET', originalUrl: '/v1/x' }) }),
    };
    filter.catch(new Error('SELECT * FROM users WHERE password_hash'), host as never);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('SELECT');
    expect(logged).toHaveBeenCalled();
  });

  it('429 dari penguncian membawa header Retry-After', () => {
    const filter = new AllExceptionsFilter();
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }), setHeader: vi.fn() };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({}) }),
    };
    filter.catch(new HttpException({ statusCode: 429, message: 'x', retryAfter: 42 }, 429), host as never);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42');
  });
});
