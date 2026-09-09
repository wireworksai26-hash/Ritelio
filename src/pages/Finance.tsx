import { useMemo, useState } from 'react';
import { AiExcelMapperModal } from '../components/excel/AiExcelMapperModal';
import { Reveal } from '../components/Reveal';
import { DonutChart } from '../components/charts/DonutChart';
import { LineChart } from '../components/charts/LineChart';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Stat } from '../components/ui/Stat';
import { Tabs } from '../components/ui/Tabs';
import { exportSalesTransactionsToXLSX } from '../lib/excel';
import { formatDateTime, formatIDR, formatIDRCompact } from '../lib/format';
import { cashflowSeries, categoryShare, outletName, productName, profitLoss } from '../lib/stats';
import { useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../stores/businessStore';
import { toast } from '../stores/toastStore';
import type { AIInsight, FinancialEntry, SalesTransaction } from '../types';

const PERIOD_OPTIONS = [
  { value: '7', label: '7 Hari' },
  { value: '30', label: '30 Hari' },
  { value: '90', label: '90 Hari' },
];

export default function Finance() {
  const tenant = useBusinessStore((s) => s.tenant);
  const allFinancialEntries = useBusinessStore((s) => s.financialEntries);
  const allTransactions = useBusinessStore((s) => s.transactions);
  const user = useAuthStore((s) => s.user);
  const canManageExcel = ['owner', 'manager', 'admin', 'superadmin'].includes(user?.role || 'owner');

  const financialEntries = useMemo(() => allFinancialEntries.filter((e) => !e.tenant_id || e.tenant_id === tenant.id), [allFinancialEntries, tenant.id]);
  const transactions = useMemo(() => allTransactions.filter((t) => !t.tenant_id || t.tenant_id === tenant.id), [allTransactions, tenant.id]);

  const [period, setPeriod] = useState<string>('30');
  const [excelModalOpen, setExcelModalOpen] = useState(false);

  const pl = profitLoss(Number(period));
  const series = cashflowSeries(14, 30);
  const anomalies = financialEntries.filter((e) => e.is_anomaly_flagged);

  const tenantAiInsights: AIInsight[] = useMemo(() => {
    return [
      {
        id: 'ai-dyn-1',
        tenant_id: tenant.id,
        module: 'finance',
        insight_type: 'cashflow_forecast',
        title: 'Proyeksi Arus Kas Sehat',
        content: `Berdasarkan tren laba bersih ${formatIDR(pl.net)}, arus kas diproyeksikan tumbuh stabil untuk 30 hari ke depan.`,
        based_on_refs: ['financial_entries:30_hari'],
        user_feedback: null,
        generated_at: new Date().toISOString(),
      },
      {
        id: 'ai-dyn-2',
        tenant_id: tenant.id,
        module: 'finance',
        insight_type: 'pricing_suggestion',
        title: 'Optimasi Margin Penjualan',
        content: 'Margin operasional saat ini dalam rentang optimal. Pertahankan bundling produk untuk mendongkrak average order value (AOV).',
        based_on_refs: ['sales_transactions'],
        user_feedback: null,
        generated_at: new Date().toISOString(),
      },
    ];
  }, [tenant.id, pl.net]);

  const forecastInsight = tenantAiInsights.find((i) => i.insight_type === 'cashflow_forecast');
  const anomalyInsight = tenantAiInsights.find((i) => i.insight_type === 'anomaly');
  const pricingInsight = tenantAiInsights.find((i) => i.insight_type === 'pricing_suggestion');


  const handleExportExcel = () => {
    if (transactions.length === 0) {
      toast({ title: 'Belum ada data transaksi untuk diekspor', icon: 'warning' });
      return;
    }
    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `Laporan_Keuangan_Penjualan_${tenant.name.replace(/\s+/g, '_')}_${dateSlug}.xlsx`;
    exportSalesTransactionsToXLSX(transactions, productName, outletName, filename);
    toast({ title: `Berhasil mengekspor ${transactions.length} transaksi ke Excel (.xlsx)`, icon: 'check' });
  };

  return (
    <div className="space-y-6">
      {/* Header + export */}
      <Reveal>
        <PageHeader
          title="Keuangan"
          subtitle="Laba rugi, arus kas, dan deteksi anomali — real-time"
          actions={
            canManageExcel ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="subtle"
                  icon="assistant"
                  className="flex-1 sm:flex-initial"
                  onClick={() => setExcelModalOpen(true)}
                >
                  Excel & AI Mapper
                </Button>
                <Button
                  variant="ghost"
                  icon="download"
                  className="flex-1 sm:flex-initial"
                  onClick={handleExportExcel}
                >
                  Export Excel (.xlsx)
                </Button>
              </div>
            ) : undefined
          }
        />
      </Reveal>

      {/* Filter periode */}
      <Reveal delay={0.04}>
        <Tabs options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
      </Reveal>

      {/* Statistik utama dengan GSAP stagger */}
      <Reveal delay={0.08} stagger={0.06}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <Stat label="Pendapatan" value={formatIDRCompact(pl.revenue)} />
          <Stat
            label="Laba Kotor"
            value={formatIDRCompact(pl.gross)}
            delta={`${Math.round((pl.gross / Math.max(pl.revenue, 1)) * 100)}% margin`}
            trend="up"
          />
          <Stat label="Beban Operasional" value={formatIDRCompact(pl.opex)} />
          <Stat label="Laba Bersih" value={formatIDRCompact(pl.net)} trend={pl.net > 0 ? 'up' : 'down'} />
        </div>
      </Reveal>

      {/* Laba rugi sederhana */}
      <Reveal delay={0.15}>
        <Card>
          <CardHeader
            title="Laba Rugi Sederhana"
            subtitle={`${period} hari terakhir · jurnal otomatis dari POS & Inventori`}
          />
          <CardBody>
            <div className="py-3 flex justify-between border-b border-sand">
              <span className="text-fossil">Pendapatan Usaha</span>
              <span className="tnum text-ink">{formatIDR(pl.revenue)}</span>
            </div>
            <div className="py-3 flex justify-between">
              <span className="text-fossil">Harga Pokok Penjualan</span>
              <span className="tnum text-smoke">− {formatIDR(pl.cogs)}</span>
            </div>
            <div className="py-3 flex justify-between border-t border-ash border-b border-sand">
              <span className="text-[15px] text-ink">Laba Kotor</span>
              <span className="tnum text-[15px] text-ink">{formatIDR(pl.gross)}</span>
            </div>
            <div className="py-3 flex justify-between">
              <span className="text-fossil">Beban Operasional</span>
              <span className="tnum text-smoke">− {formatIDR(pl.opex)}</span>
            </div>
            <div className="mt-1 flex justify-between items-center bg-sand/60 rounded-lg px-3 py-3">
              <span className="text-ink">Laba Bersih</span>
              <span className="tnum text-[17px] text-ink">{formatIDR(pl.net)}</span>
            </div>
          </CardBody>
        </Card>
      </Reveal>

      {/* Arus kas + proyeksi AI */}
      <Reveal delay={0.2}>
        <Card>
          <CardHeader
            title="Arus Kas"
            subtitle="Aktual 14 hari + proyeksi 30 hari (AI)"
            action={
              <Badge variant="accent" icon="assistant">
                AI Forecast
              </Badge>
            }
          />
          <CardBody>
            <LineChart
              labels={series.map((p) => p.label)}
              forecastFrom={14}
              series={[
                { name: 'Kas Masuk', values: series.map((p) => p.inflow), color: '#1c1c1c' },
                { name: 'Kas Keluar', values: series.map((p) => p.outflow), color: '#9e9b94', dashed: true },
              ]}
            />
            {forecastInsight && (
              <>
                <p className="text-body-sm text-fossil mt-4">{forecastInsight.content}</p>
                <p className="text-caption text-pebble mt-2">
                  Berdasarkan: {forecastInsight.based_on_refs.join(' · ')}
                </p>
              </>
            )}
          </CardBody>
        </Card>
      </Reveal>

      {/* Komposisi penjualan + deteksi anomali */}
      <Reveal delay={0.25}>
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader title="Komposisi Penjualan" subtitle={`${period} hari terakhir · per kategori`} />
            <CardBody>
              <DonutChart data={categoryShare(Number(period))} size={150} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Deteksi Anomali"
              action={<Badge variant="outline">{anomalies.length} temuan</Badge>}
            />
            <CardBody>
              {anomalies.length === 0 ? (
                <EmptyState
                  icon="check"
                  title="Tidak ada anomali"
                  body="Semua jurnal dalam pola normal."
                />
              ) : (
                anomalies.map((a) => (
                  <div key={a.id} className="border border-ash rounded-xl p-4 mb-3 last:mb-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="ink" icon="warning">
                        Anomali
                      </Badge>
                      <span className="text-caption text-pebble ml-auto">
                        {formatDateTime(a.entry_date)}
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] text-ink">
                      {a.debit_account} — <span className="tnum">{formatIDR(a.amount)}</span>
                    </p>
                    {anomalyInsight && (
                      <p className="text-body-sm text-fossil mt-1">{anomalyInsight.content}</p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          toast({ title: 'Terima kasih — feedback dikirim ke AI', icon: 'thumb-up' })
                        }
                      >
                        Bukan Anomali
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        icon="warning"
                        onClick={() => toast({ title: 'Dieskalasi ke owner', icon: 'warning' })}
                      >
                        Valid — Eskalasi
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </Reveal>

      {/* Saran AI */}
      <Reveal delay={0.3}>
        <Card className="bg-bone">
          <CardBody className="pt-6">
            <Badge variant="accent" icon="assistant">
              AI
            </Badge>
            <p className="mt-3 text-[15px] text-ink">{pricingInsight?.content}</p>
            {pricingInsight && (
              <p className="text-caption text-fossil mt-2">
                Berdasarkan: {pricingInsight.based_on_refs.join(' · ')}
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon="tag"
              className="mt-3"
              onClick={() => toast({ title: 'Bundling dibuat (mock)', icon: 'tag' })}
            >
              Terapkan Bundling
            </Button>
          </CardBody>
        </Card>
      </Reveal>

      {/* Modal Excel & AI Mapper */}
      <AiExcelMapperModal open={excelModalOpen} onClose={() => setExcelModalOpen(false)} />
    </div>
  );
}
