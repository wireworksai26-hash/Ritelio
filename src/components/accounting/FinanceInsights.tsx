import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { formatDate, formatIDR, formatNumber } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { num } from './shared';

export interface CashflowPoint {
  date: string;
  inflow: number;
  outflow: number;
  forecast: boolean;
}

interface Insight {
  id: string;
  module: string;
  insightType: string;
  title: string;
  content: string;
  userFeedback: number | null;
  createdAt: string;
}

interface Suggestion {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  warehouseName: string;
  onHand: number;
  reorderPoint: number;
  suggestedQty: number;
  estimatedCost: number;
  supplierId?: string | null;
}

const insightTypeLabel: Record<string, string> = {
  low_stock_prediction: 'Stok',
  sales_forecast: 'Penjualan',
  anomaly: 'Anomali',
  cashflow_forecast: 'Arus kas',
  insight_digest: 'Ringkasan',
  pricing_suggestion: 'Harga',
  outlet_comparison: 'Outlet',
  nlq_chat: 'Asisten',
};

/** Pesan penolakan izin / paket / kuota — bagian disembunyikan, bukan ditampilkan sebagai galat. */
export function isUnavailableError(message: string | null): boolean {
  return Boolean(message && /izin|akses|forbidden|403|tidak diizinkan|permission|kuota|paket|nonaktif|upgrade/i.test(message));
}

/** Ringkasan proyeksi 30 hari dari titik forecast backend. */
export function summarizeForecast(points: CashflowPoint[]) {
  const forecast = points.filter((p) => p.forecast);
  const actual = points.filter((p) => !p.forecast);
  const sum = (rows: CashflowPoint[], key: 'inflow' | 'outflow') => rows.reduce((s, p) => s + num(p[key]), 0);
  const inflow = sum(forecast, 'inflow');
  const outflow = sum(forecast, 'outflow');
  return {
    days: forecast.length,
    inflow,
    outflow,
    net: inflow - outflow,
    actualNet: sum(actual, 'inflow') - sum(actual, 'outflow'),
    actualDays: actual.length,
  };
}

function SoftError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon="info"
      title={title}
      action={
        <Button variant="ghost" size="sm" icon="sync" className="min-h-[44px]" onClick={onRetry}>
          Coba lagi
        </Button>
      }
    />
  );
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

/** Ringkasan proyeksi arus kas. Grafiknya digambar halaman Keuangan dari deret yang sama. */
export function ForecastSummary({ points }: { points: CashflowPoint[] }) {
  const s = summarizeForecast(points);
  if (s.days === 0) return null;
  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      <div className="rounded-xl bg-sand/50 px-4 py-3 min-w-0">
        <p className="text-caption text-fossil">Proyeksi kas masuk {s.days} hari</p>
        <p className="tnum text-ink break-words">{formatIDR(s.inflow)}</p>
      </div>
      <div className="rounded-xl bg-sand/50 px-4 py-3 min-w-0">
        <p className="text-caption text-fossil">Proyeksi kas keluar {s.days} hari</p>
        <p className="tnum text-ink break-words">{formatIDR(s.outflow)}</p>
      </div>
      <div className={`rounded-xl px-4 py-3 min-w-0 ${s.net >= 0 ? 'bg-chartreuse/25' : 'bg-sand/50'}`}>
        <p className="text-caption text-fossil">Selisih bersih proyeksi</p>
        <p className="tnum text-ink break-words">{formatIDR(s.net)}</p>
      </div>
    </div>
  );
}

