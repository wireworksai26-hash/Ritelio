import { useMemo, useState, type ReactNode } from 'react';
import { formatDate, formatNumber, formatDayShort } from '../../lib/format';
import { listOf, useResource, usePagedList } from '../../lib/useResource';
import { DonutChart } from '../charts/DonutChart';
import { LineChart } from '../charts/LineChart';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Input } from '../ui/controls';
import { DataTable, StatRow, type Column } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Tabs } from '../ui/Tabs';
import {
  BalanceBadge,
  FilterBar,
  LedgerTable,
  Notice,
  SelectBox,
  accountTypeLabel,
  formatMoney,
  isoDate,
  num,
  type Account,
  type AccountType,
} from './shared';

type ReportKey = 'laba-rugi' | 'neraca' | 'neraca-saldo' | 'arus-kas' | 'buku-besar' | 'konsolidasi';

const reportOptions: Array<{ value: ReportKey; label: string }> = [
  { value: 'laba-rugi', label: 'Laba Rugi' },
  { value: 'neraca', label: 'Neraca' },
  { value: 'neraca-saldo', label: 'Neraca Saldo' },
  { value: 'arus-kas', label: 'Arus Kas' },
  { value: 'buku-besar', label: 'Buku Besar' },
  { value: 'konsolidasi', label: 'Konsolidasi' },
];

const FALLBACK_CURRENCIES = ['IDR', 'USD', 'SGD'];

export function LoadState({
  state,
  children,
  skeletonHeight = 160,
}: {
  state: { loading: boolean; error: string | null; reload: () => void; data: unknown };
  children: ReactNode;
  skeletonHeight?: number;
}) {
  if (state.error) {
    return (
      <Card className="p-6">
        <EmptyState
          icon="warning"
          title="Gagal memuat laporan"
          body={state.error}
          action={
            <Button variant="ghost" icon="sync" onClick={state.reload}>
              Coba lagi
            </Button>
          }
        />
      </Card>
    );
  }
  if (state.loading || !state.data) {
    return <Card className="animate-pulse bg-sand/60 border-transparent" style={{ height: skeletonHeight }} aria-busy="true" />;
  }
  return <>{children}</>;
}

export function FxNotice({ missing, currency }: { missing?: string[]; currency: string }) {
  if (!missing || missing.length === 0) return null;
  return (
    <Notice>
      Kurs ke {currency} belum tersedia untuk {missing.join(', ')}. Nominal tersebut ditampilkan dalam mata uang dasar perusahaan,
      bukan hasil konversi.
    </Notice>
  );
}

// ── Laba Rugi ───────────────────────────────────────────────────────────────

interface ProfitLoss {
  periodDays: number;
  from: string;
  to: string;
  currency: string;
  fxFallbackUsed: string[];
  revenue: number;
  cogs: number;
  gross: number;
  opex: number;
  net: number;
  marginPct: number;
}

function ProfitLossReport({ currency }: { currency: string }) {
  const [days, setDays] = useState('30');
  const state = useResource<ProfitLoss>(`/v1/finance/profit-loss?days=${days}&currency=${currency}`);
  const d = state.data;
  const fmt = (v: number) => formatMoney(v, d?.currency ?? currency);

  return (
    <div className="space-y-4">
      <FilterBar>
        <SelectBox label="Rentang" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="7">7 hari terakhir</option>
          <option value="30">30 hari terakhir</option>
          <option value="90">90 hari terakhir</option>
          <option value="180">180 hari terakhir</option>
          <option value="365">365 hari terakhir</option>
        </SelectBox>
      </FilterBar>
      <LoadState state={state}>
        {d && (
          <>
            <FxNotice missing={d.fxFallbackUsed} currency={d.currency} />
            <StatRow
              items={[
                { label: 'Pendapatan', value: fmt(num(d.revenue)) },
                { label: 'HPP', value: fmt(num(d.cogs)) },
                { label: 'Laba kotor', value: fmt(num(d.gross)) },
                { label: 'Beban operasional', value: fmt(num(d.opex)) },
              ]}
            />
            <Card>
              <CardHeader
                title="Laba bersih"
                subtitle={`${formatDate(d.from)} – ${formatDate(d.to)}`}
                action={<Badge variant={num(d.net) >= 0 ? 'accent' : 'ink'}>Margin kotor {d.marginPct}%</Badge>}
              />
              <CardBody className="space-y-5">
                <p className="tnum text-[28px] sm:text-heading font-light text-ink break-words">{fmt(num(d.net))}</p>
                {num(d.revenue) > 0 && (
                  <DonutChart
                    size={140}
                    formatValue={fmt}
                    data={[
                      { label: 'HPP', value: num(d.cogs) },
                      { label: 'Beban operasional', value: num(d.opex) },
                      { label: 'Laba bersih', value: Math.max(num(d.net), 0) },
                    ]}
                  />
                )}
              </CardBody>
            </Card>
          </>
        )}
      </LoadState>
    </div>
  );
}

