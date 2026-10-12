import { roundMoney } from '../../common/utils/money';

/**
 * Prakiraan permintaan: moving average berbobot (bobot linier, bulan terbaru
 * paling berat) + buffer 5%. Bukan model musiman, dan tidak diklaim begitu.
 * Fungsi murni: `now` dan data masuk lewat argumen.
 */

export interface SaleMovement {
  productId: string;
  quantity: number | string | { toString(): string };
  createdAt: Date;
  product: { sku: string; name: string; unit: string; reorderPoint: unknown; reorderQty: unknown };
}

export interface ForecastProduct {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  history: number[];
  averageMonthly: number;
  weightedMonthly: number;
  trendPct: number;
  lastMonthQty: number;
  forecast: Array<{ monthOffset: number; qty: number }>;
  reorderPoint: number;
  reorderQty: number;
  suggestsReorder: boolean;
}

/** Hasil trend dibatasi supaya satu bulan lonjakan tidak melipatgandakan prakiraan tanpa batas. */
const TREND_FLOOR_PCT = -100;
const TREND_CEIL_PCT = 200;

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Awal bulan (00:00 UTC), `months` bulan sebelum bulan berjalan. */
export function forecastWindowStart(now: Date, months: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
}

/** Kunci bulan berurutan dari `from`, sebanyak `months`; bulan berjalan (parsial) tidak masuk. */
export function forecastMonthKeys(from: Date, months: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < months; i++) {
    keys.push(monthKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1))));
  }
  return keys;
}

export function weightedAverage(series: number[]): number {
  if (series.length === 0) return 0;
  const weights = series.map((_, i) => i + 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return series.reduce((sum, v, i) => sum + v * weights[i], 0) / weightSum;
}

export function computeDemandForecast(
  movements: SaleMovement[],
  opts: { months: number; horizon: number; now: Date },
) {
  const months = Math.max(1, Math.floor(opts.months));
  const horizon = Math.max(1, Math.floor(opts.horizon));
  const from = forecastWindowStart(opts.now, months);
  const keys = forecastMonthKeys(from, months);
  const keySet = new Set(keys);

  const buckets = new Map<string, Map<string, number>>();
  const samples = new Map<string, SaleMovement['product']>();
  for (const m of movements) {
    const qty = Math.abs(Number(m.quantity));
    if (!Number.isFinite(qty)) continue; // baris rusak tidak boleh meracuni seluruh prakiraan
    const key = monthKey(m.createdAt);
    if (!keySet.has(key)) continue; // bulan berjalan (parsial) dan di luar rentang diabaikan
    if (!buckets.has(m.productId)) buckets.set(m.productId, new Map());
    const perMonth = buckets.get(m.productId)!;
    perMonth.set(key, (perMonth.get(key) ?? 0) + qty);
    if (!samples.has(m.productId)) samples.set(m.productId, m.product);
  }

  const products: ForecastProduct[] = [...buckets.entries()].map(([productId, perMonth]) => {
    const series = keys.map((k) => perMonth.get(k) ?? 0);
    const weighted = weightedAverage(series);
    const simpleAvg = series.reduce((a, b) => a + b, 0) / series.length;

    const last = series[series.length - 1] ?? 0;
    const previous = series[series.length - 2] ?? 0;
    const trendPct = previous > 0 ? roundMoney(((last - previous) / previous) * 100) : 0;
    const effectiveTrend = Math.min(Math.max(trendPct, TREND_FLOOR_PCT), TREND_CEIL_PCT);

    const sample = samples.get(productId)!;
    const baseForecast = Math.round(weighted * 1.05); // buffer 5% untuk ketidakpastian
    const reorderPoint = Number(sample.reorderPoint);
    return {
      productId,
      sku: sample.sku,
      name: sample.name,
      unit: sample.unit,
      history: series,
      averageMonthly: roundMoney(simpleAvg),
      weightedMonthly: roundMoney(weighted),
      trendPct,
      lastMonthQty: roundMoney(last),
      forecast: Array.from({ length: horizon }, (_, i) => ({
        monthOffset: i + 1,
        qty: Math.max(0, Math.round(baseForecast * (1 + (effectiveTrend / 100) * ((i + 1) / 2)))),
      })),
      reorderPoint,
      reorderQty: Number(sample.reorderQty),
      suggestsReorder: reorderPoint > 0 && baseForecast >= reorderPoint,
    };
  });

  return {
    method: 'weighted-moving-average' as const,
    monthsAnalyzed: months,
    horizonMonths: horizon,
    from,
    products: products.sort((a, b) => b.weightedMonthly - a.weightedMonthly || a.sku.localeCompare(b.sku)),
    note:
      products.length === 0
        ? 'Belum ada riwayat penjualan pada rentang ini, prakiraan kosong.'
        : 'Prakiraan memakai moving average berbobot, bukan model musiman.',
  };
}
