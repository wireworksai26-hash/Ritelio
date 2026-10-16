import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

function controllerWith(queryRaw: () => Promise<unknown>) {
  return new HealthController({ $queryRaw: vi.fn(queryRaw) } as never);
}

describe('HealthController', () => {
  it('ok bila database menjawab', async () => {
    await expect(controllerWith(async () => [{ '?column?': 1 }]).check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('503 bila database tidak terjangkau, tanpa membocorkan pesan error asli', async () => {
    const c = controllerWith(async () => {
      throw new Error("Can't reach database server at postgres.railway.internal:5432 (password=rahasia)");
    });
    const err = await c.check().catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(err.getResponse())).not.toMatch(/rahasia|railway\.internal/);
  });
});
