import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatDate, formatNumber } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/controls';
import { DataTable, StatRow, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { ManualJournalModal } from './ManualJournalModal';
import {
  FilterBar,
  LoadMore,
  Notice,
  SelectBox,
  formatMoney,
  isoDate,
  nextDayISO,
  num,
  useCursorList,
  type Account,
} from './shared';

interface JournalLine {
  id: string;
  lineNo: number;
  accountId: string;
  direction: 'debit' | 'credit';
  amount: number | string;
  memo: string;
}

interface Journal {
  id: string;
  number: string;
  entryDate: string;
  status: 'draft' | 'posted' | 'voided';
  memo: string;
  sourceModule: string;
  sourceRefId: string | null;
  lines: JournalLine[];
  reversalOf: { id: string; number: string } | null;
  reversedBy: { id: string; number: string; entryDate: string } | null;
}

const statusBadge: Record<Journal['status'], { variant: 'outline' | 'accent' | 'ink'; label: string }> = {
  draft: { variant: 'outline', label: 'Draf' },
  posted: { variant: 'accent', label: 'Diposting' },
  voided: { variant: 'ink', label: 'Dibatalkan' },
};

const sourceLabel: Record<string, string> = {
  pos: 'Kasir',
  sales: 'Penjualan',
  manual: 'Jurnal manual',
  inventory: 'Inventori',
  purchasing: 'Pembelian',
  procurement: 'Pengadaan',
  opening_balance: 'Saldo awal',
  reversal: 'Pembalikan',
  depreciation: 'Penyusutan',
  payroll: 'Payroll',
  production: 'Produksi',
  crm: 'Penjualan CRM',
  maintenance: 'Pemeliharaan',
};

const sourceName = (key: string) => sourceLabel[key] ?? key.replace(/_/g, ' ');

function totals(j: Journal) {
  let debit = 0;
  let credit = 0;
  for (const l of j.lines) {
    if (l.direction === 'debit') debit += num(l.amount);
    else credit += num(l.amount);
  }
  return { debit, credit };
}

export function JournalTab() {
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const accounts = useResource<{ data: Account[] }>('/v1/finance/accounts');
  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    for (const a of listOf<Account>(accounts.data)) map.set(a.id, a);
    return map;
  }, [accounts.data]);

  const list = useCursorList<Journal>('/v1/journals', {
    take: 30,
    status: status || undefined,
    sourceModule: source.trim() || undefined,
    from: from || undefined,
    to: to ? nextDayISO(to) : undefined,
  });

  const [manualOpen, setManualOpen] = useState(false);
  const [detail, setDetail] = useState<Journal | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Journal | null>(null);
  const [reverseDate, setReverseDate] = useState(isoDate());
  const [reverseMemo, setReverseMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const pageTotals = useMemo(
    () =>
      list.rows.reduce(
        (acc, j) => {
          if (j.status !== 'posted') return acc;
          const t = totals(j);
          return { debit: acc.debit + t.debit, count: acc.count + 1 };
        },
        { debit: 0, count: 0 },
      ),
    [list.rows],
  );

  const columns: Column<Journal>[] = [
    {
      key: 'number',
      header: 'Nomor',
      render: (j) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="tnum text-ink break-all">{j.number}</span>
            <Badge variant={statusBadge[j.status].variant}>{statusBadge[j.status].label}</Badge>
          </div>
          {j.memo && <p className="text-caption text-fossil mt-0.5 line-clamp-2 break-words">{j.memo}</p>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Tanggal',
      render: (j) => <span className="text-fossil">{formatDate(j.entryDate)}</span>,
    },
    {
      key: 'source',
      header: 'Sumber',
      render: (j) => <span className="text-fossil">{sourceName(j.sourceModule)}</span>,
    },
    {
      key: 'lines',
      header: 'Baris',
      hideOnMobile: true,
      align: 'right',
      render: (j) => <span className="tnum text-fossil">{j.lines.length}</span>,
    },
    {
      key: 'amount',
      header: 'Nominal',
      align: 'right',
      render: (j) => <span className="tnum text-ink">{formatMoney(totals(j).debit)}</span>,
    },
  ];

  const canReverse = (j: Journal) => j.status === 'posted' && !j.reversedBy && !j.reversalOf;

  function openReverse(j: Journal) {
    setReverseTarget(j);
    setReverseDate(isoDate());
    setReverseMemo('');
  }

  async function submitReverse() {
    if (!reverseTarget) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ number?: string }>(`/v1/journals/${reverseTarget.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({
          entryDate: reverseDate || undefined,
          memo: reverseMemo.trim() || undefined,
        }),
      });
      toast({ title: `Jurnal dibalik${res?.number ? ` (${res.number})` : ''}.`, icon: 'check' });
      setReverseTarget(null);
      setDetail(null);
      list.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal membalik jurnal.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" icon="plus" className="min-h-[44px] w-full sm:w-auto" onClick={() => setManualOpen(true)}>
          Jurnal manual
        </Button>
      </div>

      <StatRow
        items={[
          { label: 'Jurnal dimuat', value: formatNumber(list.rows.length) },
          { label: 'Diposting', value: formatNumber(pageTotals.count) },
          { label: 'Total nominal diposting', value: formatMoney(pageTotals.debit) },
          { label: 'Dibalik', value: formatNumber(list.rows.filter((j) => j.reversedBy).length), tone: 'accent' },
        ]}
      />

      <FilterBar>
        <SelectBox label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option value="posted">Diposting</option>
          <option value="draft">Draf</option>
          <option value="voided">Dibatalkan</option>
        </SelectBox>
        <Input label="Modul sumber" value={source} onChange={(e) => setSource(e.target.value)} placeholder="mis. pos, manual" />
        <Input label="Dari tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Sampai tanggal" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </FilterBar>

      <DataTable
        rows={list.rows}
        columns={columns}
        rowKey={(j) => j.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={setDetail}
        emptyIcon="document"
        emptyTitle="Belum ada jurnal"
        emptyBody="Jurnal muncul otomatis dari penjualan, pembelian, dan modul lain, atau lewat saldo awal."
      />
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />

      <ManualJournalModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        accounts={listOf<Account>(accounts.data)}
        onPosted={() => list.reload()}
      />

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Jurnal ${detail.number}` : ''}
        maxWidth="xl"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm">
              <div>
                <p className="text-caption text-fossil">Tanggal</p>
                <p className="text-ink">{formatDate(detail.entryDate)}</p>
              </div>
              <div>
                <p className="text-caption text-fossil">Status</p>
                <Badge variant={statusBadge[detail.status].variant}>{statusBadge[detail.status].label}</Badge>
              </div>
              <div className="min-w-0">
                <p className="text-caption text-fossil">Sumber</p>
                <p className="text-ink break-words">
                  {sourceName(detail.sourceModule)}
                  {detail.sourceRefId ? <span className="text-fossil"> · {detail.sourceRefId}</span> : null}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-caption text-fossil">Keterangan</p>
                <p className="text-ink break-words">{detail.memo || '-'}</p>
              </div>
            </div>

            {detail.reversalOf && <Notice tone="ok">Jurnal ini membalik {detail.reversalOf.number}.</Notice>}
            {detail.reversedBy && (
              <Notice>
                Sudah dibalik oleh {detail.reversedBy.number} pada {formatDate(detail.reversedBy.entryDate)}.
              </Notice>
            )}

            <div className="border border-ash rounded-xl overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 px-3 sm:px-4 py-2 bg-sand/50 text-caption text-fossil">
                <span>Akun</span>
                <span className="text-right w-[84px] sm:w-[110px]">Debit</span>
                <span className="text-right w-[84px] sm:w-[110px]">Kredit</span>
              </div>
              {detail.lines.map((l) => {
                const acc = accountById.get(l.accountId);
                const amount = num(l.amount);
                return (
                  <div
                    key={l.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 px-3 sm:px-4 py-2.5 border-t border-sand text-[14px] items-baseline"
                  >
                    <div className="min-w-0">
                      <p className="text-ink break-words">
                        <span className="tnum text-fossil">{acc?.code ?? '—'}</span> {acc?.name ?? 'Akun tidak dikenal'}
                      </p>
                      {l.memo && <p className="text-caption text-fossil break-words">{l.memo}</p>}
                    </div>
                    <span className="text-right tnum w-[84px] sm:w-[110px]">
                      {l.direction === 'debit' ? formatNumber(amount) : ''}
                    </span>
                    <span className="text-right tnum w-[84px] sm:w-[110px]">
                      {l.direction === 'credit' ? formatNumber(amount) : ''}
                    </span>
                  </div>
                );
              })}
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 px-3 sm:px-4 py-2.5 border-t border-ash bg-sand/40 text-[14px] font-medium">
                <span>Total</span>
                <span className="text-right tnum w-[84px] sm:w-[110px]">{formatNumber(totals(detail).debit)}</span>
                <span className="text-right tnum w-[84px] sm:w-[110px]">{formatNumber(totals(detail).credit)}</span>
              </div>
            </div>

            {canReverse(detail) && (
              <Button variant="ghost" full icon="sync" onClick={() => openReverse(detail)}>
                Balik jurnal
              </Button>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={reverseTarget !== null}
        onClose={() => setReverseTarget(null)}
        title="Balik Jurnal"
        maxWidth="md"
      >
        {reverseTarget && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              Jurnal diposting tidak bisa diubah. Pembalikan membuat jurnal baru dengan debit dan kredit tertukar untuk{' '}
              <strong className="text-ink">{reverseTarget.number}</strong>.
            </p>
            <Input
              label="Tanggal pembalikan"
              type="date"
              value={reverseDate}
              onChange={(e) => setReverseDate(e.target.value)}
              hint="Periode fiskal pada tanggal ini harus masih terbuka."
            />
            <Textarea
              label="Alasan (opsional)"
              value={reverseMemo}
              onChange={(e) => setReverseMemo(e.target.value)}
              maxLength={500}
              placeholder="Mis. salah akun"
            />
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <Button variant="ghost" full onClick={() => setReverseTarget(null)}>
                Batal
              </Button>
              <Button variant="primary" full disabled={saving || !reverseDate} onClick={submitReverse}>
                {saving ? 'Memproses…' : 'Balik Jurnal'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
