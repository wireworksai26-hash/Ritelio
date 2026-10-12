import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { Input } from '../ui/controls';
import { Button } from '../ui/Button';
import { apiFetch } from '../../lib/api';
import { formatIDR } from '../../lib/format';
import { listOf, useDebounced } from '../../lib/useResource';

export interface PickedProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  sellPrice: number | string;
}

export interface EditorLine {
  key: string;
  product: PickedProduct;
  qty: string;
  price: string;
}

let lineSeq = 0;
export const newLineKey = () => `ln-${++lineSeq}`;

/** Ubah baris editor menjadi payload DTO (`DocumentLineDto`). Mengembalikan pesan galat bila ada baris tidak valid. */
export function toDocumentLines(lines: EditorLine[]): { lines: Array<{ productId: string; qty: number; price: number }> } | { error: string } {
  if (lines.length === 0) return { error: 'Tambahkan minimal satu item.' };
  const out: Array<{ productId: string; qty: number; price: number }> = [];
  for (const l of lines) {
    const qty = Number(l.qty.replace(',', '.'));
    const price = Number(l.price.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) return { error: `Jumlah ${l.product.name} harus lebih dari 0.` };
    if (!Number.isFinite(price) || price <= 0) return { error: `Harga ${l.product.name} harus lebih dari 0.` };
    out.push({ productId: l.product.id, qty: Math.round(qty * 100) / 100, price: Math.round(price * 100) / 100 });
  }
  return { lines: out };
}

export function linesTotal(lines: EditorLine[]): number {
  return lines.reduce((s, l) => {
    const qty = Number(l.qty.replace(',', '.'));
    const price = Number(l.price.replace(',', '.'));
    return s + (Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0);
  }, 0);
}

export function ProductSearch({ onPick, label = 'Cari produk' }: { onPick: (p: PickedProduct) => void; label?: string }) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q.trim(), 250);
  const [results, setResults] = useState<PickedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<unknown>(`/v1/inventory/products?q=${encodeURIComponent(debounced)}&isActive=true&limit=8`)
      .then((res) => {
        if (!cancelled) setResults(listOf<PickedProduct>(res));
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <Input
        label={label}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Nama, SKU, atau barcode"
        autoComplete="off"
      />
      {open && debounced.length >= 2 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-paper border border-ash rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] max-h-60 overflow-y-auto overscroll-contain">
          {loading && <li className="px-3.5 py-3 text-body-sm text-fossil">Mencari…</li>}
          {!loading && results.length === 0 && <li className="px-3.5 py-3 text-body-sm text-fossil">Produk tidak ditemukan.</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full text-left px-3.5 py-2.5 min-h-[48px] hover:bg-sand/60 active:bg-sand flex items-center justify-between gap-3"
                onClick={() => {
                  onPick(p);
                  setQ('');
                  setOpen(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block text-[15px] text-ink truncate">{p.name}</span>
                  <span className="block text-caption text-fossil tnum">{p.sku}</span>
                </span>
                <span className="text-caption text-fossil tnum shrink-0">{formatIDR(Number(p.sellPrice))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface LineItemsEditorProps {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
}

/** Editor baris dokumen berbentuk kartu per item (bukan tabel) supaya nyaman diisi di HP. */
export function LineItemsEditor({ lines, onChange }: LineItemsEditorProps) {
  function add(p: PickedProduct) {
    const existing = lines.find((l) => l.product.id === p.id);
    if (existing) {
      onChange(lines.map((l) => (l.key === existing.key ? { ...l, qty: String(Number(l.qty || 0) + 1) } : l)));
      return;
    }
    onChange([...lines, { key: newLineKey(), product: p, qty: '1', price: String(Number(p.sellPrice)) }]);
  }

  const patch = (key: string, next: Partial<EditorLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...next } : l)));

  return (
    <div className="space-y-3">
      <ProductSearch onPick={add} />

      {lines.length === 0 ? (
        <p className="text-body-sm text-fossil rounded-xl border border-dashed border-ash px-4 py-5 text-center">
          Belum ada item. Cari produk di atas untuk menambahkannya.
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
                  onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                  aria-label={`Hapus ${l.product.name}`}
                  className="p-2.5 -m-1.5 rounded-lg text-pebble hover:text-ink hover:bg-sand shrink-0"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Input
                  label={`Jumlah (${l.product.unit})`}
                  value={l.qty}
                  onChange={(e) => patch(l.key, { qty: e.target.value })}
                  inputMode="decimal"
                />
                <Input label="Harga satuan" value={l.price} onChange={(e) => patch(l.key, { price: e.target.value })} inputMode="decimal" />
              </div>
              <p className="text-right text-body-sm tnum text-ink">
                {formatIDR(Number(l.qty.replace(',', '.') || 0) * Number(l.price.replace(',', '.') || 0))}
              </p>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <Button type="button" variant="subtle" size="sm" onClick={() => onChange([])}>
            Kosongkan
          </Button>
          <p className="text-[16px] text-ink tnum">
            Total <strong>{formatIDR(linesTotal(lines))}</strong>
          </p>
        </div>
      )}
    </div>
  );
}
