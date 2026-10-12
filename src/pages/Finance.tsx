import { useMemo, useState } from 'react';
import { FinanceInsights, ForecastSummary, type CashflowPoint } from '../components/accounting/FinanceInsights';
import { FxNotice, LoadState } from '../components/accounting/ReportsTab';
import { SelectBox, formatMoney, num } from '../components/accounting/shared';
import { DonutChart } from '../components/charts/DonutChart';
import { LineChart } from '../components/charts/LineChart';
import { AiExcelMapperModal } from '../components/excel/AiExcelMapperModal';
import { Reveal } from '../components/Reveal';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { DataTable, RowAction, type Column } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Stat } from '../components/ui/Stat';
import { Tabs } from '../components/ui/Tabs';
import { apiFetch } from '../lib/api';
import { downloadApiFile } from '../lib/download';
import { exportSalesTransactionsToXLSX } from '../lib/excel';
import { formatDate, formatDateTime } from '../lib/format';
import { listOf, useMutation, useResource } from '../lib/useResource';
import { outletName, productName } from '../lib/stats';
import { useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../stores/businessStore';
import { toast } from '../stores/toastStore';

const PERIOD_OPTIONS = [
  { value: '7', label: '7 Hari' },
  { value: '30', label: '30 Hari' },
  { value: '90', label: '90 Hari' },
];

const FALLBACK_CURRENCIES = ['IDR'];
const JOURNAL_PAGE_SIZE = 10;

interface ProfitLoss {
  periodDays: number;
  from: string;
  to: string;
  currency: string;
  fxFallbackUsed?: string[];
  revenue: number;
  cogs: number;
  gross: number;
  opex: number;
  net: number;
  marginPct: number;
}

interface CashflowData {
  series: CashflowPoint[];
  currency: string;
  fxFallbackUsed?: string[];
  totals: { inflow: number; outflow: number; net: number };
  method: string;
}

interface AccountRef {
  code: string;
  name: string;
}

interface JournalEntry {
  id: string;
  number: string;
  sourceModule: string | null;
  entryDate: string;
  status: string;
  memo: string | null;
  amount: number;
  debitAccount: AccountRef | null;
  creditAccount: AccountRef | null;
}

interface EntriesPage {
  data: JournalEntry[];
  meta: { page: number; limit: number; total: number };
}

interface ResolveTarget {
  entry: JournalEntry;
  valid: boolean;
}

const accountLabel = (a: AccountRef | null) => (a ? `${a.code} ${a.name}` : '-');

export default function Finance() {
  const tenant = useBusinessStore((s) => s.tenant);
  const allTransactions = useBusinessStore((s) => s.transactions);
  const user = useAuthStore((s) => s.user);
  const canManageExcel = ['owner', 'manager', 'admin', 'superadmin'].includes(user?.role || 'owner');
  const canWrite = ['owner', 'superadmin'].includes(user?.role || 'owner');

  const transactions = useMemo(
    () => allTransactions.filter((t) => !t.tenant_id || t.tenant_id === tenant.id),
    [allTransactions, tenant.id],
  );

  const [period, setPeriod] = useState<string>('30');
  const [currency, setCurrency] = useState('IDR');
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [journalPage, setJournalPage] = useState(1);
  const [resolveTarget, setResolveTarget] = useState<ResolveTarget | null>(null);
  const mutation = useMutation();

  const currencies = useResource<Array<{ code: string }>>('/v1/companies/currencies');
  const currencyCodes = useMemo(() => {
    const codes = listOf<{ code: string }>(currencies.data).map((c) => c.code);
    return codes.length > 0 ? codes : FALLBACK_CURRENCIES;
  }, [currencies.data]);

  // Semua angka berasal dari buku besar (jurnal terposting) di backend.
  const pl = useResource<ProfitLoss>(`/v1/finance/profit-loss?days=${period}&currency=${currency}`);
  const cashflow = useResource<CashflowData>(`/v1/finance/cashflow?days=${period}&forecast=30&currency=${currency}`);
  const anomalies = useResource<EntriesPage>('/v1/finance/entries?anomaly=true&limit=20');
  const journals = useResource<EntriesPage>(`/v1/finance/entries?page=${journalPage}&limit=${JOURNAL_PAGE_SIZE}`);

  const plData = pl.data;
  const fmt = (v: number) => formatMoney(v, plData?.currency ?? currency);

  const points = useMemo(() => cashflow.data?.series ?? [], [cashflow.data]);
  const chartSeries = useMemo(
    () =>
      points.map((p) => ({
        label: `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}`,
        inflow: num(p.inflow),
        outflow: num(p.outflow),
      })),
    [points],
  );
  const actualDays = points.filter((p) => !p.forecast).length;
  const hasForecast = points.some((p) => p.forecast);
  const hasActivity = (cashflow.data?.totals.inflow ?? 0) > 0 || (cashflow.data?.totals.outflow ?? 0) > 0;

  const anomalyRows = listOf<JournalEntry>(anomalies.data);
  const journalRows = listOf<JournalEntry>(journals.data);
  const journalTotal = journals.data?.meta?.total ?? 0;
  const journalPages = Math.max(1, Math.ceil(journalTotal / JOURNAL_PAGE_SIZE));

  async function resolveAnomaly(target: ResolveTarget) {
    const result = await mutation.run(() =>
      apiFetch<{ resolved: string; number: string }>(`/v1/finance/entries/${target.entry.id}/resolve-anomaly`, {
        method: 'POST',
        body: JSON.stringify({ valid: !target.valid }),
      }),
    );
    if (!result) return;
    setResolveTarget(null);
    if (result.resolved === 'escalated') {
      toast({ title: `Jurnal ${result.number} dieskalasi ke owner.`, icon: 'warning' });
    } else {
      toast({ title: `Jurnal ${result.number} dicatat sebagai bukan anomali.`, icon: 'check' });
    }
    // Daftar anomali berasal dari server; muat ulang supaya tampilan tidak mendahului data.
    anomalies.reload();
  }

  async function handleExportJournal() {
    setExporting(true);
    try {
      await downloadApiFile('/v1/finance/export?format=csv&days=365', 'laporan-keuangan.csv');
      toast({ title: 'Jurnal 12 bulan terakhir diunduh (CSV).', icon: 'check' });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mengunduh jurnal.', icon: 'warning' });
    } finally {
      setExporting(false);
    }
  }

  const handleExportSales = () => {
    if (transactions.length === 0) {
      toast({ title: 'Belum ada data transaksi untuk diekspor', icon: 'warning' });
      return;
    }
    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `Penjualan_${tenant.name.replace(/\s+/g, '_')}_${dateSlug}.xlsx`;
    exportSalesTransactionsToXLSX(transactions, productName, outletName, filename);
    toast({ title: `Berhasil mengekspor ${transactions.length} transaksi ke Excel (.xlsx)`, icon: 'check' });
  };

  const journalColumns: Column<JournalEntry>[] = [
    {
      key: 'number',
      header: 'Jurnal',
      render: (e) => (
        <div className="min-w-0">
          <p className="tnum text-ink break-words">{e.number}</p>
          <p className="text-caption text-fossil break-words">{e.memo || e.sourceModule || '-'}</p>
        </div>
      ),
    },
    { key: 'date', header: 'Tanggal', render: (e) => <span className="whitespace-nowrap">{formatDate(e.entryDate)}</span> },
    { key: 'debit', header: 'Debit', render: (e) => <span className="break-words">{accountLabel(e.debitAccount)}</span> },
    { key: 'credit', header: 'Kredit', render: (e) => <span className="break-words">{accountLabel(e.creditAccount)}</span> },
    {
      key: 'amount',
      header: 'Nominal',
      align: 'right',
      render: (e) => <span className="tnum whitespace-nowrap">{formatMoney(num(e.amount))}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          title="Keuangan"
          subtitle="Laba rugi, arus kas, dan jurnal dari buku besar"
          actions={
            canManageExcel ? (
              <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full sm:w-auto">
                <Button
                  variant="subtle"
                  size="sm"
                  icon="assistant"
                  className="min-h-[44px]"
                  onClick={() => setExcelModalOpen(true)}
                >
                  Excel & AI Mapper
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="download"
                  className="min-h-[44px]"
                  disabled={exporting}
                  onClick={handleExportJournal}
                >
                  {exporting ? 'Mengunduh...' : 'Ekspor Jurnal (CSV)'}
                </Button>
                <Button variant="ghost" size="sm" icon="download" className="min-h-[44px]" onClick={handleExportSales}>
                  Ekspor Penjualan (.xlsx)
                </Button>
              </div>
            ) : undefined
          }
        />
      </Reveal>

      <Reveal delay={0.04}>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Tabs options={PERIOD_OPTIONS} value={period} onChange={setPeriod} className="flex-1 min-w-0" />
          {currencyCodes.length > 1 && (
            <SelectBox
              label="Mata uang laporan"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="sm:w-44 shrink-0"
            >
              {currencyCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectBox>
          )}
        </div>
      </Reveal>

      {/* Laba rugi dari GL */}
      <LoadState state={pl} skeletonHeight={260}>
        {plData && (
          <>
            <FxNotice missing={plData.fxFallbackUsed} currency={plData.currency} />
            <Reveal delay={0.08} stagger={0.06}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                <Stat label="Pendapatan" value={fmt(num(plData.revenue))} />
                <Stat
                  label="Laba Kotor"
                  value={fmt(num(plData.gross))}
                  delta={`${plData.marginPct}% margin`}
                  trend={num(plData.gross) > 0 ? 'up' : 'flat'}
                />
                <Stat label="Beban Operasional" value={fmt(num(plData.opex))} />
                <Stat label="Laba Bersih" value={fmt(num(plData.net))} trend={num(plData.net) > 0 ? 'up' : 'down'} />
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="grid lg:grid-cols-2 gap-6 items-start">
                <Card>
                  <CardHeader
                    title="Laba Rugi"
                    subtitle={`${formatDate(plData.from)} - ${formatDate(plData.to)} · jurnal terposting`}
                  />
                  <CardBody>
                    <div className="py-3 flex justify-between gap-3 border-b border-sand">
                      <span className="text-fossil">Pendapatan Usaha</span>
                      <span className="tnum text-ink text-right break-words">{fmt(num(plData.revenue))}</span>
                    </div>
                    <div className="py-3 flex justify-between gap-3">
                      <span className="text-fossil">Harga Pokok Penjualan</span>
                      <span className="tnum text-smoke text-right break-words">- {fmt(num(plData.cogs))}</span>
                    </div>
                    <div className="py-3 flex justify-between gap-3 border-t border-ash border-b border-sand">
                      <span className="text-[15px] text-ink">Laba Kotor</span>
                      <span className="tnum text-[15px] text-ink text-right break-words">{fmt(num(plData.gross))}</span>
                    </div>
                    <div className="py-3 flex justify-between gap-3">
                      <span className="text-fossil">Beban Operasional</span>
                      <span className="tnum text-smoke text-right break-words">- {fmt(num(plData.opex))}</span>
                    </div>
                    <div className="mt-1 flex justify-between items-center gap-3 bg-sand/60 rounded-lg px-3 py-3">
                      <span className="text-ink">Laba Bersih</span>
                      <span className="tnum text-[17px] text-ink text-right break-words">{fmt(num(plData.net))}</span>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Ke Mana Pendapatan Mengalir" subtitle="HPP, beban operasional, dan sisa laba" />
                  <CardBody>
                    {num(plData.revenue) > 0 ? (
                      <>
                        <DonutChart
                          size={150}
                          formatValue={fmt}
                          data={[
                            { label: 'HPP', value: num(plData.cogs) },
                            { label: 'Beban operasional', value: num(plData.opex) },
                            { label: 'Laba bersih', value: Math.max(num(plData.net), 0) },
                          ]}
                        />
                        {num(plData.net) < 0 && (
                          <p className="text-caption text-fossil mt-3">
                            Biaya melebihi pendapatan pada periode ini, jadi tidak ada bagian laba bersih.
                          </p>
                        )}
                      </>
                    ) : (
                      <EmptyState
                        icon="chart"
                        title="Belum ada pendapatan"
                        body="Belum ada jurnal pendapatan terposting pada periode ini."
                      />
                    )}
                  </CardBody>
                </Card>
              </div>
            </Reveal>
          </>
        )}
      </LoadState>

      {/* Arus kas dari GL + prakiraan */}
      <Reveal delay={0.2}>
        <Card>
          <CardHeader
            title="Arus Kas"
            subtitle={
              hasForecast
                ? `Aktual ${actualDays} hari dari jurnal kas + prakiraan 30 hari`
                : `Aktual ${period} hari dari jurnal kas`
            }
            action={
              hasForecast ? (
                <Badge variant="accent" icon="chart">
                  Prakiraan
                </Badge>
              ) : undefined
            }
          />
          <CardBody>
            <LoadState state={cashflow} skeletonHeight={240}>
              {cashflow.data && (
                <>
                  <FxNotice missing={cashflow.data.fxFallbackUsed} currency={cashflow.data.currency} />
                  {!hasActivity && !hasForecast ? (
                    <EmptyState
                      icon="wallet"
                      title="Belum ada pergerakan kas"
                      body="Belum ada jurnal ke akun kas pada periode ini."
                    />
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
                        <div className="rounded-xl bg-sand/50 px-4 py-3 min-w-0">
                          <p className="text-caption text-fossil">Kas masuk {period} hari</p>
                          <p className="tnum text-ink break-words">{formatMoney(num(cashflow.data.totals.inflow), cashflow.data.currency)}</p>
                        </div>
                        <div className="rounded-xl bg-sand/50 px-4 py-3 min-w-0">
                          <p className="text-caption text-fossil">Kas keluar {period} hari</p>
                          <p className="tnum text-ink break-words">{formatMoney(num(cashflow.data.totals.outflow), cashflow.data.currency)}</p>
                        </div>
                        <div className={`rounded-xl px-4 py-3 min-w-0 ${num(cashflow.data.totals.net) >= 0 ? 'bg-chartreuse/25' : 'bg-sand/50'}`}>
                          <p className="text-caption text-fossil">Selisih bersih</p>
                          <p className="tnum text-ink break-words">{formatMoney(num(cashflow.data.totals.net), cashflow.data.currency)}</p>
                        </div>
                      </div>
                      <LineChart
                        labels={chartSeries.map((p) => p.label)}
                        forecastFrom={hasForecast ? actualDays : undefined}
                        series={[
                          { name: 'Kas Masuk', values: chartSeries.map((p) => p.inflow), color: '#1c1c1c' },
                          { name: 'Kas Keluar', values: chartSeries.map((p) => p.outflow), color: '#9e9b94', dashed: true },
                        ]}
                      />
                      {hasForecast && (
                        <>
                          <ForecastSummary points={points} />
                          <p className="text-caption text-fossil mt-3">
                            Prakiraan memakai pola rata-rata per hari dalam minggu dari kas aktual. Ini perkiraan
                            sederhana, bukan jaminan.
                          </p>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </LoadState>
          </CardBody>
        </Card>
      </Reveal>

      {/* Anomali + jurnal terbaru */}
      <Reveal delay={0.25}>
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader
              title="Jurnal Bertanda Anomali"
              action={anomalies.data ? <Badge variant="outline">{anomalyRows.length} temuan</Badge> : undefined}
            />
            <CardBody>
              {anomalies.error ? (
                <EmptyState
                  icon="warning"
                  title="Anomali belum bisa dimuat"
                  body={anomalies.error}
                  action={
                    <Button variant="ghost" size="sm" icon="sync" className="min-h-[44px]" onClick={anomalies.reload}>
                      Coba lagi
                    </Button>
                  }
                />
              ) : anomalies.loading ? (
                <div className="h-24 rounded-xl bg-sand/60 animate-pulse" aria-busy="true" />
              ) : anomalyRows.length === 0 ? (
                <EmptyState icon="check" title="Tidak ada jurnal bertanda anomali" body="Semua jurnal dalam pola normal." />
              ) : (
                anomalyRows.map((a) => (
                  <div key={a.id} className="border border-ash rounded-xl p-4 mb-3 last:mb-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="ink" icon="warning">
                        Anomali
                      </Badge>
                      <span className="text-caption text-fossil ml-auto">{formatDateTime(a.entryDate)}</span>
                    </div>
                    <p className="mt-2 text-[15px] text-ink break-words">
                      {a.number} - <span className="tnum">{formatMoney(num(a.amount))}</span>
                    </p>
                    <p className="text-caption text-fossil break-words">
                      {accountLabel(a.debitAccount)} / {accountLabel(a.creditAccount)}
                    </p>
                    {canWrite && (
                      <div className="mt-3 flex flex-col min-[420px]:flex-row gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-[44px]"
                          onClick={() => setResolveTarget({ entry: a, valid: false })}
                        >
                          Bukan Anomali
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          icon="warning"
                          className="min-h-[44px]"
                          onClick={() => setResolveTarget({ entry: a, valid: true })}
                        >
                          Valid, Eskalasi
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <div className="space-y-3 min-w-0">
            <div>
              <h2 className="text-[18px] font-light text-ink">Jurnal Terbaru</h2>
              <p className="text-body-sm text-fossil mt-0.5">
                Dari buku besar. Eskalasi mengirim notifikasi ke owner untuk ditinjau.
              </p>
            </div>
            <DataTable
              rows={journalRows}
              rowKey={(e) => e.id}
              columns={journalColumns}
              loading={journals.loading}
              error={journals.error}
              onRetry={journals.reload}
              emptyIcon="document"
              emptyTitle="Belum ada jurnal"
              emptyBody="Jurnal muncul otomatis dari penjualan, pembelian, dan input manual."
              page={journalPage}
              totalPages={journalPages}
              totalItems={journalTotal}
              pageSize={JOURNAL_PAGE_SIZE}
              onPageChange={setJournalPage}
              rowActions={
                canWrite
                  ? (e) => (
                      <RowAction
                        icon="warning"
                        label={`Eskalasi jurnal ${e.number} sebagai anomali`}
                        onClick={() => setResolveTarget({ entry: e, valid: true })}
                      />
                    )
                  : undefined
              }
            />
          </div>
        </div>
      </Reveal>

      {/* Insight & rekomendasi dari backend; tersembunyi bila izin/paket tidak tersedia */}
      <Reveal delay={0.3}>
        <FinanceInsights />
      </Reveal>

      <AiExcelMapperModal open={excelModalOpen} onClose={() => setExcelModalOpen(false)} />

      <Modal
        open={resolveTarget !== null}
        onClose={() => {
          if (!mutation.busy) setResolveTarget(null);
        }}
        title={resolveTarget?.valid ? 'Eskalasi jurnal ke owner?' : 'Tandai bukan anomali?'}
        maxWidth="sm"
      >
        {resolveTarget && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              {resolveTarget.valid
                ? `Jurnal ${resolveTarget.entry.number} (${formatMoney(num(resolveTarget.entry.amount))}) dikonfirmasi sebagai anomali. Owner akan menerima notifikasi untuk meninjaunya.`
                : `Jurnal ${resolveTarget.entry.number} dicatat sebagai bukan anomali. Keputusan ini tersimpan sebagai masukan untuk analisis AI; jurnalnya sendiri tidak diubah.`}
            </p>
            {mutation.error && (
              <p role="alert" className="text-body-sm text-fossil border border-ash rounded-lg px-3 py-2">
                {mutation.error}
              </p>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                variant="ghost"
                className="min-h-[44px]"
                disabled={mutation.busy}
                onClick={() => {
                  mutation.setError(null);
                  setResolveTarget(null);
                }}
              >
                Batal
              </Button>
              <Button className="min-h-[44px]" disabled={mutation.busy} onClick={() => resolveAnomaly(resolveTarget)}>
                {mutation.busy ? 'Menyimpan...' : resolveTarget.valid ? 'Ya, eskalasi' : 'Ya, bukan anomali'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
