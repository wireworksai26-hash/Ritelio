import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatDate, formatIDR, formatNumber } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { useBusinessStore } from '../../stores/businessStore';
import { toast } from '../../stores/toastStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/controls';
import { DataTable, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { PoPrintSheet, PoShareModal, usePoPrint, type PoPrintData, type PoSendResult } from './PoShare';
import {
  LineItemsEditor,
  errMsg,
  newLine,
  num,
  useCatalog,
  validateLines,
  type BadgeVariant,
  type EditorLine,
} from './shared';

interface PurchaseOrder {
  id: string;
  code: string;
  status: string;
  createdAt: string;
  totalValue: number;
  supplier: { code: string; name: string; paymentTermDays: number };
  warehouse: { name: string };
  items: Array<{
    id: string;
    qty: number | string;
    price: number | string;
    qtyRejected?: number | string | null;
    product: { id: string; name: string; unit: string };
  }>;
}

interface OrdersResponse {
  data: PurchaseOrder[];
  meta: { page: number; limit: number; total: number };
}

const statusBadge: Record<string, { variant: BadgeVariant; label: string }> = {
  draft: { variant: 'outline', label: 'Draf' },
  ordered: { variant: 'neutral', label: 'Dipesan' },
  received: { variant: 'ink', label: 'Diterima' },
  cancelled: { variant: 'outline', label: 'Dibatalkan' },
};

const PAGE_SIZE = 10;

export function OrdersTab({ createOpen, onCreateClose }: { createOpen: boolean; onCreateClose: () => void }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useResource<OrdersResponse>(
    `/v1/purchasing/orders?page=${page}&limit=${PAGE_SIZE}${status ? `&status=${status}` : ''}`,
  );
  const rows = listOf<PurchaseOrder>(list.data);
  const total = list.data?.meta?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [rejections, setRejections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [shareResult, setShareResult] = useState<PoSendResult | null>(null);
  const printer = usePoPrint();
  const tenantName = useBusinessStore((s) => s.tenant?.name);

  const catalog = useCatalog(createOpen);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [sendNow, setSendNow] = useState(false);
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);

  function closeCreate() {
    onCreateClose();
    setSupplierId('');
    setWarehouseId('');
    setSendNow(false);
    setLines([newLine()]);
  }

  async function create() {
    if (!supplierId) {
      toast({ title: 'Pilih pemasok.', icon: 'warning' });
      return;
    }
    if (!warehouseId) {
      toast({ title: 'Pilih gudang penerima.', icon: 'warning' });
      return;
    }
    const problem = validateLines(lines, true);
    if (problem) {
      toast({ title: problem, icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/purchasing/orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          warehouseId,
          status: sendNow ? 'ordered' : 'draft',
          items: lines.map((l) => ({ productId: l.productId, qty: num(l.qty), price: num(l.price) })),
        }),
      });
      toast({ title: sendNow ? 'PO dibuat dan berstatus dipesan.' : 'PO dibuat sebagai draf.', icon: 'check' });
      closeCreate();
      setPage(1);
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal membuat PO.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  async function setPoStatus(po: PurchaseOrder, next: 'ordered' | 'cancelled') {
    setBusy(true);
    try {
      await apiFetch(`/v1/purchasing/orders/${po.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      toast({ title: next === 'ordered' ? `${po.code} ditandai dipesan.` : `${po.code} dibatalkan.`, icon: 'check' });
      setDetail(null);
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal mengubah status PO.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  // Draf → Dipesan di server, lalu pengguna memilih saluran kirim. Bila sudah
  // Dipesan, endpoint yang sama hanya mengembalikan bahan bagikan ulang.
  async function sendToSupplier(po: PurchaseOrder) {
    setBusy(true);
    try {
      const res = await apiFetch<PoSendResult>(`/v1/purchasing/orders/${po.id}/send`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setDetail(null);
      setShareResult(res);
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal menyiapkan pengiriman PO.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  // Cetak dari data baris, jadi juga bisa untuk PO Diterima/Dibatalkan yang tidak boleh dikirim.
  function printData(po: PurchaseOrder): PoPrintData {
    return {
      code: po.code,
      companyName: tenantName || 'Perusahaan',
      createdAt: po.createdAt,
      supplier: { name: po.supplier.name },
      warehouse: po.warehouse.name,
      items: po.items.map((i) => ({
        name: i.product.name,
        unit: i.product.unit,
        qty: num(i.qty),
        price: num(i.price),
        subtotal: num(i.qty) * num(i.price),
      })),
      total: num(po.totalValue),
    };
  }

  function openReceive(po: PurchaseOrder) {
    setReceiving(po);
    setRejections({});
  }

  async function receive() {
    if (!receiving) return;
    const payload: Record<string, number> = {};
    for (const item of receiving.items) {
      const rejected = num(rejections[item.id]);
      if (rejected < 0 || rejected > num(item.qty)) {
        toast({ title: `Jumlah ditolak untuk ${item.product.name} tidak valid.`, icon: 'warning' });
        return;
      }
      if (rejected > 0) payload[item.id] = rejected;
    }
    setBusy(true);
    try {
      await apiFetch(`/v1/purchasing/orders/${receiving.id}/receive`, {
        method: 'POST',
        body: JSON.stringify(Object.keys(payload).length ? { rejections: payload } : {}),
      });
      toast({ title: `${receiving.code} diterima. Stok dan tagihan pemasok dicatat.`, icon: 'check' });
      setReceiving(null);
      setDetail(null);
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal menerima barang.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<PurchaseOrder>[] = [
    {
      key: 'code',
      header: 'PO',
      render: (po) => (
        <>
          <p className="text-[15px] text-ink font-medium truncate">{po.code}</p>
          <p className="text-caption text-fossil break-words">{po.supplier.name}</p>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (po) => {
        const b = statusBadge[po.status] ?? { variant: 'neutral' as const, label: po.status };
        return <Badge variant={b.variant}>{b.label}</Badge>;
      },
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (po) => <span className="tnum">{formatIDR(num(po.totalValue))}</span>,
    },
    {
      key: 'warehouse',
      header: 'Gudang',
      hideOnMobile: true,
      render: (po) => <span className="text-body-sm">{po.warehouse.name}</span>,
    },
    {
      key: 'created',
      header: 'Dibuat',
      align: 'right',
      render: (po) => <span className="text-caption text-fossil">{formatDate(po.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <Select
        aria-label="Filter status"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        className="sm:max-w-[220px]"
      >
        <option value="">Semua status</option>
        {Object.entries(statusBadge).map(([value, b]) => (
          <option key={value} value={value}>
            {b.label}
          </option>
        ))}
      </Select>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(po) => po.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        emptyIcon="document"
        emptyTitle={status ? 'Tidak ada PO dengan status ini' : 'Belum ada pesanan pembelian'}
        emptyBody="PO dibuat manual atau otomatis dari saran reorder."
        onRowClick={setDetail}
        page={page}
        totalPages={totalPages}
        totalItems={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <Modal open={createOpen} onClose={closeCreate} title="Pesanan Pembelian Baru" maxWidth="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Pemasok" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Pilih pemasok</option>
              {catalog.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
            <Select label="Gudang penerima" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Pilih gudang</option>
              {catalog.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </Select>
          </div>
          {catalog.error ? (
            <div className="rounded-lg border border-ash p-3 text-body-sm text-fossil">
              Gagal memuat data: {catalog.error}{' '}
              <button type="button" className="underline text-ink" onClick={catalog.reload}>
                Coba lagi
              </button>
            </div>
          ) : (
            <LineItemsEditor lines={lines} products={catalog.products} onChange={setLines} withPrice />
          )}
          <label className="flex items-center gap-3 min-h-[44px] text-body-sm text-ink">
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
              className="h-5 w-5 accent-[var(--color-ink)]"
            />
            Langsung tandai dipesan
          </label>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" full onClick={closeCreate}>
              Batal
            </Button>
            <Button variant="primary" full disabled={busy || catalog.loading} onClick={create}>
              {busy ? 'Menyimpan…' : 'Simpan PO'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail ? `PO ${detail.code}` : ''} maxWidth="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-body-sm">
              <div className="min-w-0">
                <p className="text-caption text-fossil">Pemasok</p>
                <p className="text-ink break-words">{detail.supplier.name}</p>
              </div>
              <div className="min-w-0">
                <p className="text-caption text-fossil">Gudang</p>
                <p className="text-ink break-words">{detail.warehouse.name}</p>
              </div>
              <div>
                <p className="text-caption text-fossil">Status</p>
                <Badge variant={(statusBadge[detail.status] ?? statusBadge.draft).variant} className="mt-1">
                  {(statusBadge[detail.status] ?? { label: detail.status }).label}
                </Badge>
              </div>
              <div>
                <p className="text-caption text-fossil">Total</p>
                <p className="text-ink tnum">{formatIDR(num(detail.totalValue))}</p>
              </div>
            </div>

            <ul className="divide-y divide-sand border border-ash rounded-xl">
              {detail.items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-3.5 py-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-[14px] text-ink break-words">{i.product.name}</p>
                    <p className="text-caption text-fossil tnum">
                      {formatNumber(num(i.qty))} {i.product.unit} x {formatIDR(num(i.price))}
                      {num(i.qtyRejected) > 0 && ` · ${formatNumber(num(i.qtyRejected))} ditolak`}
                    </p>
                  </div>
                  <p className="tnum text-[14px] text-ink shrink-0">{formatIDR(num(i.qty) * num(i.price))}</p>
                </li>
              ))}
            </ul>

            {detail.status === 'draft' && (
              <div className="space-y-2">
                <Button
                  variant="primary"
                  icon="arrow-up"
                  full
                  className="min-h-[44px]"
                  disabled={busy}
                  onClick={() => sendToSupplier(detail)}
                >
                  Kirim ke pemasok
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost" className="min-h-[44px]" disabled={busy} onClick={() => setPoStatus(detail, 'cancelled')}>
                    Batalkan
                  </Button>
                  <Button variant="ghost" className="min-h-[44px]" disabled={busy} onClick={() => setPoStatus(detail, 'ordered')}>
                    Tandai dipesan
                  </Button>
                </div>
              </div>
            )}
            {detail.status === 'ordered' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost" className="min-h-[44px]" disabled={busy} onClick={() => setPoStatus(detail, 'cancelled')}>
                    Batalkan
                  </Button>
                  <Button variant="primary" className="min-h-[44px]" onClick={() => openReceive(detail)}>
                    Terima barang
                  </Button>
                </div>
                <Button variant="subtle" icon="arrow-up" full className="min-h-[44px]" disabled={busy} onClick={() => sendToSupplier(detail)}>
                  Kirim ulang ke pemasok
                </Button>
              </div>
            )}
            {detail.status !== 'cancelled' && (
              <Button variant="subtle" icon="printer" full className="min-h-[44px]" onClick={() => printer.print(printData(detail))}>
                Cetak / simpan PDF
              </Button>
            )}
          </div>
        )}
      </Modal>

      <PoShareModal result={shareResult} onClose={() => setShareResult(null)} onPrint={printer.print} />
      <PoPrintSheet data={printer.data} onDone={printer.done} />

      <Modal open={receiving !== null} onClose={() => setReceiving(null)} title="Terima barang" maxWidth="md">
        {receiving && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              Stok {receiving.warehouse.name} bertambah dan tagihan pemasok tercatat. Isi jumlah yang ditolak (rusak atau tidak
              sesuai) bila ada; ini memengaruhi skor kualitas pemasok dan tidak bisa dibatalkan.
            </p>
            <div className="space-y-2.5">
              {receiving.items.map((i) => (
                <div key={i.id} className="rounded-xl border border-ash bg-bone/60 p-3 min-w-0">
                  <p className="text-[14px] text-ink break-words">{i.product.name}</p>
                  <p className="text-caption text-fossil tnum mb-2">
                    Dipesan {formatNumber(num(i.qty))} {i.product.unit}
                  </p>
                  <Input
                    label={`Ditolak (${i.product.unit})`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={num(i.qty)}
                    step="0.01"
                    value={rejections[i.id] ?? ''}
                    placeholder="0"
                    onChange={(e) => setRejections((r) => ({ ...r, [i.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" full onClick={() => setReceiving(null)}>
                Batal
              </Button>
              <Button variant="primary" full disabled={busy} onClick={receive}>
                {busy ? 'Memproses…' : 'Konfirmasi terima'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
