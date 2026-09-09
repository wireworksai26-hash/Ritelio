import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { useModuleStore } from '../../stores/moduleStore';
import { useNotificationStore, unreadCount } from '../../stores/notificationStore';
import { Icon } from '../icons/Icon';
import { navForRole } from './nav';

// Bottom navigation untuk layar kecil (HP kasir / tablet POS)
export function BottomNav() {
  const user = useAuthStore((s) => s.user);
  const isActive = useModuleStore((s) => s.isActive);
  const notifications = useNotificationStore((s) => s.notifications);
  if (!user) return null;

  const items = navForRole(user.role, isActive).slice(0, 5);
  const unread = unreadCount(notifications);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-paper border-t border-ash select-none shadow-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive: active }) =>
              cn(
                'relative flex flex-col items-center gap-1 py-2 sm:py-2.5 text-[11px] leading-tight transition-all duration-150 active:scale-95',
                active ? 'text-ink font-medium' : 'text-fossil hover:text-ink',
              )
            }
          >
            {({ isActive: active }) => (
              <>
                <span className="relative">
                  <Icon name={item.icon} size={19} strokeWidth={active ? 2 : 1.5} />
                  {(item.to === '/app/notifications' || item.to === '/notifications') && unread > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[14px] h-3.5 px-0.5 rounded-full bg-ink text-paper text-[9px] leading-[14px] text-center tnum font-normal">
                      {unread}
                    </span>
                  )}
                </span>
                <span className={active ? 'font-semibold' : ''}>{item.shortLabel ?? item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
