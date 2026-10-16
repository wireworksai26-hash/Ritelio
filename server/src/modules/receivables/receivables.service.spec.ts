import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ReceivablesService } from './receivables.service';

// Regresi: status dulu dibandingkan dengan SISA tagihan, padahal paidAmount kumulatif.
// Faktur 100 yang sudah diterima 40, lalu diterima 30, ditandai "paid" padahal sisa 30,
// dan sisa itu tidak bisa ditagih lagi karena faktur "paid" ditolak receive().
//
// SELECT ... FOR UPDATE ditiru: transaksi lain menunggu commit, dan baris dibaca ulang
// setelah kunci didapat (membaca tanpa kunci melempar error).
function setup(invoice: { total: number; paidAmount: number; taxTotal?: number }) {
  const row: Record<string, any> = {
    id: 'i1',
    number: 'INV-1',
    customerId: 'cu1',
    status: invoice.paidAmount > 0 ? 'partial' : 'open',
    taxTotal: 0,
    ...invoice,
  };
  const updates: Array<{ paidAmount: unknown; status: string }> = [];
  let chain: Promise<void> = Promise.resolve();
  const prisma: Record<string, any> = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    chartOfAccount: { findFirst: async (args: { where: { code: string } }) => ({ id: `acc-${args.where.code}` }) },
  };
  prisma['$transaction'] = async (fn: (t: unknown) => Promise<unknown>) => {
    let release!: () => void;
    const done = new Promise<void>((res) => (release = res));
    const prev = chain;
    chain = prev.then(() => done);
    let locked = false;
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray) => {
        expect(strings.join('?')).toContain('FOR UPDATE');
        await prev;
        locked = true;
      },
      documentSequence: { upsert: async () => ({ nextValue: 2 }) },
      customerReceipt: { findFirst: async () => null, create: async ({ data }: { data: unknown }) => data },
      customerInvoice: {
        findFirst: async () => {
          if (!locked) throw new Error('faktur dibaca tanpa kunci');
          return { ...row };
        },
        update: async ({ data }: { data: { paidAmount: unknown; status: string } }) => {
          updates.push(data);
          row.paidAmount = Number(data.paidAmount);
          row.status = data.status;
          return data;
        },
      },
    };
    try {
      return await fn(tx);
    } finally {
      release();
    }
  };
  const posted: Array<{ lines: Array<{ accountId: string; direction: string }> }> = [];
  const journals = { post: async (_tx: unknown, input: { lines: Array<{ accountId: string; direction: string }> }) => { posted.push(input); return { id: 'j1' }; } };
  return { service: new ReceivablesService(prisma as never, journals as never, {} as never), updates, row, posted };
}

describe('ReceivablesService.receive status', () => {
  it('melunasi piutang: Dr Kas (1000) / Cr Piutang Usaha (1200), bukan Aset Tetap (1300)', async () => {
    const { service, posted } = setup({ total: 100, paidAmount: 0 });
    await service.receive('t1', 'i1', { amount: 40 });
    const credit = posted[0].lines.find((l) => l.direction === 'credit');
    const debit = posted[0].lines.find((l) => l.direction === 'debit');
    expect(credit?.accountId).toBe('acc-1200');
    expect(debit?.accountId).toBe('acc-1000');
  });

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

  it('nilai yang diterima adalah gross (DPP + PPN): taxTotal 111 -> sisa 111, bukan 100', async () => {
    const { service, row } = setup({ total: 100, paidAmount: 0, taxTotal: 111 });
    await expect(service.receive('t1', 'i1', { amount: 111.01 })).rejects.toThrow(BadRequestException);
    const res = await service.receive('t1', 'i1', { amount: 111 });
    expect(res.invoiceStatus).toBe('paid');
    expect(row.paidAmount).toBe(111);
  });

  it('penerimaan paralel pada sisa yang cukup untuk satu saja: hanya satu berhasil', async () => {
    const { service, row } = setup({ total: 100, paidAmount: 50 });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.receive('t1', 'i1', { amount: 50 })),
    );
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(row.paidAmount).toBe(100);
  });
});
