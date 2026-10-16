import { cn } from '../../lib/format';
import { Icon } from '../icons/Icon';

interface NavGroupHeaderProps {
  label: string;
  count: number;
  open: boolean;
  /** id panel yang dikendalikan, untuk aria-controls */
  panelId: string;
  onToggle: () => void;
  /** Penanda ada halaman aktif di dalam grup yang sedang tertutup */
  hasActive?: boolean;
  className?: string;
}

// Kepala grup dropdown yang dipakai Sidebar dan lembar Menu HP.
export function NavGroupHeader({ label, count, open, panelId, onToggle, hasActive, className }: NavGroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg px-3 py-2 min-h-[40px] text-left',
        'text-[12px] uppercase tracking-[0.08em] text-fossil hover:text-ink hover:bg-sand/60 transition-colors',
        className,
      )}
    >
      <span className="flex-1 truncate">{label}</span>
      {!open && hasActive && <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-label="berisi halaman aktif" />}
      <span className="text-[11px] tnum normal-case tracking-normal text-pebble">{count}</span>
      <Icon
        name="chevron-down"
        size={14}
        className={cn('shrink-0 transition-transform duration-150', open ? 'rotate-180' : '')}
      />
    </button>
  );
}
