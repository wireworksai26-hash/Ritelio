import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { Button } from './Button';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { Pagination } from './Pagination';

// Tabel data generik untuk halaman modul baru. Sengaja tanpa state internal:
// konsumen sudah memegang `loading`/`error` dari useResource, dan tabel ini
// hanya bertanggung jawab atas tampilan — supaya filter dan pagination bisa tetap di luar.
//
// Responsif: di bawah breakpoint `md` baris dirender sebagai kartu (kolom pertama
// menjadi judul, kolom lain pasangan label-nilai) agar tidak perlu geser horizontal di HP.

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'right' | 'center';
  /** Sembunyikan kolom ini pada tampilan kartu HP (kolom sekunder / redundan). */
  hideOnMobile?: boolean;
  /** Label di kartu HP bila `header` bukan teks sederhana. */
  mobileLabel?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  page?: number;
  totalPages?: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  rowActions?: (row: T) => ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  error,
  onRetry,
  emptyIcon = 'search',
  emptyTitle = 'Belum ada data',
  emptyBody,
  emptyAction,
  onRowClick,
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  rowActions,
}: DataTableProps<T>) {
  if (error) {
    return (
      <Card className="p-6">
        <EmptyState
          icon="warning"
          title="Gagal memuat data"
          body={error}
          action={
            onRetry ? (
              <Button variant="ghost" icon="sync" onClick={onRetry}>
                Coba lagi
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-sand animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 rounded bg-sand animate-pulse" style={{ width: `${60 - i * 8}%` }} />
              <div className="h-2.5 rounded bg-sand/60 animate-pulse" style={{ width: `${40 - i * 6}%` }} />
            </div>
          </div>
        ))}
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} action={emptyAction} />
      </Card>
    );
  }

  const [titleCol, ...restCols] = columns;
  const detailCols = restCols.filter((c) => !c.hideOnMobile);

  return (
    <Card className="overflow-hidden">
      {/* Tampilan kartu — HP */}
      <ul className="md:hidden divide-y divide-sand">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`px-4 py-3.5 ${onRowClick ? 'active:bg-sand/50 cursor-pointer' : ''}`}
          >
            <div className="min-w-0 text-[15px] text-ink">{titleCol.render(row)}</div>
            {detailCols.length > 0 && (
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                {detailCols.map((col) => (
                  <div key={col.key} className="min-w-0">
                    <dt className="text-caption text-fossil truncate">
                      {col.mobileLabel ?? (typeof col.header === 'string' ? col.header : '')}
                    </dt>
                    <dd className="text-[14px] text-ink break-words">{col.render(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {rowActions && (
              <div
                className="mt-2.5 -mb-1 flex items-center justify-end gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {rowActions(row)}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Tampilan tabel — tablet & desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-ash">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-caption text-fossil font-normal px-4 sm:px-6 py-3 ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                  } ${col.headerClassName ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
              {rowActions && <th className="text-caption text-fossil font-normal px-4 sm:px-6 py-3 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-sand last:border-0 ${
                  onRowClick ? 'hover:bg-sand/40 cursor-pointer' : 'hover:bg-sand/20'
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 sm:px-6 py-3.5 align-middle ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                    } ${col.className ?? ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-4 sm:px-6 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onPageChange && totalPages !== undefined && (
        <div className="px-4 sm:px-6 pb-4">
          <Pagination
            currentPage={page ?? 1}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </Card>
  );
}

/** Baris statistik ringkas di atas tabel. */
export function StatRow({ items }: { items: Array<{ label: string; value: ReactNode; tone?: 'default' | 'accent' }> }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {items.map((item, i) => (
        <Card key={i} className={`px-3.5 sm:px-4 py-3 sm:py-3.5 min-w-0 ${item.tone === 'accent' ? 'bg-chartreuse/25 border-olive/30' : ''}`}>
          <p className="text-caption text-fossil">{item.label}</p>
          <p className="text-[18px] sm:text-heading-sm tnum text-ink mt-1 break-words">{item.value}</p>
        </Card>
      ))}
    </div>
  );
}

/** Kartu kosong untuk domain yang belum terisi, dengan penjelasan singkat. */
export function ModulePlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-6">
      <EmptyState icon="info" title={title} body={body} />
    </Card>
  );
}

/** Tombol aksi baris yang konsisten (ikon + label opsional). */
export function RowAction({
  icon,
  label,
  onClick,
  tone = 'default',
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'primary';
  disabled?: boolean;
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-pebble hover:text-rose-700 hover:bg-sand'
      : tone === 'primary'
        ? 'text-ink hover:bg-sand'
        : 'text-pebble hover:text-ink hover:bg-sand';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`p-2.5 sm:p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none ${toneClass}`}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
