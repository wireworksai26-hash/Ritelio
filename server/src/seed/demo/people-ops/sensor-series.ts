/**
 * Pembangkit pembacaan sensor yang murni dan deterministik (PRNG berbenih dari kode sensor).
 * Dipakai untuk mengisi riwayat 48 jam tiap 30 menit, termasuk anomali yang ditentukan eksplisit.
 */

export type SeriesShape = 'flat' | 'duty' | 'production';

export interface SensorAnomaly {
  /** berapa jam sebelum pembacaan terakhir anomali itu berakhir (0 = sampai pembacaan terakhir) */
  endHoursAgo: number;
  /** jumlah pembacaan berturut-turut yang terdampak */
  slots: number;
  /** ditambahkan ke nilai normal */
  offset: number;
}

export interface SeriesSpec {
  code: string;
  shape: SeriesShape;
  /** flat: nilai dasar. duty: daya saat mesin menyala. production: tambahan per pembacaan saat produksi. */
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
export const READINGS_48H = 96;

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

/** Pembacaan terakhir jatuh di kelipatan 30 menit terdekat yang tidak melewati `now`. */
export function lastSlot(now: Date): Date {
  const step = STEP_MINUTES * 60_000;
  return new Date(Math.floor(now.getTime() / step) * step);
}

function wibHour(d: Date): number {
  return (d.getUTCHours() + 7 + d.getUTCMinutes() / 60) % 24;
}

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

export function generateReadings(spec: SeriesSpec, end: Date, count = READINGS_48H): Reading[] {
  const rand = seededRandom(seedFromText(spec.code));
  const decimals = spec.decimals ?? (spec.shape === 'production' ? 0 : 2);
  const [from, to] = spec.activeHours ?? [4, 14];
  const out: Reading[] = [];
  let counter = spec.idle ?? 0;

  for (let i = 0; i < count; i++) {
    const at = new Date(end.getTime() - (count - 1 - i) * STEP_MINUTES * 60_000);
    const hour = wibHour(at);
    const active = hour >= from && hour < to;
    const jitter = (rand() * 2 - 1) * spec.noise;

    let value: number;
    if (spec.shape === 'duty') {
      value = (active ? spec.baseline : (spec.idle ?? 0)) + jitter * (active ? 1 : 0.2);
    } else if (spec.shape === 'production') {
      // penghitung kumulatif: hanya bertambah saat jam produksi
      const add = active ? Math.max(0, spec.baseline + jitter) : 0;
      counter += add;
      value = counter;
    } else {
      const cycle = spec.dailyAmplitude ? Math.sin(((hour - 6) / 24) * Math.PI * 2) * spec.dailyAmplitude : 0;
      value = spec.baseline + cycle + jitter;
    }

    for (const a of spec.anomalies ?? []) {
      const lastIdx = count - 1 - Math.round(a.endHoursAgo * (60 / STEP_MINUTES));
      if (i > lastIdx - a.slots && i <= lastIdx) {
        // bentuk lonjakan: naik, puncak, turun, supaya tidak terlihat seperti tangga
        const pos = (i - (lastIdx - a.slots + 1) + 1) / (a.slots + 1);
        const shape = a.slots <= 2 ? 1 : Math.sin(pos * Math.PI) * 0.35 + 0.65;
        value += a.offset * shape;
      }
    }
    out.push({ recordedAt: at, value: round(Math.max(value, 0), decimals) });
  }
  return out;
}
