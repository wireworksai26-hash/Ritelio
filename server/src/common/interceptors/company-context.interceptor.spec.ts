import { ForbiddenException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import { defaultCompanyId } from '../utils/default-company';
import { CompanyContextInterceptor } from './company-context.interceptor';

const TENANT = 'tenant-a';
const MAIN = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const FOREIGN = '00000000-0000-4000-8000-000000000003';

function fakePrisma() {
  // Perusahaan: MAIN & OTHER milik tenant-a; FOREIGN milik tenant lain.
  const companies = [
    { id: MAIN, tenantId: TENANT, code: 'MAIN', isActive: true },
    { id: OTHER, tenantId: TENANT, code: 'SUB1', isActive: true },
    { id: FOREIGN, tenantId: 'tenant-b', code: 'X', isActive: true },
  ];
  const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const hit = companies.find((c) =>
      Object.entries(where).every(([k, v]) => (c as Record<string, unknown>)[k] === v),
    );
    return hit ? { id: hit.id } : null;
  });
  return { prisma: { company: { findFirst } } as unknown as PrismaService, findFirst };
}

function ctxWith(headers: Record<string, string>, user: { sub: string; tenantId: string } | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers, user }) }),
  } as unknown as ExecutionContext;
}

describe('CompanyContextInterceptor', () => {
  it('tanpa header memakai perusahaan utama (perilaku lama)', async () => {
    const { prisma } = fakePrisma();
    const interceptor = new CompanyContextInterceptor(prisma);
    const next: CallHandler = { handle: () => defer(() => defaultCompanyId(prisma, TENANT)) };
    const result = await firstValueFrom(
      interceptor.intercept(ctxWith({}, { sub: 'u1', tenantId: TENANT }), next),
    );
    expect(result).toBe(MAIN);
  });

  it('header valid mengubah perusahaan, bahkan setelah await di dalam handler', async () => {
    const { prisma } = fakePrisma();
    const interceptor = new CompanyContextInterceptor(prisma);
    const next: CallHandler = {
      handle: () =>
        defer(async () => {
          await new Promise((r) => setTimeout(r, 5));
          return defaultCompanyId(prisma, TENANT);
        }),
    };
    const result = await firstValueFrom(
      interceptor.intercept(ctxWith({ 'x-company-id': OTHER }, { sub: 'u1', tenantId: TENANT }), next),
    );
    expect(result).toBe(OTHER);
  });

  it('request paralel tidak saling bocor konteks perusahaannya', async () => {
    const { prisma } = fakePrisma();
    const interceptor = new CompanyContextInterceptor(prisma);
    const handler = (delay: number): CallHandler => ({
      handle: () =>
        defer(async () => {
          await new Promise((r) => setTimeout(r, delay));
          return defaultCompanyId(prisma, TENANT);
        }),
    });
    const [a, b] = await Promise.all([
      firstValueFrom(interceptor.intercept(ctxWith({ 'x-company-id': OTHER }, { sub: 'u1', tenantId: TENANT }), handler(20))),
      firstValueFrom(interceptor.intercept(ctxWith({}, { sub: 'u2', tenantId: TENANT }), handler(5))),
    ]);
    expect(a).toBe(OTHER);
    expect(b).toBe(MAIN);
  });

  it('menolak perusahaan milik tenant lain', async () => {
    const { prisma } = fakePrisma();
    const interceptor = new CompanyContextInterceptor(prisma);
    const next = { handle: vi.fn() } as unknown as CallHandler;
    await expect(
      firstValueFrom(interceptor.intercept(ctxWith({ 'x-company-id': FOREIGN }, { sub: 'u1', tenantId: TENANT }), next)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('menolak header yang bukan UUID tanpa menyentuh database', () => {
    const { prisma, findFirst } = fakePrisma();
    const interceptor = new CompanyContextInterceptor(prisma);
    const next = { handle: vi.fn() } as unknown as CallHandler;
    expect(() =>
      interceptor.intercept(ctxWith({ 'x-company-id': "x' OR 1=1" }, { sub: 'u1', tenantId: TENANT }), next),
    ).toThrow(ForbiddenException);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
