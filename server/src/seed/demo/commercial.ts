import type { DemoContext, DemoDomain } from './context';

// Domain "commercial": diisi oleh pemilik domain ini. Orchestrator ada di ../seed-demo.ts dan konteks di ./context.ts.
export const commercialDomain: DemoDomain = {
  key: 'commercial',
  implemented: false,
  title: 'Penjualan: kasir POS, CRM, pesanan, piutang',
  async run(_ctx: DemoContext) {
    // belum diisi
  },
};
