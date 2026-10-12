import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ReceivablesService } from './receivables.service';

// Regresi: status dulu dibandingkan dengan SISA tagihan, padahal paidAmount kumulatif.
// Faktur 100 yang sudah diterima 40, lalu diterima 30, ditandai "paid" padahal sisa 30,
// dan sisa itu tidak bisa ditagih lagi karena faktur "paid" ditolak receive().
function setup(invoice: { total: number; paidAmount: number }) {
  const updates: Array<{ paidAmount: unknown; status: string }> = [];
  const tx = {
    documentSequence: { upsert: async () => ({ nextValue: 2 }) },
    customerReceipt: { findFirst: async () => null, create: async ({ data }: { data: unknown }) => data },
    customerInvoice: {
      update: async ({ data }: { data: { paidAmount: unknown; status: string } }) => {
        updates.push(data);
        return data;
      },
    },
  };
  const prisma = {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    company: { findFirst: async () => ({ id: 'c1' }) },
    customerInvoice: {
      findFirst: async () => ({ id: 'i1', number: 'INV-1', customerId: 'cu1', status: 'partial', ...invoice }),
    },
    chartOfAccount: { findFirst: async (args: { where: { code: string } }) => ({ id: `acc-${args.where.code}` }) },
  };
  const journals = { post: async () => ({ id: 'j1' }) };
  return { service: new ReceivablesService(prisma as never, journals as never, {} as never), updates };
}

describe('ReceivablesService.receive status', () => {
  it('terima sebagian pada faktur yang sudah sebagian lunas tetap "partial"', async () => {
    const { service, updates } = setup({ total: 100, paidAmount: 40 });
    const res = await service.receive('t1', 'i1', { amount: 30 });
    expect(res.invoiceStatus).toBe('partial');
    expect(updates[0].status).toBe('partial');
  });

  it('melunasi sisa menjadikan "paid"', async () => {
    const { service } = setup({ total: 100, paidAmount: 40 });
    const res = await service.receive('t1', 'i1', { amount: 60 });
    expect(res.invoiceStatus).toBe('paid');
  });

  it('menolak penerimaan melebihi sisa', async () => {
    const { service } = setup({ total: 100, paidAmount: 40 });
    await expect(service.receive('t1', 'i1', { amount: 61 })).rejects.toThrow(BadRequestException);
  });
});