function InsightsList() {
  const insights = useResource<unknown>('/v1/ai/insights?module=finance');
  const [pending, setPending] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (isUnavailableError(insights.error)) return null;

  const rows = listOf<Insight>(insights.data);
  const visible = showAll ? rows : rows.slice(0, 4);

  async function sendFeedback(insight: Insight, feedback: 1 | -1) {
    setPending(insight.id);
    try {
      await apiFetch(`/v1/ai/insights/${insight.id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ feedback }),
      });
      insights.setData((prev: unknown) =>
        listOf<Insight>(prev).map((i) => (i.id === insight.id ? { ...i, userFeedback: feedback } : i)),
      );
      toast({ title: 'Terima kasih, masukan Anda tersimpan.', icon: 'check' });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mengirim masukan.', icon: 'warning' });
    } finally {
      setPending(null);
    }
  }

  return (
    <SectionCard
      title="Insight Keuangan"
      subtitle="Dibuat dari pertanyaan Anda ke asisten dan analisis otomatis"
      action={rows.length > 0 ? <Badge variant="outline">{rows.length}</Badge> : undefined}
    >
      {insights.loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-sand/60 animate-pulse" />
          ))}
        </div>
      ) : insights.error ? (
        <SoftError title="Insight belum bisa dimuat" onRetry={insights.reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="assistant"
          title="Belum ada insight keuangan"
          body="Insight muncul setelah asisten menganalisis data Anda."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((i) => (
            <div key={i.id} className="rounded-xl border border-ash p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="neutral">{insightTypeLabel[i.insightType] ?? i.insightType}</Badge>
                <span className="text-caption text-pebble ml-auto">{formatDate(i.createdAt)}</span>
              </div>
              {i.title && <p className="mt-2 text-[15px] text-ink break-words">{i.title}</p>}
              <p className="mt-1 text-body-sm text-fossil break-words whitespace-pre-line">{i.content}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-caption text-fossil mr-auto">Apakah ini membantu?</span>
                <Button
                  variant={i.userFeedback === 1 ? 'primary' : 'ghost'}
                  size="sm"
                  icon="thumb-up"
                  className="min-h-[44px]"
                  disabled={pending === i.id}
                  aria-pressed={i.userFeedback === 1}
                  onClick={() => sendFeedback(i, 1)}
                >
                  Berguna
                </Button>
                <Button
                  variant={i.userFeedback === -1 ? 'primary' : 'ghost'}
                  size="sm"
                  icon="thumb-down"
                  className="min-h-[44px]"
                  disabled={pending === i.id}
                  aria-pressed={i.userFeedback === -1}
                  onClick={() => sendFeedback(i, -1)}
                >
                  Kurang
                </Button>
              </div>
            </div>
          ))}
          {rows.length > 4 && (
            <Button variant="subtle" size="sm" full className="min-h-[44px]" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Tampilkan lebih sedikit' : `Lihat ${rows.length - 4} lainnya`}
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function PurchaseRecommendations() {
  const reorder = useResource<unknown>('/v1/procurement/reorder-suggestions');
  if (isUnavailableError(reorder.error)) return null;

  const rows = listOf<Suggestion>(reorder.data);
  const top = rows.slice(0, 5);
  const totalCost = rows.reduce((s, r) => s + num(r.estimatedCost), 0);

  return (
    <SectionCard
      title="Rekomendasi Pembelian"
      subtitle="Stok sudah di bawah titik pemesanan ulang"
      action={
        <Link
          to="/app/procurement"
          className="inline-flex items-center gap-1 min-h-[44px] px-1 text-body-sm text-ink hover:underline"
        >
          Buka Pengadaan
          <Icon name="arrow-right" size={14} />
        </Link>
      }
    >
      {reorder.loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-sand/60 animate-pulse" />
          ))}
        </div>
      ) : reorder.error ? (
        <SoftError title="Rekomendasi belum bisa dimuat" onRetry={reorder.reload} />
      ) : top.length === 0 ? (
        <EmptyState icon="check" title="Stok aman" body="Tidak ada barang di bawah titik pemesanan ulang." />
      ) : (
        <div className="space-y-2.5">
          {top.map((r) => (
            <div key={`${r.productId}-${r.warehouseName}`} className="rounded-xl border border-ash px-4 py-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-ink break-words">{r.name}</p>
                <p className="text-caption text-fossil break-words">
                  {r.sku} · {r.warehouseName}
                </p>
                <p className="text-caption text-fossil tnum mt-1">
                  Sisa {formatNumber(num(r.onHand))} dari titik {formatNumber(num(r.reorderPoint))} {r.unit}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[15px] text-ink tnum">
                  +{formatNumber(num(r.suggestedQty))} {r.unit}
                </p>
                <p className="text-caption text-fossil tnum">{formatIDR(num(r.estimatedCost))}</p>
                {!r.supplierId && <Badge variant="outline" className="mt-1">Tanpa pemasok</Badge>}
              </div>
            </div>
          ))}
          <p className="text-caption text-fossil pt-1">
            {rows.length > top.length ? `${rows.length - top.length} barang lain juga perlu dipesan. ` : ''}
            Estimasi total {formatIDR(totalCost)}. PO dibuat sebagai draf dan tidak langsung dikirim ke pemasok.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

/** Bagian "Insight & Proyeksi" di halaman Keuangan. Tiap blok menyembunyikan diri bila izin/paket tidak tersedia. */
export function FinanceInsights() {
  return (
    <div className="grid lg:grid-cols-2 gap-5 sm:gap-6 items-start">
      <InsightsList />
      <PurchaseRecommendations />
    </div>
  );
}
