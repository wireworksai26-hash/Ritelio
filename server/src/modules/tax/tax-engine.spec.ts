import { describe, expect, it } from 'vitest';
import { TaxEngineService } from './tax-engine.service';

function mockTx(existing: Record<string, unknown> | null, rule: Record<string, unknown> | null) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    taxComputation: {
      findFirst: async () => existing,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
    },
    taxRule: { findFirst: async () => rule },
  };
  return { tx, created };
}

const params = {
  tenantId: 't1',
  companyId: 'c1',
  documentType: 'customer_invoice' as const,
  documentId: 'inv-1',
  base: 1_000_000,
  on: new Date('2026-03-10'),
};

const ppnRule = {
  id: 'rule-1',
  code: 'PPN-KELUARAN',
  name: 'PPN Keluaran 11%',
  rate: 0.11,
  direction: 'output',
  source: 'official',
  brackets: [],
};

describe('TaxEngineService.computeAndPersist', () => {
  it('menghitung PPN dari nilai neto dan menyimpannya', async () => {
    const { tx, created } = mockTx(null, ppnRule);
    const result = await new TaxEngineService().computeAndPersist(tx as never, { ...params, kind: 'sale' });

    expect(result?.tax).toBe(110_000);
    expect(result?.base).toBe(1_000_000);
    expect(created).toHaveLength(1);
    expect(created[0].taxRuleId).toBe('rule-1');
  });

  it('snapshot menyimpan tarif dan sumber untuk jejak audit', async () => {
    const { tx, created } = mockTx(null, ppnRule);
    await new TaxEngineService().computeAndPersist(tx as never, { ...params, kind: 'sale' });

    const snapshot = created[0].ruleSnapshot as { rate: number; source: string; basis: string };
    expect(snapshot.rate).toBe(0.11);
    expect(snapshot.source).toBe('official');
    expect(snapshot.basis).toBe('net');
  });

  it('idempoten: tidak menambah perhitungan kedua untuk dokumen yang sama', async () => {
    const { tx, created } = mockTx(
      { taxRuleId: 'rule-1', direction: 'output', source: 'official', baseAmount: 1_000_000, taxAmount: 110_000, ruleSnapshot: { rate: 0.11 } },
      ppnRule,
    );
    const result = await new TaxEngineService().computeAndPersist(tx as never, { ...params, kind: 'sale' });

    expect(created).toHaveLength(0);
    expect(result?.tax).toBe(110_000);
  });

  it('mengembalikan null saat tidak ada aturan aktif', async () => {
    const { tx } = mockTx(null, null);
    const result = await new TaxEngineService().computeAndPersist(tx as never, { ...params, kind: 'sale' });
    expect(result).toBeNull();
  });

  it('membulatkan ke sen terdekat', async () => {
    const { tx } = mockTx(null, { ...ppnRule, rate: 0.11 });
    const result = await new TaxEngineService().computeAndPersist(tx as never, {
      ...params,
      base: 3_333.33,
      kind: 'sale',
    });
    // 3333.33 * 11% = 366.6663 -> 366.67
    expect(result?.tax).toBe(366.67);
  });
});

describe('TaxEngineService.resolveRule', () => {
  it('memilih aturan sesuai arah dokumen', async () => {
    const { tx } = mockTx(null, ppnRule);
    const sale = await new TaxEngineService().resolveRule(tx as never, { ...params, kind: 'sale' });
    expect(sale?.direction).toBe('output');
  });

  it('mengabaikan aturan tanpa tarif maupun bracket', async () => {
    const { tx } = mockTx(null, { ...ppnRule, rate: null, brackets: [] });
    const rule = await new TaxEngineService().resolveRule(tx as never, { ...params, kind: 'sale' });
    expect(rule).toBeNull();
  });

  it('memakai tarif bracket pertama bila tarif tunggal kosong', async () => {
    const { tx } = mockTx(null, { ...ppnRule, rate: null, brackets: [{ ratePercent: 0.05 }] });
    const rule = await new TaxEngineService().resolveRule(tx as never, { ...params, kind: 'sale' });
    expect(rule?.rate).toBe(0.05);
  });
});