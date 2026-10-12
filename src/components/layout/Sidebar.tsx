import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { useModuleStore } from '../../stores/moduleStore';
import { useNotificationStore, unreadCount } from '../../stores/notificationStore';
import { useThemeStore } from '../../stores/themeStore';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Icon } from '../icons/Icon';
import { Logo } from './Logo';
import { groupNav, navForRole } from './nav';

const roleLabel: Record<string, string> = {
  superadmin: 'Superadmin',
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  cashier: 'Kasir',
  staff: 'Staff',
};

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const isActive = useModuleStore((s) => s.isActive);
  const notifications = useNotificationStore((s) => s.notifications);
  const navigate = useNavigate();
  if (!user) return null;

  const groups = groupNav(navForRole(user.role, isActive));
  const unread = unreadCount(notifications);

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-bone border-r border-ash z-40">
      <div className="px-6 pt-7 pb-6">
        <Logo />
      </div>

      <nav className="flex-1 px-3 pb-3 overflow-y-auto space-y-5" aria-label="Menu utama">
        {groups.map((group) => (
          <div key={group.key}>
            {groups.length > 1 && (
              <p className="px-3 mb-1.5 text-[11px] uppercase tracking-[0.08em] text-pebble">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive: active }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors duration-150',
                      active ? 'bg-sand text-ink' : 'text-fossil hover:text-ink hover:bg-sand/60',
                    )
                  }
                >
                  <Icon name={item.icon} size={18} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.to === '/app/notifications' && unread > 0 && (
                    <Badge variant="ink" className="px-1.5">
                      {unread}
                    </Badge>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-ash p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} size={34} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] text-ink truncate">{user.name}</p>
            <p className="text-caption text-fossil">{roleLabel[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={useThemeStore.getState().toggleDark}
            aria-label="Ganti mode gelap / terang"
            title="Ganti Mode Tampilan"
            className="text-fossil hover:text-ink transition-colors p-1.5 rounded-lg hover:bg-sand"
          >
            <Icon name={useThemeStore((s) => s.isDark) ? 'sun' : 'moon'} size={17} />
          </button>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            aria-label="Keluar"
            title="Keluar"
            className="text-fossil hover:text-ink transition-colors p-1.5 rounded-lg hover:bg-sand"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
