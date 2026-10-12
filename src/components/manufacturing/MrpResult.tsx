import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { formatIDR, formatNumber } from '../../lib/format';

export interface MrpRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  level: number;
  requiredQty: number;
  onHand: number;
  shortageQty: number;
  avgCost: number;
  estimatedCost: number;
}

export interface MrpData {
  product: { id: string; sku: string; name: string; unit: string };
  qty: number;
  rows: MrpRow[];
  totalEstimatedCost: number;
  shortages: MrpRow[];
}

/** Kebutuhan bahan hasil ledakan BOM. Baris level 0 adalah produk jadinya sendiri sehingga tidak ditampilkan sebagai bahan. */
export function MrpResult({ data }: { data: MrpData }) {
  const rows = data.rows.filter((r) => r.level > 0);

  if (rows.length === 0) {
    return (
      <Card className="p-5 text-body-sm text-fossil">
        {data.product.name} belum punya BOM aktif, jadi tidak ada kebutuhan bahan yang bisa dihitung. Buat BOM di tab Bill of Materials.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Bahan', value: String(rows.length) },
          { label: 'Kurang stok', value: String(data.shortages.filter((s) => s.level > 0).length) },
          { label: 'Biaya kekurangan', value: formatIDR(data.totalEstimatedCost) },
        ].map((s) => (
          <Card key={s.label} className="px-3 py-2.5 min-w-0">
            <p className="text-caption text-fossil truncate">{s.label}</p>
            <p className="text-[15px] sm:text-[17px] text-ink tnum break-words mt-0.5">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-sand">
          {rows.map((r) => (
            <li key={r.productId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0" style={{ paddingLeft: Math.min(r.level - 1, 4) * 12 }}>
                  <p className="text-[15px] text-ink break-words">{r.name}</p>
                  <p className="text-caption text-fossil tnum">
                    {r.sku}
                    {r.level > 1 ? ` · level ${r.level}` : ''}
                  </p>
                </div>
                {r.shortageQty > 0 ? <Badge variant="outline">Kurang</Badge> : <Badge variant="accent">Cukup</Badge>}
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-body-sm">
                <div>
                  <dt className="text-caption text-fossil">Butuh</dt>
                  <dd className="tnum text-ink">
                    {formatNumber(r.requiredQty)} {r.unit}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-fossil">Stok</dt>
                  <dd className="tnum text-ink">{formatNumber(r.onHand)}</dd>
                </div>
                <div>
                  <dt className="text-caption text-fossil">Kurang</dt>
                  <dd className={`tnum ${r.shortageQty > 0 ? 'text-rose-700 font-medium' : 'text-fossil'}`}>
                    {r.shortageQty > 0 ? formatNumber(r.shortageQty) : '0'}
                  </dd>
                </div>
              </dl>
              {r.shortageQty > 0 && r.estimatedCost > 0 && (
                <p className="text-caption text-fossil mt-1.5 tnum">Perkiraan biaya melengkapi {formatIDR(r.estimatedCost)}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
