import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ScrollTrigger } from '../../lib/gsap';
import { useCompanyStore } from '../../stores/companyStore';
import { useSyncStore } from '../../stores/syncStore';
import { AssistantDrawer } from '../assistant/AssistantDrawer';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export default function AppShell() {
  const location = useLocation();
  const setOnline = useSyncStore((s) => s.setOnline);
  const companyId = useCompanyStore((s) => s.selected);

  // Listener konektivitas nyata (fallback iOS: event online/offline)
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);

  // Reset scroll & refresh ScrollTrigger saat pindah halaman
  useEffect(() => {
    window.scrollTo(0, 0);
    const t = setTimeout(() => ScrollTrigger.refresh(), 50);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-bone w-full overflow-x-hidden">
      <Sidebar />
      <div className="lg:pl-64 w-full min-w-0">
        <Topbar />
        <main className="mx-auto max-w-[1200px] w-full px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-10 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-16 min-w-0">
          {/* key: ganti perusahaan = halaman dimuat ulang dari nol untuk perusahaan baru */}
          <Outlet key={companyId} />
        </main>
      </div>
      <BottomNav />
      <AssistantDrawer />
    </div>
  );
}
