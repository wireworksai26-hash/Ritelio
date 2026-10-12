import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatDate, formatNumber } from '../../lib/format';
import { listOf, usePagedList, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/controls';
import { DataTable, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import {
  LineItemsEditor,
  SearchBox,
  errMsg,
  newLine,
  num,
  useCatalog,
  validateLines,
  type BadgeVariant,
  type EditorLine,
} from './shared';

interface Transfer {
  id: string;
  code: string;
  status: string;
  note: string;
  shippedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  fromWarehouse: { id: string; code: string; name: string };
  toWarehouse: { id: string; code: string; name: string };
  lines: Array<{ id: string; qty: number | string; product: { id: string; sku: string; name: string; unit: string } }>;
}

const statusBadge: Record<string, { variant: BadgeVariant; label: string }> = {
  draft: { variant: 'outline', label: 'Draf' },
  in_transit: { variant: 'accent', label: 'Dalam perjalanan' },
  received: { variant: 'ink', label: 'Diterima' },
  cancelled: { variant: 'outline', label: 'Dibatalkan' },
};

const PAGE_SIZE = 10;

function Route({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
      <span className="truncate">{from}</span>
      <Icon name="arrow-right" size={13} className="shrink-0 text-pebble" />
      <span className="truncate">{to}</span>
    </span>
  );
}

export function TransfersTab({ createOpen, onCreateClose }: { createOpen: boolean; onCreateClose: () => void }) {
  const list = useResource<unknown>('/v1/procurement/transfers');
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () =>
      listOf<Transfer>(list.data).filter((t) =>
        `${t.code} ${t.fromWarehouse.name} ${t.toWarehouse.name}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [list.data, query],
  );
  const { page, setPage, totalPages, paged } = usePagedList(rows, PAGE_SIZE);

  const [detail, setDetail] = useState<Transfer | null>(null);
  const [confirm, setConfirm] = useState<{ transfer: Transfer; action: 'ship' | 'receive' } | null>(null);
  const [busy, setBusy] = useState(false);

  const catalog = useCatalog(createOpen);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);

  function closeCreate() {
    onCreateClose();
    setFromId('');
    setToId('');
    setNote('');
    setLines([newLine()]);
  }

  async function create() {
    if (!fromId || !toId) {
      toast({ title: 'Pilih gudang asal dan tujuan.', icon: 'warning' });
      return;
    }
    if (fromId === toId) {
      toast({ title: 'Gudang asal dan tujuan tidak boleh sama.', icon: 'warning' });
      return;
    }
    const problem = validateLines(lines);
    if (problem) {
      toast({ title: problem, icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/procurement/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromWarehouseId: fromId,
          toWarehouseId: toId,
          note: note.trim() || undefined,
          lines: lines.map((l) => ({ productId: l.productId, qty: num(l.qty) })),
        }),
      });
      toast({ title: 'Transfer dibuat sebagai draf.', icon: 'check' });
      closeCreate();
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal membuat transfer.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  async function run(t: Transfer, action: 'ship' | 'receive') {
    setBusy(true);
    try {
      await apiFetch(`/v1/procurement/transfers/${t.id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      toast({
        title: action === 'ship' ? `${t.code} dikirim. Stok gudang asal berkurang.` : `${t.code} diterima. Stok gudang tujuan bertambah.`,
        icon: 'check',
      });
      setConfirm(null);
      setDetail(null);
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal memproses transfer.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Transfer>[] = [
    {
      key: 'code',
      header: 'Transfer',
      render: (t) => (
        <>
          <p className="text-[15px] text-ink font-medium truncate">{t.code}</p>
          <p className="text-caption text-fossil">
            <Route from={t.fromWarehouse.name} to={t.toWarehouse.name} />
          </p>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => {
        const b = statusBadge[t.status] ?? { variant: 'neutral' as const, label: t.status };
        return <Badge variant={b.variant}>{b.label}</Badge>;
      },
    },
    {
      key: 'lines',
      header: 'Item',
      align: 'right',
      render: (t) => <span className="tnum">{t.lines.length}</span>,
    },
    {
      key: 'created',
      header: 'Dibuat',
      align: 'right',
      render: (t) => <span className="text-caption text-fossil">{formatDate(t.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <SearchBox value={query} onChange={setQuery} placeholder="Cari kode atau gudang" />

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(t) => t.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        emptyIcon="warehouse"
        emptyTitle={query ? 'Tidak ada transfer yang cocok' : 'Belum ada transfer gudang'}
        emptyBody="Pindahkan stok antar gudang. Stok tercatat dalam perjalanan sampai diterima."
        onRowClick={setDetail}
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <Modal open={createOpen} onClose={closeCreate} title="Transfer Gudang Baru" maxWidth="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Gudang asal" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Pilih gudang</option>
              {catalog.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </Select>
            <Select label="Gudang tujuan" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Pilih gudang</option>
              {catalog.warehouses
                .filter((w) => w.id !== fromId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
            </Select>
          </div>
          <Input label="Catatan" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" />
          {catalog.error ? (
            <div className="rounded-lg border border-ash p-3 text-body-sm text-fossil">
              Gagal memuat data gudang/produk: {catalog.error}{' '}
              <button type="button" className="underline text-ink" onClick={catalog.reload}>
                Coba lagi
              </button>
            </div>
          ) : (
            <LineItemsEditor lines={lines} products={catalog.products} onChange={setLines} />
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" full onClick={closeCreate}>
              Batal
            </Button>
            <Button variant="primary" full disabled={busy || catalog.loading} onClick={create}>
              {busy ? 'Menyimpan…' : 'Simpan Draf'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail ? `Transfer ${detail.code}` : ''} maxWidth="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-body-sm">
              <div className="col-span-2 min-w-0">
                <p className="text-caption text-fossil">Rute</p>
                <p className="text-ink">
                  <Route from={detail.fromWarehouse.name} to={detail.toWarehouse.name} />
                </p>
              </div>
              <div>
                <p className="text-caption text-fossil">Status</p>
                <Badge variant={(statusBadge[detail.status] ?? statusBadge.draft).variant} className="mt-1">
                  {(statusBadge[detail.status] ?? { label: detail.status }).label}
                </Badge>
              </div>
              <div>
                <p className="text-caption text-fossil">Dibuat</p>
                <p className="text-ink">{formatDate(detail.createdAt)}</p>
              </div>
              {detail.shippedAt && (
                <div>
                  <p className="text-caption text-fossil">Dikirim</p>
                  <p className="text-ink">{formatDate(detail.shippedAt)}</p>
                </div>
              )}
              {detail.receivedAt && (
                <div>
                  <p className="text-caption text-fossil">Diterima</p>
                  <p className="text-ink">{formatDate(detail.receivedAt)}</p>
                </div>
              )}
              {detail.note && (
                <div className="col-span-2 min-w-0">
                  <p className="text-caption text-fossil">Catatan</p>
                  <p className="text-ink break-words">{detail.note}</p>
                </div>
              )}
            </div>

            <ul className="divide-y divide-sand border border-ash rounded-xl">
              {detail.lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-3.5 py-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-[14px] text-ink break-words">{l.product.name}</p>
                    <p className="text-caption text-fossil">{l.product.sku}</p>
                  </div>
                  <p className="tnum text-[14px] text-ink shrink-0">
                    {formatNumber(num(l.qty))} {l.product.unit}
                  </p>
                </li>
              ))}
            </ul>

            {detail.status === 'draft' && (
              <Button variant="primary" full onClick={() => setConfirm({ transfer: detail, action: 'ship' })}>
                Kirim barang
              </Button>
            )}
            {detail.status === 'in_transit' && (
              <Button variant="primary" full onClick={() => setConfirm({ transfer: detail, action: 'receive' })}>
                Tandai diterima
              </Button>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.action === 'ship' ? 'Kirim transfer?' : 'Terima transfer?'}
        maxWidth="sm"
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              {confirm.action === 'ship'
                ? `Stok di ${confirm.transfer.fromWarehouse.name} langsung berkurang dan tercatat dalam perjalanan. Tindakan ini tidak bisa dibatalkan.`
                : `Stok masuk ke ${confirm.transfer.toWarehouse.name} dengan harga pokok bawaan dari gudang asal. Tindakan ini tidak bisa dibatalkan.`}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" full onClick={() => setConfirm(null)}>
                Batal
              </Button>
              <Button variant="primary" full disabled={busy} onClick={() => run(confirm.transfer, confirm.action)}>
                {busy ? 'Memproses…' : confirm.action === 'ship' ? 'Kirim' : 'Terima'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
