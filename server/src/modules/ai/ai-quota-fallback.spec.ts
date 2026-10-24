import { describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service';

// Kuota cadangan saat tenant belum punya baris langganan aktif: harus sama seperti sebelum konfigurasi paket
// dipindah dari kode (plus_ai = 1000, lainnya 0), bukan kuota paket berbayar.
function make(plan: string, subscription: unknown = null) {
  const prisma = {
    tenant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ subscriptionPlan: plan }) },
    subscription: { findFirst: vi.fn().mockResolvedValue(subscription) },
  };
  const service = new AiService(prisma as never, {} as never, {} as never, {} as never);
  return (service as unknown as { quotaFor(id: string): Promise<number> }).quotaFor('t-1');
}

describe('AiService.quotaFor cadangan tanpa langganan', () => {
  it('plus_ai tanpa baris langganan: 1000 (nilai trial), bukan 3000 milik paket berbayar', async () => {
    expect(await make('plus_ai')).toBe(1000);
  });

  it('basic tanpa baris langganan: 0', async () => {
    expect(await make('basic')).toBe(0);
  });

  it('ada baris langganan: memakai kuotanya; custom tidak dibatasi', async () => {
    expect(await make('plus_ai', { aiQuota: 3000, endsAt: null })).toBe(3000);
    expect(await make('custom')).toBe(Number.POSITIVE_INFINITY);
  });
});
