export type AssetStatus = 'active' | 'fully_depreciated' | 'disposed';
export type DepreciationMethod = 'straight_line' | 'declining_balance';

export interface FixedAsset {
  id: string;
  code: string;
  name: string;
  category: string;
  location: string;
  acquisitionDate: string;
  acquisitionCost: number | string;
  salvageValue: number | string;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  decliningRate: number | string | null;
  accumulatedDepreciation: number | string;
  status: AssetStatus;
  disposedAt: string | null;
  disposalProceeds: number | string | null;
  bookValue: number | string;
}

export interface DepreciationScheduleRow {
  id: string;
  periodId: string;
  depreciation: number | string;
  accumulated: number | string;
  bookValue: number | string;
  createdAt: string;
}

export interface FixedAssetDetail extends FixedAsset {
  schedules: DepreciationScheduleRow[];
}

export interface FiscalPeriod {
  id: string;
  code: string;
  name: string;
  status: 'open' | 'closed';
  startDate: string;
  endDate: string;
}

export interface DepreciationRunResult {
  period: string;
  processed: number;
  skipped: number;
  totalDepreciation?: number;
  message?: string;
  data?: Array<{ code: string; depreciation: number; bookValue: number; status: string }>;
}

export const num = (v: unknown) => Number(v) || 0;

export const STATUS_LABEL: Record<AssetStatus, string> = {
  active: 'Aktif',
  fully_depreciated: 'Habis disusutkan',
  disposed: 'Dihapus buku',
};

export function methodLabel(asset: Pick<FixedAsset, 'depreciationMethod' | 'decliningRate'>): string {
  if (asset.depreciationMethod === 'declining_balance') {
    const rate = num(asset.decliningRate);
    return `Saldo menurun${rate > 0 ? ` ${Math.round(rate * 10000) / 100}%` : ''}`;
  }
  return 'Garis lurus';
}
