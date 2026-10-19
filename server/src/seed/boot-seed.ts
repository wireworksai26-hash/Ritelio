import 'reflect-metadata';
import { MIN_MASTER_LENGTH } from './seed-passwords';

type Env = Record<string, string | undefined>;

export interface BootSeedPlan {
  run: boolean;
  /** Alasan ringkas; dicetak bila seed diminta tetapi dilewati. */
  reason: string;
  /** true bila pengguna memang meminta seed (flag "yes"), supaya penolakan bisa dicatat sebagai peringatan. */
  requested: boolean;
  /** Isi juga data transaksi contoh (seed:demo). Hanya bermakna bila run = true. */
  demo: boolean;
}

/**
 * Seed tiga usaha saat service start, supaya akun contoh bisa dibuat dari Railway saja (dua variabel lalu
 * redeploy) tanpa menjalankan apa pun dari komputer.
 *
 *   SEED_BUSINESSES_ON_BOOT=yes   menyalakan fitur ini
 *   SEED_MASTER_SECRET=...        wajib (min. 16 karakter); kata sandi semua akun diturunkan darinya
 *   SEED_DEMO_ON_BOOT=no          opsional; bawaannya data transaksi contoh (penjualan, CRM, bank, SDM, ...) ikut
 *                                 diisi supaya menu dan grafik owner tidak kosong. "no" = hanya akun dan master data.
 *
 * Mati secara bawaan. Setelah akun terbentuk, hapus SEED_BUSINESSES_ON_BOOT: seed aman diulang, tetapi
 * menambah beberapa detik pada tiap start.
 */
export function bootSeedPlan(env: Env): BootSeedPlan {
  if (env.SEED_BUSINESSES_ON_BOOT !== 'yes') {
    return { run: false, requested: false, demo: false, reason: 'SEED_BUSINESSES_ON_BOOT tidak diset ke "yes"' };
  }
  const master = (env.SEED_MASTER_SECRET ?? '').trim();
  if (master.length < MIN_MASTER_LENGTH) {
    // Tidak pernah membangkitkan kunci acak di sini: kata sandi tidak dicetak ke log, jadi kunci yang tidak
    // diketahui pengguna berarti akun yang tidak bisa dipakai siapa pun.
    return {
      run: false,
      requested: true,
      demo: false,
      reason: `SEED_MASTER_SECRET wajib diisi (minimal ${MIN_MASTER_LENGTH} karakter) agar kata sandi bisa diturunkan`,
    };
  }
  return { run: true, requested: true, demo: env.SEED_DEMO_ON_BOOT !== 'no', reason: 'seed saat start diminta' };
}

/** Tidak pernah gagal: kegagalan seed hanya dicatat, server tetap dinyalakan. */
async function main(): Promise<void> {
  const plan = bootSeedPlan(process.env);
  if (!plan.run) {
    if (plan.requested) console.warn(`[boot-seed] dilewati: ${plan.reason}`);
    return;
  }
  console.log('[boot-seed] membuat tiga usaha contoh (tidak menghapus apa pun, aman diulang)');
  try {
    // Dimuat saat dibutuhkan agar start biasa tidak membayar biaya memuat seluruh aplikasi dua kali.
    const { seedBusinesses } = await import('./seed-businesses');
    await seedBusinesses({ printPasswords: false });
    console.log('[boot-seed] akun dan master data selesai');
    if (plan.demo) {
      console.log('[boot-seed] mengisi data transaksi contoh (bisa beberapa menit pada start pertama)');
      const { seedDemo } = await import('./seed-demo');
      // Menyalakan seed saat start adalah persetujuan eksplisit, jadi larangan produksi seed:demo tidak berlaku.
      const failures = await seedDemo({ allowProduction: true });
      if (failures > 0) console.error(`[boot-seed] data transaksi contoh: ${failures} langkah gagal (dapat diulang, yang selesai dilewati)`);
    }
    console.log('[boot-seed] selesai');
  } catch (err) {
    console.error('[boot-seed] gagal, server tetap dinyalakan:', err instanceof Error ? err.message : err);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
