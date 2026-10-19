/**
 * Pembangkit pembacaan sensor yang murni dan deterministik (PRNG berbenih dari kode sensor).
 * Dipakai untuk mengisi riwayat ±10 hari: tiap 30 menit pada 48 jam terakhir (supaya grafik 6/24/72 jam rapat),
 * tiap 60 menit sebelumnya, termasuk anomali yang ditentukan eksplisit.
 */

export type SeriesShape = 'flat' | 'duty' | 'production';

export interface SensorAnomaly {
  /** berapa jam sebelum pembacaan terakhir anomali itu berakhir (0 = sampai pembacaan terakhir) */
  endHoursAgo: number;
  /** lama anomali dalam jam */
  durationHours: number;
  /** ditambahkan ke nilai normal pada puncak */
  offset: number;
  /** spike = naik lalu turun (pintu terbuka); sustained = naik dan bertahan sampai akhir jendela anomali */
  form?: 'spike' | 'sustained';
}

export interface SeriesSpec {
  code: string;
  shape: SeriesShape;
  /** flat: nilai dasar. duty: daya/getaran saat mesin menyala. production: tambahan per pembacaan saat produksi. */
  baseline: number;
  /** duty: daya saat siaga. production: nilai awal penghitung. */
  idle?: number;
  noise: number;
  /** amplitudo siklus harian (flat) */
  dailyAmplitude?: number;
  /** jam kerja WIB untuk duty/production [mulai, selesai) */
  activeHours?: [number, number];
  decimals?: number;
  anomalies?: SensorAnomaly[];
}

export interface Reading {
  recordedAt: Date;
  value: number;
}

export const STEP_MINUTES = 30;
const HOUR_MS = 3_600_000;
const DENSE_HOURS = 48;

/** mulberry32: PRNG kecil dengan benih 32-bit. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Waktu pembacaan menaik: 30 menit sekali pada 48 jam terakhir, lalu 60 menit sekali hingga `days` hari ke belakang.
 * Pembacaan paling awal jatuh tepat `spanMs(days)` sebelum `end`, sehingga `end` bisa dipulihkan dari pembacaan
 * tertua yang sudah tersimpan (menjalankan ulang tidak menggeser waktu dan tidak menggandakan baris).
 */
export function readingSlots(end: Date, days: number): Date[] {
  const out: Date[] = [];
  const dense = (DENSE_HOURS * 60) / STEP_MINUTES;
  for (let k = 0; k < dense; k++) out.push(new Date(end.getTime() - k * STEP_MINUTES * 60_000));
  const sparse = Math.max(days * 24 - DENSE_HOURS, 0);
  for (let j = 0; j < sparse; j++) out.push(new Date(end.getTime() - (DENSE_HOURS + j) * HOUR_MS));
  return out.reverse();
}

/** Jarak (ms) dari pembacaan terakhir ke pembacaan tertua untuk `days` hari. */
export function spanMs(days: number): number {
  return -readingSlots(new Date(0), days)[0].getTime();
}

function wibHour(d: Date): number {
  return (d.getUTCHours() + 7 + d.getUTCMinutes() / 60) % 24;
}

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

export function generateReadings(spec: SeriesSpec, slots: Date[]): Reading[] {
  if (slots.length === 0) return [];
  const rand = seededRandom(seedFromText(spec.code));
  const decimals = spec.decimals ?? (spec.shape === 'production' ? 0 : 2);
  const [from, to] = spec.activeHours ?? [4, 14];
  const last = slots[slots.length - 1].getTime();
  const out: Reading[] = [];
  let counter = spec.idle ?? 0;

  for (const at of slots) {
    const hour = wibHour(at);
    const active = hour >= from && hour < to;
    const jitter = (rand() * 2 - 1) * spec.noise;

    let value: number;
    if (spec.shape === 'duty') {
      value = (active ? spec.baseline : (spec.idle ?? 0)) + jitter * (active ? 1 : 0.2);
    } else if (spec.shape === 'production') {
      // penghitung kumulatif: hanya bertambah saat jam produksi
      counter += active ? Math.max(0, spec.baseline + jitter) : 0;
      value = counter;
    } else {
      const cycle = spec.dailyAmplitude ? Math.sin(((hour - 6) / 24) * Math.PI * 2) * spec.dailyAmplitude : 0;
      value = spec.baseline + cycle + jitter;
    }

    const hoursAgo = (last - at.getTime()) / HOUR_MS;
    for (const a of spec.anomalies ?? []) {
      const rel = hoursAgo - a.endHoursAgo;
      if (rel < 0 || rel >= a.durationHours) continue;
      // pos: 0 di awal anomali, 1 di akhirnya (rel dihitung mundur dari akhir)
      const pos = 1 - rel / a.durationHours;
      const shape = a.form === 'sustained' ? Math.min(1, pos * 3) : Math.sin(pos * Math.PI);
      value += a.offset * shape;
    }
    out.push({ recordedAt: at, value: round(Math.max(value, 0), decimals) });
  }
  return out;
}