// ── Neraca ──────────────────────────────────────────────────────────────────

interface BalanceLine {
  code: string;
  name: string;
  balance: number;
}

interface BalanceSheet {
  asOf: string;
  currency: string;
  assets: { total: number; detail: BalanceLine[] };
  liabilities: { total: number; detail: BalanceLine[] };
  equity: { total: number; bookEquity: number; retainedProfit: number; detail: BalanceLine[] };
  totalLiabilitiesEquity: number;
  balanced: boolean;
  warnings: string[];
}

function BalanceGroup({ title, total, lines, currency }: { title: string; total: number; lines: BalanceLine[]; currency: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-4 sm:px-6 py-3 border-b border-ash bg-sand/40">
        <h3 className="text-[16px] text-ink">{title}</h3>
        <span className="tnum text-[15px] text-ink break-words text-right">{formatMoney(total, currency)}</span>
      </div>
      {lines.length === 0 ? (
        <p className="px-4 sm:px-6 py-4 text-body-sm text-fossil">Belum ada saldo.</p>
      ) : (
        <ul className="divide-y divide-sand">
          {lines.map((l) => (
            <li key={l.code} className="flex items-baseline justify-between gap-3 px-4 sm:px-6 py-2.5 text-[14px]">
              <span className="min-w-0 text-ink break-words">
                <span className="tnum text-fossil mr-2">{l.code}</span>
                {l.name}
              </span>
              <span className="tnum shrink-0 text-right">{formatMoney(num(l.balance), currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BalanceSheetReport({ currency }: { currency: string }) {
  const [asOf, setAsOf] = useState(isoDate());
  const state = useResource<BalanceSheet>(`/v1/finance/reports/balance-sheet?asOf=${asOf}&currency=${currency}`);
  const d = state.data;

  return (
    <div className="space-y-4">
      <FilterBar>
        <Input label="Per tanggal" type="date" value={asOf} max={isoDate()} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
      </FilterBar>
      <LoadState state={state} skeletonHeight={280}>
        {d && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <BalanceBadge balanced={d.balanced} />
              <span className="text-caption text-fossil">Per {formatDate(d.asOf)} · {d.currency}</span>
            </div>
            {d.warnings.map((w) => (
              <Notice key={w}>{w}</Notice>
            ))}
            <StatRow
              items={[
                { label: 'Total aset', value: formatMoney(num(d.assets.total), d.currency) },
                { label: 'Kewajiban', value: formatMoney(num(d.liabilities.total), d.currency) },
                { label: 'Ekuitas', value: formatMoney(num(d.equity.total), d.currency) },
                { label: 'Laba berjalan', value: formatMoney(num(d.equity.retainedProfit), d.currency), tone: 'accent' },
              ]}
            />
            {(num(d.liabilities.total) > 0 || num(d.equity.total) > 0) && (
              <Card>
                <CardHeader title="Sumber pendanaan" subtitle="Kewajiban dibanding ekuitas" />
                <CardBody>
                  <DonutChart
                    size={140}
                    formatValue={(v) => formatMoney(v, d.currency)}
                    data={[
                      { label: 'Kewajiban', value: Math.max(num(d.liabilities.total), 0) },
                      { label: 'Ekuitas', value: Math.max(num(d.equity.total), 0) },
                    ]}
                  />
                </CardBody>
              </Card>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <BalanceGroup title="Aset" total={num(d.assets.total)} lines={d.assets.detail} currency={d.currency} />
              <div className="space-y-4">
                <BalanceGroup title="Kewajiban" total={num(d.liabilities.total)} lines={d.liabilities.detail} currency={d.currency} />
                <BalanceGroup
                  title="Ekuitas"
                  total={num(d.equity.total)}
                  lines={[
                    ...d.equity.detail,
                    { code: '—', name: 'Laba periode berjalan', balance: d.equity.retainedProfit },
                  ]}
                  currency={d.currency}
                />
              </div>
            </div>
          </>
        )}
      </LoadState>
    </div>
  );
}

// ── Neraca Saldo ────────────────────────────────────────────────────────────

interface TrialRow {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

interface TrialBalance {
  asOf: string;
  currency: string;
  fxFallbackUsed: string[];
  data: TrialRow[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
}

function TrialBalanceReport({ currency }: { currency: string }) {
  const [asOf, setAsOf] = useState(isoDate());
  const state = useResource<TrialBalance>(`/v1/finance/reports/trial-balance?asOf=${asOf}&currency=${currency}`);
  const d = state.data;

  return (
    <div className="space-y-4">
      <FilterBar>
        <Input label="Per tanggal" type="date" value={asOf} max={isoDate()} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
      </FilterBar>
      <LoadState state={state} skeletonHeight={240}>
        {d && (
          <>
            <FxNotice missing={d.fxFallbackUsed} currency={d.currency} />
            <div className="flex items-center gap-2 flex-wrap">
              <BalanceBadge balanced={d.balanced} />
              {!d.balanced && <span className="text-caption text-fossil tnum">Selisih {formatMoney(Math.abs(num(d.difference)), d.currency)}</span>}
              <span className="text-caption text-fossil">Per {formatDate(d.asOf)} · {d.currency}</span>
            </div>
            {d.data.length === 0 ? (
              <Card className="p-6">
                <EmptyState icon="document" title="Belum ada saldo" body="Belum ada jurnal diposting sampai tanggal ini." />
              </Card>
            ) : (
              <LedgerTable
                rows={d.data}
                rowKey={(r) => r.code}
                columns={[
                  {
                    key: 'account',
                    header: 'Akun',
                    render: (r) => (
                      <span className="text-ink break-words">
                        <span className="tnum text-fossil mr-2">{r.code}</span>
                        {r.name}
                        <span className="block text-caption text-fossil">{accountTypeLabel[r.type]}</span>
                      </span>
                    ),
                  },
                  { key: 'debit', header: 'Debit', numeric: true, render: (r) => (r.debit ? formatNumber(r.debit) : '') },
                  { key: 'credit', header: 'Kredit', numeric: true, render: (r) => (r.credit ? formatNumber(r.credit) : '') },
                ]}
                footer={
                  <>
                    <span>Total</span>
                    <span className="text-right tnum">{formatNumber(num(d.totalDebit))}</span>
                    <span className="text-right tnum">{formatNumber(num(d.totalCredit))}</span>
                  </>
                }
              />
            )}
          </>
        )}
      </LoadState>
    </div>
  );
}

// ── Arus Kas ────────────────────────────────────────────────────────────────

interface Cashflow {
  days: number;
  forecastDays: number;
  currency: string;
  fxFallbackUsed: string[];
  series: Array<{ date: string; inflow: number; outflow: number; forecast: boolean }>;
  totals: { inflow: number; outflow: number; net: number };
  method: string;
}

function CashflowReport({ currency }: { currency: string }) {
  const [days, setDays] = useState('14');
  const [forecast, setForecast] = useState('30');
  const state = useResource<Cashflow>(
    `/v1/finance/cashflow?days=${days}&forecast=${forecast}&currency=${currency}`,
  );
  const d = state.data;
  const fmt = (v: number) => formatMoney(v, d?.currency ?? currency);

  const chart = useMemo(() => {
    if (!d) return null;
    const firstForecast = d.series.findIndex((p) => p.forecast);
    return {
      labels: d.series.map((p) => formatDayShort(p.date)),
      inflow: d.series.map((p) => num(p.inflow)),
      outflow: d.series.map((p) => num(p.outflow)),
      forecastFrom: firstForecast > 0 ? firstForecast : undefined,
    };
  }, [d]);

  return (
    <div className="space-y-4">
      <FilterBar>
        <SelectBox label="Riwayat" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="7">7 hari</option>
          <option value="14">14 hari</option>
          <option value="30">30 hari</option>
          <option value="60">60 hari</option>
          <option value="90">90 hari</option>
        </SelectBox>
        <SelectBox label="Prakiraan" value={forecast} onChange={(e) => setForecast(e.target.value)}>
          <option value="7">7 hari</option>
          <option value="30">30 hari</option>
          <option value="60">60 hari</option>
          <option value="90">90 hari</option>
        </SelectBox>
      </FilterBar>
      <LoadState state={state} skeletonHeight={280}>
        {d && chart && (
          <>
            <FxNotice missing={d.fxFallbackUsed} currency={d.currency} />
            <StatRow
              items={[
                { label: 'Kas masuk', value: fmt(num(d.totals.inflow)) },
                { label: 'Kas keluar', value: fmt(num(d.totals.outflow)) },
                { label: 'Arus bersih', value: fmt(num(d.totals.net)), tone: 'accent' },
                { label: 'Metode prakiraan', value: <span className="text-[14px] font-normal break-words">{d.method}</span> },
              ]}
            />
            <Card>
              <CardHeader title="Kas masuk dan keluar" subtitle={`${d.days} hari terakhir dan prakiraan ${d.forecastDays} hari`} />
              <CardBody className="space-y-4">
                <div>
                  <p className="text-caption text-fossil mb-1">Kas masuk</p>
                  <LineChart
                    labels={chart.labels}
                    height={130}
                    forecastFrom={chart.forecastFrom}
                    series={[{ name: 'Kas masuk', values: chart.inflow, color: '#1c1c1c' }]}
                  />
                </div>
                <div>
                  <p className="text-caption text-fossil mb-1">Kas keluar</p>
                  <LineChart
                    labels={chart.labels}
                    height={130}
                    forecastFrom={chart.forecastFrom}
                    series={[{ name: 'Kas keluar', values: chart.outflow, color: '#706f6c', dashed: true }]}
                  />
                </div>
              </CardBody>
            </Card>
          </>
        )}
      </LoadState>
    </div>
  );
}

// ── Buku Besar ──────────────────────────────────────────────────────────────

interface LedgerRow {
  journalNumber: string;
  date: string;
  sourceModule: string;
  sourceRefId: string | null;
  memo: string;
  debit: number;
  credit: number;
  balance: number;
}

interface GeneralLedger {
  account: { id: string; code: string; name: string; type: AccountType };
  period: { from: string | null; to: string };
  openingBalance: number;
  closingBalance: number;
  data: LedgerRow[];
}

function GeneralLedgerReport() {
  const accounts = useResource<{ data: Account[] }>('/v1/finance/accounts');
  const accountRows = listOf<Account>(accounts.data);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [asOf, setAsOf] = useState(isoDate());

  const qs = new URLSearchParams({ asOf });
  if (from) qs.set('from', from);
  const state = useResource<GeneralLedger>(accountId ? `/v1/finance/reports/general-ledger/${accountId}?${qs}` : null);
  const d = state.data;
  const rows = d?.data ?? [];
  const { page, setPage, totalPages, paged } = usePagedList(rows, 25);

  const columns: Column<LedgerRow>[] = [
    {
      key: 'no',
      header: 'Jurnal',
      render: (r) => (
        <div className="min-w-0">
          <span className="tnum text-ink break-all">{r.journalNumber}</span>
          <p className="text-caption text-fossil">{formatDate(r.date)}</p>
          {r.memo && <p className="text-caption text-fossil break-words line-clamp-2">{r.memo}</p>}
        </div>
      ),
    },
    { key: 'debit', header: 'Debit', align: 'right', render: (r) => <span className="tnum">{r.debit ? formatNumber(r.debit) : '-'}</span> },
    { key: 'credit', header: 'Kredit', align: 'right', render: (r) => <span className="tnum">{r.credit ? formatNumber(r.credit) : '-'}</span> },
    { key: 'balance', header: 'Saldo', align: 'right', render: (r) => <span className="tnum text-ink">{formatNumber(r.balance)}</span> },
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <SelectBox label="Akun" className="min-[420px]:col-span-2" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Pilih akun</option>
          {accountRows.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} {a.name}
            </option>
          ))}
        </SelectBox>
        <Input label="Dari tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Sampai tanggal" type="date" value={asOf} max={isoDate()} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
      </FilterBar>

      {!accountId ? (
        <Card className="p-6">
          <EmptyState icon="document" title="Pilih akun" body="Buku besar menampilkan semua mutasi satu akun beserta saldo berjalannya." />
        </Card>
      ) : (
        <>
          {d && (
            <StatRow
              items={[
                { label: 'Akun', value: <span className="text-[15px] break-words">{d.account.code} {d.account.name}</span> },
                { label: 'Saldo awal', value: formatMoney(num(d.openingBalance)) },
                { label: 'Mutasi', value: formatNumber(rows.length) },
                { label: 'Saldo akhir', value: formatMoney(num(d.closingBalance)), tone: 'accent' },
              ]}
            />
          )}
          <DataTable
            rows={paged}
            columns={columns}
            rowKey={(r) => `${r.journalNumber}-${r.date}-${r.debit}-${r.credit}-${r.balance}`}
            loading={state.loading}
            error={state.error}
            onRetry={state.reload}
            emptyIcon="document"
            emptyTitle="Tidak ada mutasi"
            emptyBody="Akun ini belum memiliki jurnal diposting pada rentang tersebut."
            page={page}
            totalPages={totalPages}
            totalItems={rows.length}
            pageSize={25}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

// ── Konsolidasi ─────────────────────────────────────────────────────────────

interface ConsolidatedCompany {
  companyId: string;
  code: string;
  name: string;
  currency: string;
  assets: number;
  liabilities: number;
  equity: number;
  profit: number;
}

interface Consolidation {
  asOf: string;
  reportingCurrency: string;
  companies: ConsolidatedCompany[];
  excluded: Array<{ code: string; reason: string }>;
  byAccount: TrialRow[];
  totalAssets: number;
  totalLiabilitiesEquity: number;
  totalProfit: number;
  balanced: boolean;
}

function ConsolidationReport({ currency }: { currency: string }) {
  const [asOf, setAsOf] = useState(isoDate());
  const [showAccounts, setShowAccounts] = useState(false);
  const state = useResource<Consolidation>(`/v1/finance/reports/consolidation?asOf=${asOf}&currency=${currency}`);
  const d = state.data;
  const fmt = (v: number) => formatMoney(v, d?.reportingCurrency ?? currency);

  const columns: Column<ConsolidatedCompany>[] = [
    {
      key: 'company',
      header: 'Perusahaan',
      render: (c) => (
        <span className="text-ink break-words">
          <span className="tnum text-fossil mr-2">{c.code}</span>
          {c.name}
        </span>
      ),
    },
    { key: 'assets', header: 'Aset', align: 'right', render: (c) => <span className="tnum">{fmt(num(c.assets))}</span> },
    { key: 'liabilities', header: 'Kewajiban', align: 'right', render: (c) => <span className="tnum">{fmt(num(c.liabilities))}</span> },
    { key: 'equity', header: 'Ekuitas', align: 'right', render: (c) => <span className="tnum">{fmt(num(c.equity))}</span> },
    { key: 'profit', header: 'Laba', align: 'right', render: (c) => <span className="tnum">{fmt(num(c.profit))}</span> },
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <Input label="Per tanggal" type="date" value={asOf} max={isoDate()} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
      </FilterBar>
      <LoadState state={state} skeletonHeight={240}>
        {d && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <BalanceBadge balanced={d.balanced} />
              <span className="text-caption text-fossil">Per {formatDate(d.asOf)} · semua dalam {d.reportingCurrency}</span>
            </div>
            {d.excluded.map((e) => (
              <Notice key={e.code}>
                <strong className="text-ink">{e.code}</strong> tidak ikut dikonsolidasi. {e.reason}
              </Notice>
            ))}
            <StatRow
              items={[
                { label: 'Total aset', value: fmt(num(d.totalAssets)) },
                { label: 'Kewajiban + ekuitas', value: fmt(num(d.totalLiabilitiesEquity)) },
                { label: 'Laba grup', value: fmt(num(d.totalProfit)), tone: 'accent' },
                { label: 'Perusahaan', value: formatNumber(d.companies.length) },
              ]}
            />
            <DataTable
              rows={d.companies}
              columns={columns}
              rowKey={(c) => c.companyId}
              emptyIcon="building"
              emptyTitle="Tidak ada perusahaan dikonsolidasi"
              emptyBody="Pastikan kurs ke mata uang laporan sudah diisi."
            />
            {d.byAccount.length > 0 && (
              <>
                <Button variant="ghost" icon="layers" onClick={() => setShowAccounts((v) => !v)}>
                  {showAccounts ? 'Sembunyikan rincian akun' : 'Lihat rincian per akun'}
                </Button>
                {showAccounts && (
                  <LedgerTable
                    rows={d.byAccount}
                    rowKey={(r) => r.code}
                    columns={[
                      {
                        key: 'account',
                        header: 'Akun',
                        render: (r) => (
                          <span className="text-ink break-words">
                            <span className="tnum text-fossil mr-2">{r.code}</span>
                            {r.name}
                          </span>
                        ),
                      },
                      { key: 'debit', header: 'Debit', numeric: true, render: (r) => (r.debit ? formatNumber(r.debit) : '') },
                      { key: 'credit', header: 'Kredit', numeric: true, render: (r) => (r.credit ? formatNumber(r.credit) : '') },
                    ]}
                  />
                )}
              </>
            )}
          </>
        )}
      </LoadState>
    </div>
  );
}

// ── Tab ─────────────────────────────────────────────────────────────────────

export function ReportsTab() {
  const [report, setReport] = useState<ReportKey>('laba-rugi');
  const [currency, setCurrency] = useState('IDR');
  const currencies = useResource<Array<{ code: string; name?: string }>>('/v1/companies/currencies');
  const codes = useMemo(() => {
    const fromApi = listOf<{ code: string }>(currencies.data).map((c) => c.code);
    return fromApi.length > 0 ? fromApi : FALLBACK_CURRENCIES;
  }, [currencies.data]);

  // Buku besar dihitung dalam mata uang dasar perusahaan, jadi pilihan mata uang tidak berlaku.
  const usesCurrency = report !== 'buku-besar';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <Tabs options={reportOptions} value={report} onChange={setReport} className="flex-1 min-w-0" />
        {usesCurrency && (
          <SelectBox
            label="Mata uang laporan"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="sm:w-44 shrink-0"
          >
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectBox>
        )}
      </div>

      {report === 'laba-rugi' && <ProfitLossReport currency={currency} />}
      {report === 'neraca' && <BalanceSheetReport currency={currency} />}
      {report === 'neraca-saldo' && <TrialBalanceReport currency={currency} />}
      {report === 'arus-kas' && <CashflowReport currency={currency} />}
      {report === 'buku-besar' && <GeneralLedgerReport />}
      {report === 'konsolidasi' && <ConsolidationReport currency={currency} />}
    </div>
  );
}
