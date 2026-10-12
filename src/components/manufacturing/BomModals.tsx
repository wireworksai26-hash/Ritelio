import { useEffect, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { Icon } from '../icons/Icon';
import { apiFetch } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { toast } from '../../stores/toastStore';
import { ProductSearch, newLineKey, type PickedProduct } from '../crm/LineItemsEditor';

interface ComponentLine {
  key: string;
  product: PickedProduct;
  qty: string;
  scrap: string;
}

const errText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** Buat BOM baru. Versi dinaikkan otomatis oleh backend; BOM yang membentuk siklus ditolak di sana. */
export function BomFormModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [finished, setFinished] = useState<PickedProduct | null>(null);
  const [name, setName] = useState('');
  const [outputQty, setOutputQty] = useState('1');
  const [lines, setLines] = useState<ComponentLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFinished(null);
      setName('');
      setOutputQty('1');
      setLines([]);
    }
  }, [open]);

  function addComponent(p: PickedProduct) {
    if (finished && p.id === finished.id) {
      toast({ title: 'Produk jadi tidak boleh jadi komponen dirinya sendiri.', icon: 'warning' });
      return;
    }
    if (lines.some((l) => l.product.id === p.id)) {
      toast({ title: `${p.name} sudah ada di daftar komponen.`, icon: 'info' });
      return;
    }
    setLines((prev) => [...prev, { key: newLineKey(), product: p, qty: '1', scrap: '0' }]);
  }

  const patch = (key: string, next: Partial<ComponentLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...next } : l)));

  async function submit() {
    if (!finished) {
      toast({ title: 'Pilih produk jadi.', icon: 'warning' });
      return;
    }
    if (name.trim().length < 2) {
      toast({ title: 'Nama BOM minimal 2 huruf.', icon: 'warning' });
      return;
    }
    const output = Number(outputQty.replace(',', '.'));
    if (!Number.isFinite(output) || output <= 0) {
      toast({ title: 'Jumlah hasil harus lebih dari 0.', icon: 'warning' });
      return;
    }
    if (lines.length === 0) {
      toast({ title: 'Tambahkan minimal satu komponen.', icon: 'warning' });
      return;
    }
    const payloadLines: Array<{ productId: string; qtyRequired: number; scrapPercent: number }> = [];
    for (const l of lines) {
      const qty = Number(l.qty.replace(',', '.'));
      const scrap = Number(l.scrap.replace(',', '.') || 0);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast({ title: `Jumlah ${l.product.name} harus lebih dari 0.`, icon: 'warning' });
        return;
      }
      if (!Number.isFinite(scrap) || scrap < 0 || scrap > 100) {
        toast({ title: `Susut ${l.product.name} harus 0 sampai 100%.`, icon: 'warning' });
        return;
      }
      payloadLines.push({ productId: l.product.id, qtyRequired: Math.round(qty * 100) / 100, scrapPercent: Math.round(scrap * 100) / 100 });
    }

    setBusy(true);
    try {
      await apiFetch('/v1/manufacturing/boms', {
        method: 'POST',
        body: JSON.stringify({ productId: finished.id, name: name.trim(), outputQty: Math.round(output * 100) / 100, lines: payloadLines }),
      });
      toast({ title: 'BOM dibuat.', icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal membuat BOM.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="BOM Baru" maxWidth="xl">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-2">
          {finished ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-ash bg-bone/40 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-caption text-fossil">Produk jadi</p>
                <p className="text-[15px] text-ink break-words">{finished.name}</p>
                <p className="text-caption text-fossil tnum">{finished.sku}</p>
              </div>
              <Button type="button" variant="subtle" size="sm" onClick={() => setFinished(null)}>
                Ganti
              </Button>
            </div>
          ) : (
            <ProductSearch
              label="Produk jadi yang dihasilkan"
              onPick={(p) => {
                setFinished(p);
                if (!name.trim()) setName(`BOM ${p.name}`);
              }}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
          <Input label="Nama BOM" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label={`Hasil per batch${finished ? ` (${finished.unit})` : ''}`}
            value={outputQty}
            onChange={(e) => setOutputQty(e.target.value)}
            inputMode="decimal"
          />
        </div>

        <div className="space-y-3">
          <ProductSearch label="Tambah komponen / bahan baku" onPick={addComponent} />
          {lines.length === 0 ? (
            <p className="text-body-sm text-fossil rounded-xl border border-dashed border-ash px-4 py-5 text-center">
              Belum ada komponen. Cari bahan baku di atas untuk menambahkannya.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {lines.map((l) => (
                <li key={l.key} className="rounded-xl border border-ash bg-bone/40 p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15px] text-ink break-words">{l.product.name}</p>
                      <p className="text-caption text-fossil tnum">{l.product.sku}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      aria-label={`Hapus ${l.product.name}`}
                      className="p-2.5 -m-1.5 rounded-lg text-pebble hover:text-ink hover:bg-sand shrink-0"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Input label={`Jumlah (${l.product.unit})`} value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} inputMode="decimal" />
                    <Input label="Susut (%)" value={l.scrap} onChange={(e) => patch(l.key, { scrap: e.target.value })} inputMode="decimal" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" full onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" full disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan BOM'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export interface BomDetail {
  id: string;
  name?: string;
  version: number;
  outputQty: number | string;
  isActive: boolean;
  product: { sku: string; name: string; unit: string };
  lines: Array<{ id: string; qtyRequired: number | string; scrapPercent: number | string; product: { sku: string; name: string; unit: string } }>;
}

/** Rincian komponen satu BOM. */
export function BomDetailModal({ bom, onClose }: { bom: BomDetail | null; onClose: () => void }) {
  return (
    <Modal open={bom !== null} onClose={onClose} title={bom ? `${bom.product.name} · v${bom.version}` : ''} maxWidth="lg">
      {bom && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-fossil">
            <Badge variant={bom.isActive ? 'accent' : 'outline'}>{bom.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
            <span className="tnum">
              Hasil {formatNumber(Number(bom.outputQty))} {bom.product.unit} per batch
            </span>
          </div>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-sand">
              {bom.lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[15px] text-ink break-words">{l.product.name}</p>
                    <p className="text-caption text-fossil tnum">{l.product.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[15px] text-ink tnum">
                      {formatNumber(Number(l.qtyRequired))} {l.product.unit}
                    </p>
                    {Number(l.scrapPercent) > 0 && <p className="text-caption text-fossil tnum">susut {formatNumber(Number(l.scrapPercent))}%</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Modal>
  );
}
