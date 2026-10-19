import type { DemoContext, DemoDomain } from './context';

// Domain "supply": diisi oleh pemilik domain ini. Orchestrator ada di ../seed-demo.ts dan konteks di ./context.ts.
export const supplyDomain: DemoDomain = {
  key: 'supply',
  implemented: false,
  title: 'Rantai pasok: pembelian, utang usaha, transfer, opname, produksi',
  async run(_ctx: DemoContext) {
    // belum diisi
  },
};
