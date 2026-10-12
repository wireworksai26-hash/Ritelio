import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { useModuleStore } from '../../stores/moduleStore';
import { useNotificationStore, unreadCount } from '../../stores/notificationStore';
import { Icon } from '../icons/Icon';
import { MobileMenuSheet } from './MobileMenuSheet';
import { navForRole, splitForBottomNav } from './nav';

const slotClass =
  'relative flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 text-[11px] leading-tight transition-all duration-150 active:scale-95';

// Bottom navigation untuk layar kecil. Role dengan banyak modul mendapat 4 item
// pinned + tombol "Menu" yang membuka lembar semua modul.
export function BottomNav() {
  const user = useAuthStore((s) => s.user);
  const isActive = useModuleStore((s) => s.isActive);
  const notifications = useNotificationStore((s) => s.notifications);
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Tutup lembar saat rute berpindah (mis. tombol back browser)
  useEffect(() => setSheetOpen(false), [location.pathname]);

  if (!user) return null;

  const all = navForRole(user.role, isActive);
  const { primary, hasMore } = splitForBottomNav(all);
  const unread = unreadCount(notifications);
  const slots = primary.length + (hasMore ? 1 : 0);
  const inPrimary = primary.some((i) =>
    i.end ? location.pathname === i.to : location.pathname === i.to || location.pathname.startsWith(`${i.to}/`),
  );

  return (
    <>
      <nav
        aria-label="Navigasi bawah"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-paper border-t border-ash select-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}>
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive: active }) =>
                cn(slotClass, active ? 'text-ink font-medium' : 'text-fossil hover:text-ink')
              }
            >
              {({ isActive: active }) => (
                <>
                  <span className="relative">
                    <Icon name={item.icon} size={20} strokeWidth={active ? 2 : 1.5} />
                    {item.to === '/app/notifications' && unread > 0 && (
                      <span className="absolute -top-1 -right-2 min-w-[14px] h-3.5 px-0.5 rounded-full bg-ink text-paper text-[9px] leading-[14px] text-center tnum font-normal">
                        {unread}
                      </span>
                    )}
                  </span>
                  <span className={cn('truncate max-w-full px-1', active && 'font-semibold')}>
                    {item.shortLabel ?? item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              className={cn(slotClass, !inPrimary || sheetOpen ? 'text-ink font-medium' : 'text-fossil hover:text-ink')}
            >
              <Icon name="menu" size={20} strokeWidth={!inPrimary || sheetOpen ? 2 : 1.5} />
              <span>Menu</span>
            </button>
          )}
        </div>
      </nav>
      {hasMore && <MobileMenuSheet open={sheetOpen} onClose={() => setSheetOpen(false)} items={all} />}
    </>
  );
}
