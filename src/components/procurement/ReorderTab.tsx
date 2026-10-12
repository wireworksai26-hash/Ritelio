import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatIDR, formatNumber } from '../../lib/format';
import { listOf, usePagedList, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DataTable, StatRow, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { SearchBox, errMsg, num, type SupplierOption } from './shared';

interface Suggestion {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reorderPoint: number;
  suggestedQty: number;
  estimatedCost: number;
  supplierId?: string | null;
}

interface GenerateResult {
  created: Array<{ supplierId: string; orderNumber: string; total: number; lines: number }>;
  skipped: Array<{ sku: string; reason: string }>;
  total: number;
}

const PAGE_SIZE = 10;

export function ReorderTab() {
  const list = useResource<unknown>('/v1/procurement/reorder-suggestions');
  const suppliers = useResource<unknown>('/v1/parties/suppliers');
  const [query, setQuery] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const supplierName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of listOf<SupplierOption>(suppliers.data)) map.set(s.id, s.name);
    return map;
  }, [suppliers.data]);

  const all = useMemo(() => listOf<Suggestion>(list.data), [list.data]);
  const rows = useMemo(
    () => all.filter((s) => `${s.sku} ${s.name} ${s.warehouseName}`.toLowerCase().includes(query.trim().toLowerCase())),
    [all, query],
  );
  const { page, setPage, totalPages, paged } = usePagedList(rows, PAGE_SIZE);

  // Pratinjau sama dengan logika backend: dikelompokkan per pemasok default, tanpa pemasok dilewati.
  const preview = useMemo(() => {
    const groups = new Map<string, Suggestion[]>();
    const noSupplier: Suggestion[] = [];
    for (const s of all) {
      if (!s.supplierId) {
        noSupplier.push(s);
        continue;
      }
      groups.set(s.supplierId, [...(groups.get(s.supplierId) ?? []), s]);
    }
    return { groups: Array.from(groups.entries()), noSupplier };
  }, [all]);

  const totalCost = all.reduce((sum, s) => sum + num(s.estimatedCost), 0);

  async function generate() {
    setBusy(true);
    try {
      const res = await apiFetch<GenerateResult>('/v1/procurement/reorder-generate-po', {
        method: 'POST',
        body: JSON.stringify({ notify }),
      });
      setPreviewOpen(false);
      setResult(res);
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal membuat draf PO.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Suggestion>[] = [
    {
      key: 'product',
      header: 'Produk',
      render: (s) => (
        <>
          <p className="text-[15px] text-ink font-medium break-words">{s.name}</p>
          <p className="text-caption text-fossil">
            {s.sku} · {s.warehouseName}
          </p>
        </>
      ),
    },
    {
      key: 'onHand',
      header: 'Stok',
      align: 'right',
      render: (s) => (
        <span className={`tnum ${s.onHand <= 0 ? 'text-rose-700' : ''}`}>
          {formatNumber(num(s.onHand))} {s.unit}
        </span>
      ),
    },
    {
      key: 'rop',
      header: 'Titik pesan',
      align: 'right',
      hideOnMobile: true,
      render: (s) => <span className="tnum">{formatNumber(num(s.reorderPoint))}</span>,
    },
    {
      key: 'qty',
      header: 'Saran beli',
      align: 'right',
      render: (s) => (
        <span className="tnum">
          {formatNumber(num(s.suggestedQty))} {s.unit}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Perkiraan',
      align: 'right',
      render: (s) => <span className="tnum">{formatIDR(num(s.estimatedCost))}</span>,
    },
    {
      key: 'supplier',
      header: 'Pemasok',
      render: (s) =>
        s.supplierId ? (
          <span className="break-words">{supplierName.get(s.supplierId) ?? 'Pemasok'}</span>
        ) : (
          <Badge variant="outline">Belum diatur</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <StatRow
        items={[
          { label: 'Produk di bawah titik pesan', value: all.length },
          { label: 'Perkiraan biaya', value: formatIDR(totalCost) },
          { label: 'Pemasok terlibat', value: preview.groups.length },
          { label: 'Tanpa pemasok', value: preview.noSupplier.length, tone: preview.noSupplier.length > 0 ? 'accent' : 'default' },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5">
        <SearchBox value={query} onChange={setQuery} placeholder="Cari produk atau gudang" />
        <Button variant="primary" icon="document" disabled={list.loading || preview.groups.length === 0} onClick={() => setPreviewOpen(true)}>
          Buat draf PO
        </Button>
      </div>

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(s) => `${s.productId}:${s.warehouseId}`}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        emptyIcon="check"
        emptyTitle={query ? 'Tidak ada produk yang cocok' : 'Semua stok di atas titik pesan'}
        emptyBody="Produk yang stoknya menyentuh titik pesan ulang akan muncul di sini."
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Pratinjau draf PO" maxWidth="lg">
        <div className="space-y-4">
          <p className="text-body-sm text-fossil">
            Satu draf PO dibuat per pemasok. Draf tidak dikirim ke pemasok sampai Anda mengubahnya jadi dipesan. Produk yang
            sudah punya PO terbuka untuk pemasok yang sama akan dilewati.
          </p>
          <div className="space-y-2.5">
            {preview.groups.map(([supplierId, items]) => (
              <Card key={supplierId} className="p-3.5 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] text-ink font-medium break-words min-w-0">{supplierName.get(supplierId) ?? 'Pemasok'}</p>
                  <p className="tnum text-[14px] text-ink shrink-0">
                    {formatIDR(items.reduce((s, i) => s + num(i.estimatedCost), 0))}
                  </p>
                </div>
                <ul className="mt-2 space-y-1">
                  {items.map((i) => (
                    <li key={`${i.productId}:${i.warehouseId}`} className="flex justify-between gap-3 text-caption text-fossil">
                      <span className="truncate min-w-0">{i.name}</span>
                      <span className="tnum shrink-0">
                        {formatNumber(num(i.suggestedQty))} {i.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
          {preview.noSupplier.length > 0 && (
            <div className="rounded-lg border border-ash bg-sand/40 p-3 text-caption text-fossil">
              {preview.noSupplier.length} produk belum punya pemasok default dan tidak akan dibuatkan PO:{' '}
              <span className="text-ink break-words">{preview.noSupplier.map((s) => s.sku).join(', ')}</span>
            </div>
          )}
          <label className="flex items-center gap-3 min-h-[44px] text-body-sm text-ink">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="h-5 w-5 accent-[var(--color-ink)]"
            />
            Kirim notifikasi ke tim
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" full onClick={() => setPreviewOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" full disabled={busy} onClick={generate}>
              {busy ? 'Membuat…' : `Buat ${preview.groups.length} draf PO`}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={result !== null} onClose={() => setResult(null)} title="Hasil pembuatan draf PO" maxWidth="md">
        {result && (
          <div className="space-y-4">
            {result.created.length === 0 ? (
              <p className="text-body-sm text-fossil">Tidak ada draf PO baru yang dibuat.</p>
            ) : (
              <ul className="divide-y divide-sand border border-ash rounded-xl">
                {result.created.map((c) => (
                  <li key={c.orderNumber} className="flex items-start justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="text-[14px] text-ink tnum">{c.orderNumber}</p>
                      <p className="text-caption text-fossil break-words">
                        {supplierName.get(c.supplierId) ?? 'Pemasok'} · {c.lines} item
                      </p>
                    </div>
                    <p className="tnum text-[14px] text-ink shrink-0">{formatIDR(num(c.total))}</p>
                  </li>
                ))}
              </ul>
            )}
            {result.skipped.length > 0 && (
              <div className="space-y-1">
                <p className="text-caption text-fossil">Dilewati</p>
                <ul className="text-body-sm text-ink space-y-0.5">
                  {result.skipped.map((s, i) => (
                    <li key={`${s.sku}-${i}`} className="break-words">
                      <span className="tnum">{s.sku}</span> <span className="text-fossil">· {s.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button variant="primary" full onClick={() => setResult(null)}>
              Selesai
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
