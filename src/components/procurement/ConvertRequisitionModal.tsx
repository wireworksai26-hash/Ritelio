import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatIDR, formatNumber } from '../../lib/format';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { errMsg, num, useCatalog } from './shared';

export interface ConvertibleRequisition {
  id: string;
  code: string;
  lines: Array<{
    id: string;
    requestedQty: number | string;
    product: { id: string; sku: string; name: string; unit: string };
  }>;
}

interface ConvertResult {
  purchaseOrders: Array<{ id: string; code: string; supplierName: string; lines: number; total: number }>;
}

interface Override {
  supplierId: string;
  price: string;
}

interface Props {
  requisition: ConvertibleRequisition | null;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Ubah permintaan yang sudah disetujui menjadi PO draf. Pemasok dan harga diambil
 * dari data produk; kolom per baris hanya untuk menimpa saat data produk kosong
 * (backend menolak baris tanpa pemasok atau harga dan menyebut SKU-nya).
 */
export function ConvertRequisitionModal({ requisition, onClose, onDone }: Props) {
  const open = requisition !== null;
  const catalog = useCatalog(open);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setWarehouseId('');
    setSupplierId('');
    setOverrides({});
    setError(null);
    setResult(null);
  }, [open, requisition?.id]);

  // Gudang tunggal: pilih otomatis, satu keputusan lebih sedikit di HP
  useEffect(() => {
    if (open && !warehouseId && catalog.warehouses.length === 1) setWarehouseId(catalog.warehouses[0].id);
  }, [open, warehouseId, catalog.warehouses]);

  if (!requisition) return null;

  const setOverride = (productId: string, patch: Partial<Override>) =>
    setOverrides((o) => ({ ...o, [productId]: { ...(o[productId] ?? { supplierId: '', price: '' }), ...patch } }));

  async function submit() {
    if (!requisition) return;
    if (!warehouseId) {
      setError('Pilih gudang penerima.');
      return;
    }
    const lineOverrides = Object.entries(overrides)
      .filter(([, o]) => o.supplierId || num(o.price) > 0)
      .map(([productId, o]) => ({
        productId,
        ...(o.supplierId ? { supplierId: o.supplierId } : {}),
        ...(num(o.price) > 0 ? { price: num(o.price) } : {}),
      }));

    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<ConvertResult>(`/v1/procurement/requisitions/${requisition.id}/convert-po`, {
        method: 'POST',
        body: JSON.stringify({
          warehouseId,
          ...(supplierId ? { supplierId } : {}),
          ...(lineOverrides.length ? { lines: lineOverrides } : {}),
        }),
      });
      setResult(res);
    } catch (err) {
      setError(errMsg(err, 'Gagal membuat PO.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : result ? onDone : onClose}
      title={result ? 'PO berhasil dibuat' : `Jadikan PO · ${requisition.code}`}
      maxWidth="lg"
    >
      {result ? (
        <div className="space-y-4">
          <ul className="divide-y divide-sand border border-ash rounded-xl">
            {result.purchaseOrders.map((po) => (
              <li key={po.id} className="flex items-start justify-between gap-3 px-3.5 py-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-[15px] text-ink font-medium tnum">{po.code}</p>
                  <p className="text-caption text-fossil break-words">
                    {po.supplierName} · {po.lines} item
                  </p>
                </div>
                <p className="tnum text-[14px] text-ink shrink-0">{formatIDR(po.total)}</p>
              </li>
            ))}
          </ul>
          <p className="text-body-sm text-fossil">
            Berstatus Draf. Buka tab PO untuk memeriksa lalu mengirimnya ke pemasok.
            {result.purchaseOrders.length > 1 && ' Item dengan pemasok berbeda dipecah menjadi beberapa PO.'}
          </p>
          <Button variant="primary" full className="min-h-[44px]" onClick={onDone}>
            Selesai
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Gudang penerima" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">{catalog.loading ? 'Memuat…' : 'Pilih gudang'}</option>
              {catalog.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </Select>
            <Select
              label="Pemasok cadangan"
              hint="Untuk produk yang belum punya pemasok utama."
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Tidak ada</option>
              {catalog.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2.5">
            <p className="text-caption text-fossil">Item — pemasok dan harga ikut data produk, isi hanya untuk menimpa</p>
            {requisition.lines.map((l) => {
              const o = overrides[l.product.id];
              return (
                <div key={l.id} className="rounded-xl border border-ash bg-bone/60 p-3 space-y-3 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] text-ink break-words">{l.product.name}</p>
                      <p className="text-caption text-fossil">{l.product.sku}</p>
                    </div>
                    <p className="tnum text-[14px] text-ink shrink-0">
                      {formatNumber(num(l.requestedQty))} {l.product.unit}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="Pemasok"
                      value={o?.supplierId ?? ''}
                      onChange={(e) => setOverride(l.product.id, { supplierId: e.target.value })}
                    >
                      <option value="">Ikut produk</option>
                      {catalog.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Harga satuan"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={o?.price ?? ''}
                      placeholder="Ikut harga pokok"
                      onChange={(e) => setOverride(l.product.id, { price: e.target.value })}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="rounded-xl border border-ash bg-bone p-3.5 flex items-start gap-2.5" role="alert">
              <Icon name="warning" size={18} className="shrink-0 mt-0.5 text-fossil" />
              <p className="text-body-sm text-ink break-words min-w-0">{error}</p>
            </div>
          )}
          {catalog.error && <p className="text-caption text-fossil break-words">Gagal memuat gudang/pemasok: {catalog.error}</p>}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button full className="sm:w-auto min-h-[44px]" onClick={submit} disabled={busy || catalog.loading}>
              {busy ? 'Membuat PO…' : 'Buat PO'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
