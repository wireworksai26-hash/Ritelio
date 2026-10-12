import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatDate, formatIDR, formatNumber, todayISO } from '../../lib/format';
import { listOf, usePagedList, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/controls';
import { DataTable, StatRow, type Column } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { ScoreBar, SearchBox, errMsg, num } from './shared';

interface ScoreRow {
  supplierId: string;
  code: string;
  name: string;
  ordersReceived: number;
  ordersCancelled: number;
  totalValue: number;
  onTimeScore: number | null;
  priceScore: number;
  overallScore: number | null;
}

interface HistoryRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  ordersCount: number;
  ordersOnTime: number;
  totalValue: number | string;
  qualityScore: number | string | null;
  onTimeScore: number | string | null;
  priceScore: number | string | null;
  overallScore: number | string | null;
}

interface ComputeResult {
  periodStart: string;
  periodEnd: string;
  computed: number;
  data: Array<{
    supplierId: string;
    ordersCount: number;
    totalValue: number;
    onTimeScore: number;
    qualityScore: number;
    priceScore: number;
    overallScore: number;
  }>;
}

const PAGE_SIZE = 10;

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ScoreCell({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-fossil">{label}</p>
      <ScoreBar value={value} label={label} />
    </div>
  );
}

export function VendorTab() {
  const list = useResource<unknown>('/v1/procurement/vendor-scorecard');
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => listOf<ScoreRow>(list.data).filter((r) => `${r.code} ${r.name}`.toLowerCase().includes(query.trim().toLowerCase())),
    [list.data, query],
  );
  const { page, setPage, totalPages, paged } = usePagedList(rows, PAGE_SIZE);

  const [selected, setSelected] = useState<ScoreRow | null>(null);
  const history = useResource<unknown>(selected ? `/v1/procurement/vendor-performance/${selected.supplierId}?periods=6` : null);
  const historyRows = listOf<HistoryRow>(history.data);

  const [computeOpen, setComputeOpen] = useState(false);
  const [from, setFrom] = useState(daysAgoISO(90));
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ComputeResult | null>(null);

  const nameById = useMemo(() => new Map(listOf<ScoreRow>(list.data).map((r) => [r.supplierId, r.name])), [list.data]);

  async function compute() {
    if (!from || !to || from > to) {
      toast({ title: 'Rentang tanggal tidak valid.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<ComputeResult>('/v1/procurement/vendor-performance/compute', {
        method: 'POST',
        body: JSON.stringify({ periodStart: from, periodEnd: to }),
      });
      setComputeOpen(false);
      setResult(res);
      list.reload();
      history.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal menghitung skor.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  const scored = rows.filter((r) => r.overallScore !== null);
  const best = scored[0];
  const avg = scored.length ? scored.reduce((s, r) => s + num(r.overallScore), 0) / scored.length : null;

  const columns: Column<ScoreRow>[] = [
    {
      key: 'name',
      header: 'Pemasok',
      render: (r) => (
        <>
          <p className="text-[15px] text-ink font-medium break-words">{r.name}</p>
          <p className="text-caption text-fossil">{r.code}</p>
        </>
      ),
    },
    { key: 'overall', header: 'Skor total', render: (r) => <ScoreBar value={r.overallScore} label="Skor total" /> },
    { key: 'ontime', header: 'Ketepatan', render: (r) => <ScoreBar value={r.onTimeScore} label="Ketepatan" /> },
    { key: 'price', header: 'Harga', hideOnMobile: true, render: (r) => <ScoreBar value={r.priceScore} label="Harga" /> },
    {
      key: 'orders',
      header: 'PO diterima',
      align: 'right',
      render: (r) => (
        <span className="tnum">
          {formatNumber(r.ordersReceived)}
          {r.ordersCancelled > 0 && <span className="text-caption text-fossil"> · {r.ordersCancelled} batal</span>}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Nilai belanja',
      align: 'right',
      hideOnMobile: true,
      render: (r) => <span className="tnum">{formatIDR(num(r.totalValue))}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <StatRow
        items={[
          { label: 'Pemasok dinilai', value: scored.length },
          { label: 'Rata-rata skor', value: avg === null ? '-' : avg.toFixed(0) },
          { label: 'Terbaik', value: <span className="text-[16px] sm:text-heading-sm break-words">{best?.name ?? '-'}</span>, tone: 'accent' },
          { label: 'Belum punya PO', value: rows.length - scored.length },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5">
        <SearchBox value={query} onChange={setQuery} placeholder="Cari pemasok" />
        <Button variant="subtle" icon="sync" onClick={() => setComputeOpen(true)}>
          Hitung skor periode
        </Button>
      </div>

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(r) => r.supplierId}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        emptyIcon="star"
        emptyTitle={query ? 'Tidak ada pemasok yang cocok' : 'Belum ada pemasok'}
        emptyBody="Skor muncul setelah pemasok memiliki pesanan pembelian."
        onRowClick={setSelected}
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
      <p className="text-caption text-pebble">
        Skor berjalan menghitung ketepatan dari PO diterima versus dibatalkan. Gunakan Hitung skor periode untuk skor
        kualitas (barang ditolak) dan harga terhadap rata-rata katalog, yang disimpan sebagai riwayat.
      </p>

      <Modal open={computeOpen} onClose={() => setComputeOpen(false)} title="Hitung skor periode" maxWidth="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Dari" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <Input label="Sampai" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <p className="text-caption text-fossil">
            Hasil disimpan per pemasok untuk periode ini. Menghitung ulang periode dengan tanggal mulai yang sama akan
            menimpa hasil sebelumnya.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" full onClick={() => setComputeOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" full disabled={busy} onClick={compute}>
              {busy ? 'Menghitung…' : 'Hitung'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={result !== null} onClose={() => setResult(null)} title="Hasil perhitungan" maxWidth="lg">
        {result && (
          <div className="space-y-3">
            <p className="text-body-sm text-fossil">
              {formatDate(result.periodStart)} sampai {formatDate(result.periodEnd)} · {result.computed} pemasok
            </p>
            {result.data.length === 0 ? (
              <EmptyState icon="info" title="Tidak ada pemasok untuk dihitung" />
            ) : (
              <div className="space-y-2">
                {result.data.map((r) => (
                  <Card key={r.supplierId} className="p-3.5 min-w-0">
                    <p className="text-[15px] text-ink font-medium break-words">{nameById.get(r.supplierId) ?? 'Pemasok'}</p>
                    <p className="text-caption text-fossil">
                      {r.ordersCount} PO · {formatIDR(num(r.totalValue))}
                    </p>
                    <div className="mt-2.5 grid grid-cols-4 gap-3">
                      <ScoreCell label="Total" value={r.overallScore} />
                      <ScoreCell label="Tepat" value={r.onTimeScore} />
                      <ScoreCell label="Mutu" value={r.qualityScore} />
                      <ScoreCell label="Harga" value={r.priceScore} />
                    </div>
                  </Card>
                ))}
              </div>
            )}
            <Button variant="primary" full onClick={() => setResult(null)}>
              Selesai
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected ? `Riwayat ${selected.name}` : ''} maxWidth="lg">
        {selected && (
          <div className="space-y-3">
            {history.loading ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-sand animate-pulse" />
                ))}
              </div>
            ) : history.error ? (
              <EmptyState
                icon="warning"
                title="Gagal memuat riwayat"
                body={history.error}
                action={
                  <Button variant="ghost" icon="sync" onClick={history.reload}>
                    Coba lagi
                  </Button>
                }
              />
            ) : historyRows.length === 0 ? (
              <EmptyState
                icon="clock"
                title="Belum ada riwayat skor"
                body="Jalankan Hitung skor periode untuk menyimpan skor pemasok ini."
              />
            ) : (
              historyRows.map((h) => (
                <Card key={h.id} className="p-3.5 min-w-0">
                  <p className="text-[14px] text-ink">
                    {formatDate(h.periodStart)} - {formatDate(h.periodEnd)}
                  </p>
                  <p className="text-caption text-fossil">
                    {h.ordersCount} PO, {h.ordersOnTime} tepat waktu · {formatIDR(num(h.totalValue))}
                  </p>
                  <div className="mt-2.5 grid grid-cols-4 gap-3">
                    <ScoreCell label="Total" value={h.overallScore} />
                    <ScoreCell label="Tepat" value={h.onTimeScore} />
                    <ScoreCell label="Mutu" value={h.qualityScore} />
                    <ScoreCell label="Harga" value={h.priceScore} />
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
