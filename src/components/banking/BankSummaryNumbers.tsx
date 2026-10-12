import { formatIDR } from '../../lib/format';

// Dua angka ringkas di kartu rekening. Mata uang non-IDR ditampilkan apa adanya (tanpa simbol Rp).
export function BankSummaryNumbers({ total, reconciled, currency }: { total: number; reconciled: number; currency: string }) {
  const fmt = (v: number) =>
    currency === 'IDR' ? formatIDR(v) : `${currency} ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)}`;
  return (
    <span className="mt-2.5 grid grid-cols-2 gap-3">
      <span className="min-w-0">
        <span className="block text-caption text-fossil">Mutasi bersih</span>
        <span className="block text-[14px] text-ink tnum truncate">{fmt(total)}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-caption text-fossil">Dicocokkan</span>
        <span className="block text-[14px] text-ink tnum truncate">{fmt(reconciled)}</span>
      </span>
    </span>
  );
}
