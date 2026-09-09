import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { gsap, ScrollTrigger } from '../../lib/gsap';
import { pendingSyncCount } from '../../lib/stats';
import { useAssistantStore } from '../../stores/assistantStore';
import { useAuthStore } from '../../stores/authStore';
import { useBusinessStore } from '../../stores/businessStore';
import { useModuleStore } from '../../stores/moduleStore';
import { useNotificationStore, unreadCount } from '../../stores/notificationStore';
import { useOutletStore } from '../../stores/outletStore';
import { useSyncStore } from '../../stores/syncStore';
import { useThemeStore } from '../../stores/themeStore';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Icon } from '../icons/Icon';
import { LogoMark } from './Logo';

function SyncChip() {
  const isOnline = useSyncStore((s) => s.isOnline);
  const pendingLocal = useSyncStore((s) => s.pendingLocal);
  const pending = pendingSyncCount() + pendingLocal.length;

  if (!isOnline) {
    return (
      <Badge variant="accent" icon="offline">
        Offline{pending > 0 ? ` · ${pending} antre` : ''}
      </Badge>
    );
  }
  if (pending > 0) {
    return (
      <Badge variant="outline" icon="sync">
        Sinkron {pending}…
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" icon="online">
      Online
    </Badge>
  );
}

export function Topbar() {
  const { user, logout } = useAuthStore();
  const allOutlets = useBusinessStore((s) => s.outlets);
  const tenant = useBusinessStore((s) => s.tenant);
  const assistant = useAssistantStore();
  const assistantActive = useModuleStore((s) => s.modules.find((m) => m.module_key === 'assistant')?.is_active);
  const notifications = useNotificationStore((s) => s.notifications);
  const { selected, setSelected } = useOutletStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const outlets = allOutlets.filter((o) => !o.tenant_id || o.tenant_id === tenant.id);
  const tenantNotifications = notifications.filter((n) => !n.tenant_id || n.tenant_id === tenant.id);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // GSAP scroll effect: kompresi halus tinggi navbar & bayangan saat discroll
  useEffect(() => {
    const header = headerRef.current;
    const inner = innerRef.current;
    if (!header || !inner) return;

    const ctx = gsap.context(() => {
      gsap.to(inner, {
        height: 54,
        ease: 'power1.out',
        scrollTrigger: {
          start: 'top -15',
          end: 'top -60',
          scrub: true,
        },
      });

      gsap.to(header, {
        backgroundColor: 'rgba(245, 244, 240, 0.95)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 10px -2px rgba(28, 28, 28, 0.05)',
        ease: 'power1.out',
        scrollTrigger: {
          start: 'top -15',
          end: 'top -60',
          scrub: true,
        },
      });
    }, headerRef);

    return () => ctx.revert();
  }, []);

  if (!user) return null;
  const unread = unreadCount(tenantNotifications);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 bg-bone border-b border-ash transition-colors duration-200"
    >
      <div
        ref={innerRef}
        className="mx-auto max-w-[1200px] px-3 sm:px-6 lg:px-8 h-16 flex items-center gap-2 sm:gap-3 transition-[height] duration-200"
      >
        <NavLink to="/app" className="lg:hidden shrink-0" aria-label="Retalio">
          <LogoMark size={26} />
        </NavLink>

        {user.role === 'superadmin' ? (
          <div className="shrink-0 flex items-center gap-1.5">
            <Badge variant="ink">Superadmin Institusi</Badge>
          </div>
        ) : user.role === 'cashier' ? (
          <div className="shrink-0 flex items-center gap-1.5">
            <Badge variant="outline">Kasir Outlet</Badge>
          </div>
        ) : user.role === 'staff' ? (
          <div className="shrink-0 flex items-center gap-1.5">
            <Badge variant="outline">Staff Gudang</Badge>
          </div>
        ) : (
          <div className="relative shrink-0">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              aria-label="Pilih outlet"
              className="appearance-none bg-paper/60 border border-ash rounded-lg pl-2.5 pr-7 py-1.5 sm:py-2 text-caption sm:text-body-sm text-ink hover:border-pebble focus:border-ink focus:outline-none cursor-pointer max-w-[170px] sm:max-w-none truncate"
            >
              <option value="all">Semua Outlet</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  Outlet {o.name}
                </option>
              ))}
            </select>
            <Icon
              name="chevron-down"
              size={13}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fossil"
            />
          </div>
        )}

        <div className="flex-1 min-w-0" />

        {/* Sync chip disembunyikan di layar HP kecil agar tidak overflow */}
        <div className="hidden md:flex items-center">
          <SyncChip />
        </div>

        {/* Dark Mode Toggle */}
        <button
          onClick={useThemeStore.getState().toggleDark}
          aria-label="Ganti mode gelap / terang"
          title="Mode Tampilan (Gelap / Terang)"
          className="relative p-1.5 sm:p-2 rounded-lg text-ink hover:bg-sand transition-colors shrink-0"
        >
          <Icon name={useThemeStore((s) => s.isDark) ? 'sun' : 'moon'} size={19} />
        </button>

        {(tenant.subscription_plan === 'plus_ai' || tenant.subscription_plan === 'custom') && assistantActive && (
          <button
            onClick={assistant.toggle}
            aria-label="Buka Retalio Intelligence"
            title="Retalio Intelligence"
            className="relative p-1.5 sm:p-2 rounded-lg text-ink hover:bg-sand transition-colors shrink-0"
          >
            <Icon name="assistant" size={19} />
          </button>
        )}

        <NavLink
          to="/app/notifications"
          aria-label="Notifikasi"
          className="relative p-1.5 sm:p-2 rounded-lg text-ink hover:bg-sand transition-colors shrink-0"
        >
          <Icon name="bell" size={19} />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[15px] h-3.5 px-0.5 rounded-full bg-ink text-paper text-[9px] leading-[14px] text-center tnum">
              {unread}
            </span>
          )}
        </NavLink>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu pengguna"
            className="rounded-full flex items-center justify-center"
          >
            <Avatar name={user.name} size={32} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-60 bg-paper border border-ash rounded-xl p-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)] z-50">
              <div className="px-3 py-2.5 border-b border-sand">
                <p className="text-[15px] text-ink">{user.name}</p>
                <p className="text-caption text-fossil">{user.email}</p>
              </div>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="mt-1 w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] text-ink hover:bg-sand transition-colors"
              >
                <Icon name="logout" size={16} />
                Keluar
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
