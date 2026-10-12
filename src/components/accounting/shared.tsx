import { useCallback, useEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { apiFetch } from '../../lib/api';
import { cn, formatNumber } from '../../lib/format';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Field } from '../ui/controls';

/** Decimal dari Prisma datang sebagai string; normalkan di satu tempat. */
export function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Nominal dengan mata uang laporan (IDR tanpa desimal, mata uang lain 2 desimal). */
export function formatMoney(value: number, currency = 'IDR'): string {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'IDR' ? 0 : 2,
      maximumFractionDigits: currency === 'IDR' ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${formatNumber(value)}`;
  }
}

/** Tanggal lokal YYYY-MM-DD untuk <input type="date"> dan query laporan. */
export function isoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Batas atas eksklusif untuk filter `to` backend (lt): hari terpilih + 1. */
export function nextDayISO(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export const accountTypeLabel: Record<AccountType, string> = {
  asset: 'Aset',
  liability: 'Kewajiban',
  equity: 'Ekuitas',
  revenue: 'Pendapatan',
  expense: 'Beban',
};

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  _count?: { journalLines: number; children?: number };
}

export interface AccountNode extends Account {
  children: AccountNode[];
}

/** Select dengan panah, label, dan ukuran font 16px di HP (mencegah zoom iOS). */
export function SelectBox({
  label,
  hint,
  className,
  children,
  ...rest
}: {
  label?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>) {
  return (
    <Field label={label} hint={hint} className={className}>
      <div className="relative">
        <select
          className="w-full appearance-none bg-paper border border-pebble/70 rounded-lg pl-3 pr-9 py-2.5 text-[16px] sm:text-[15px] text-ink hover:border-pebble focus:border-ink focus:outline-none transition-colors duration-150 min-w-0"
          {...rest}
        >
          {children}
        </select>
        <Icon
          name="chevron-down"
          size={15}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fossil"
        />
      </div>
    </Field>
  );
}

/** Baris filter: satu kolom di HP, mengalir ke samping di layar lebar. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>;
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[18px] font-light text-ink">{title}</h2>
        {hint && <p className="text-body-sm text-fossil mt-0.5">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Pesan penting yang tidak boleh terlewat (kurs fallback, saldo tidak seimbang, dsb). */
export function Notice({
  tone = 'warn',
  children,
}: {
  tone?: 'warn' | 'ok';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-body-sm',
        tone === 'warn' ? 'border-ash bg-sand/60 text-smoke' : 'border-olive/30 bg-chartreuse/25 text-ink',
      )}
    >
      <Icon name={tone === 'warn' ? 'warning' : 'check'} size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function BalanceBadge({ balanced }: { balanced: boolean }) {
  return balanced ? (
    <Badge variant="accent" icon="check">
      Seimbang
    </Badge>
  ) : (
    <Badge variant="ink" icon="warning">
      Tidak seimbang
    </Badge>
  );
}

export interface LedgerColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

/**
 * Tabel angka rapat untuk neraca saldo & konsolidasi. Memang tabular-numeric,
 * jadi lebar minimum dijaga dan wadahnya bisa digeser di HP — jangan ubah jadi
 * kartu, nilai debit/kredit harus sejajar untuk dibandingkan.
 */
export function LedgerTable<T>({
  rows,
  columns,
  rowKey,
  footer,
  minWidth = 460,
}: {
  rows: T[];
  columns: LedgerColumn<T>[];
  rowKey: (row: T) => string;
  footer?: ReactNode;
  minWidth?: number;
}) {
  const template = columns.map((c, i) => (i === 0 ? 'minmax(0,1fr)' : 'auto')).join(' ');
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            className="grid gap-x-4 px-4 sm:px-6 py-2.5 border-b border-ash text-caption text-fossil"
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((c) => (
              <span key={c.key} className={c.numeric ? 'text-right' : ''}>
                {c.header}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div
              key={rowKey(row)}
              className="grid gap-x-4 px-4 sm:px-6 py-2.5 border-b border-sand last:border-0 text-[14px] items-baseline"
              style={{ gridTemplateColumns: template }}
            >
              {columns.map((c) => (
                <div key={c.key} className={cn('min-w-0', c.numeric && 'text-right tnum whitespace-nowrap')}>
                  {c.render(row)}
                </div>
              ))}
            </div>
          ))}
          {footer && (
            <div
              className="grid gap-x-4 px-4 sm:px-6 py-3 border-t border-ash bg-sand/40 text-[14px] font-medium items-baseline"
              style={{ gridTemplateColumns: template }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function LoadMore({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center">
      <Button variant="ghost" onClick={onClick} disabled={loading} icon="arrow-right">
        {loading ? 'Memuat…' : 'Muat lebih banyak'}
      </Button>
    </div>
  );
}

interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  total?: number;
}

/**
 * Daftar berpaginasi kursor. Filter yang berubah mengosongkan daftar dan
 * memuat ulang dari awal; respons lama yang terlambat dibuang lewat penanda
 * `token` supaya tidak menimpa hasil filter yang lebih baru.
 */
export function useCursorList<T>(path: string, params: Record<string, string | number | undefined>) {
  const [rows, setRows] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const token = useRef(0);

  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  useEffect(() => {
    const mine = ++token.current;
    setLoading(true);
    setError(null);
    apiFetch<CursorPage<T>>(`${path}?${query}`)
      .then((res) => {
        if (mine !== token.current) return;
        setRows(res.data ?? []);
        setCursor(res.nextCursor ?? null);
        setTotal(res.total);
      })
      .catch((err: Error) => {
        if (mine === token.current) setError(err.message || 'Gagal memuat data.');
      })
      .finally(() => {
        if (mine === token.current) setLoading(false);
      });
  }, [path, query, nonce]);

  const loadMore = useCallback(() => {
    if (!cursor) return;
    const mine = token.current;
    setLoadingMore(true);
    apiFetch<CursorPage<T>>(`${path}?${query}${query ? '&' : ''}cursor=${encodeURIComponent(cursor)}`)
      .then((res) => {
        if (mine !== token.current) return;
        setRows((prev) => [...prev, ...(res.data ?? [])]);
        setCursor(res.nextCursor ?? null);
      })
      .catch((err: Error) => {
        if (mine === token.current) setError(err.message || 'Gagal memuat data.');
      })
      .finally(() => setLoadingMore(false));
  }, [cursor, path, query]);

  return {
    rows,
    total,
    loading,
    loadingMore,
    error,
    hasMore: cursor !== null,
    loadMore,
    reload: () => setNonce((n) => n + 1),
  };
}

/** Sembunyikan nilai rahasia sebelum ditampilkan (jejak audit bisa memuat token/hash). */
const SECRET_KEY = /pass(word)?|secret|token|hash|otp|pin\b|api[-_]?key/i;

export function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? '••••••' : maskSecrets(v)]),
    );
  }
  return value;
}
