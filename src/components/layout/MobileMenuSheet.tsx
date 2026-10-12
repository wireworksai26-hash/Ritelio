import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/format';
import { Icon } from '../icons/Icon';
import { groupNav, type NavItem } from './nav';

interface MobileMenuSheetProps {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
}

// Lembar menu penuh untuk HP. Dengan 15+ modul, bottom nav 5 slot tidak cukup,
// jadi semua modul dikelompokkan di sini dan bisa dicari.
export function MobileMenuSheet({ open, onClose, items }: MobileMenuSheetProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(q))
      : items;
    return groupNav(filtered);
  }, [items, query]);

  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Semua menu">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-bone border-t border-ash rounded-t-2xl max-h-[88dvh] flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="mx-auto h-1 w-10 rounded-full bg-ash mb-3" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari menu"
                aria-label="Cari menu"
                className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-3 py-2.5 text-[16px] text-ink placeholder:text-pebble focus:border-ink focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup menu"
              className="p-2.5 rounded-lg text-fossil hover:text-ink hover:bg-sand transition-colors"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 pb-5 space-y-5">
          {groups.length === 0 && <p className="text-body-sm text-fossil text-center py-8">Menu tidak ditemukan.</p>}
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="text-[11px] uppercase tracking-[0.08em] text-pebble mb-2">{group.label}</h2>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'flex flex-col gap-2 rounded-xl border px-3.5 py-3 min-h-[84px] active:scale-[0.98] transition-all',
                        isActive ? 'bg-sand border-ink/30 text-ink' : 'bg-paper border-ash text-ink',
                      )
                    }
                  >
                    <Icon name={item.icon} size={20} strokeWidth={1.5} />
                    <span>
                      <span className="block text-[14px] leading-tight">{item.label}</span>
                      {item.hint && <span className="block text-caption text-fossil leading-snug mt-0.5 line-clamp-2">{item.hint}</span>}
                    </span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
