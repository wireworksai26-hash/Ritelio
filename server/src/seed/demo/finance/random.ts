/** Pembangkit acak berbenih: masukan sama menghasilkan keluaran sama, sehingga seed aman diulang. */

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Angka 0..1 yang hanya bergantung pada kunci (tidak pada urutan pemanggilan). */
export function unitFor(key: string): number {
  return mulberry32(hashString(key))();
}

export function roundTo(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

export function ceilTo(value: number, unit: number): number {
  return Math.ceil(value / unit) * unit;
}

/**
 * Bagi `total` menurut bobot dan bulatkan ke `unit`; selisih pembulatan ditaruh di elemen terakhir
 * sehingga jumlahnya tepat `total` (dibulatkan ke unit).
 */
export function allocate(total: number, weights: number[], unit: number, min = 0): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const target = roundTo(total, unit);
  const parts = weights.map((w) => roundTo((total * w) / sum, unit));
  const drift = target - parts.reduce((s, v) => s + v, 0);
  parts[parts.length - 1] += drift;
  if (min > 0 && target >= min * parts.length) floorParts(parts, min, unit);
  return parts;
}

/** Naikkan bagian di bawah `min`, lalu ambil selisihnya dari bagian terbesar; jumlah total tetap. */
function floorParts(parts: number[], min: number, unit: number): void {
  let deficit = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] < min) {
      deficit += min - parts[i];
      parts[i] = min;
    }
  }
  while (deficit > 0) {
    let big = 0;
    for (let i = 1; i < parts.length; i++) if (parts[i] > parts[big]) big = i;
    const room = parts[big] - min;
    if (room <= 0) return;
    const take = Math.min(room, deficit, Math.max(unit, roundTo(deficit / 2, unit)));
    parts[big] -= take;
    deficit -= take;
  }
}
