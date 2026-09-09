import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import { InstallBanner } from './components/pwa/InstallBanner';
import { subscribeToStateChanges } from './lib/broadcast';
import Dashboard from './pages/Dashboard';
import Finance from './pages/Finance';
import Inventory from './pages/Inventory';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Notifications from './pages/Notifications';
import Onboarding from './pages/Onboarding';
import POS from './pages/POS';
import Settings from './pages/Settings';
import Superadmin from './pages/Superadmin';
import { homePathFor, useAuthStore } from './stores/authStore';
import { useBusinessStore } from './stores/businessStore';
import type { Role } from './types';

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

export default function App() {
  const user = useAuthStore((s) => s.user);

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
        <Route path="/app" element={<RequireAuth>{<AppShell />}</RequireAuth>}>
          <Route index element={<Home />} />
          <Route
            path="superadmin"
            element={
              <RequireRole roles={['superadmin']}>
                <Superadmin />
              </RequireRole>
            }
          />
          <Route
            path="pos"
            element={
              <RequireRole roles={['superadmin', 'manager', 'cashier']}>
                <POS />
              </RequireRole>
            }
          />
          <Route
            path="inventory"
            element={
              <RequireRole roles={['superadmin', 'owner', 'manager', 'staff']}>
                <Inventory />
              </RequireRole>
            }
          />
          <Route
            path="finance"
            element={
              <RequireRole roles={['superadmin', 'owner']}>
                <Finance />
              </RequireRole>
            }
          />
          <Route
            path="settings"
            element={
              <RequireRole roles={['superadmin', 'owner']}>
                <Settings />
              </RequireRole>
            }
          />
          <Route path="notifications" element={<Notifications />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? homePathFor(user.role) : '/'} replace />} />
      </Routes>
      <InstallBanner />
    </>
  );
}


