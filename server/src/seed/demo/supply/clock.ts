/**
 * Jam "mundur" untuk seed data contoh.
 *
 * Banyak service aplikasi memakai `new Date()` untuk tanggal jurnal, tanggal jatuh tempo, nomor dokumen, dan
 * waktu transisi status (diterima, dikirim, ditutup, selesai), dan tidak menerimanya sebagai parameter. Alih-alih
 * menulis ulang tanggal jurnal dengan update mentah, blok kerja dijalankan di bawah jam yang digeser: seluruh
 * `new Date()` / `Date.now()` di dalamnya mengembalikan waktu target (waktu terus berjalan normal setelah itu).
 * Hasilnya jurnal, periode fiskal, nomor jurnal, dan tanggal jatuh tempo lahir konsisten lewat jalur aplikasi.
 *
 * Yang TIDAK terpengaruh: kolom bawaan database (`@default(now())`, mis. createdAt). Itu dirapikan terpisah
 * dengan update kosmetik terarah (lihat execute.ts).
 */

type Proxied = DateConstructor;

let active = false;

/** Waktu nyata dari jam digeser: dipakai blok yang sedang berjalan untuk menghitung selisih. */
export function shiftedNow(realNow: number, offsetMs: number): number {
  return realNow - offsetMs;
}

/** Target tidak boleh di masa depan: jam hanya boleh mundur. */
export function clampTarget(target: Date, realNow: number): number {
  return Math.min(target.getTime(), realNow);
}

/**
 * Jalankan `fn` dengan jam sistem seolah-olah sekarang adalah `at`.
 * Tidak boleh bersarang. Jam selalu dipulihkan, juga bila `fn` melempar.
 */
export async function withClock<T>(at: Date, fn: () => Promise<T>): Promise<T> {
  if (active) throw new Error('withClock tidak boleh bersarang.');
  const Real = globalThis.Date;
  const offset = Real.now() - clampTarget(at, Real.now());

  const shifted = new Proxy(Real, {
    construct(target, args: unknown[]) {
      // Tanpa argumen = "sekarang" yang digeser. Dengan argumen = tanggal biasa, tidak disentuh.
      return args.length === 0
        ? new target(shiftedNow(Real.now(), offset))
        : Reflect.construct(target, args);
    },
    get(target, prop, receiver) {
      if (prop === 'now') return () => shiftedNow(Real.now(), offset);
      return Reflect.get(target, prop, receiver);
    },
    apply() {
      return new Real(shiftedNow(Real.now(), offset)).toString();
    },
  }) as Proxied;

  active = true;
  globalThis.Date = shifted;
  try {
    return await fn();
  } finally {
    globalThis.Date = Real;
    active = false;
  }
}
