import { Icon } from '../icons/Icon';
import { cn } from '../../lib/format';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
  compact?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className,
  compact = false,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = totalItems !== undefined && pageSize !== undefined
    ? (currentPage - 1) * pageSize + 1
    : null;
  const endItem = totalItems !== undefined && pageSize !== undefined
    ? Math.min(currentPage * pageSize, totalItems)
    : null;

  if (compact) {
    return (
      <div className={cn('flex items-center justify-between gap-2 pt-3 border-t border-sand text-caption text-fossil', className)}>
        <span>
          Hal {currentPage} dari {totalPages}
          {totalItems !== undefined && ` (${totalItems})`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Halaman sebelumnya"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="w-7 h-7 rounded-md border border-ash bg-paper hover:bg-sand disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center text-ink transition-colors"
          >
            <Icon name="chevron-left" size={14} />
          </button>
          <button
            type="button"
            aria-label="Halaman berikutnya"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="w-7 h-7 rounded-md border border-ash bg-paper hover:bg-sand disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center text-ink transition-colors"
          >
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Full pagination bar with number pills & item count
  const pages: (number | string)[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-ash text-caption text-fossil', className)}>
      <div>
        {startItem !== null && endItem !== null && totalItems !== undefined ? (
          <span>
            Menampilkan <span className="font-medium text-ink tnum">{startItem}–{endItem}</span> dari{' '}
            <span className="font-medium text-ink tnum">{totalItems}</span> produk
          </span>
        ) : (
          <span>
            Halaman <span className="font-medium text-ink tnum">{currentPage}</span> dari{' '}
            <span className="font-medium text-ink tnum">{totalPages}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Halaman sebelumnya"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="px-2.5 py-1.5 rounded-lg border border-ash bg-paper hover:bg-sand disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1 text-ink text-caption font-medium transition-colors"
        >
          <Icon name="chevron-left" size={13} />
          <span className="hidden sm:inline">Sebelumnya</span>
        </button>

        <div className="flex items-center gap-1">
          {pages.map((p, idx) => {
            if (typeof p === 'string') {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-fossil select-none">
                  …
                </span>
              );
            }
            const active = p === currentPage;
            return (
              <button
                key={p}
                type="button"
                aria-label={`Ke halaman ${p}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onPageChange(p)}
                className={cn(
                  'w-8 h-8 rounded-lg text-caption font-medium tnum transition-colors inline-flex items-center justify-center',
                  active
                    ? 'bg-ink text-paper'
                    : 'border border-ash bg-paper text-ink hover:bg-sand',
                )}
              >
                {p}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Halaman berikutnya"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="px-2.5 py-1.5 rounded-lg border border-ash bg-paper hover:bg-sand disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1 text-ink text-caption font-medium transition-colors"
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <Icon name="chevron-right" size={13} />
        </button>
      </div>
    </div>
  );
}
