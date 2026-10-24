import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InstallBanner } from './components/pwa/InstallBanner';
import { Toasts } from './components/ui/Toast';
import { toast } from './stores/toastStore';
import { subscribeToStateChanges } from './lib/broadcast';
import { rolesForPath } from './components/layout/nav';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import { homePathFor, useAuthStore } from './stores/authStore';
import { useBusinessStore } from './stores/businessStore';
import type { Role } from './types';

// Halaman di dalam /app dimuat saat dibuka saja. Bundle awal PWA tetap kecil
// walau modul ERP bertambah banyak — penting untuk HP dengan koneksi lemah.
// Halaman hukum publik: dimuat saat dibuka saja, tidak menambah bundle awal.
const Legal = lazy(() => import('./pages/Legal'));
const Info = lazy(() => import('./pages/Info'));
const Finance = lazy(() => import('./pages/Finance'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Notifications = lazy(() => import('./pages/Notifications'));
const POS = lazy(() => import('./pages/POS'));
const Settings = lazy(() => import('./pages/Settings'));
const Superadmin = lazy(() => import('./pages/Superadmin'));
const Crm = lazy(() => import('./pages/Crm'));
const Hrm = lazy(() => import('./pages/Hrm'));
const Manufacturing = lazy(() => import('./pages/Manufacturing'));
const Operations = lazy(() => import('./pages/Operations'));
const Accounting = lazy(() => import('./pages/Accounting'));
const Billing = lazy(() => import('./pages/Billing'));
const Banking = lazy(() => import('./pages/Banking'));
const Assets = lazy(() => import('./pages/Assets'));
const Procurement = lazy(() => import('./pages/Procurement'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Audit = lazy(() => import('./pages/Audit'));
const Iot = lazy(() => import('./pages/Iot'));

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat halaman">
      <div className="h-9 w-2/3 sm:w-1/3 rounded-lg bg-sand animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[74px] rounded-xl bg-sand/70 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-sand/50 animate-pulse" />
    </div>
  );
}

// Redirect default landing page sesuai tugas & wewenang masing-masing role
function Home() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'superadmin') return <Navigate to="/app/superadmin" replace />;
  if (user.role === 'cashier') return <Navigate to="/app/pos" replace />;
  if (user.role === 'staff') return <Navigate to="/app/inventory" replace />;
  return <Dashboard />;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Guard rute: cegah akses liar ke menu yang bukan wewenangnya
function RequireRole({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  return children;
}

// Guard rute + batas Suspense per halaman, role diambil dari konfigurasi menu.
function Guarded({ path, children }: { path: string; children: JSX.Element }) {
  return (
    <RequireRole roles={rolesForPath(path)}>
      {/* key=path: pindah halaman selalu mereset boundary; galat satu halaman tidak menjatuhkan shell/menu */}
      <ErrorBoundary key={path} scope="page" name={path}>
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </ErrorBoundary>
    </RequireRole>
  );
}

// Penolakan promise yang tidak ditangani (mis. aksi async tanpa try/catch) jangan diam.
function describeRejection(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  if (!message) return 'Coba ulangi aksi tersebut.';
  if (/failed to fetch|networkerror|load failed/i.test(message)) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
  if (/abort/i.test(message)) return 'Permintaan terlalu lama dan dibatalkan. Coba lagi.';
  return message.length > 140 ? `${message.slice(0, 137)}...` : message;
}

function useUnhandledRejectionToast() {
  useEffect(() => {
    let lastAt = 0;
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error('[unhandledrejection]', event.reason);
      const now = Date.now();
      if (now - lastAt < 3000) return; // jangan membanjiri layar
      lastAt = now;
      toast({ title: 'Terjadi kesalahan', description: describeRejection(event.reason), icon: 'warning' });
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  useUnhandledRejectionToast();

  useEffect(() => {
    // Sinkronkan data bisnis secara instan antar-tab / multi-jendela / multi-role
    const unsubscribe = subscribeToStateChanges((_action, payload: any) => {
      if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
        useBusinessStore.setState((state) => ({ ...state, ...payload }));
      } else {
        try {
          const raw = localStorage.getItem('retalio-business-data');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.state) {
              useBusinessStore.setState((state) => ({ ...state, ...parsed.state }));
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    });

    // Inisialisasi sync data dari dev sync server (lintas-profil / incognito)
    fetch('/api-sync/state')
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
          useBusinessStore.setState((state) => ({ ...state, ...data }));
        }
      })
      .catch(() => {});

    return unsubscribe;
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/syarat-ketentuan" element={<Suspense fallback={null}><Legal kind="terms" /></Suspense>} />
        <Route path="/privasi" element={<Suspense fallback={null}><Legal kind="privacy" /></Suspense>} />
        <Route path="/tentang" element={<Suspense fallback={null}><Info kind="about" /></Suspense>} />
        <Route path="/panduan" element={<Suspense fallback={null}><Info kind="guide" /></Suspense>} />
        <Route path="/template" element={<Suspense fallback={null}><Info kind="templates" /></Suspense>} />
        <Route path="/bantuan" element={<Suspense fallback={null}><Info kind="help" /></Suspense>} />
        <Route path="/status" element={<Suspense fallback={null}><Info kind="status" /></Suspense>} />
        <Route path="/app" element={<RequireAuth>{<AppShell />}</RequireAuth>}>
          <Route index element={<Home />} />
          <Route path="superadmin" element={<Guarded path="/app/superadmin"><Superadmin /></Guarded>} />
          <Route path="pos" element={<Guarded path="/app/pos"><POS /></Guarded>} />
          <Route path="inventory" element={<Guarded path="/app/inventory"><Inventory /></Guarded>} />
          <Route path="finance" element={<Guarded path="/app/finance"><Finance /></Guarded>} />
          <Route path="settings" element={<Guarded path="/app/settings"><Settings /></Guarded>} />
          <Route path="crm" element={<Guarded path="/app/crm"><Crm /></Guarded>} />
          <Route path="procurement" element={<Guarded path="/app/procurement"><Procurement /></Guarded>} />
          <Route path="manufacturing" element={<Guarded path="/app/manufacturing"><Manufacturing /></Guarded>} />
          <Route path="accounting" element={<Guarded path="/app/accounting"><Accounting /></Guarded>} />
          <Route path="billing" element={<Guarded path="/app/billing"><Billing /></Guarded>} />
          <Route path="banking" element={<Guarded path="/app/banking"><Banking /></Guarded>} />
          <Route path="assets" element={<Guarded path="/app/assets"><Assets /></Guarded>} />
          <Route path="approvals" element={<Guarded path="/app/approvals"><Approvals /></Guarded>} />
          <Route path="hrm" element={<Guarded path="/app/hrm"><Hrm /></Guarded>} />
          <Route path="operations" element={<Guarded path="/app/operations"><Operations /></Guarded>} />
          <Route path="iot" element={<Guarded path="/app/iot"><Iot /></Guarded>} />
          <Route path="audit" element={<Guarded path="/app/audit"><Audit /></Guarded>} />
          <Route path="notifications" element={<Guarded path="/app/notifications"><Notifications /></Guarded>} />
        </Route>
        <Route path="*" element={<Navigate to={user ? homePathFor(user.role) : '/'} replace />} />
      </Routes>
      <InstallBanner />
      <Toasts />
    </>
  );
}


