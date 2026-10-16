import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  buildAdjustmentLines,
  ensureAccount,
  INVENTORY_VARIANCE_ACCOUNT,
  OPENING_EQUITY_ACCOUNT,
  postInventoryValueJournal,
  valueOfAdjustment,
} from './inventory-adjustment';

describe('valueOfAdjustment', () => {
  it('qty selisih x biaya moving-average, bertanda dan dibulatkan ke sen', () => {
    expect(valueOfAdjustment(-2, 1000)).toBe(-2000);
    expect(valueOfAdjustment(3, 2000)).toBe(6000);
    expect(valueOfAdjustment(1.5, 333.3333)).toBe(500);
  });

  it('input tidak finite menghasilkan 0, bukan NaN yang merusak jurnal', () => {
    expect(valueOfAdjustment(Number.NaN, 10)).toBe(0);
    expect(valueOfAdjustment(5, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('buildAdjustmentLines', () => {
  const base = { inventoryAccountId: 'inv', counterAccountId: 'var', memo: 'Opname' };

  it('laba selisih: Dr Persediaan / Cr Selisih', () => {
    const lines = buildAdjustmentLines({ ...base, gain: 6000, loss: 0 });
    expect(lines).toEqual([
      expect.objectContaining({ accountId: 'inv', direction: 'debit', amount: 6000 }),
      expect.objectContaining({ accountId: 'var', direction: 'credit', amount: 6000 }),
    ]);
  });

  it('rugi selisih: Dr Selisih / Cr Persediaan', () => {
    const lines = buildAdjustmentLines({ ...base, gain: 0, loss: 2000 });
    expect(lines).toEqual([
      expect.objectContaining({ accountId: 'var', direction: 'debit', amount: 2000 }),
      expect.objectContaining({ accountId: 'inv', direction: 'credit', amount: 2000 }),
    ]);
  });

  it('gain dan loss sekaligus tetap seimbang dan tidak dinetto', () => {
    const lines = buildAdjustmentLines({ ...base, gain: 6000, loss: 2000 });
    const dr = lines.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amount, 0);
    const cr = lines.filter((l) => l.direction === 'credit').reduce((s, l) => s + l.amount, 0);
    expect(lines).toHaveLength(4);
    expect(dr).toBe(cr);
    expect(dr).toBe(8000);
  });

  it('tanpa selisih tidak menghasilkan baris', () => {
    expect(buildAdjustmentLines({ ...base, gain: 0, loss: 0 })).toEqual([]);
  });
});

function fakeTx(accounts: Array<{ id: string; code: string }> = [{ id: 'acc-1100', code: '1100' }]) {
  const store = [...accounts];
  return {
    store,
    chartOfAccount: {
      findFirst: vi.fn(async ({ where }: { where: { code: string } }) => store.find((a) => a.code === where.code) ?? null),
      findFirstOrThrow: vi.fn(async ({ where }: { where: { code: string } }) => {
        const found = store.find((a) => a.code === where.code);
        if (!found) throw new Error('not found');
        return found;
      }),
      createMany: vi.fn(async ({ data }: { data: Array<{ code: string }> }) => {
        for (const d of data) if (!store.some((a) => a.code === d.code)) store.push({ id: `acc-${d.code}`, code: d.code });
        return { count: data.length };
      }),
    },
  };
}

describe('ensureAccount', () => {
  it('memakai akun yang sudah ada tanpa membuat baru', async () => {
    const tx = fakeTx([{ id: 'x', code: '6500' }]);
    const acc = await ensureAccount(tx as never, 't1', 'c1', INVENTORY_VARIANCE_ACCOUNT);
    expect(acc.id).toBe('x');
    expect(tx.chartOfAccount.createMany).not.toHaveBeenCalled();
  });

  it('membuat akun Selisih Persediaan (6500, expense) bila COA seed belum punya', async () => {
    const tx = fakeTx();
    const acc = await ensureAccount(tx as never, 't1', 'c1', INVENTORY_VARIANCE_ACCOUNT);
    expect(acc.code).toBe('6500');
    expect(tx.chartOfAccount.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [expect.objectContaining({ code: '6500', type: 'expense', tenantId: 't1', companyId: 'c1' })],
      }),
    );
  });
});

describe('postInventoryValueJournal', () => {
  const params = { tenantId: 't1', companyId: 'c1', sourceModule: 'stock-opname', sourceRefId: 'op-1', memo: 'Selisih' };

  it('memposting jurnal lewat JournalService.post pada transaksi yang sama (tx pemanggil)', async () => {
    const tx = fakeTx();
    const post = vi.fn(async (_tx: unknown, input: unknown) => ({ id: 'j1', input }));
    const journal = await postInventoryValueJournal(tx as never, { post } as never, { ...params, gain: 6000, loss: 2000 });
    expect(journal?.id).toBe('j1');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe(tx);
    const input = post.mock.calls[0][1] as { sourceModule: string; sourceRefId: string; lines: Array<{ amount: number; direction: string }> };
    expect(input.sourceModule).toBe('stock-opname');
    expect(input.sourceRefId).toBe('op-1');
    expect(input.lines).toHaveLength(4);
  });

  it('tidak memposting apa pun bila tidak ada nilai yang berubah', async () => {
    const tx = fakeTx();
    const post = vi.fn();
    expect(await postInventoryValueJournal(tx as never, { post } as never, { ...params, gain: 0, loss: 0 })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('akun Persediaan (1100) hilang -> 400 jelas, tidak ada jurnal setengah jadi', async () => {
    const tx = fakeTx([]);
    const post = vi.fn();
    await expect(
      postInventoryValueJournal(tx as never, { post } as never, { ...params, gain: 10, loss: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(post).not.toHaveBeenCalled();
  });

  it('stok awal produk baru dilawankan ke Modal Awal (ekuitas), bukan akun selisih', async () => {
    const tx = fakeTx();
    const post = vi.fn(async () => ({ id: 'j2' }));
    await postInventoryValueJournal(tx as never, { post } as never, { ...params, gain: 200, loss: 0, counter: OPENING_EQUITY_ACCOUNT });
    expect(tx.store.some((a) => a.code === '3000')).toBe(true);
    expect(tx.store.some((a) => a.code === '6500')).toBe(false);
  });

  it('error period lock dari JournalService merambat (transaksi pemanggil dibatalkan)', async () => {
    const tx = fakeTx();
    const post = vi.fn(async () => {
      throw new BadRequestException('Tanggal jurnal tidak berada dalam periode fiskal yang terbuka.');
    });
    await expect(
      postInventoryValueJournal(tx as never, { post } as never, { ...params, gain: 0, loss: 500 }),
    ).rejects.toThrow(/periode fiskal/);
  });
});
