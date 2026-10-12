import { LineChart } from '../charts/LineChart';
import { Badge } from '../ui/Badge';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { StatRow } from '../ui/DataTable';
import { formatDayShort, formatTime } from '../../lib/format';

export interface SensorHistory {
  device: { code: string; name: string; type: string; unit: string };
  count: number;
  last: number | null;
  average: number | null;
  min: number | null;
  max: number | null;
  anomaly: { level: string; message: string } | null;
  series: Array<{ at: string; value: number }>;
}

const numberFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const fmt = (v: number | null, unit: string) => (v === null ? '-' : `${numberFmt.format(v)}${unit ? ` ${unit}` : ''}`);

interface SensorTrendProps {
  history: SensorHistory | null;
  loading: boolean;
  error: string | null;
  hours: number;
  onRetry: () => void;
}

/** Statistik, peringatan ambang, dan grafik garis satu sensor. */
export function SensorTrend({ history, loading, error, hours, onRetry }: SensorTrendProps) {
  if (error) {
    return (
      <Card className="p-6">
        <EmptyState
          icon="warning"
          title="Gagal memuat pembacaan"
          body={error}
          action={
            <Button variant="ghost" icon="sync" onClick={onRetry}>
              Coba lagi
            </Button>
          }
        />
      </Card>
    );
  }
  if (loading || !history) {
    return (
      <Card className="p-6 space-y-3" aria-busy="true">
        <div className="h-4 w-1/3 rounded bg-sand animate-pulse" />
        <div className="h-48 rounded-lg bg-sand/60 animate-pulse" />
      </Card>
    );
  }

  const { device, series } = history;
  // Rentang pendek hanya jam; rentang panjang butuh tanggal supaya label sumbu tidak ambigu.
  const labels = series.map((p) => (hours > 24 ? `${formatDayShort(p.at)} ${formatTime(p.at)}` : formatTime(p.at)));

  return (
    <div className="space-y-3 sm:space-y-4">
      <StatRow
        items={[
          { label: 'Terakhir', value: fmt(history.last, device.unit), tone: 'accent' },
          { label: 'Rata-rata', value: fmt(history.average, device.unit) },
          { label: 'Terendah', value: fmt(history.min, device.unit) },
          { label: 'Tertinggi', value: fmt(history.max, device.unit) },
        ]}
      />

      {history.anomaly && (
        <Card className="px-4 py-3 border-ink/40 bg-chartreuse/25" role="alert">
          <div className="flex items-start gap-2">
            <Badge variant="ink">Peringatan</Badge>
            <p className="text-body-sm text-ink min-w-0">{history.anomaly.message}</p>
          </div>
          <p className="text-caption text-fossil mt-1.5">
            Sensor hanya melaporkan. Penyesuaian stok tetap dilakukan manual lewat stok opname.
          </p>
        </Card>
      )}

      <Card>
        <CardHeader
          title={device.name}
          subtitle={`${history.count} pembacaan dalam ${hours} jam terakhir`}
        />
        <CardBody>
          {series.length < 2 ? (
            <EmptyState
              icon="sensor"
              title={series.length === 0 ? 'Belum ada pembacaan' : 'Data belum cukup untuk grafik'}
              body="Grafik tampil setelah sensor mengirim minimal dua pembacaan pada rentang ini."
            />
          ) : (
            <LineChart
              labels={labels}
              series={[{ name: `${device.name}${device.unit ? ` (${device.unit})` : ''}`, values: series.map((p) => p.value), color: 'var(--color-ink)' }]}
              height={200}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
