/**
 * Pembangkit transaksi POS yang deterministik (tanpa akses database, tanpa jam sistem).
 * Masukan sama -> keluaran sama, sehingga kunci transaksi (clientGeneratedId) stabil untuk seed berulang.
 */

export type PosMethod = 'cash' | 'qris' | 'debit' | 'transfer';
export type PosRole = 'cashier' | 'manager';

export interface CatalogEntry {
  sku: string;
  weight: number;
  /** pasangan [jumlah, bobot] */
  qty: Array<[number, number]>;
}

export interface PosProfile {
  businessKey: string;
  /** jumlah transaksi yang dituju */
  count: number;
  /** transaksi tersebar pada 1..days hari lalu (hari ini tidak dipakai agar jam tidak melampaui sekarang) */
  days: number;
  /** bobot per jam (24 elemen, indeks = jam WIB) */
  hours: number[];
  /** bobot per hari dalam sepekan (0 = Minggu) */
  dow: number[];
  /** kenaikan bobot hari terbaru dibanding hari terlama, mis. 0.3 = +30% */
  growth: number;
  outletWeights: number[];
  /** bobot jumlah baris item: indeks 0 = 1 baris */
  lineWeights: number[];
  payment: Array<[PosMethod, number]>;
  cashier: Array<[PosRole, number]>;
  catalog: CatalogEntry[];
  /** peluang transaksi non-kredit diberi pelanggan anggota */
  memberRate: number;
  members: string[];
}

export interface PlannedSale {
  clientId: string;
  /** hari lalu (>= 1) */
  dayOffset: number;
  hour: number;
  minute: number;
  outletIdx: number;
  role: PosRole;
  method: PosMethod;
  items: Array<{ sku: string; qty: number }>;
  customerName?: string;
}

/** Batas jumlah per outlet untuk SKU berstok; SKU yang tidak tercantum dianggap tanpa batas (jasa). */
export type Capacity = Array<Map<string, number>>;

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

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rand: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Hari dalam sepekan (0 = Minggu) untuk `dayOffset` hari sebelum hari yang jatuh pada `todayDow`. */
export function dowOf(todayDow: number, dayOffset: number): number {
  return (((todayDow - dayOffset) % 7) + 7) % 7;
}

/** Bagi `total` ke hari-hari menurut bobot dengan pembulatan sisa terbesar (jumlahnya tepat `total`). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map((r) => Math.floor(r));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) out[order[k % order.length].i] += 1;
  return out;
}

export function planSales(profile: PosProfile, capacity: Capacity, todayDow: number): PlannedSale[] {
  const rand = mulberry32(hashString(`pos:${profile.businessKey}`));

  // 1. Berapa transaksi tiap hari: pola pekan + tren naik + sedikit derau.
  const offsets = Array.from({ length: profile.days }, (_, i) => profile.days - i); // tertua dulu
  const weights = offsets.map((d) => {
    const recency = 1 + profile.growth * (1 - (d - 1) / Math.max(profile.days - 1, 1));
    const noise = 0.85 + rand() * 0.3;
    return profile.dow[dowOf(todayDow, d)] * recency * noise;
  });
  const perDay = allocate(profile.count, weights);

  // 2. Slot waktu.
  const slots: Array<Pick<PlannedSale, 'dayOffset' | 'hour' | 'minute'>> = [];
  offsets.forEach((dayOffset, i) => {
    for (let n = 0; n < perDay[i]; n++) {
      const hour = pick(rand, profile.hours.map((w, h) => [h, w] as [number, number]).filter(([, w]) => w > 0));
      slots.push({ dayOffset, hour, minute: Math.floor(rand() * 60) });
    }
  });
  slots.sort((a, b) => b.dayOffset - a.dayOffset || a.hour - b.hour || a.minute - b.minute);

  // 3. Isi item dalam urutan acak agar stok yang menipis tidak selalu "memakan" hari-hari terbaru.
  const remaining: Capacity = capacity.map((m) => new Map(m));
  const order = slots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const drafts = new Map<number, PlannedSale>();
  for (const idx of order) {
    const slot = slots[idx];
    const outletIdx = pick(rand, profile.outletWeights.map((w, i) => [i, w] as [number, number]));
    const budget = remaining[outletIdx] ?? new Map<string, number>();
    const available = (e: CatalogEntry) => !budget.has(e.sku) || (budget.get(e.sku) ?? 0) > 0;

    const wanted = 1 + pick(rand, profile.lineWeights.map((w, i) => [i, w] as [number, number]));
    const chosen: Array<{ sku: string; qty: number }> = [];
    for (let line = 0; line < wanted; line++) {
      const pool = profile.catalog.filter((e) => available(e) && !chosen.some((c) => c.sku === e.sku));
      if (pool.length === 0) break;
      const entry = pick(rand, pool.map((e) => [e, e.weight] as [CatalogEntry, number]));
      let qty = pick(rand, entry.qty);
      if (budget.has(entry.sku)) {
        const left = budget.get(entry.sku) ?? 0;
        qty = Math.min(qty, left);
        budget.set(entry.sku, left - qty);
      }
      if (qty > 0) chosen.push({ sku: entry.sku, qty });
    }
    if (chosen.length === 0) continue;

    const method = pick(rand, profile.payment);
    const role = pick(rand, profile.cashier);
    const member = profile.members.length > 0 && rand() < profile.memberRate ? profile.members[Math.floor(rand() * profile.members.length)] : undefined;
    drafts.set(idx, {
      clientId: '',
      ...slot,
      outletIdx,
      role,
      method,
      items: chosen,
      ...(member ? { customerName: member } : {}),
    });
  }

  // 4. Kunci berurutan menurut waktu (tertua = 0001).
  const ordered = [...drafts.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
  ordered.forEach((s, i) => {
    s.clientId = `demo-${profile.businessKey}-${String(i + 1).padStart(4, '0')}`;
  });
  return ordered;
}

/** Kapasitas jual per outlet: porsi stok tiap outlet dikali `fraction`; jasa tidak dimasukkan. */
export function buildCapacity(
  products: Array<{ sku: string; kind?: string; stock?: number }>,
  outletShares: number[],
  fraction: number,
): Capacity {
  return outletShares.map((_, o) => {
    const map = new Map<string, number>();
    for (const p of products) {
      if (p.kind === 'service') continue;
      map.set(p.sku, Math.floor(holdingOf(p.stock ?? 0, outletShares, o) * fraction));
    }
    return map;
  });
}

/**
 * Stok yang dipegang tiap outlet setelah distribusi awal: outlet pertama menyimpan sisanya,
 * outlet lain menerima floor(stok x porsi). Sama persis dengan jumlah yang ditransfer saat seed.
 */
export function holdingOf(stock: number, outletShares: number[], outletIdx: number): number {
  const sent = outletShares.map((share, i) => (i === 0 ? 0 : Math.floor(stock * share)));
  if (outletIdx === 0) return stock - sent.reduce((a, b) => a + b, 0);
  return sent[outletIdx];
}
