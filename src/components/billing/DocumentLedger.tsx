import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Field, Input, Select, Textarea } from '../ui/controls';
import { DataTable, StatRow, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { apiFetch } from '../../lib/api';
import { formatDate, formatIDR, todayISO } from '../../lib/format';
import { listOf, usePagedList, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { AgingBars, type AgingData } from './AgingBars';

export type LedgerKind = 'receivable' | 'payable';

interface LedgerConfig {
  listPath: string;
  agingPath: string;
  settlePath: (id: string) => string;
  taxPath: (id: string) => string;
  partyLabel: string;
  dateLabel: string;
  settleVerb: string;
  settleNoun: string;
  amountLabel: string;
  agingTitle: string;
  totalLabel: string;
  emptyTitle: string;
  emptyBody: string;
  searchPlaceholder: string;
}

const CONFIG: Record<LedgerKind, LedgerConfig> = {
  receivable: {
    listPath: '/v1/receivables/invoices',
    agingPath: '/v1/receivables/aging',
    settlePath: (id) => `/v1/receivables/invoices/${id}/receive`,
    taxPath: (id) => `/v1/tax/sale/${id}`,
    partyLabel: 'Pelanggan',
    dateLabel: 'Tanggal faktur',
    settleVerb: 'Terima',
    settleNoun: 'penerimaan',
    amountLabel: 'Jumlah diterima',
    agingTitle: 'Umur piutang',
    totalLabel: 'Total piutang',
    emptyTitle: 'Belum ada faktur penjualan',
    emptyBody: 'Faktur terbit otomatis dari penjualan kredit (non-tunai) dan penagihan proyek.',
    searchPlaceholder: 'Cari nomor faktur atau pelanggan',
  },
  payable: {
    listPath: '/v1/payables/bills',
    agingPath: '/v1/payables/aging',
    settlePath: (id) => `/v1/payables/bills/${id}/pay`,
    taxPath: (id) => `/v1/tax/purchase/${id}`,
    partyLabel: 'Pemasok',
    dateLabel: 'Tanggal tagihan',
    settleVerb: 'Bayar',
    settleNoun: 'pembayaran',
    amountLabel: 'Jumlah dibayar',
    agingTitle: 'Umur utang',
    totalLabel: 'Total utang',
    emptyTitle: 'Belum ada tagihan pemasok',
    emptyBody: 'Tagihan terbit otomatis saat PO diterima di gudang. Tagihan lain bisa dicatat manual atau dipindai dari foto invoice.',
    searchPlaceholder: 'Cari nomor tagihan atau pemasok',
  },
};

interface RawDocument {
  id: string;
  number: string;
  status: 'open' | 'partial' | 'paid' | 'voided';
  invoiceDate?: string;
  billDate?: string;
  dueDate: string;
  total: number | string;
  paidAmount: number | string;
  outstanding?: number | string;
  note?: string;
  customer?: { code: string; name: string } | null;
  supplier?: { code: string; name: string } | null;
}

interface LedgerDoc {
  id: string;
  number: string;
  status: RawDocument['status'];
  party: string;
  date: string;
  dueDate: string;
  total: number;
  paid: number;
  outstanding: number;
  overdueDays: number;
  note: string;
}

interface TaxDetail {
  document: { number: string; total: number | string; taxAmount: number | string; taxTotal: number | string };
  computation: {
    baseAmount: number | string;
    taxAmount: number | string;
    source: 'official' | 'estimate';
    taxRule: { code: string; name: string; source: 'official' | 'estimate'; rate: number | string | null };
  } | null;
}

type StatusFilter = 'all' | 'unpaid' | 'overdue' | 'paid';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Tunai',
  transfer: 'Transfer bank',
  qris: 'QRIS',
  debit: 'Kartu debit',
};

const num = (v: unknown) => Number(v) || 0;

function normalize(raw: RawDocument): LedgerDoc {
  const total = num(raw.total);
  const paid = num(raw.paidAmount);
  const outstanding = raw.outstanding !== undefined ? num(raw.outstanding) : Math.max(total - paid, 0);
  const open = raw.status === 'open' || raw.status === 'partial';
  const days = Math.floor((Date.now() - new Date(raw.dueDate).getTime()) / 86400000);
  return {
    id: raw.id,
    number: raw.number,
    status: raw.status,
    party: raw.customer?.name ?? raw.supplier?.name ?? '-',
    date: raw.invoiceDate ?? raw.billDate ?? raw.dueDate,
    dueDate: raw.dueDate,
    total,
    paid,
    outstanding,
    overdueDays: open && days > 0 ? days : 0,
    note: raw.note ?? '',
  };
}

function StatusBadge({ doc }: { doc: LedgerDoc }) {
  if (doc.status === 'paid') return <Badge variant="accent">Lunas</Badge>;
  if (doc.status === 'voided') return <Badge variant="outline">Dibatalkan</Badge>;
  if (doc.overdueDays > 0) return <Badge variant="ink">Telat {doc.overdueDays} hari</Badge>;
  if (doc.status === 'partial') return <Badge variant="neutral">Dibayar sebagian</Badge>;
  return <Badge variant="outline">Belum lunas</Badge>;
}

export function DocumentLedger({ kind, reloadSignal = 0 }: { kind: LedgerKind; reloadSignal?: number }) {
  const cfg = CONFIG[kind];
  const list = useResource<RawDocument[]>(cfg.listPath);
  const aging = useResource<AgingData>(cfg.agingPath);

  // Pemuatan ulang dari luar (mis. tagihan baru dicatat) tanpa mengubah filter yang aktif
  useEffect(() => {
    if (reloadSignal > 0) {
      list.reload();
      aging.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSignal]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('unpaid');
  const [detail, setDetail] = useState<LedgerDoc | null>(null);
  const [settleTarget, setSettleTarget] = useState<LedgerDoc | null>(null);

  const docs = useMemo(() => listOf<RawDocument>(list.data).map(normalize), [list.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (q && !`${d.number} ${d.party}`.toLowerCase().includes(q)) return false;
      if (filter === 'unpaid') return d.status === 'open' || d.status === 'partial';
      if (filter === 'overdue') return d.overdueDays > 0;
      if (filter === 'paid') return d.status === 'paid';
      return true;
    });
  }, [docs, query, filter]);

  const { page, setPage, totalPages, paged } = usePagedList(rows, 15);

  const buckets = aging.data?.buckets;
  const lateTotal = buckets ? num(buckets.d1_30) + num(buckets.d31_60) + num(buckets.d61_90) + num(buckets.d90plus) : 0;
  const unpaidCount = docs.filter((d) => d.status === 'open' || d.status === 'partial').length;
  const overdueCount = docs.filter((d) => d.overdueDays > 0).length;

  const reloadAll = () => {
    list.reload();
    aging.reload();
  };

  const columns: Column<LedgerDoc>[] = [
    {
      key: 'number',
      header: 'Dokumen',
      render: (d) => (
        <>
          <p className="text-[15px] text-ink font-medium tnum break-words">{d.number}</p>
          <p className="text-caption text-fossil truncate max-w-[260px]">{d.party}</p>
        </>
      ),
    },
    {
      key: 'due',
      header: 'Jatuh tempo',
      render: (d) => <span className="text-[14px] text-ink">{formatDate(d.dueDate)}</span>,
    },
    {
      key: 'total',
      header: 'Nilai',
      align: 'right',
      render: (d) => <span className="tnum text-[14px] text-ink">{formatIDR(d.total)}</span>,
    },
    {
      key: 'outstanding',
      header: 'Sisa',
      align: 'right',
      render: (d) => (
        <span className={`tnum text-[14px] ${d.outstanding > 0 ? 'text-ink font-medium' : 'text-fossil'}`}>
          {formatIDR(d.outstanding)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (d) => <StatusBadge doc={d} /> },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <StatRow
        items={[
          { label: cfg.totalLabel, value: formatIDR(num(aging.data?.total)), tone: 'accent' },
          { label: 'Sudah lewat jatuh tempo', value: formatIDR(lateTotal) },
          { label: 'Belum lunas', value: `${unpaidCount} dokumen` },
          { label: 'Terlambat', value: `${overdueCount} dokumen` },
        ]}
      />

      {aging.error ? (
        <Card className="px-4 py-3.5 flex items-center justify-between gap-3">
          <p className="text-body-sm text-fossil min-w-0 break-words">Umur {kind === 'receivable' ? 'piutang' : 'utang'} gagal dimuat: {aging.error}</p>
          <Button variant="ghost" size="sm" icon="sync" onClick={aging.reload} className="min-h-[40px] shrink-0">
            Coba lagi
          </Button>
        </Card>
      ) : (
        aging.data && (
          <AgingBars
            data={aging.data}
            title={cfg.agingTitle}
            subtitle="Dihitung dari tanggal jatuh tempo, hanya dokumen yang belum lunas."
          />
        )
      )}

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble pointer-events-none" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={cfg.searchPlaceholder}
            aria-label={cfg.searchPlaceholder}
            className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-3 py-2.5 text-[16px] sm:text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
          />
        </div>
        <div className="relative sm:w-52">
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
            aria-label="Filter status"
            className="w-full appearance-none bg-paper border border-pebble/70 rounded-lg pl-3 pr-9 py-2.5 text-[16px] sm:text-[15px] text-ink focus:border-ink focus:outline-none"
          >
            <option value="unpaid">Belum lunas</option>
            <option value="overdue">Terlambat</option>
            <option value="paid">Lunas</option>
            <option value="all">Semua</option>
          </select>
          <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fossil" />
        </div>
      </div>

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(d) => d.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        emptyIcon="receipt"
        emptyTitle={docs.length === 0 ? cfg.emptyTitle : 'Tidak ada dokumen yang cocok'}
        emptyBody={docs.length === 0 ? cfg.emptyBody : 'Ubah kata kunci atau filter status.'}
        onRowClick={setDetail}
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        pageSize={15}
        onPageChange={setPage}
        rowActions={(d) =>
          d.status === 'open' || d.status === 'partial' ? (
            <Button
              variant="subtle"
              size="sm"
              icon="wallet"
              className="min-h-[40px] sm:min-h-0"
              onClick={() => setSettleTarget(d)}
            >
              {cfg.settleVerb}
            </Button>
          ) : null
        }
      />

      <DetailModal
        kind={kind}
        doc={detail}
        onClose={() => setDetail(null)}
        onSettle={(d) => {
          setDetail(null);
          setSettleTarget(d);
        }}
      />

      <SettleModal
        kind={kind}
        doc={settleTarget}
        onClose={() => setSettleTarget(null)}
        onDone={() => {
          setSettleTarget(null);
          reloadAll();
        }}
      />
    </div>
  );
}

// ── Detail dokumen + PPN ──────────────────────────────────────────────────

function DetailModal({
  kind,
  doc,
  onClose,
  onSettle,
}: {
  kind: LedgerKind;
  doc: LedgerDoc | null;
  onClose: () => void;
  onSettle: (d: LedgerDoc) => void;
}) {
  const cfg = CONFIG[kind];
  // path null saat tertutup -> useResource tidak memanggil API
  const tax = useResource<TaxDetail>(doc ? cfg.taxPath(doc.id) : null);

  const rate = tax.data?.computation?.taxRule?.rate;
  const ratePct = rate == null ? null : num(rate) > 1 ? num(rate) : Math.round(num(rate) * 10000) / 100;
  const canSettle = doc && (doc.status === 'open' || doc.status === 'partial');

  return (
    <Modal open={Boolean(doc)} onClose={onClose} title={doc ? doc.number : undefined} maxWidth="md">
      {doc && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge doc={doc} />
            <span className="text-body-sm text-fossil break-words min-w-0">{doc.party}</span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Info label={cfg.dateLabel} value={formatDate(doc.date)} />
            <Info label="Jatuh tempo" value={formatDate(doc.dueDate)} />
            <Info label="Nilai dokumen" value={formatIDR(doc.total)} />
            <Info label={kind === 'receivable' ? 'Sudah diterima' : 'Sudah dibayar'} value={formatIDR(doc.paid)} />
            <Info label="Sisa tagihan" value={formatIDR(doc.outstanding)} strong />
          </dl>

          {doc.note && <p className="text-body-sm text-fossil break-words">{doc.note}</p>}

          <div className="rounded-xl border border-ash bg-bone px-4 py-3.5">
            <p className="text-caption text-fossil mb-2">Pajak (PPN)</p>
            {!tax.error && !tax.data && <div className="h-10 rounded bg-sand animate-pulse" />}
            {tax.error && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-body-sm text-fossil min-w-0 break-words">{tax.error}</p>
                <Button variant="ghost" size="sm" icon="sync" onClick={tax.reload} className="min-h-[40px] shrink-0">
                  Ulangi
                </Button>
              </div>
            )}
            {!tax.error && tax.data && !tax.data.computation && (
              <p className="text-body-sm text-fossil">Tidak ada PPN yang menempel pada dokumen ini.</p>
            )}
            {!tax.error && tax.data?.computation && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Info
                  label="Aturan"
                  value={`${tax.data.computation.taxRule.code}${ratePct != null ? ` · ${ratePct}%` : ''}`}
                />
                <div className="min-w-0">
                  <dt className="text-caption text-fossil">Sumber tarif</dt>
                  <dd className="mt-0.5">
                    <Badge variant={tax.data.computation.source === 'official' ? 'accent' : 'outline'}>
                      {tax.data.computation.source === 'official' ? 'Resmi' : 'Perkiraan'}
                    </Badge>
                  </dd>
                </div>
                <Info label="Dasar pengenaan" value={formatIDR(num(tax.data.computation.baseAmount))} />
                <Info label="PPN" value={formatIDR(num(tax.data.computation.taxAmount))} />
                <Info label="Total + PPN" value={formatIDR(num(tax.data.document.taxTotal))} strong />
              </dl>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
            <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={onClose}>
              Tutup
            </Button>
            {canSettle && (
              <Button icon="wallet" full className="sm:w-auto min-h-[44px]" onClick={() => onSettle(doc)}>
                {cfg.settleVerb} sekarang
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-fossil">{label}</dt>
      <dd className={`text-[15px] tnum break-words ${strong ? 'text-ink font-medium' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}

// ── Terima / bayar ────────────────────────────────────────────────────────

function SettleModal({
  kind,
  doc,
  onClose,
  onDone,
}: {
  kind: LedgerKind;
  doc: LedgerDoc | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const cfg = CONFIG[kind];
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('transfer');
  const [payDate, setPayDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastDocId, setLastDocId] = useState<string | null>(null);

  // Isi ulang form setiap dokumen baru dibuka (state tidak ikut tertinggal dari dokumen sebelumnya)
  if (doc && doc.id !== lastDocId) {
    setLastDocId(doc.id);
    setAmount(String(doc.outstanding));
    setMethod('transfer');
    setPayDate(todayISO());
    setNote('');
  }
  if (!doc && lastDocId !== null) setLastDocId(null);

  const value = Number(amount);
  const tooMuch = doc ? value > doc.outstanding + 0.001 : false;
  const invalid = !Number.isFinite(value) || value <= 0 || tooMuch;
  const remaining = doc ? Math.max(doc.outstanding - (Number.isFinite(value) ? value : 0), 0) : 0;

  async function submit() {
    if (!doc || invalid) return;
    setSaving(true);
    try {
      await apiFetch(cfg.settlePath(doc.id), {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(value * 100) / 100,
          method,
          payDate,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      toast({ title: `${cfg.settleNoun[0].toUpperCase()}${cfg.settleNoun.slice(1)} ${doc.number} dicatat.`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mencatat transaksi.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={Boolean(doc)} onClose={saving ? () => {} : onClose} title={doc ? `${cfg.settleVerb} ${doc.number}` : undefined} maxWidth="md">
      {doc && (
        <div className="space-y-4">
          <div className="rounded-xl border border-ash bg-bone px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-caption text-fossil">{cfg.partyLabel}</p>
              <p className="text-[15px] text-ink truncate">{doc.party}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-caption text-fossil">Sisa tagihan</p>
              <p className="text-[15px] text-ink tnum font-medium">{formatIDR(doc.outstanding)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field
                label={cfg.amountLabel}
                hint={
                  invalid && amount !== ''
                    ? undefined
                    : value > 0
                      ? remaining > 0
                        ? `Sisa setelah ini ${formatIDR(remaining)}`
                        : 'Dokumen akan lunas.'
                      : undefined
                }
              >
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-label={cfg.amountLabel}
                    aria-invalid={invalid && amount !== ''}
                    className="flex-1 min-w-0 bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[16px] sm:text-[15px] text-ink tnum focus:border-ink focus:outline-none"
                  />
                  <Button
                    variant="subtle"
                    className="min-h-[44px] sm:min-h-0 shrink-0"
                    onClick={() => setAmount(String(doc.outstanding))}
                  >
                    Lunasi
                  </Button>
                </div>
              </Field>
              {tooMuch && (
                <p className="text-caption text-rose-700 mt-1.5">
                  Melebihi sisa tagihan ({formatIDR(doc.outstanding)}). Kelebihan pembayaran ditolak sistem.
                </p>
              )}
            </div>
            <Select label="Metode" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(METHOD_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
            <Input label="Tanggal" type="date" value={payDate} max={todayISO()} onChange={(e) => setPayDate(e.target.value)} />
            <div className="sm:col-span-2">
              <Textarea
                label="Catatan (opsional)"
                value={note}
                maxLength={255}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[72px]"
              />
            </div>
          </div>

          <p className="text-caption text-fossil">
            Transaksi ini langsung dijurnal ke buku besar ({kind === 'receivable' ? 'Dr Kas / Cr Piutang Usaha' : 'Dr Hutang Usaha / Cr Kas'}).
          </p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button full className="sm:w-auto min-h-[44px]" onClick={submit} disabled={invalid || saving}>
              {saving ? 'Menyimpan…' : `Catat ${cfg.settleNoun}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
