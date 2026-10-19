import type { DemoContext, DemoDomain } from './context';
import { runCommercial } from './commercial/run';

// Domain "commercial": POS harian, CRM (prospek sampai penerimaan pelanggan), pesanan, dan piutang.
// Orchestrator ada di ../seed-demo.ts dan konteks di ./context.ts.
export const commercialDomain: DemoDomain = {
  key: 'commercial',
  title: 'Penjualan: kasir POS, CRM, pesanan, piutang',
  async run(ctx: DemoContext) {
    await runCommercial(ctx);
  },
};
