// Memetakan keluaran model OCR (tidak tepercaya, banyak null) ke nilai awal form tagihan.
// Semua hasil hanyalah usulan: pengguna wajib memeriksa sebelum tagihan dibuat.

export interface PrefillLine {
  description: string;
  amount: string;
}

export interface BillPrefill {
  supplierId: string;
  supplierInvoiceNumber: string;
  billDate: string;
  lines: PrefillLine[];
}

interface SupplierLike {
  id: string;
  name: string;
}

const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

function amount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const norm = (s: string) => s.toLowerCase().replace(/\b(pt|cv|ud|tbk)\b\.?/g, '').replace(/[^a-z0-9]/g, '');

/** Cocokkan nama pemasok hasil baca dengan master pemasok; kosong bila tidak yakin. */
export function matchSupplier(name: string, suppliers: SupplierLike[]): string {
  const target = norm(name);
  if (target.length < 3) return '';
  const exact = suppliers.find((s) => norm(s.name) === target);
  if (exact) return exact.id;
  const partial = suppliers.filter((s) => {
    const n = norm(s.name);
    return n.length >= 3 && (n.includes(target) || target.includes(n));
  });
  // Dua kandidat sama-sama mungkin = ambigu, biarkan pengguna memilih
  return partial.length === 1 ? partial[0].id : '';
}

export function prefillFromOcr(fields: Record<string, unknown>, suppliers: SupplierLike[]): BillPrefill {
  const date = text(fields.invoiceDate);
  const dpp = amount(fields.subtotal);
  const total = amount(fields.total);
  const items = Array.isArray(fields.lineItems) ? (fields.lineItems as Array<Record<string, unknown>>) : [];

  const itemLines: PrefillLine[] = items
    .map((it) => {
      const qty = amount(it.qty) ?? 1;
      const unit = amount(it.unitPrice);
      return unit ? { description: text(it.description), amount: String(Math.round(qty * unit * 100) / 100) } : null;
    })
    .filter((l): l is PrefillLine => l !== null);

  // Baris hasil baca dipakai hanya bila jumlahnya cocok dengan subtotal/total;
  // kalau tidak, satu baris ringkas lebih jujur daripada rincian yang meleset.
  const itemSum = itemLines.reduce((s, l) => s + Number(l.amount), 0);
  const reference = dpp ?? total;
  const itemsConsistent = itemLines.length > 0 && reference !== null && Math.abs(itemSum - reference) <= 1;

  return {
    supplierId: matchSupplier(text(fields.supplierName), suppliers),
    supplierInvoiceNumber: text(fields.invoiceNumber),
    billDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    lines: itemsConsistent
      ? itemLines
      : [{ description: 'Sesuai invoice', amount: reference !== null ? String(reference) : '' }],
  };
}
