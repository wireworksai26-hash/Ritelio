/**
 * Pembangkit transaksi POS yang deterministik (tanpa akses database, tanpa jam sistem).
 *
 * Kunci transaksi (clientGeneratedId) memuat TANGGAL dan nomor urut hari itu, dan isi tiap transaksi
 * dibangkitkan dari benih kunci itu sendiri. Jadi menjalankan ulang pada hari yang sama menghasilkan
 * rencana identik, dan pergeseran jumlah transaksi satu hari tidak mengubah isi hari-hari lain.
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
  /** rata-rata transaksi per hari sebelum pola pekan, tren, dan derau */
  baseDaily: number;
  /** panjang jendela maksimum (hari ke belakang, hari ini tidak dipakai) */
  days: number;
  /** bobot per jam (24 elemen, indeks = jam WIB) */
  hours: number[];
  /** faktor per hari dalam sepekan (0 = Minggu) */
  dow: number[];
  /** kenaikan hari terbaru dibanding hari terlama, mis. 0.3 = +30% */
  growth: number;
  outletWeights: number[];
  /** bobot jumlah baris item: indeks 0 = 1 baris */
  lineWeights: number[];
  payment: Array<[PosMethod, number]>;
  cashier: Array<[PosRole, number]>;
  catalog: CatalogEntry[];
  /** peluang transaksi dicatat atas nama pelanggan anggota (diskon anggota) */
  memberRate: number;
  members: string[];
  memberDiscountPct: number;
  /** peluang sebuah transaksi memakai promo, dan pilihan besarnya (persen) */
  promoRate: number;
  promoPcts: number[];
}

export interface PlannedSale {
  clientId: string;
  /** hari lalu (0 = hari ini, hanya bila todayMaxHour diisi) */
  dayOffset: number;
  hour: number;
  minute: number;
  outletIdx: number;
  role: PosRole;
  method: PosMethod;
  items: Array<{ sku: string; qty: number }>;
  discountPct: number;
  customerName?: string;
}

/** Batas jumlah per outlet untuk SKU berstok; SKU yang tidak tercantum dianggap tanpa batas (jasa). */
export type Capacity = Array<Map<string, number>>;

/** Perubahan stok luar (bukan penjualan seed ini) pada waktu `at` (ms epoch); masuk positif, keluar negatif. */
export interface StockEvent {
  at: number;
  qty: number;
}
/** Per outlet, per SKU berstok: kejadian stok luar urut waktu (daftar kosong = stok tidak pernah ada). */
export type StockTimeline = Array<Map<string, StockEvent[]>>;
/** Barang berstok yang pasti keluar pada waktu tertentu (pesanan terpenuhi, penjualan kredit). */
export interface FixedUse {
  outletIdx: number;
  sku: string;
  at: number;
  qty: number;
}

