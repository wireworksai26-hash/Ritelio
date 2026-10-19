import type { DemoContext, DemoDomain } from './context';
import { KOPI_SENJA_PEOPLE_OPS } from './people-ops/data-kopisenja';
import { LAUNDRY_SEGAR_PEOPLE_OPS } from './people-ops/data-laundrysegar';
import { ROTI_NUSANTARA_PEOPLE_OPS } from './people-ops/data-rotinusantara';
import { seedFleet } from './people-ops/fleet';
import { seedHr } from './people-ops/hr';
import { seedIot } from './people-ops/iot';
import { seedProjects } from './people-ops/projects';
import type { PeopleOpsSeed } from './people-ops/types';

export const PEOPLE_OPS_SEEDS: Record<string, PeopleOpsSeed> = {
  kopisenja: KOPI_SENJA_PEOPLE_OPS,
  rotinusantara: ROTI_NUSANTARA_PEOPLE_OPS,
  laundrysegar: LAUNDRY_SEGAR_PEOPLE_OPS,
};

/**
 * SDM (rekrutmen, cuti, absensi, KPI, payroll), proyek, armada dan pengiriman, perawatan, dan IoT.
 * Semua lewat service aplikasi; yang tidak bisa (tanggal historis, status proyek) dikoreksi dengan update
 * kosmetik yang dikomentari di tempatnya. Urutan penting: karyawan baru dari rekrutmen harus ada sebelum absensi
 * dan payroll, dan payroll sesudah absensi karena lembur dihitung darinya.
 */
export const peopleOpsDomain: DemoDomain = {
  key: 'people-ops',
  title: 'SDM, proyek, logistik, perawatan, dan IoT',
  async run(ctx: DemoContext) {
    const seed = PEOPLE_OPS_SEEDS[ctx.biz.key];
    if (!seed) {
      ctx.log(`people-ops: tidak ada data untuk usaha "${ctx.biz.key}", dilewati`);
      return;
    }
    await seedHr(ctx, seed.hr);
    await seedProjects(ctx, seed.projects);
    await seedFleet(ctx, seed.fleet);
    await seedIot(ctx, seed.sensors);
  },
};
