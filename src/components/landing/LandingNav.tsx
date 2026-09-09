import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { homePathFor, useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { Logo } from '../layout/Logo';
import { cn } from '../../lib/format';

const links = [
  { href: '#fitur', label: 'Fitur', id: 'fitur' },
  { href: '#nilai', label: 'Nilai', id: 'nilai' },
  { href: '#harga', label: 'Harga', id: 'harga' },
  { href: '#keamanan', label: 'Keamanan', id: 'keamanan' },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const isDark = useThemeStore((s) => s.isDark);
  const toggleDark = useThemeStore((s) => s.toggleDark);

  // ScrollSpy untuk mendeteksi section aktif saat scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 160;
      let current = '';
      for (const item of links) {
        const el = document.getElementById(item.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            current = item.id;
          }
        }
      }
      setActiveSection(current);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-bone/85 backdrop-blur-md border-b border-ash/70 transition-all">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-3">
          <Link to="/" aria-label="Retalio — beranda" className="flex items-center gap-2 group">
            <Logo />
          </Link>
        </div>

        {/* Center: Navigation Links with ScrollSpy */}
        <nav className="hidden md:flex items-center gap-1 rounded-full border border-ash/60 bg-paper/60 px-3 py-1 shadow-xs">
          {links.map((l) => {
            const isActive = activeSection === l.id;
            return (
              <a
                key={l.href}
                href={l.href}
                className={cn(
                  'px-3.5 py-1 text-[14px] rounded-full transition-all duration-150',
                  isActive
                    ? 'bg-ink text-paper font-medium shadow-xs'
                    : 'text-fossil hover:text-ink hover:bg-sand/60'
                )}
              >
                {l.label}
              </a>
            );
          })}
        </nav>

        {/* Right: Actions & Theme Toggle */}
        <div className="hidden md:flex items-center gap-2.5">
          {/* Dark Mode Toggle Button */}
          <button
            onClick={toggleDark}
            aria-label="Ganti mode gelap / terang"
            title={isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ash/70 bg-paper/70 text-ink hover:bg-sand hover:scale-105 active:scale-95 transition-all shadow-xs"
          >
            <Icon name={isDark ? 'sun' : 'moon'} size={17} />
          </button>

          {user ? (
            <Button size="sm" iconRight="arrow-right" onClick={() => navigate(homePathFor(user.role))}>
              Buka Dashboard
            </Button>
          ) : (
            <>
              <Link
                to="/login"
                className="text-[14px] font-medium text-fossil hover:text-ink px-3 py-1.5 rounded-lg hover:bg-sand/50 transition-colors"
              >
                Masuk
              </Link>
              <Button
                size="sm"
                iconRight="arrow-right"
                onClick={() => navigate('/onboarding')}
              >
                Coba Gratis
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu trigger */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={toggleDark}
            aria-label="Ganti mode gelap / terang"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ash bg-paper text-ink"
          >
            <Icon name={isDark ? 'sun' : 'moon'} size={16} />
          </button>
          <button
            className="p-2 rounded-lg text-ink hover:bg-sand transition-colors"
            aria-label="Buka menu"
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {open && (
        <div className="md:hidden border-t border-ash bg-bone px-4 py-4 space-y-1 shadow-lg animate-fade-in">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={cn(
                'block rounded-lg px-3.5 py-2.5 text-[15px] transition-colors',
                activeSection === l.id ? 'bg-ink text-paper font-medium' : 'text-ink hover:bg-sand'
              )}
            >
              {l.label}
            </a>
          ))}
          <div className="pt-3 mt-2 border-t border-sand flex flex-col gap-2">
            {user ? (
              <Button size="sm" full onClick={() => navigate(homePathFor(user.role))}>
                Buka Dashboard
              </Button>
            ) : (
              <>
                <Button size="sm" full onClick={() => navigate('/onboarding')}>
                  Coba Gratis
                </Button>
                <Button variant="subtle" size="sm" full onClick={() => navigate('/login')}>
                  Masuk
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
