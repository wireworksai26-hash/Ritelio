import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OcrService } from './ocr.service';

const dto = {
  supplierId: 's1',
  supplierInvoiceNumber: 'INV-9',
  lines: [{ accountId: 'beban', amount: 250_000 }],
};

function setup(record: { status: string; fields?: Record<string, unknown> } | null) {
  const state = { stored: { ...(record?.fields ?? {}) } as Record<string, unknown>, calls: [] as Array<Record<string, any>> };

  const tx = {
    ocrResult: {
      findUniqueOrThrow: async () => ({ fields: state.stored }),
      update: async ({ data }: { data: { fields: Record<string, unknown> } }) => {
        state.stored = data.fields;
        return {};
      },
    },
  };

  const prisma = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    ocrResult: {
      findFirst: async () => (record ? { id: 'ocr-12345678-abcd', fields: state.stored, ...record } : null),
    },
  };

  const payables = {
    createBill: async (
      _tenantId: string,
      _dto: unknown,
      opts: { idempotencyKey?: string; source?: string; actorId?: string; onCreated?: (tx: unknown, b: { id: string; number: string }) => Promise<void> },
    ) => {
      state.calls.push(opts);
      await opts.onCreated?.(tx, { id: 'bill-1', number: 'AP-2026-00001' });
      return { id: 'bill-1', number: 'AP-2026-00001' };
    },
  };

  const service = new OcrService(prisma as never, {} as never, payables as never);
  return { service, state };
}

describe('OcrService.createBill', () => {
  it('hasil OCR processed menjadi tagihan dengan kunci idempotensi per hasil OCR', async () => {
    const { service, state } = setup({ status: 'processed' });
    const bill = await service.createBill('t1', 'ocr-12345678-abcd', dto, 'u1');
    expect(bill).toMatchObject({ id: 'bill-1' });
    expect(state.calls[0].idempotencyKey).toBe('ocr-bill:ocr-12345678-abcd');
    expect(state.calls[0].actorId).toBe('u1');
    expect(state.calls[0].source).toContain('ocr-1234');
  });

  it('menautkan billId dan nomor tagihan ke hasil OCR tanpa menghapus field lain', async () => {
    const { service, state } = setup({ status: 'processed', fields: { total: 250_000, supplierName: 'CV Maju' } });
    await service.createBill('t1', 'ocr-12345678-abcd', dto);
    expect(state.stored).toMatchObject({
      total: 250_000,
      supplierName: 'CV Maju',
      billId: 'bill-1',
      billNumber: 'AP-2026-00001',
    });
  });

  it('hasil yang sudah dijadikan tagihan ditolak sebelum menyentuh AP', async () => {
    const { service, state } = setup({
      status: 'processed',
      fields: { billId: 'bill-0', billNumber: 'AP-2026-00000' },
    });
    await expect(service.createBill('t1', 'ocr-12345678-abcd', dto)).rejects.toThrow(ConflictException);
    expect(state.calls).toHaveLength(0);
  });

  it('needs_review harus direview manusia dulu', async () => {
    const { service, state } = setup({ status: 'needs_review' });
    await expect(service.createBill('t1', 'ocr-12345678-abcd', dto)).rejects.toThrow(BadRequestException);
    expect(state.calls).toHaveLength(0);
  });

  it('failed dan pending tidak bisa dijadikan tagihan', async () => {
    for (const status of ['failed', 'pending']) {
      const { service, state } = setup({ status });
      await expect(service.createBill('t1', 'ocr-12345678-abcd', dto)).rejects.toThrow(BadRequestException);
      expect(state.calls).toHaveLength(0);
    }
  });

  it('hasil OCR tidak ditemukan', async () => {
    const { service } = setup(null);
    await expect(service.createBill('t1', 'nope', dto)).rejects.toThrow(NotFoundException);
  });
});