export interface PlanOptions {
  /** jumlah hari ke belakang yang dipakai (<= profile.days) */
  windowDays: number;
  /** hari dalam sepekan untuk hari ini (0 = Minggu) */
  todayDow: number;
  /** tanggal YYYY-MM-DD untuk `dayOffset` hari lalu (0 = hari ini) */
  isoOf(dayOffset: number): string;
  capacity?: Capacity;
  /**
   * Bila diisi, hari ini juga mendapat transaksi sampai jam WIB ini (inklusif) supaya tile "Penjualan Hari Ini"
   * tidak kosong. Kosong = hari ini tidak dipakai. Dipilih per tanggal, bukan per jam jalan, agar seed ulang stabil.
   */
  todayMaxHour?: number;
  /**
   * Bila diisi, penjualan tidak pernah melampaui stok yang sudah ADA pada waktunya (barang masuk lewat pembelian,
   * produksi, atau transfer yang tanggalnya lebih baru tidak dipakai lebih awal), sehingga kartu stok urut tanggal
   * tidak pernah negatif.
   */
  timeline?: { events: StockTimeline; fixed: FixedUse[]; timeOf(dayOffset: number, hour: number, minute: number): number };
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

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Bilangan acak [0,1) yang hanya bergantung pada teks `key`. */
export function unitHash(key: string): number {
  return mulberry32(hashString(key))();
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

/** Harga setelah diskon persen, dibulatkan ke Rp 100 terdekat dan tidak pernah di bawah Rp 100. */
export function discountedPrice(sell: number, pct: number): number {
  if (pct <= 0) return sell;
  return Math.max(100, Math.round((sell * (1 - pct / 100)) / 100) * 100);
}

/** Jumlah transaksi satu hari: pola pekan x tren naik x derau, dengan sesekali hari sepi dan hari ramai. */
export function dailyCount(profile: PosProfile, rand: () => number, dayOffset: number, windowDays: number, dow: number): number {
  const recency = 1 + profile.growth * (1 - (Math.max(dayOffset, 1) - 1) / Math.max(windowDays - 1, 1));
  const roll = rand();
  const texture = roll < 0.06 ? 0.6 : roll > 0.95 ? 1.4 : 0.85 + rand() * 0.3;
  return Math.max(1, Math.round(profile.baseDaily * profile.dow[dow] * recency * texture));
}

function planOne(profile: PosProfile, clientId: string, dayOffset: number): PlannedSale {
  const rand = mulberry32(hashString(`pos:${clientId}`));
  const hour = pick(rand, profile.hours.map((w, h) => [h, w] as [number, number]).filter(([, w]) => w > 0));
  const minute = Math.floor(rand() * 60);
  const outletIdx = pick(rand, profile.outletWeights.map((w, i) => [i, w] as [number, number]));

  const wanted = 1 + pick(rand, profile.lineWeights.map((w, i) => [i, w] as [number, number]));
  const items: Array<{ sku: string; qty: number }> = [];
  for (let line = 0; line < wanted; line++) {
    const pool = profile.catalog.filter((e) => !items.some((c) => c.sku === e.sku));
    if (pool.length === 0) break;
    const entry = pick(rand, pool.map((e) => [e, e.weight] as [typeof e, number]));
    items.push({ sku: entry.sku, qty: pick(rand, entry.qty) });
  }

  const method = pick(rand, profile.payment);
  const role = pick(rand, profile.cashier);
  const member = profile.members.length > 0 && rand() < profile.memberRate ? profile.members[Math.floor(rand() * profile.members.length)] : undefined;
  const promo = rand() < profile.promoRate ? pick(rand, profile.promoPcts.map((p) => [p, 1] as [number, number])) : 0;
  const discountPct = member ? Math.max(profile.memberDiscountPct, promo) : promo;

  return { clientId, dayOffset, hour, minute, outletIdx, role, method, items, discountPct, ...(member ? { customerName: member } : {}) };
}

function balanceAt(events: StockEvent[], at: number): number {
  let sum = 0;
  for (const e of events) {
    if (e.at > at) break;
    sum += e.qty;
  }
  return sum;
}

/**
 * Pangkas baris penjualan berurutan waktu agar kumulatif yang keluar (penjualan + pemakaian tetap) tidak pernah
 * melebihi saldo stok luar pada waktu itu. Hanya mengurangi atau menghapus; tidak pernah menambah.
 */
export function limitByTimeline(
  sales: PlannedSale[],
  timeOf: (s: PlannedSale) => number,
  timeline: StockTimeline,
  fixed: FixedUse[],
): PlannedSale[] {
  type Item = { at: number; order: number; sale?: PlannedSale; fixed?: FixedUse };
  const items: Item[] = [
    ...fixed.map((f, i) => ({ at: f.at, order: i, fixed: f })),
    ...sales.map((sale, i) => ({ at: timeOf(sale), order: fixed.length + i, sale })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);

  const used = new Map<string, number>();
  const keptBySale = new Map<string, Array<{ sku: string; qty: number }>>();
  for (const it of items) {
    if (it.fixed) {
      const k = `${it.fixed.outletIdx}|${it.fixed.sku}`;
      used.set(k, (used.get(k) ?? 0) + it.fixed.qty);
      continue;
    }
    const sale = it.sale!;
    const kept: Array<{ sku: string; qty: number }> = [];
    for (const line of sale.items) {
      const events = timeline[sale.outletIdx]?.get(line.sku);
      if (!events) {
        kept.push(line);
        continue;
      }
      const k = `${sale.outletIdx}|${line.sku}`;
      const room = balanceAt(events, it.at) - (used.get(k) ?? 0);
      const qty = Math.floor(Math.min(line.qty, room) * 100) / 100;
      if (qty <= 0) continue;
      used.set(k, (used.get(k) ?? 0) + qty);
      kept.push({ sku: line.sku, qty });
    }
    keptBySale.set(sale.clientId, kept);
  }
  return sales.map((s) => ({ ...s, items: keptBySale.get(s.clientId) ?? [] })).filter((s) => s.items.length > 0);
}

const chronological = (a: PlannedSale, b: PlannedSale) =>
  b.dayOffset - a.dayOffset || a.hour - b.hour || a.minute - b.minute || a.clientId.localeCompare(b.clientId);

/** Rencana penjualan POS, urut dari yang tertua. Tidak pernah melebihi `capacity` per outlet dan SKU. */
export function planPosSales(profile: PosProfile, opts: PlanOptions): PlannedSale[] {
  const windowDays = Math.max(0, Math.min(opts.windowDays, profile.days));

  // 1. Transaksi mentah: jumlah per hari dari benih tanggal, isi tiap transaksi dari benih kuncinya.
  const raw: PlannedSale[] = [];
  const todayCut = opts.todayMaxHour;
  for (let d = windowDays; d >= (todayCut === undefined ? 1 : 0); d--) {
    const iso = opts.isoOf(d);
    const dayRand = mulberry32(hashString(`pos-day:${profile.businessKey}:${iso}`));
    const n = dailyCount(profile, dayRand, d, windowDays, dowOf(opts.todayDow, d));
    for (let k = 0; k < n; k++) {
      const clientId = `demo-${profile.businessKey}-${iso.replace(/-/g, '')}-${String(k + 1).padStart(3, '0')}`;
      const sale = planOne(profile, clientId, d);
      if (d === 0 && todayCut !== undefined && sale.hour > todayCut) continue;
      raw.push(sale);
    }
  }
  raw.sort(chronological);
  const capacity = opts.capacity;
  if (!capacity) return raw;

  // 2. Penipisan seragam: SKU yang permintaannya melebihi kapasitas dikurangi merata sepanjang waktu,
  //    sehingga tren harian tetap hidup (bukan habis di pekan-pekan terakhir).
  const demand = capacity.map(() => new Map<string, number>());
  for (const s of raw) {
    for (const it of s.items) {
      const m = demand[s.outletIdx];
      if (m && capacity[s.outletIdx]?.has(it.sku)) m.set(it.sku, (m.get(it.sku) ?? 0) + it.qty);
    }
  }
  const keepProb = (outletIdx: number, sku: string): number => {
    const cap = capacity[outletIdx]?.get(sku);
    if (cap === undefined) return 1;
    const want = demand[outletIdx]?.get(sku) ?? 0;
    if (want <= 0) return 1;
    return Math.min(1, (0.95 * cap) / want);
  };

  const selected = new Map<string, Array<{ sku: string; qty: number }>>();
  for (const s of raw) {
    selected.set(
      s.clientId,
      s.items.filter((it) => !capacity[s.outletIdx]?.has(it.sku) || unitHash(`${s.clientId}:${it.sku}`) < keepProb(s.outletIdx, it.sku)),
    );
  }

  // Hari yang kosong setelah penipisan (stok awal kecil) tetap diberi satu transaksi kecil agar grafik harian tidak bolong.
  const live = new Set<number>();
  for (const s of raw) if ((selected.get(s.clientId) ?? []).length > 0) live.add(s.dayOffset);
  const seenEmpty = new Set<number>();
  for (const s of raw) {
    if (live.has(s.dayOffset) || seenEmpty.has(s.dayOffset)) continue;
    seenEmpty.add(s.dayOffset);
    selected.set(s.clientId, [{ sku: s.items[0].sku, qty: Math.min(s.items[0].qty, 1) }]);
  }

  // Stok yang belum ada pada waktunya tidak boleh terjual (barang masuk lewat transfer/pembelian bertanggal lebih baru).
  if (opts.timeline) {
    const { events, fixed, timeOf } = opts.timeline;
    const candidates = raw.map((s) => ({ ...s, items: selected.get(s.clientId) ?? [] })).filter((s) => s.items.length > 0);
    const limited = limitByTimeline(candidates, (s) => timeOf(s.dayOffset, s.hour, s.minute), events, fixed);
    const keep = new Map(limited.map((s) => [s.clientId, s.items]));
    for (const s of raw) selected.set(s.clientId, keep.get(s.clientId) ?? []);
  }

  // 3. Anggaran sebagai pengaman akhir: tidak pernah melampaui kapasitas. Dari yang terbaru, supaya bila
  //    ada kekurangan yang terpangkas adalah hari-hari lama, bukan grafik 30 hari terakhir.
  const remaining: Capacity = capacity.map((m) => new Map(m));
  const out: PlannedSale[] = [];
  for (let i = raw.length - 1; i >= 0; i--) {
    const s = raw[i];
    const budget = remaining[s.outletIdx];
    const kept: Array<{ sku: string; qty: number }> = [];
    for (const it of selected.get(s.clientId) ?? []) {
      if (budget?.has(it.sku)) {
        const left = budget.get(it.sku) ?? 0;
        const qty = Math.floor(Math.min(it.qty, left) * 100) / 100;
        if (qty <= 0) continue;
        budget.set(it.sku, left - qty);
        kept.push({ sku: it.sku, qty });
      } else {
        kept.push({ ...it });
      }
    }
    if (kept.length > 0) out.push({ ...s, items: kept });
  }
  return out.reverse();
}

/**
 * Stok yang dipegang tiap outlet setelah distribusi awal: outlet pertama menyimpan sisanya,
 * outlet lain menerima floor(stok x porsi).
 */
export function holdingOf(stock: number, outletShares: number[], outletIdx: number): number {
  const sent = outletShares.map((share, i) => (i === 0 ? 0 : Math.floor(stock * share)));
  if (outletIdx === 0) return stock - sent.reduce((a, b) => a + b, 0);
  return sent[outletIdx];
}

/** Jumlah yang dikirim ke tiap outlet selain yang pertama. */
export function distributionOf(stock: number, outletShares: number[]): number[] {
  return outletShares.map((share, i) => (i === 0 ? 0 : Math.floor(stock * share)));
}

/**
 * Berapa hari ke belakang yang aman dipakai: tanggal dokumen tidak boleh sebelum 2 Januari
 * (kalender fiskal hanya dibuat untuk tahun berjalan). `todayNoon` = ctx.daysAgo(0).
 */
export function maxAgoOf(todayNoon: Date): number {
  const floorMs = Date.UTC(todayNoon.getUTCFullYear(), 0, 2);
  return Math.max(0, Math.floor((todayNoon.getTime() - floorMs) / 86_400_000) - 1);
}

/**
 * Jam WIB terakhir (inklusif) untuk transaksi hari ini, dari menit sejak tengah malam WIB sekarang.
 * Berubah hanya pada 10.30, 14.30, dan 18.30 supaya seed ulang dalam hari yang sama hampir selalu identik
 * dan tidak pernah membuat transaksi di masa depan.
 */
export function todayCutHour(nowWibMinutes: number): number | undefined {
  if (nowWibMinutes >= 18 * 60 + 30) return 17;
  if (nowWibMinutes >= 14 * 60 + 30) return 13;
  if (nowWibMinutes >= 10 * 60 + 30) return 9;
  return undefined;
}
