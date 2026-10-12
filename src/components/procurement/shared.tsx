import { useMemo } from 'react';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/controls';
import { listOf, useResource } from '../../lib/useResource';

export type BadgeVariant = 'outline' | 'neutral' | 'ink' | 'accent';

/** Decimal dari Prisma datang sebagai string; satu tempat untuk normalisasi. */
export function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
  costPrice?: number | string;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

export interface SupplierOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

/**
 * Pilihan produk, gudang, dan pemasok untuk form. Diambil langsung dari backend
 * (bukan businessStore) karena id di store bisa berasal dari data demo yang tidak dikenal server.
 */
export function useCatalog(enabled: boolean) {
  const products = useResource<unknown>('/v1/inventory/products?limit=100', { enabled });
  const warehouses = useResource<unknown>('/v1/inventory/warehouses', { enabled });
  const suppliers = useResource<unknown>('/v1/parties/suppliers?isActive=true', { enabled });
  return useMemo(
    () => ({
      products: listOf<ProductOption>(products.data),
      warehouses: listOf<WarehouseOption>(warehouses.data),
      suppliers: listOf<SupplierOption>(suppliers.data),
      loading: products.loading || warehouses.loading || suppliers.loading,
      error: products.error || warehouses.error || suppliers.error,
      reload: () => {
        products.reload();
        warehouses.reload();
        suppliers.reload();
      },
    }),
    [products, warehouses, suppliers],
  );
}

export interface EditorLine {
  key: string;
  productId: string;
  qty: string;
  price: string;
}

let lineSeq = 0;
export function newLine(): EditorLine {
  lineSeq += 1;
  return { key: `l${lineSeq}`, productId: '', qty: '', price: '' };
}

interface LineItemsEditorProps {
  lines: EditorLine[];
  products: ProductOption[];
  onChange: (lines: EditorLine[]) => void;
  withPrice?: boolean;
  qtyLabel?: string;
}

/**
 * Editor baris item untuk HP: satu kartu per baris, bukan tabel.
 * Produk yang sudah dipilih di baris lain disembunyikan (backend menolak produk ganda).
 */
export function LineItemsEditor({ lines, products, onChange, withPrice, qtyLabel = 'Jumlah' }: LineItemsEditorProps) {
  const patch = (key: string, p: Partial<EditorLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));

  return (
    <div className="space-y-2.5">
      {lines.map((line, i) => {
        const product = products.find((p) => p.id === line.productId);
        const taken = new Set(lines.filter((l) => l.key !== line.key).map((l) => l.productId));
        return (
          <div key={line.key} className="rounded-xl border border-ash bg-bone/60 p-3 space-y-3 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-caption text-fossil">Item {i + 1}</p>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                  aria-label={`Hapus item ${i + 1}`}
                  className="p-2.5 -m-2.5 rounded-lg text-pebble hover:text-rose-700 hover:bg-sand"
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
            <Select
              label="Produk"
              value={line.productId}
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value);
                patch(line.key, {
                  productId: e.target.value,
                  ...(withPrice && p && !line.price && p.costPrice ? { price: String(num(p.costPrice)) } : {}),
                });
              }}
            >
              <option value="">Pilih produk</option>
              {products
                .filter((p) => !taken.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
            </Select>
            <div className={`grid gap-3 ${withPrice ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <Input
                label={product ? `${qtyLabel} (${product.unit})` : qtyLabel}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={line.qty}
                onChange={(e) => patch(line.key, { qty: e.target.value })}
                placeholder="0"
              />
              {withPrice && (
                <Input
                  label="Harga satuan"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={line.price}
                  onChange={(e) => patch(line.key, { price: e.target.value })}
                  placeholder="0"
                />
              )}
            </div>
          </div>
        );
      })}
      <Button variant="ghost" size="sm" icon="plus" full onClick={() => onChange([...lines, newLine()])}>
        Tambah item
      </Button>
    </div>
  );
}

/** Validasi baris: null bila lolos, selain itu pesan untuk toast. */
export function validateLines(lines: EditorLine[], withPrice?: boolean): string | null {
  if (lines.length === 0) return 'Tambahkan minimal satu item.';
  for (const [i, l] of lines.entries()) {
    if (!l.productId) return `Item ${i + 1}: pilih produk.`;
    if (!(num(l.qty) > 0)) return `Item ${i + 1}: jumlah harus lebih dari 0.`;
    if (withPrice && !(num(l.price) > 0)) return `Item ${i + 1}: harga harus lebih dari 0.`;
  }
  return null;
}

/** Skor 0-100 sebagai batang tipis + angka; null ditampilkan sebagai strip. */
export function ScoreBar({ value, label }: { value: number | string | null | undefined; label?: string }) {
  if (value === null || value === undefined) return <span className="text-pebble">-</span>;
  const pct = Math.max(0, Math.min(100, num(value)));
  return (
    <div className="min-w-0" aria-label={label ? `${label} ${pct.toFixed(0)} dari 100` : undefined}>
      <span className="tnum text-[14px] text-ink">{pct.toFixed(0)}</span>
      <div className="mt-1 h-1.5 w-full max-w-[96px] rounded-full bg-sand overflow-hidden">
        <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-3 py-2.5 text-[16px] sm:text-[15px] text-ink placeholder:text-pebble hover:border-pebble focus:border-ink focus:outline-none"
      />
    </div>
  );
}

/** Pesan galat singkat dari exception apa pun. */
export function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
