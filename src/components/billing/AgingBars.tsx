import { Card, CardBody, CardHeader } from '../ui/Card';
import { cn, formatIDR } from '../../lib/format';

export interface AgingData {
  total: number;
  buckets: { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number };
}

const BUCKETS: Array<{ key: keyof AgingData['buckets']; label: string; late: boolean }> = [
  { key: 'current', label: 'Belum jatuh tempo', late: false },
  { key: 'd1_30', label: 'Telat 1-30 hari', late: true },
  { key: 'd31_60', label: 'Telat 31-60 hari', late: true },
  { key: 'd61_90', label: 'Telat 61-90 hari', late: true },
  { key: 'd90plus', label: 'Telat > 90 hari', late: true },
];

// Aging berbentuk batang horizontal: label di atas batang, jadi tetap terbaca di 360px
// tanpa memotong teks (berbeda dengan grafik vertikal yang butuh lebar).
export function AgingBars({ data, title, subtitle }: { data: AgingData; title: string; subtitle?: string }) {
  const max = Math.max(...BUCKETS.map((b) => Number(data.buckets[b.key]) || 0), 1);

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody>
        <ul className="space-y-3">
          {BUCKETS.map((b) => {
            const value = Number(data.buckets[b.key]) || 0;
            return (
              <li key={b.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body-sm text-fossil truncate">{b.label}</span>
                  <span className="text-[14px] text-ink tnum shrink-0">{formatIDR(value)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-sand overflow-hidden" aria-hidden="true">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500', b.late ? 'bg-ink' : 'bg-chartreuse')}
                    style={{ width: value > 0 ? `${Math.max((value / max) * 100, 2)}%` : '0%' }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
