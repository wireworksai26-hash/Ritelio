import type { DemoContext, DemoDomain } from './context';

// Domain "finance": diisi oleh pemilik domain ini. Orchestrator ada di ../seed-demo.ts dan konteks di ./context.ts.
export const financeDomain: DemoDomain = {
  key: 'finance',
  implemented: false,
  title: 'Keuangan: bank, aset tetap, jurnal manual, kurs',
  async run(_ctx: DemoContext) {
    // belum diisi
  },
};
