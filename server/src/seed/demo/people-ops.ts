import type { DemoContext, DemoDomain } from './context';

// Domain "people-ops": diisi oleh pemilik domain ini. Orchestrator ada di ../seed-demo.ts dan konteks di ./context.ts.
export const peopleOpsDomain: DemoDomain = {
  key: 'people-ops',
  implemented: false,
  title: 'SDM, proyek, logistik, perawatan, dan IoT',
  async run(_ctx: DemoContext) {
    // belum diisi
  },
};
