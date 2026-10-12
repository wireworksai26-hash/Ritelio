import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatDate, formatNumber } from '../../lib/format';
import { listOf, usePagedList, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field, Select, Textarea } from '../ui/controls';
import { DataTable, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { ConvertRequisitionModal } from './ConvertRequisitionModal';
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

interface Requisition {
  id: string;
  code: string;
  status: string;
  reason: string;
  createdAt: string;
  approvedAt: string | null;
  lines: Array<{
    id: string;
    requestedQty: number | string;
    orderedQty: number | string;
    product: { id: string; sku: string; name: string; unit: string };
  }>;
  purchaseOrder: { id: string; code: string; status: string } | null;
}

const statusBadge: Record<string, { variant: BadgeVariant; label: string }> = {
  draft: { variant: 'outline', label: 'Draf' },
  submitted: { variant: 'neutral', label: 'Diajukan' },
  approved: { variant: 'accent', label: 'Disetujui' },
  rejected: { variant: 'outline', label: 'Ditolak' },
  converted: { variant: 'ink', label: 'Jadi PO' },
};

const PAGE_SIZE = 10;

export function RequisitionsTab({ createOpen, onCreateClose }: { createOpen: boolean; onCreateClose: () => void }) {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const list = useResource<unknown>(`/v1/procurement/requisitions${status ? `?status=${status}` : ''}`);

  const rows = useMemo(
    () =>
      listOf<Requisition>(list.data).filter((r) =>
        `${r.code} ${r.reason}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [list.data, query],
  );
  const { page, setPage, totalPages, paged } = usePagedList(rows, PAGE_SIZE);

  const [detail, setDetail] = useState<Requisition | null>(null);
  const [converting, setConverting] = useState<Requisition | null>(null);
  const [busy, setBusy] = useState(false);

  // Form baru
  const catalog = useCatalog(createOpen);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);

  function closeCreate() {
    onCreateClose();
    setReason('');
    setLines([newLine()]);
  }

  async function create() {
    const problem = validateLines(lines);
    if (problem) {
      toast({ title: problem, icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/procurement/requisitions', {
        method: 'POST',
        body: JSON.stringify({
          reason: reason.trim() || undefined,
          lines: lines.map((l) => ({ productId: l.productId, qty: num(l.qty) })),
        }),
      });
      toast({ title: 'Permintaan pembelian dibuat sebagai draf.', icon: 'check' });
      closeCreate();
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal membuat permintaan.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  async function act(req: Requisition, action: 'submit' | 'approve' | 'reject') {
    setBusy(true);
    try {
      if (action === 'submit') {
        await apiFetch(`/v1/procurement/requisitions/${req.id}/submit`, { method: 'POST', body: JSON.stringify({}) });
      } else {
        await apiFetch(`/v1/procurement/requisitions/${req.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ approve: action === 'approve' }),
        });
      }
      toast({
        title:
          action === 'submit' ? `${req.code} diajukan.` : action === 'approve' ? `${req.code} disetujui.` : `${req.code} ditolak.`,
        icon: 'check',
      });
      setDetail(null);
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal memproses permintaan.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Requisition>[] = [
    {
      key: 'code',
      header: 'Permintaan',
      render: (r) => (
        <>
          <p className="text-[15px] text-ink font-medium truncate">{r.code}</p>
          <p className="text-caption text-fossil line-clamp-1 break-words">{r.reason || 'Tanpa keterangan'}</p>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const b = statusBadge[r.status] ?? { variant: 'neutral' as const, label: r.status };
        return <Badge variant={b.variant}>{b.label}</Badge>;
      },
    },
    {
      key: 'lines',
      header: 'Item',
      align: 'right',
      render: (r) => <span className="tnum">{r.lines.length}</span>,
    },
    {
      key: 'po',
      header: 'PO',
      hideOnMobile: true,
      render: (r) => (r.purchaseOrder ? <span className="tnum">{r.purchaseOrder.code}</span> : <span className="text-pebble">-</span>),
    },
    {
      key: 'created',
      header: 'Dibuat',
      align: 'right',
      render: (r) => <span className="text-caption text-fossil">{formatDate(r.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-2.5">
        <SearchBox value={query} onChange={setQuery} placeholder="Cari kode atau keterangan" />
        <Select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(statusBadge).map(([value, b]) => (
            <option key={value} value={value}>
              {b.label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(r) => r.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        emptyIcon="clipboard"
        emptyTitle={query || status ? 'Tidak ada permintaan yang cocok' : 'Belum ada permintaan pembelian'}
        emptyBody="Permintaan dari divisi internal muncul di sini sebelum disetujui."
        onRowClick={setDetail}
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <Modal open={createOpen} onClose={closeCreate} title="Permintaan Pembelian Baru" maxWidth="lg">
        <div className="space-y-4">
          <Field label="Keterangan" hint="Opsional. Mis. stok bahan baku minggu depan">
            <Textarea value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} className="min-h-[72px]" />
          </Field>
          {catalog.error ? (
            <div className="rounded-lg border border-ash p-3 text-body-sm text-fossil">
              Gagal memuat daftar produk: {catalog.error}{' '}
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

      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail ? `Permintaan ${detail.code}` : ''} maxWidth="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-body-sm">
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
              <div className="col-span-2 min-w-0">
                <p className="text-caption text-fossil">Keterangan</p>
                <p className="text-ink break-words">{detail.reason || '-'}</p>
              </div>
              {detail.purchaseOrder && (
                <div className="col-span-2">
                  <p className="text-caption text-fossil">Pesanan pembelian</p>
                  <p className="text-ink tnum">{detail.purchaseOrder.code}</p>
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
                    {formatNumber(num(l.requestedQty))} {l.product.unit}
                  </p>
                </li>
              ))}
            </ul>

            {detail.status === 'draft' && (
              <Button variant="primary" full disabled={busy} onClick={() => act(detail, 'submit')}>
                Ajukan untuk persetujuan
              </Button>
            )}
            {detail.status === 'submitted' && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" disabled={busy} onClick={() => act(detail, 'reject')}>
                  Tolak
                </Button>
                <Button variant="primary" disabled={busy} onClick={() => act(detail, 'approve')}>
                  Setujui
                </Button>
              </div>
            )}
            {detail.status === 'approved' && (
              <Button
                variant="primary"
                icon="arrow-right"
                full
                className="min-h-[44px]"
                onClick={() => {
                  setConverting(detail);
                  setDetail(null);
                }}
              >
                Jadikan PO
              </Button>
            )}
          </div>
        )}
      </Modal>

      <ConvertRequisitionModal
        requisition={converting}
        onClose={() => setConverting(null)}
        onDone={() => {
          setConverting(null);
          list.reload();
        }}
      />
    </div>
  );
}
