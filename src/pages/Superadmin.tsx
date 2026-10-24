import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../components/icons/Icon';
import { Reveal } from '../components/Reveal';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input, Select, Textarea } from '../components/ui/controls';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { Stat } from '../components/ui/Stat';
import { Tabs } from '../components/ui/Tabs';
import { Toggle } from '../components/ui/Toggle';
import { apiFetch } from '../lib/api';
import {
  cn,
  formatDate,
  formatDateTime,
  formatIDR,
  formatIDRCompact,
  formatNumber,
  timeAgo,
} from '../lib/format';
import { isValidUuid } from '../lib/onesignal';
import { maskApiKey } from '../lib/security';
import { AVAILABLE_NIM_MODELS, FALLBACK_OPTIONS, useAiConfigStore } from '../stores/aiConfigStore';
import { IntakeTab } from '../components/superadmin/IntakeTab';
import { OnboardingTab } from '../components/superadmin/OnboardingTab';
import { useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../stores/businessStore';
import { useOneSignalStore, type OneSignalChannels, type PushBroadcastRecord } from '../stores/oneSignalStore';
import { useSyncStore } from '../stores/syncStore';
import { toast } from '../stores/toastStore';
import type { IndustryTemplate, NotificationType, Role, SubscriptionPlan, Tenant, User } from '../types';

// ── Kontrak data dari GET /v1/superadmin/overview ───────────────────────────

interface ApiTenant extends Tenant {
  status: 'active' | 'suspended' | 'trial';
  modules: Record<string, boolean>;
  /** Dari langganan yang sebenarnya dipakai login dan AI (opsional: server lama tidak mengirimnya). */
  access_mode?: 'full' | 'read_only' | 'suspended';
  trial_ends_at?: string | null;
  ai_quota_unlimited?: boolean;
}

interface ApiUser {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Record<string, boolean>;
  is_active: boolean;
  two_factor_enabled: boolean;
  outlet_id: string | null;
  created_at: string;
}

interface ApiAudit {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  action: string;
  category: 'auth' | 'transaction' | 'inventory' | 'system' | 'billing';
  details: string;
  ip_address: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
}

interface ApiDiagnostics {
  databaseStatus: string;
  dbLatencyMs: number;
  activeSessionsCount: number;
  uptimeSeconds: number;
  memoryRssMb: number;
  nimConfigured: boolean;
  nimBaseUrl: string;
  nimModel: string;
  oneSignalConfigured: boolean;
  checkedAt: string;
}

interface ApiOverview {
  tenants: ApiTenant[];
  users: ApiUser[];
  auditLogs: ApiAudit[];
  diagnostics: ApiDiagnostics;
}

type SuperadminTab = 'tenants' | 'intake' | 'onboarding' | 'users' | 'push' | 'audit' | 'system';

const tabOptions: Array<{ value: SuperadminTab; label: string }> = [
  { value: 'tenants', label: 'Tenant & Institusi' },
  { value: 'intake', label: 'Pengajuan Calon Klien' },
  { value: 'onboarding', label: 'Data Awal Klien' },
  { value: 'users', label: 'Pengguna Global' },
  { value: 'push', label: 'Push & Broadcast' },
  { value: 'audit', label: 'Audit & Keamanan' },
  { value: 'system', label: 'AI Engine & Server' },
];

const TENANT_PAGE_SIZE = 4;
const USER_PAGE_SIZE = 6;
const AUDIT_PAGE_SIZE = 8;
const HISTORY_PAGE_SIZE = 6;

const MODULE_CATALOG: Array<{ key: string; label: string; desc: string }> = [
  { key: 'inventory', label: 'Inventori', desc: 'Stok, gudang, dan stok opname' },
  { key: 'pos', label: 'Kasir POS', desc: 'Transaksi penjualan dan cetak struk' },
  { key: 'finance', label: 'Keuangan', desc: 'Laba rugi dan arus kas' },
  { key: 'assistant', label: 'Retalio Intelligence', desc: 'Asisten bisnis berbasis AI' },
  { key: 'production', label: 'Produksi', desc: 'Bill of materials dan batch produksi' },
  { key: 'booking', label: 'Booking & Jadwal', desc: 'Penjadwalan layanan pelanggan' },
];

const PUSH_CHANNELS: Array<{ key: keyof OneSignalChannels; label: string; desc: string; icon: IconName }> = [
  { key: 'lowStock', label: 'Stok Menipis', desc: 'Push otomatis saat stok menyentuh ambang minimum', icon: 'inventory' },
  { key: 'approval', label: 'Persetujuan Dokumen', desc: 'PO, jurnal, dan pengajuan yang menunggu keputusan', icon: 'clipboard' },
  { key: 'aiDigest', label: 'Digest AI', desc: 'Ringkasan anomali margin dan rekomendasi AI', icon: 'assistant' },
  { key: 'syncConflict', label: 'Konflik Sinkronisasi', desc: 'Antrean transaksi offline dan konflik merge data', icon: 'sync' },
  { key: 'broadcast', label: 'Broadcast Institusi', desc: 'Pengumuman manual dari Superadmin', icon: 'megaphone' },
];

const NOTIFICATION_TYPES: Array<{ value: NotificationType; label: string }> = [
  { value: 'insight_digest', label: 'Digest & Pengumuman' },
  { value: 'low_stock', label: 'Peringatan Stok' },
  { value: 'approval', label: 'Persetujuan Dokumen' },
  { value: 'sync_conflict', label: 'Konflik Sinkronisasi' },
];

const RBAC_PERMISSIONS: Array<{ key: string; label: string; desc: string }> = [
  { key: 'inventory:read', label: 'Baca Inventori', desc: 'Melihat stok dan riwayat pergerakan barang' },
  { key: 'inventory:write', label: 'Kelola Inventori', desc: 'Menerima barang, opname, dan penyesuaian stok' },
  { key: 'purchasing:read', label: 'Baca Pengadaan', desc: 'Melihat purchase order dan kebutuhan bahan' },
  { key: 'purchasing:write', label: 'Kelola Pengadaan', desc: 'Membuat dan mengirim purchase order' },
  { key: 'pos:read', label: 'Baca Transaksi POS', desc: 'Melihat riwayat penjualan kasir' },
  { key: 'pos:write', label: 'Kasir & Pembayaran', desc: 'Memproses transaksi dan pembayaran di kasir' },
  { key: 'finance:read', label: 'Baca Keuangan', desc: 'Melihat laba rugi dan arus kas' },
  { key: 'finance:write', label: 'Tulis Keuangan', desc: 'Mencatat jurnal dan penyesuaian akun' },
  { key: 'approvals:decide', label: 'Putuskan Approval', desc: 'Menyetujui atau menolak dokumen bertahap' },
  { key: 'ai:use', label: 'Pakai Retalio Intelligence', desc: 'Menggunakan asisten AI dan analisis' },
  { key: 'users:manage', label: 'Kelola Pengguna', desc: 'Menambah, mengubah, dan menonaktifkan akun' },
  { key: 'settings:write', label: 'Kelola Pengaturan', desc: 'Mengubah konfigurasi tenant dan modul' },
  { key: 'notifications:read', label: 'Baca Notifikasi', desc: 'Melihat kotak masuk notifikasi' },
  { key: 'outlets:read', label: 'Baca Outlet', desc: 'Melihat daftar cabang' },
  { key: 'outlets:write', label: 'Kelola Outlet', desc: 'Menambah dan mengubah cabang' },
  { key: 'audit:read', label: 'Baca Audit Log', desc: 'Melihat jejak aktivitas tenant' },
];

const roleBadgeColors: Record<Role, 'ink' | 'neutral' | 'accent' | 'outline'> = {
  superadmin: 'ink',
  owner: 'neutral',
  admin: 'neutral',
  manager: 'accent',
  cashier: 'outline',
  staff: 'outline',
};

const templateLabels: Record<IndustryTemplate, string> = {
  retail: 'Retail / F&B',
  manufacturing: 'Manufaktur & Bakery',
  services: 'Jasa & Perawatan',
};

const planLabels: Record<SubscriptionPlan, string> = {
  basic: 'Basic',
  plus_ai: 'Plus AI',
  custom: 'Enterprise',
};

const statusLabels: Record<'active' | 'suspended' | 'trial', string> = {
  active: 'Aktif',
  suspended: 'Suspended',
  trial: 'Masa Uji Coba',
};

function toCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function Superadmin() {
  const currentUser = useAuthStore((s) => s.user);
  const storeTenants = useBusinessStore((s) => s.allTenants);
  const storeUsers = useBusinessStore((s) => s.users);
  const switchActiveTenant = useBusinessStore((s) => s.switchActiveTenant);
  const upsertTenantInList = useBusinessStore((s) => s.upsertTenantInList);
  const updateUserById = useBusinessStore((s) => s.updateUserById);

  const isOnline = useSyncStore((s) => s.isOnline);
  const pendingSync = useSyncStore((s) => s.pendingLocal.length);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);

  const [tab, setTab] = useState<SuperadminTab>('tenants');
  const [overview, setOverview] = useState<ApiOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [focusTenantId, setFocusTenantId] = useState<string | null>(null);
  const [actionJournal, setActionJournal] = useState<ApiAudit[]>([]);
  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<ApiTenant | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);

  // ── Pemuatan data ─────────────────────────────────────────────────────────
  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<ApiOverview>('/v1/superadmin/overview');
      setOverview(data);
      setApiOnline(true);
    } catch (err) {
      setApiOnline(false);
      setLoadError(err instanceof Error ? err.message : 'Gagal menghubungi server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void useOneSignalStore.getState().syncConfigFromServer();
  }, []);

  const recordAction = useCallback((entry: { action: string; details: string; category: ApiAudit['category']; status: ApiAudit['status'] }) => {
    setActionJournal((prev) => [
      {
        id: `local-action-${Date.now()}-${prev.length}`,
        tenant_id: focusTenantId ?? 'semua-tenant',
        user_id: currentUser?.id ?? 'superadmin',
        user_name: currentUser?.name ?? 'Super Admin Retalio',
        action: entry.action,
        category: entry.category,
        details: entry.details,
        ip_address: '127.0.0.1 (perangkat ini)',
        timestamp: new Date().toISOString(),
        status: entry.status,
      },
      ...prev,
    ]);
  }, [currentUser, focusTenantId]);

  // Data tenant: dari server bila tersedia, jika tidak pakai data lokal perangkat.
  const tenants: ApiTenant[] = useMemo(() => {
    if (overview?.tenants?.length) return overview.tenants;
    return storeTenants.map((t) => ({ ...t, status: (t.status ?? 'active') as ApiTenant['status'], modules: {} }));
  }, [overview, storeTenants]);

  const users: ApiUser[] = useMemo(() => {
    if (overview?.users?.length) return overview.users;
    return storeUsers.map(
      (u): ApiUser => ({
        id: u.id,
        tenant_id: u.tenant_id,
        name: u.name,
        email: u.email,
        role: u.role,
        permissions: u.permissions ?? {},
        is_active: u.is_active !== false,
        two_factor_enabled: false,
        outlet_id: u.outlet_id ?? null,
        created_at: u.last_login ?? new Date().toISOString(),
      }),
    );
  }, [overview, storeUsers]);

  const allAuditLogs = useMemo<ApiAudit[]>(
    () => [...actionJournal, ...(overview?.auditLogs ?? [])],
    [actionJournal, overview],
  );

  const diagnostics: ApiDiagnostics | null = overview?.diagnostics ?? null;
  const focusedTenant = focusTenantId ? tenants.find((t) => t.id === focusTenantId) ?? null : null;

  // ── Statistik (semua angka berasal dari API atau store, tidak ada tebakan) ──
  const activeTenants = tenants.filter((t) => t.status === 'active').length;
  const suspendedTenants = tenants.filter((t) => t.status === 'suspended').length;
  const trialTenants = tenants.filter((t) => t.status === 'trial').length;
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.is_active).length;
  const totalRevenue = tenants.reduce((acc, t) => acc + (t.monthly_revenue ?? 0), 0);
  const totalAiTokens = tenants.reduce((acc, t) => acc + (t.ai_quota_used ?? 0), 0);
  const totalAiQuota = tenants.reduce((acc, t) => acc + (t.ai_quota_limit ?? 0), 0);

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      <Reveal>
        <PageHeader
          title="Superadmin Institusi"
          subtitle="Kontrol penuh lintas tenant: status institusi, akun global, push OneSignal, jejak audit, dan diagnostik server."
          actions={
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                icon="sync"
                disabled={isLoading}
                onClick={() => void loadOverview()}
              >
                {isLoading ? 'Memuat...' : 'Muat Ulang'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon="plus"
                onClick={() => {
                  if (tab === 'users') setUserModalOpen(true);
                  else if (tab === 'tenants') setTenantModalOpen(true);
                  else setTab('tenants');
                }}
              >
                {tab === 'users' ? 'Buat Akun' : tab === 'tenants' ? 'Daftarkan Tenant' : 'Kelola Tenant'}
              </Button>
            </div>
          }
        />
      </Reveal>

      {/* Status koneksi: apa yang terlihat di layar ini dan dari mana asalnya */}
      <Reveal delay={0.02}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3">
          <Card className="p-3.5 sm:p-4 flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-sand inline-flex items-center justify-center shrink-0">
              <Icon name="layers" size={16} className="text-smoke" />
            </span>
            <div className="min-w-0">
              <p className="text-caption text-fossil">Sumber Data</p>
              <p className="text-[15px] font-medium text-ink mt-0.5">
                {apiOnline ? 'Server PostgreSQL' : 'Cache Lokal Perangkat'}
              </p>
              <p className="text-caption text-pebble mt-0.5">
                {apiOnline
                  ? diagnostics
                    ? `Latensi ${formatNumber(diagnostics.dbLatencyMs)} ms`
                    : 'Terhubung ke API'
                  : 'Server tidak merespons, tampil data perangkat ini'}
              </p>
            </div>
          </Card>
          <Card className="p-3.5 sm:p-4 flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-sand inline-flex items-center justify-center shrink-0">
              <Icon name={isOnline ? 'online' : 'offline'} size={16} className="text-smoke" />
            </span>
            <div className="min-w-0">
              <p className="text-caption text-fossil">Jaringan Perangkat</p>
              <p className="text-[15px] font-medium text-ink mt-0.5">
                {isOnline ? 'Online' : 'Offline'}
              </p>
              <p className="text-caption text-pebble mt-0.5">
                {pendingSync > 0
                  ? `${formatNumber(pendingSync)} transaksi mengantre`
                  : lastSyncAt
                    ? `Sinkron ${timeAgo(lastSyncAt)}`
                    : 'Belum ada sinkron'}
              </p>
            </div>
          </Card>
          <Card className="p-3.5 sm:p-4 flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-sand inline-flex items-center justify-center shrink-0">
              <Icon name="bell" size={16} className="text-smoke" />
            </span>
            <div className="min-w-0">
              <p className="text-caption text-fossil">Kanal OneSignal</p>
              <p className="text-[15px] font-medium text-ink mt-0.5">
                {diagnostics?.oneSignalConfigured ? 'REST API Terhubung' : 'Belum Dikonfigurasi'}
              </p>
              <p className="text-caption text-pebble mt-0.5">
                {diagnostics?.oneSignalConfigured ? 'Broadcast cloud aktif' : 'Isi App ID di tab Push & Broadcast'}
              </p>
            </div>
          </Card>
          <Card className="p-3.5 sm:p-4 flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-sand inline-flex items-center justify-center shrink-0">
              <Icon name="assistant" size={16} className="text-smoke" />
            </span>
            <div className="min-w-0">
              <p className="text-caption text-fossil">AI Engine</p>
              <p className="text-[15px] font-medium text-ink mt-0.5">
                {diagnostics?.nimConfigured ? 'NVIDIA NIM Aktif' : 'Kunci API Kosong'}
              </p>
              <p className="text-caption text-pebble mt-0.5 truncate">
                {diagnostics ? diagnostics.nimModel : 'Belum diperiksa'}
              </p>
            </div>
          </Card>
        </div>
      </Reveal>

      {/* Statistik institusi */}
      <Reveal stagger={0.06}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 w-full min-w-0">
          <Stat
            label="Institusi Terdaftar"
            value={formatNumber(tenants.length)}
            hint={`${activeTenants} aktif, ${trialTenants} uji coba, ${suspendedTenants} suspended`}
          />
          <Stat
            label="Akun Global"
            value={formatNumber(totalUsers)}
            hint={`${formatNumber(activeUsers)} akun aktif`}
          />
          <Stat
            label="Omset Terpantau"
            value={formatIDRCompact(totalRevenue)}
            hint="akumulasi seluruh tenant"
          />
          <Stat
            label="Kuota AI Terpakai"
            value={`${formatNumber(totalAiTokens)} / ${formatNumber(totalAiQuota)}`}
            hint="token lintas tenant"
          />
        </div>
      </Reveal>

      {/* Banner fokus tenant */}
      {focusedTenant && (
        <Reveal delay={0.01}>
          <Card className="bg-chartreuse/25 border-ink/25 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Icon name="target" size={18} className="text-ink mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-ink">
                  Fokus tenant: {focusedTenant.name}
                </p>
                <p className="text-caption text-smoke mt-0.5">
                  Semua tab difilter ke institusi ini. Ruang kerja aktif di topbar ikut berpindah.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="close"
              className="shrink-0"
              onClick={() => {
                setFocusTenantId(null);
                recordAction({
                  action: 'SUPERADMIN_TENANT_FOCUS_CLEAR',
                  details: 'Superadmin keluar dari fokus tenant dan kembali melihat seluruh institusi.',
                  category: 'system',
                  status: 'success',
                });
              }}
            >
              Lihat Semua Tenant
            </Button>
          </Card>
        </Reveal>
      )}

      <Tabs options={tabOptions} value={tab} onChange={setTab} />

      {/* Tab 1: Tenant & Institusi */}
      {tab === 'tenants' && (
        <TenantsTab
          tenants={tenants}
          focusTenantId={focusTenantId}
          onFocus={setFocusTenantId}
          onManage={(t) => setEditingTenant(t)}
          onStatusToggle={(t) => void toggleTenantStatus(t)}
          isLoading={isLoading}
          loadError={loadError}
          onRetry={() => void loadOverview()}
          onSwitchWorkspace={(t) => {
            const active = switchActiveTenant(t.id);
            if (active) {
              setFocusTenantId(t.id);
              toast({
                title: `Ruang kerja berpindah ke ${active.name}`,
                description: 'Data ERP yang tampil sekarang milik tenant tersebut.',
                icon: 'store',
              });
            }
          }}
        />
      )}

      {/* Tab 2: Pengguna Global */}
      {tab === 'users' && (
        <UsersTab
          users={users}
          tenants={tenants}
          focusTenantId={focusTenantId}
          currentUserId={currentUser?.id}
          onManage={(u) => setEditingUser(u)}
          onRevokeSessions={(u) => void revokeSessions(u)}
          onAdd={() => setUserModalOpen(true)}
        />
      )}

      {/* Pengajuan calon klien dari Google Form + analisis AI */}
      {tab === 'intake' && <IntakeTab />}

      {/* Data awal klien dari Google Form 2 (setelah berlangganan) */}
      {tab === 'onboarding' && <OnboardingTab />}

      {/* Tab 3: Push & Broadcast OneSignal */}
      {tab === 'push' && <PushTab tenants={tenants} />}

      {/* Tab 4: Audit & Keamanan */}
      {tab === 'audit' && (
        <AuditTab
          logs={allAuditLogs}
          tenants={tenants}
          focusTenantId={focusTenantId}
          onClearFocus={() => setFocusTenantId(null)}
        />
      )}

      {/* Tab 5: AI Engine & Server */}
      {tab === 'system' && (
        <SystemTab
          diagnostics={diagnostics}
          isOnline={isOnline}
          pendingSync={pendingSync}
          lastSyncAt={lastSyncAt}
          tenants={tenants}
        />
      )}

      {/* Modal Tenant */}
      <TenantFormModal
        open={tenantModalOpen}
        onClose={() => setTenantModalOpen(false)}
        onSubmit={async (payload) => {
          const created = await createTenant(payload);
          if (!created) return false;
          setTenantModalOpen(false);
          await loadOverview();
          return true;
        }}
      />

      <TenantCommandModal
        tenant={editingTenant}
        onClose={() => setEditingTenant(null)}
        onSaved={async (next) => {
          upsertTenantInList(next);
          setEditingTenant(null);
          await loadOverview();
        }}
        onDeleted={(id, name) => {
          setEditingTenant(null);
          if (focusTenantId === id) setFocusTenantId(null);
          useBusinessStore.getState().deleteTenantFromList(id);
          toast({ title: `Tenant ${name} dihapus dari daftar lokal`, icon: 'trash' });
          recordAction({
            action: 'SUPERADMIN_TENANT_REMOVED',
            details: `Tenant ${name} dihapus dari daftar lokal perangkat. Data server tidak ikut terhapus.`,
            category: 'system',
            status: 'warning',
          });
          void loadOverview();
        }}
      />

      <UserFormModal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        tenants={tenants}
        onSubmit={async (payload) => {
          const created = await createUser(payload);
          if (!created) return false;
          setUserModalOpen(false);
          await loadOverview();
          return true;
        }}
      />

      <UserCommandModal
        user={editingUser}
        tenants={tenants}
        currentUserId={currentUser?.id}
        onClose={() => setEditingUser(null)}
        onSaved={async (next) => {
          updateUserById(next.id, {
            name: next.name,
            email: next.email,
            role: next.role,
            permissions: next.permissions,
            is_active: next.is_active,
          });
          setEditingUser(null);
          await loadOverview();
        }}
      />
    </div>
  );

  // ── Aksi tenant & pengguna (backend dulu, lalu store lokal) ────────────────
  function toggleTenantStatus(t: ApiTenant) {
    const nextStatus = t.status === 'suspended' ? 'active' : 'suspended';
    upsertTenantInList({ ...t, status: nextStatus });
    recordAction({
      action: 'SUPERADMIN_TENANT_STATUS',
      details: `Status ${t.name} diubah dari ${statusLabels[t.status]} menjadi ${statusLabels[nextStatus]}.`,
      category: 'system',
      status: nextStatus === 'suspended' ? 'warning' : 'success',
    });
    if (apiOnline) {
      void apiFetch(`/v1/superadmin/tenants/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
        .then(() => {
          toast({ title: `${t.name} kini ${statusLabels[nextStatus]}`, icon: nextStatus === 'suspended' ? 'warning' : 'check' });
          void loadOverview();
        })
        .catch((err) => {
          toast({
            title: 'Server menolak perubahan status',
            description: err instanceof Error ? err.message : undefined,
            icon: 'warning',
          });
        });
    } else {
      toast({ title: `${t.name} kini ${statusLabels[nextStatus]} (lokal)`, icon: 'check' });
    }
  }

  async function createTenant(payload: {
    name: string;
    industryTemplate: IndustryTemplate;
    subscriptionPlan: SubscriptionPlan;
    outletName: string;
  }): Promise<ApiTenant | null> {
    if (!payload.name.trim()) {
      toast({ title: 'Nama institusi wajib diisi', icon: 'warning' });
      return null;
    }
    const local: ApiTenant = {
      id: `tenant-lokal-${Date.now().toString().slice(-6)}`,
      name: payload.name.trim(),
      industry_template: payload.industryTemplate,
      subscription_plan: payload.subscriptionPlan,
      status: 'active',
      created_at: new Date().toISOString(),
      monthly_revenue: 0,
      outlets_count: 1,
      users_count: 1,
      ai_quota_used: 0,
      ai_quota_limit: payload.subscriptionPlan === 'basic' ? 0 : payload.subscriptionPlan === 'plus_ai' ? 3000 : 25000,
      modules: {},
      settings: { currency: 'IDR', timezone: 'Asia/Jakarta' },
    };
    upsertTenantInList(local);
    recordAction({
      action: 'SUPERADMIN_TENANT_CREATED',
      details: `Institusi ${local.name} didaftarkan dengan paket ${planLabels[local.subscription_plan]}.`,
      category: 'system',
      status: 'success',
    });

    if (apiOnline) {
      try {
        const res = await apiFetch<ApiTenant>('/v1/superadmin/tenants', {
          method: 'POST',
          body: JSON.stringify({
            name: payload.name.trim(),
            industryTemplate: payload.industryTemplate,
            subscriptionPlan: payload.subscriptionPlan,
            outletName: payload.outletName.trim() || undefined,
          }),
        });
        upsertTenantInList({ ...local, ...res, modules: res.modules ?? {} });
        toast({ title: `Tenant ${res.name} terdaftar di server`, icon: 'check' });
        return { ...local, ...res, modules: res.modules ?? {} };
      } catch (err) {
        toast({
          title: 'Pendaftaran lokal tersimpan, server menolak',
          description: err instanceof Error ? err.message : undefined,
          icon: 'warning',
        });
      }
    } else {
      toast({ title: `Tenant ${local.name} didaftarkan pada data lokal`, icon: 'check' });
    }
    return local;
  }

  async function createUser(payload: {
    name: string;
    email: string;
    role: Role;
    targetTenantId: string;
    password: string;
  }): Promise<ApiUser | null> {
    if (!payload.name.trim() || !payload.email.trim()) {
      toast({ title: 'Nama dan email wajib diisi', icon: 'warning' });
      return null;
    }
    if (!/^\S+@\S+\.\S+$/.test(payload.email.trim())) {
      toast({ title: 'Format email belum benar', icon: 'warning' });
      return null;
    }
    if (apiOnline) {
      try {
        const res = await apiFetch<{ user: ApiUser; temporaryPassword: string }>('/v1/superadmin/users', {
          method: 'POST',
          body: JSON.stringify({
            name: payload.name.trim(),
            email: payload.email.trim().toLowerCase(),
            role: payload.role,
            targetTenantId: payload.targetTenantId,
            password: payload.password.trim() || undefined,
          }),
        });
        recordAction({
          action: 'SUPERADMIN_USER_CREATED',
          details: `Akun ${res.user.email} dibuat dengan peran ${res.user.role.toUpperCase()}.`,
          category: 'system',
          status: 'success',
        });
        toast({
          title: `Akun ${res.user.name} dibuat`,
          description: `Kata sandi sementara: ${res.temporaryPassword}`,
          icon: 'check',
        });
        return res.user;
      } catch (err) {
        toast({
          title: 'Gagal membuat akun di server',
          description: err instanceof Error ? err.message : undefined,
          icon: 'warning',
        });
        return null;
      }
    }

    const local: ApiUser = {
      id: `u-lokal-${Date.now().toString().slice(-6)}`,
      tenant_id: payload.targetTenantId,
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      role: payload.role,
      permissions: {},
      is_active: true,
      two_factor_enabled: false,
      outlet_id: null,
      created_at: new Date().toISOString(),
    };
    useBusinessStore.getState().addUser({
      id: local.id,
      tenant_id: local.tenant_id,
      name: local.name,
      email: local.email,
      role: local.role,
      permissions: {},
      is_active: true,
      password: payload.password.trim() || undefined,
    });
    recordAction({
      action: 'SUPERADMIN_USER_CREATED',
      details: `Akun ${local.email} dibuat pada data lokal perangkat.`,
      category: 'system',
      status: 'warning',
    });
    toast({ title: `Akun ${local.name} dibuat pada data lokal`, icon: 'check' });
    return local;
  }

  async function revokeSessions(u: ApiUser) {
    recordAction({
      action: 'SUPERADMIN_SESSION_REVOKED',
      details: `Seluruh sesi aktif milik ${u.email} dicabut.`,
      category: 'auth',
      status: 'warning',
    });
    if (apiOnline) {
      try {
        await apiFetch(`/v1/superadmin/users/${u.id}/revoke-sessions`, { method: 'POST' });
        toast({ title: `Sesi ${u.name} dicabut`, description: 'Token lama ditolak di request berikutnya.', icon: 'lock' });
        return;
      } catch (err) {
        toast({
          title: 'Server menolak pencabutan sesi',
          description: err instanceof Error ? err.message : undefined,
          icon: 'warning',
        });
        return;
      }
    }
    toast({ title: `Pencabutan sesi dicatat lokal untuk ${u.name}`, icon: 'lock' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Tenant & Institusi
// ─────────────────────────────────────────────────────────────────────────────

function TenantsTab({
  tenants,
  focusTenantId,
  onFocus,
  onManage,
  onStatusToggle,
  onSwitchWorkspace,
  isLoading,
  loadError,
  onRetry,
}: {
  tenants: ApiTenant[];
  focusTenantId: string | null;
  onFocus: (id: string | null) => void;
  onManage: (tenant: ApiTenant) => void;
  onStatusToggle: (tenant: ApiTenant) => void;
  onSwitchWorkspace: (tenant: ApiTenant) => void;
  isLoading: boolean;
  loadError: string | null;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | SubscriptionPlan>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants.filter((t) => {
      if (focusTenantId && t.id !== focusTenantId) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (planFilter !== 'all' && t.subscription_plan !== planFilter) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
    });
  }, [tenants, query, statusFilter, planFilter, focusTenantId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TENANT_PAGE_SIZE));
  const paged = filtered.slice((page - 1) * TENANT_PAGE_SIZE, page * TENANT_PAGE_SIZE);

  if (isLoading && tenants.length === 0) {
    return (
      <Card className="p-6" aria-busy="true">
        <div className="flex items-center gap-3 text-smoke">
          <Icon name="sync" size={18} className="animate-spin" />
          <p className="text-body-sm">Memuat data institusi dari server...</p>
        </div>
      </Card>
    );
  }

  if (loadError && tenants.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="warning"
          title="Data institusi gagal dimuat"
          body={`${loadError}. Periksa apakah backend berjalan, lalu muat ulang.`}
          action={
            <Button variant="primary" icon="sync" onClick={onRetry}>
              Muat Ulang Data
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full">
        <div className="relative flex-1 min-w-0">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama institusi atau ID tenant..."
            aria-label="Cari tenant"
            className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-8 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
          />
          {query && (
            <button
              type="button"
              aria-label="Bersihkan pencarian"
              onClick={() => {
                setQuery('');
                setPage(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 -m-1 text-fossil hover:text-ink transition-colors"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <Select
          value={statusFilter}
          aria-label="Filter status tenant"
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="trial">Masa Uji Coba</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Select
          value={planFilter}
          aria-label="Filter paket tenant"
          onChange={(e) => {
            setPlanFilter(e.target.value as typeof planFilter);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="all">Semua Paket</option>
          <option value="basic">Basic</option>
          <option value="plus_ai">Plus AI</option>
          <option value="custom">Enterprise</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="search"
            title="Tidak ada institusi yang cocok"
            body={
              focusTenantId
                ? 'Fokus tenant aktif membatasi hasil. Klearifikasi fokus untuk melihat institusi lain.'
                : 'Ubah kata kunci atau atur ulang filter status dan paket untuk melihat institusi lain.'
            }
            action={
              <Button
                variant="ghost"
                icon="close"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('all');
                  setPlanFilter('all');
                  onFocus(null);
                }}
              >
                Atur Ulang Filter
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3 w-full min-w-0">
          {paged.map((t) => {
            const quotaUsed = t.ai_quota_used ?? 0;
            const quotaLimit = t.ai_quota_limit ?? 0;
            const quotaPct = quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0;
            const activeModules = Object.values(t.modules ?? {}).filter(Boolean).length;
            const moduleTotal = Object.keys(t.modules ?? {}).length;
            const isSuspended = t.status === 'suspended';

            return (
              <Card
                key={t.id}
                className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full min-w-0 hover:border-pebble transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[17px] font-medium text-ink truncate">{t.name}</span>
                    <Badge variant="outline">{templateLabels[t.industry_template]}</Badge>
                    <Badge variant={t.subscription_plan === 'custom' ? 'ink' : 'neutral'}>
                      {planLabels[t.subscription_plan]}
                    </Badge>
                    <Badge variant={isSuspended ? 'ink' : t.status === 'trial' ? 'accent' : 'neutral'}>
                      {statusLabels[t.status]}
                    </Badge>
                    {t.access_mode === 'read_only' && <Badge variant="outline">Baca saja</Badge>}
                  </div>
                  <p className="text-caption text-fossil break-words">
                    <span className="font-mono">{t.id}</span>, sejak {formatDate(t.created_at ?? new Date().toISOString())},{' '}
                    {formatNumber(t.outlets_count ?? 0)} outlet, {formatNumber(t.users_count ?? 0)} akun
                    {moduleTotal > 0 && `, ${activeModules} dari ${moduleTotal} modul aktif`}
                    {t.trial_ends_at && `, trial berakhir ${formatDate(t.trial_ends_at)}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-caption text-smoke">
                    <span>
                      Omset <span className="tnum font-medium text-ink">{formatIDR(t.monthly_revenue ?? 0)}</span>/bln
                    </span>
                    <span className="flex items-center gap-1.5">
                      Kuota AI
                      <span className="inline-block w-16 sm:w-28 bg-sand rounded-full h-2 overflow-hidden align-middle">
                        <span className={cn('block h-full rounded-full', quotaPct >= 90 ? 'bg-ink' : 'bg-ink/70')} style={{ width: `${quotaPct}%` }} />
                      </span>
                      <span className="tnum">
                        {quotaLimit > 0 ? `${formatNumber(quotaUsed)}/${formatNumber(quotaLimit)} (${quotaPct}%)` : 'Tanpa kuota'}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-sand">
                  <Button variant="subtle" size="sm" icon="store" onClick={() => onSwitchWorkspace(t)}>
                    Ruang Kerja
                  </Button>
                  <Button variant="ghost" size="sm" icon="settings" onClick={() => onManage(t)}>
                    Kelola
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={isSuspended ? 'check' : 'lock'}
                    onClick={() => onStatusToggle(t)}
                  >
                    {isSuspended ? 'Aktifkan' : 'Suspend'}
                  </Button>
                </div>
              </Card>
            );
          })}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={TENANT_PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Pengguna Global
// ─────────────────────────────────────────────────────────────────────────────

function UsersTab({
  users,
  tenants,
  focusTenantId,
  currentUserId,
  onManage,
  onRevokeSessions,
  onAdd,
}: {
  users: ApiUser[];
  tenants: ApiTenant[];
  focusTenantId: string | null;
  currentUserId?: string;
  onManage: (user: ApiUser) => void;
  onRevokeSessions: (user: ApiUser) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (focusTenantId && u.tenant_id !== focusTenantId) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (tenantFilter !== 'all' && u.tenant_id !== tenantFilter) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, query, roleFilter, tenantFilter, focusTenantId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / USER_PAGE_SIZE));
  const paged = filtered.slice((page - 1) * USER_PAGE_SIZE, page * USER_PAGE_SIZE);
  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? 'Tenant tidak ditemukan';

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full">
        <div className="relative flex-1 min-w-0">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama pengguna atau email..."
            aria-label="Cari pengguna"
            className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-8 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
          />
          {query && (
            <button
              type="button"
              aria-label="Bersihkan pencarian"
              onClick={() => {
                setQuery('');
                setPage(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 -m-1 text-fossil hover:text-ink transition-colors"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <Select
          value={roleFilter}
          aria-label="Filter peran pengguna"
          onChange={(e) => {
            setRoleFilter(e.target.value as typeof roleFilter);
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="all">Semua Peran</option>
          <option value="superadmin">Superadmin</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="cashier">Kasir</option>
          <option value="staff">Staff</option>
        </Select>
        <Select
          value={tenantFilter}
          aria-label="Filter tenant pengguna"
          onChange={(e) => {
            setTenantFilter(e.target.value);
            setPage(1);
          }}
          className="sm:w-48"
        >
          <option value="all">Semua Tenant</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="users"
            title="Belum ada akun yang cocok"
            body="Atur ulang filter, atau buat akun baru bila institusi ini belum punya admin."
            action={
              <Button variant="primary" icon="plus" onClick={onAdd}>
                Buat Akun Baru
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden w-full min-w-0">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ash text-caption text-fossil font-normal">
                  <th scope="col" className="px-4 sm:px-6 py-3">Nama &amp; Email</th>
                  <th scope="col" className="px-4 sm:px-6 py-3">Institusi</th>
                  <th scope="col" className="px-4 sm:px-6 py-3">Peran</th>
                  <th scope="col" className="px-4 sm:px-6 py-3">Status</th>
                  <th scope="col" className="px-4 sm:px-6 py-3">Terakhir Aktif</th>
                  <th scope="col" className="px-4 sm:px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {paged.map((u) => (
                  <tr key={u.id} className="hover:bg-sand/30 transition-colors">
                    <td className="px-4 sm:px-6 py-3.5">
                      <p className="text-[14.5px] font-medium text-ink">{u.name}</p>
                      <p className="text-caption text-fossil break-all">{u.email}</p>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 text-[14px] text-ink">{tenantName(u.tenant_id)}</td>
                    <td className="px-4 sm:px-6 py-3.5">
                      <Badge variant={roleBadgeColors[u.role]}>{u.role.toUpperCase()}</Badge>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5">
                      <Badge variant={u.is_active ? 'neutral' : 'ink'}>
                        {u.is_active ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 text-caption text-fossil">{timeAgo(u.created_at)}</td>
                    <td className="px-4 sm:px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <Button variant="ghost" size="sm" icon="edit" onClick={() => onManage(u)}>
                          Kelola
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="lock"
                          disabled={u.id === currentUserId}
                          title={u.id === currentUserId ? 'Tidak bisa mencabut sesi akun sendiri' : undefined}
                          onClick={() => onRevokeSessions(u)}
                        >
                          Putuskan Sesi
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 sm:px-6 pb-4">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={USER_PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3: Push & Broadcast OneSignal
// ─────────────────────────────────────────────────────────────────────────────

function PushTab({ tenants }: { tenants: ApiTenant[] }) {
  const appId = useOneSignalStore((s) => s.appId);
  const restApiKey = useOneSignalStore((s) => s.restApiKey);
  const safariWebId = useOneSignalStore((s) => s.safariWebId);
  const enabled = useOneSignalStore((s) => s.enabled);
  const channels = useOneSignalStore((s) => s.channels);
  const permissionStatus = useOneSignalStore((s) => s.permissionStatus);
  const isSubscribed = useOneSignalStore((s) => s.isSubscribed);
  const subscriptionId = useOneSignalStore((s) => s.subscriptionId);
  const provider = useOneSignalStore((s) => s.provider);
  const lastError = useOneSignalStore((s) => s.lastError);
  const history = useOneSignalStore((s) => s.broadcastHistory);

  const [formAppId, setFormAppId] = useState(appId);
  const [formKey, setFormKey] = useState(restApiKey);
  const [formSafariId, setFormSafariId] = useState(safariWebId);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const [form, setForm] = useState({
    title: '',
    body: '',
    type: 'insight_digest' as NotificationType,
    link: '/app/notifications',
    targetTenantId: 'all',
    targetRole: 'all',
  });

  const currentUser = useAuthStore((s) => s.user);
  const appIdValid = formAppId.trim() === '' || isValidUuid(formAppId.trim());
  const keyLooksValid = formKey.trim() === '' || /^(os_v2_|Basic |Key )/.test(formKey.trim());

  useEffect(() => setFormAppId(appId), [appId]);
  useEffect(() => setFormSafariId(safariWebId), [safariWebId]);

  const historyTotalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const pagedHistory = history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  const saveConfig = async () => {
    if (!appIdValid) {
      toast({ title: 'App ID harus berupa UUID lengkap', icon: 'warning' });
      return;
    }
    if (!keyLooksValid) {
      toast({ title: 'REST API Key tidak dikenali', description: 'Kunci OneSignal diawali os_v2_, atau header Key dan Basic.', icon: 'warning' });
      return;
    }
    setIsSaving(true);
    const res = await useOneSignalStore.getState().saveMasterConfig({
      enabled,
      appId: formAppId,
      restApiKey: formKey,
      safariWebId: formSafariId,
      channels,
    });
    setIsSaving(false);
    toast({ title: res.ok ? 'Konfigurasi OneSignal disimpan' : 'Konfigurasi ditolak', description: res.message, icon: res.ok ? 'check' : 'warning' });
  };

  const enableOnDevice = async () => {
    if (!currentUser) return;
    setIsEnabling(true);
    const res = await useOneSignalStore.getState().enablePushForCurrentUser({
      id: currentUser.id,
      tenant_id: currentUser.tenant_id,
      role: currentUser.role,
      email: currentUser.email,
    });
    setIsEnabling(false);
    toast({
      title: res.granted ? 'Push aktif di perangkat ini' : 'Izin push belum diberikan',
      description: res.message,
      icon: res.granted ? 'check' : 'warning',
    });
  };

  const sendTest = async () => {
    if (!currentUser) return;
    setIsTesting(true);
    const res = await useOneSignalStore.getState().sendTestNotification({
      id: currentUser.id,
      tenant_id: currentUser.tenant_id,
      name: currentUser.name,
    });
    setIsTesting(false);
    toast({ title: 'Uji push diproses', description: res.message, icon: 'bell' });
  };

  const sendBroadcast = async () => {
    if (!currentUser) return;
    if (!form.title.trim() || !form.body.trim()) {
      toast({ title: 'Judul dan isi pengumuman wajib diisi', icon: 'warning' });
      return;
    }
    if (!channels.broadcast) {
      toast({
        title: 'Kanal broadcast dimatikan',
        description: 'Aktifkan kanal Broadcast Institusi sebelum mengirim pengumuman.',
        icon: 'warning',
      });
      return;
    }
    setIsBroadcasting(true);
    const res = await useOneSignalStore.getState().sendBroadcastNotification({
      title: form.title.trim(),
      body: form.body.trim(),
      type: form.type,
      link: form.link.trim() || '/app/notifications',
      targetTenantId: form.targetTenantId,
      targetRole: form.targetRole,
      sentBy: currentUser.name,
    });
    setIsBroadcasting(false);
    toast({
      title: 'Broadcast diproses',
      description: res.message,
      icon: 'megaphone',
    });
    setHistoryPage(1);
  };

  return (
    <div className="space-y-5 w-full min-w-0">
      {/* Konfigurasi gateway */}
      <Card>
        <CardHeader
          title="Gateway OneSignal"
          subtitle="App ID dan REST API Key menghubungkan push Retalio ke cloud OneSignal."
          action={
            <Badge variant={enabled && appId ? 'accent' : 'outline'}>
              {enabled && appId ? 'Aktif' : 'Nonaktif'}
            </Badge>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-sand">
            <div className="min-w-0">
              <p className="text-[15px] text-ink font-medium">Kirim push ke pengguna</p>
              <p className="text-caption text-fossil mt-0.5">
                Menghentikan seluruh pengiriman OneSignal tanpa menghapus riwayat.
              </p>
            </div>
            <Toggle
              checked={enabled}
              label="Aktifkan gateway OneSignal"
              onChange={(val) => {
                useOneSignalStore.setState({ enabled: val });
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Input
              label="OneSignal App ID"
              value={formAppId}
              onChange={(e) => setFormAppId(e.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
              hint={
                appIdValid
                  ? 'Disalin dari dashboard.onesignal.com pada bagian Application Settings.'
                  : 'Format App ID harus UUID dengan empat blok dipisah tanda hubung.'
              }
              className={cn('font-mono text-[14px]', !appIdValid && 'border-ink')}
            />
            <Input
              label="REST API Key"
              type="password"
              value={formKey}
              onChange={(e) => setFormKey(e.target.value)}
              placeholder="os_v2_app_xxxxxxxxxxxxxxxxxxxx"
              hint={
                keyLooksValid
                  ? 'Hanya disimpan di server. Nilai tersimpan ditampilkan tersensor.'
                  : 'REST API OneSignal diawali os_v2_ atau header Key/Basic.'
              }
              className={cn('font-mono text-[14px]', !keyLooksValid && 'border-ink')}
            />
            <Input
              label="Safari Web ID (opsional)"
              value={formSafariId}
              onChange={(e) => setFormSafariId(e.target.value)}
              placeholder="web.onesignal.auto.XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              hint="Wajib hanya bila，iOS Safari tidak mendapat push tanpa prompt."
              className="font-mono text-[14px]"
            />
            <div className="flex flex-col justify-end gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" icon="check" disabled={isSaving} onClick={saveConfig}>
                  {isSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                </Button>
                {restApiKey && (
                  <Badge variant="outline" className="self-center">
                    Tersimpan: {maskApiKey(restApiKey)}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-sand">
            <p className="text-caption text-fossil mb-2.5">Kanal notifikasi otomatis</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {PUSH_CHANNELS.map((ch) => (
                <div
                  key={ch.key}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-ash bg-paper"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Icon name={ch.icon} size={16} className="text-smoke mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-ink">{ch.label}</p>
                      <p className="text-[11.5px] text-fossil leading-snug mt-0.5">{ch.desc}</p>
                    </div>
                  </div>
                  <Toggle
                    checked={channels[ch.key]}
                    label={`Kanal ${ch.label}`}
                    onChange={(val) => {
                      useOneSignalStore.getState().setChannelToggle(ch.key, val);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Perangkat ini */}
      <Card>
        <CardHeader
          title="Perangkat Superadmin Ini"
          subtitle="Status izin push peramban yang dipakai sekarang."
          action={
            <Badge variant={permissionStatus === 'granted' ? 'accent' : permissionStatus === 'denied' ? 'ink' : 'outline'}>
              {permissionStatus === 'granted'
                ? 'Izin Diberikan'
                : permissionStatus === 'denied'
                  ? 'Izin Ditolak'
                  : 'Belum Ada Izin'}
            </Badge>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-sand/50 border border-ash">
              <p className="text-caption text-fossil">Sumber Langganan</p>
              <p className="text-[15px] text-ink mt-1">
                {provider === 'onesignal' ? 'OneSignal Cloud SDK' : provider === 'web_push_native' ? 'Browser Web Push' : 'Belum terdaftar'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-sand/50 border border-ash">
              <p className="text-caption text-fossil">ID Perangkat</p>
              <p className="text-[13px] font-mono text-ink mt-1 break-all">{subscriptionId ?? 'Belum ada'}</p>
            </div>
            <div className="p-3 rounded-xl bg-sand/50 border border-ash">
              <p className="text-caption text-fossil">Status Berlangganan</p>
              <p className="text-[15px] text-ink mt-1">{isSubscribed ? 'Aktif' : 'Tidak aktif'}</p>
            </div>
          </div>

          {lastError && (
            <p className="text-body-sm text-ink bg-sand/60 border border-ash rounded-lg px-3 py-2">{lastError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon="bell" disabled={isEnabling} onClick={enableOnDevice}>
              {isEnabling ? 'Meminta Izin...' : 'Aktifkan Push di Perangkat Ini'}
            </Button>
            <Button variant="ghost" size="sm" icon="megaphone" disabled={isTesting} onClick={sendTest}>
              {isTesting ? 'Mengirim...' : 'Kirim Uji Push'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Penyusun broadcast */}
      <Card>
        <CardHeader
          title="Broadcast Institusi"
          subtitle="Satu pesan terkirim lewat OneSignal dan kotak masuk notifikasi setiap tenant sasaran."
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Input
              label="Judul Pengumuman"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="mis. Jadwal Maintenance Server Hari Minggu"
              maxLength={140}
            />
            <Select
              label="Kategori Notifikasi"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as NotificationType }))}
            >
              {NOTIFICATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label="Isi Pengumuman"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Tuliskan informasi yang perlu diketahui seluruh pengguna sasaran."
            maxLength={1000}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Select
              label="Tenant Sasaran"
              value={form.targetTenantId}
              onChange={(e) => setForm((f) => ({ ...f, targetTenantId: e.target.value }))}
            >
              <option value="all">Semua Tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select
              label="Peran Sasaran"
              value={form.targetRole}
              onChange={(e) => setForm((f) => ({ ...f, targetRole: e.target.value }))}
            >
              <option value="all">Semua Peran</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="cashier">Kasir</option>
              <option value="staff">Staff</option>
            </Select>
            <Input
              label="Tujuan Deep Link"
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              placeholder="/app/notifications"
              hint="Halaman yang dibuka saat notifikasi diklik."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="megaphone" disabled={isBroadcasting} onClick={sendBroadcast}>
              {isBroadcasting ? 'Mengirim...' : 'Kirim Broadcast'}
            </Button>
            {!channels.broadcast && (
              <p className="text-caption text-fossil self-center">
                Aktifkan kanal Broadcast Institusi agar pengumuman tidak diblokir.
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Riwayat pengiriman */}
      <Card>
        <CardHeader title="Riwayat Pengiriman" subtitle="Catatan push yang dikirim dari panel ini dan dari server." />
        <CardBody>
          {history.length === 0 ? (
            <EmptyState
              icon="megaphone"
              title="Belum ada push yang dikirim"
              body="Kirim uji push atau broadcast di atas, lalu riwayatnya muncul di tabel ini."
            />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-ash text-caption text-fossil font-normal">
                    <th scope="col" className="px-4 py-3">Pesan</th>
                    <th scope="col" className="px-4 py-3">Sasaran</th>
                    <th scope="col" className="px-4 py-3">Kanal</th>
                    <th scope="col" className="px-4 py-3">Penerima</th>
                    <th scope="col" className="px-4 py-3">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand">
                  {pagedHistory.map((h: PushBroadcastRecord) => (
                    <tr key={h.id}>
                      <td className="px-4 py-3 max-w-[280px]">
                        <p className="text-[14px] font-medium text-ink break-words">{h.title}</p>
                        <p className="text-caption text-fossil break-words">{h.body}</p>
                      </td>
                      <td className="px-4 py-3 text-[13.5px] text-ink">
                        {h.targetTenantId === 'all' ? 'Semua tenant' : h.targetTenantId}
                        <span className="block text-caption text-fossil">Peran: {h.targetRole}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={h.mode === 'onesignal_live' ? 'accent' : 'neutral'}>
                          {h.mode === 'onesignal_live' ? 'OneSignal' : 'In-App'}
                        </Badge>
                        {h.errorMessage && (
                          <span className="block text-caption text-pebble mt-1 break-words">{h.errorMessage}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tnum text-[14px] text-ink">{formatNumber(h.recipients)}</td>
                      <td className="px-4 py-3 text-caption text-fossil">{timeAgo(h.sentAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={historyPage}
                totalPages={historyTotalPages}
                totalItems={history.length}
                pageSize={HISTORY_PAGE_SIZE}
                onPageChange={setHistoryPage}
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 4: Audit & Keamanan
// ─────────────────────────────────────────────────────────────────────────────

function AuditTab({
  logs,
  tenants,
  focusTenantId,
  onClearFocus,
}: {
  logs: ApiAudit[];
  tenants: ApiTenant[];
  focusTenantId: string | null;
  onClearFocus: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | ApiAudit['category']>('all');
  const [outcome, setOutcome] = useState<'all' | ApiAudit['status']>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ApiAudit | null>(null);

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (focusTenantId && l.tenant_id !== focusTenantId) return false;
      if (category !== 'all' && l.category !== category) return false;
      if (outcome !== 'all' && l.status !== outcome) return false;
      if (!q) return true;
      return (
        l.user_name.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.ip_address.toLowerCase().includes(q)
      );
    });
  }, [logs, query, category, outcome, focusTenantId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
  const paged = filtered.slice((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast({ title: 'Tidak ada baris untuk diekspor', icon: 'warning' });
      return;
    }
    const header = ['Waktu', 'Institusi', 'Pelaku', 'Aksi', 'Kategori', 'Hasil', 'IP', 'Detail'];
    const rows = filtered.map((l) => [
      l.timestamp,
      tenantName(l.tenant_id),
      l.user_name,
      l.action,
      l.category,
      l.status,
      l.ip_address,
      l.details,
    ]);
    const csv = [header, ...rows].map((row) => row.map(toCsvCell).join(',')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-retalio-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: `${formatNumber(filtered.length)} baris audit diunduh`, icon: 'download' });
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex flex-col lg:flex-row gap-2.5 sm:gap-3 w-full">
        <div className="relative flex-1 min-w-0">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Cari pelaku, aksi, IP, atau detail event..."
            aria-label="Cari audit log"
            className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-8 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
          />
          {query && (
            <button
              type="button"
              aria-label="Bersihkan pencarian"
              onClick={() => {
                setQuery('');
                setPage(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 -m-1 text-fossil hover:text-ink transition-colors"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <Select
          value={category}
          aria-label="Filter kategori audit"
          onChange={(e) => {
            setCategory(e.target.value as typeof category);
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="all">Semua Kategori</option>
          <option value="auth">Otentikasi</option>
          <option value="transaction">Transaksi &amp; POS</option>
          <option value="inventory">Inventori</option>
          <option value="billing">Keuangan</option>
          <option value="system">Sistem</option>
        </Select>
        <Select
          value={outcome}
          aria-label="Filter hasil audit"
          onChange={(e) => {
            setOutcome(e.target.value as typeof outcome);
            setPage(1);
          }}
          className="sm:w-36"
        >
          <option value="all">Semua Hasil</option>
          <option value="success">Berhasil</option>
          <option value="warning">Peringatan</option>
          <option value="error">Gagal</option>
        </Select>
        <Button variant="ghost" icon="download" onClick={exportCsv} className="shrink-0">
          Ekspor CSV
        </Button>
      </div>

      {focusTenantId && (
        <p className="text-caption text-fossil">
          Menampilkan log satu tenant saja.{' '}
          <button type="button" onClick={onClearFocus} className="underline text-ink hover:text-ink/70">
            Tampilkan semua tenant
          </button>
        </p>
      )}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon="shield"
            title="Tidak ada jejak audit yang cocok"
            body="Belum ada aktivitas yang cocok dengan filter, atau server belum mencatat audit log untuk tenant ini."
            action={
              <Button
                variant="ghost"
                icon="close"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                  setOutcome('all');
                  onClearFocus();
                }}
              >
                Atur Ulang Filter
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5 w-full min-w-0">
          {paged.map((log) => (
            <Card key={log.id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full min-w-0">
              <button
                type="button"
                onClick={() => setSelected(log)}
                className="flex-1 min-w-0 space-y-1 text-left hover:opacity-80 transition-opacity"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={log.status === 'success' ? 'neutral' : log.status === 'warning' ? 'accent' : 'ink'}>
                    {log.category.toUpperCase()}
                  </Badge>
                  <span className="text-[14.5px] font-medium text-ink font-mono break-all">{log.action}</span>
                  <span className="text-caption text-fossil">oleh {log.user_name}</span>
                </div>
                <p className="text-[14px] text-smoke leading-relaxed break-words">{log.details}</p>
                <p className="text-caption text-fossil break-words">
                  {tenantName(log.tenant_id)}, IP <span className="font-mono">{log.ip_address}</span>,{' '}
                  {formatDateTime(log.timestamp)}
                </p>
              </button>
              <Badge variant="outline" className="shrink-0">
                {log.status === 'success' ? 'BERHASIL' : log.status === 'warning' ? 'PERINGATAN' : 'GAGAL'}
              </Badge>
            </Card>
          ))}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={AUDIT_PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Detail Entri Audit" maxWidth="lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={selected.status === 'success' ? 'neutral' : selected.status === 'warning' ? 'accent' : 'ink'}>
                {selected.category.toUpperCase()}
              </Badge>
              <span className="font-mono text-[14px] text-ink break-all">{selected.action}</span>
            </div>
            <p className="text-body-sm text-smoke leading-relaxed">{selected.details}</p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-sm">
              <div className="p-3 rounded-lg bg-sand/50 border border-ash">
                <dt className="text-caption text-fossil">Pelaku</dt>
                <dd className="text-ink mt-0.5 break-words">{selected.user_name}</dd>
              </div>
              <div className="p-3 rounded-lg bg-sand/50 border border-ash">
                <dt className="text-caption text-fossil">Institusi</dt>
                <dd className="text-ink mt-0.5 break-words">{tenantName(selected.tenant_id)}</dd>
              </div>
              <div className="p-3 rounded-lg bg-sand/50 border border-ash">
                <dt className="text-caption text-fossil">Alamat IP</dt>
                <dd className="text-ink mt-0.5 font-mono break-all">{selected.ip_address}</dd>
              </div>
              <div className="p-3 rounded-lg bg-sand/50 border border-ash">
                <dt className="text-caption text-fossil">Waktu</dt>
                <dd className="text-ink mt-0.5">{formatDateTime(selected.timestamp)}</dd>
              </div>
            </dl>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 5: AI Engine & Server
// ─────────────────────────────────────────────────────────────────────────────

function SystemTab({
  diagnostics,
  isOnline,
  pendingSync,
  lastSyncAt,
  tenants,
}: {
  diagnostics: ApiDiagnostics | null;
  isOnline: boolean;
  pendingSync: number;
  lastSyncAt: string | null;
  tenants: ApiTenant[];
}) {
  const aiApiKey = useAiConfigStore((s) => s.apiKey);
  const setAiApiKey = useAiConfigStore((s) => s.setApiKey);
  const aiBaseUrl = useAiConfigStore((s) => s.baseUrl);
  const setAiBaseUrl = useAiConfigStore((s) => s.setBaseUrl);
  const aiPrimaryModel = useAiConfigStore((s) => s.primaryModel);
  const setAiPrimaryModel = useAiConfigStore((s) => s.setPrimaryModel);
  const aiFallbackModel = useAiConfigStore((s) => s.fallbackModel);
  const setAiFallbackModel = useAiConfigStore((s) => s.setFallbackModel);
  const aiTemperature = useAiConfigStore((s) => s.temperature);
  const setAiTemperature = useAiConfigStore((s) => s.setTemperature);
  const aiIsEnabled = useAiConfigStore((s) => s.isEnabled);
  const setAiIsEnabled = useAiConfigStore((s) => s.setIsEnabled);
  const testAiConnection = useAiConfigStore((s) => s.testConnection);
  const lastTestStatus = useAiConfigStore((s) => s.lastTestStatus);
  const lastTestLatency = useAiConfigStore((s) => s.lastTestLatency);
  const lastTestMessage = useAiConfigStore((s) => s.lastTestMessage);

  const [localKey, setLocalKey] = useState(aiApiKey);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [swState, setSwState] = useState<{ registered: boolean; scope: string | null }>({
    registered: false,
    scope: null,
  });

  useEffect(() => setLocalKey(aiApiKey), [aiApiKey]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => setSwState({ registered: Boolean(reg), scope: reg?.scope ?? null }))
      .catch(() => setSwState({ registered: false, scope: null }));
  }, []);

  const saveAiConfig = () => {
    setAiApiKey(localKey);
    toast({ title: 'Konfigurasi AI Engine tersimpan untuk sesi ini', icon: 'check' });
  };

  const runTest = async () => {
    setAiApiKey(localKey);
    setIsTesting(true);
    const res = await testAiConnection();
    setIsTesting(false);
    toast({
      title: res.success ? `Koneksi AI berhasil (${res.latency} ms)` : 'Koneksi AI gagal',
      description: res.success ? undefined : res.message,
      icon: res.success ? 'check' : 'warning',
    });
  };

  const quotasTight = tenants.filter(
    (t) => (t.ai_quota_limit ?? 0) > 0 && (t.ai_quota_used ?? 0) / (t.ai_quota_limit ?? 1) >= 0.9,
  );

  return (
    <div className="space-y-5 w-full min-w-0">
      {/* Master AI Engine */}
      <Card>
        <CardHeader
          title="Master AI Engine"
          subtitle="Seluruh tenant memakai kunci ini. Nilainya tidak pernah dikirim ke klien tenant biasa."
          action={
            <Badge variant={aiIsEnabled ? 'ink' : 'outline'} icon="assistant">
              {aiIsEnabled ? 'AI Aktif' : 'AI Nonaktif'}
            </Badge>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-sand">
            <div className="min-w-0">
              <p className="text-[15px] text-ink font-medium">Cluster inferensi</p>
              <p className="text-caption text-fossil mt-0.5">
                Menghentikan semua permintaan AI tanpa menghapus model dan kunci tersimpan.
              </p>
            </div>
            <Toggle
              checked={aiIsEnabled}
              label="Status cluster AI"
              onChange={(val) => {
                setAiIsEnabled(val);
                toast({ title: val ? 'Cluster AI diaktifkan' : 'Cluster AI dihentikan', icon: val ? 'check' : 'warning' });
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label htmlFor="sa-ai-key" className="text-caption text-fossil">
                Kunci API NVIDIA NIM
              </label>
              <div className="relative flex items-center">
                <input
                  id="sa-ai-key"
                  type={showKey ? 'text' : 'password'}
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  placeholder="nvapi-xxxxxxxxxxxxxxxx"
                  className="w-full bg-paper border border-pebble/70 rounded-lg pl-3 pr-24 py-2.5 text-[14px] font-mono placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 px-2 py-1.5 text-caption text-fossil hover:text-ink rounded bg-sand/70"
                >
                  {showKey ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <p className="text-caption text-fossil">
                {aiApiKey ? `Tersimpan: ${maskApiKey(aiApiKey)}` : 'Belum diisi. Ambil dari build.nvidia.com.'}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="sa-ai-base" className="text-caption text-fossil">
                Endpoint Inference
              </label>
              <input
                id="sa-ai-base"
                type="text"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="https://integrate.api.nvidia.com/v1"
                className="w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[14px] font-mono placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
              />
              <p className="text-caption text-fossil">Endpoint OpenAI-compatible milik NVIDIA NIM.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="sa-ai-primary" className="text-caption text-fossil">
                Model Utama
              </label>
              <select
                id="sa-ai-primary"
                value={aiPrimaryModel}
                onChange={(e) => setAiPrimaryModel(e.target.value)}
                className="w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[14.5px] focus:border-ink focus:outline-none transition-colors"
              >
                {AVAILABLE_NIM_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider}){m.badge ? `, ${m.badge}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-caption text-fossil">
                {AVAILABLE_NIM_MODELS.find((m) => m.id === aiPrimaryModel)?.description}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="sa-ai-fallback" className="text-caption text-fossil">
                Model Cadangan
              </label>
              <select
                id="sa-ai-fallback"
                value={aiFallbackModel}
                onChange={(e) => setAiFallbackModel(e.target.value)}
                className="w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[14.5px] focus:border-ink focus:outline-none transition-colors"
              >
                {FALLBACK_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <p className="text-caption text-fossil">Dipakai otomatis saat kuota habis atau server model sedang lambat.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="sa-ai-temp" className="text-caption text-fossil">
                Kreativitas (temperature): <span className="font-mono text-ink">{aiTemperature.toFixed(1)}</span>
              </label>
              <input
                id="sa-ai-temp"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={aiTemperature}
                onChange={(e) => setAiTemperature(Number(e.target.value))}
                className="w-full accent-ink"
              />
              <p className="text-caption text-fossil">Nilai rendah membuat kalkulator HPP dan rekonsiliasi lebih konsisten.</p>
            </div>

            <div className="flex flex-col justify-end gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" icon="check" onClick={saveAiConfig}>
                  Simpan Konfigurasi
                </Button>
                <Button variant="ghost" size="sm" icon="sync" disabled={isTesting} onClick={runTest}>
                  {isTesting ? 'Mengetes...' : 'Tes Koneksi'}
                </Button>
              </div>
              {lastTestStatus && lastTestStatus !== 'idle' && (
                <p
                  className={cn(
                    'p-3 rounded-lg text-[13px] border',
                    lastTestStatus === 'success'
                      ? 'bg-sand/60 border-ash text-ink'
                      : 'bg-ink/5 border-ink/25 text-ink',
                  )}
                >
                  <span className="font-medium flex items-center gap-1.5">
                    <Icon name={lastTestStatus === 'success' ? 'check' : 'warning'} size={14} />
                    {lastTestStatus === 'success' ? 'Koneksi berhasil' : 'Koneksi bermasalah'}
                    {lastTestLatency ? ` (${formatNumber(lastTestLatency)} ms)` : ''}
                  </span>
                  {lastTestMessage && <span className="block text-caption mt-0.5 break-words">{lastTestMessage}</span>}
                </p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Diagnostik nyata */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full min-w-0">
        <Card>
          <CardHeader title="Diagnostik Server" subtitle="Nilai dibaca langsung dari proses API saat data dimuat." />
          <CardBody>
            {diagnostics ? (
              <div className="divide-y divide-sand">
                <div className="flex justify-between items-center py-2.5 gap-3">
                  <span className="text-[14.5px] text-ink">Status database</span>
                  <Badge variant="neutral" icon="check">{diagnostics.databaseStatus === 'up' ? 'Sehat' : diagnostics.databaseStatus}</Badge>
                </div>
                <div className="flex justify-between items-center py-2.5 gap-3">
                  <span className="text-[14.5px] text-ink">Latensi query</span>
                  <span className="tnum font-medium text-ink">{formatNumber(diagnostics.dbLatencyMs)} ms</span>
                </div>
                <div className="flex justify-between items-center py-2.5 gap-3">
                  <span className="text-[14.5px] text-ink">Sesi aktif</span>
                  <span className="tnum font-medium text-ink">{formatNumber(diagnostics.activeSessionsCount)}</span>
                </div>
                <div className="flex justify-between items-center py-2.5 gap-3">
                  <span className="text-[14.5px] text-ink">Uptime proses</span>
                  <span className="tnum font-medium text-ink">{formatUptime(diagnostics.uptimeSeconds)}</span>
                </div>
                <div className="flex justify-between items-center py-2.5 gap-3">
                  <span className="text-[14.5px] text-ink">Memori resident</span>
                  <span className="tnum font-medium text-ink">{formatNumber(diagnostics.memoryRssMb)} MB</span>
                </div>
                <div className="flex justify-between items-center py-2.5 gap-3">
                  <span className="text-[14.5px] text-ink">Gateway OneSignal</span>
                  <Badge variant={diagnostics.oneSignalConfigured ? 'accent' : 'outline'}>
                    {diagnostics.oneSignalConfigured ? 'Terhubung' : 'Belum diisi'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-2.5 gap-3">
                  <span className="text-caption text-fossil">Diperiksa</span>
                  <span className="text-caption text-fossil">{formatDateTime(diagnostics.checkedAt)}</span>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="gauge"
                title="Diagnostik belum tersedia"
                body="Nilai ini hanya muncul bila server API merespons. Muat ulang data saat backend aktif."
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Kesiapan Perangkat & PWA" subtitle="Kondisi perangkat yang dipakai membuka panel ini." />
          <CardBody>
            <div className="divide-y divide-sand">
              <div className="flex justify-between items-center py-2.5 gap-3">
                <span className="text-[14.5px] text-ink">Koneksi jaringan</span>
                <Badge variant={isOnline ? 'neutral' : 'ink'} icon={isOnline ? 'online' : 'offline'}>
                  {isOnline ? 'Online' : 'Offline'}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2.5 gap-3">
                <span className="text-[14.5px] text-ink">Antrean transaksi offline</span>
                <span className="tnum font-medium text-ink">{formatNumber(pendingSync)}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 gap-3">
                <span className="text-[14.5px] text-ink">Sinkron terakhir</span>
                <span className="text-caption text-fossil">{lastSyncAt ? formatDateTime(lastSyncAt) : 'Belum pernah'}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 gap-3">
                <span className="text-[14.5px] text-ink">Service Worker</span>
                <Badge variant={swState.registered ? 'accent' : 'outline'}>
                  {swState.registered ? 'Terdaftar' : 'Belum aktif'}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2.5 gap-3">
                <span className="text-[14.5px] text-ink">Cakupan Service Worker</span>
                <span className="text-caption text-fossil font-mono break-all text-right">{swState.scope ?? '-'}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-sand">
              <p className="text-caption text-fossil mb-2.5">Tenant dengan kuota AI hampir habis</p>
              {quotasTight.length === 0 ? (
                <p className="text-body-sm text-fossil">Tidak ada tenant yang menyentuh 90% kuota bulan ini.</p>
              ) : (
                <div className="space-y-2">
                  {quotasTight.map((t) => {
                    const pct = Math.min(100, Math.round(((t.ai_quota_used ?? 0) / (t.ai_quota_limit ?? 1)) * 100));
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3">
                        <span className="text-[14px] text-ink truncate">{t.name}</span>
                        <span className="tnum text-caption text-fossil shrink-0">{pct}% terpakai</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam ${minutes % 60} menit`;
  return `${Math.floor(hours / 24)} hari ${hours % 24} jam`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

function TenantFormModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    industryTemplate: IndustryTemplate;
    subscriptionPlan: SubscriptionPlan;
    outletName: string;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<IndustryTemplate>('retail');
  const [plan, setPlan] = useState<SubscriptionPlan>('plus_ai');
  const [outletName, setOutletName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setIndustry('retail');
      setPlan('plus_ai');
      setOutletName('');
    }
  }, [open]);

  const submit = async () => {
    setIsSaving(true);
    const ok = await onSubmit({ name, industryTemplate: industry, subscriptionPlan: plan, outletName });
    setIsSaving(false);
    return ok;
  };

  return (
    <Modal open={open} onClose={onClose} title="Daftarkan Institusi Baru" maxWidth="lg">
      <div className="space-y-4">
        <Input
          label="Nama Institusi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="mis. Kopi Senja Nusantara"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Template Industri"
            value={industry}
            onChange={(e) => setIndustry(e.target.value as IndustryTemplate)}
          >
            <option value="retail">Retail / Kafe / F&amp;B</option>
            <option value="manufacturing">Manufaktur / Bakery</option>
            <option value="services">Jasa / Salon / Klinik</option>
          </Select>
          <Select
            label="Paket Langganan"
            value={plan}
            onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
          >
            <option value="basic">Basic (tanpa AI)</option>
            <option value="plus_ai">Plus AI (kuota 3.000 token)</option>
            <option value="custom">Enterprise (kuota 25.000 token)</option>
          </Select>
        </div>
        <Input
          label="Nama Outlet Pusat (opsional)"
          value={outletName}
          onChange={(e) => setOutletName(e.target.value)}
          placeholder="mis. Outlet Senopati"
          hint="Bila kosong, sistem membuat outlet pusat bernama Kantor Pusat."
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" icon="plus" disabled={isSaving} onClick={() => void submit()}>
            {isSaving ? 'Mendaftarkan...' : 'Daftarkan Tenant'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TenantCommandModal({
  tenant,
  onClose,
  onSaved,
  onDeleted,
}: {
  tenant: ApiTenant | null;
  onClose: () => void;
  onSaved: (next: ApiTenant) => Promise<void>;
  onDeleted: (id: string, name: string) => void;
}) {
  const [draft, setDraft] = useState<ApiTenant | null>(tenant);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setDraft(tenant), [tenant]);

  if (!draft) return null;

  const patch = (updates: Partial<ApiTenant>) => setDraft((d) => (d ? { ...d, ...updates } : d));

  const save = async () => {
    if (!draft.name.trim()) {
      toast({ title: 'Nama institusi tidak boleh kosong', icon: 'warning' });
      return;
    }
    setIsSaving(true);
    const payload = {
      name: draft.name.trim(),
      industryTemplate: draft.industry_template,
      subscriptionPlan: draft.subscription_plan,
      status: draft.status,
      aiQuotaLimit: draft.ai_quota_limit ?? 0,
      monthlyRevenue: draft.monthly_revenue ?? 0,
      modules: draft.modules ?? {},
      resetAiQuota: (draft.ai_quota_used ?? 0) === 0,
    };
    const local: ApiTenant = {
      ...draft,
      name: payload.name,
      industry_template: payload.industryTemplate,
      subscription_plan: payload.subscriptionPlan,
      status: payload.status,
      ai_quota_limit: payload.aiQuotaLimit,
      monthly_revenue: payload.monthlyRevenue,
    };
    await onSaved(local);
    setIsSaving(false);

    void apiFetch(`/v1/superadmin/tenants/${draft.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
      .then(() => toast({ title: `${local.name} tersimpan di server`, icon: 'check' }))
      .catch((err) => {
        toast({
          title: 'Perubahan hanya tersimpan di perangkat ini',
          description: err instanceof Error ? err.message : undefined,
          icon: 'warning',
        });
      });
  };

  const removeTenant = () => {
    if (!window.confirm(`Hapus ${draft.name} dari daftar tenant di perangkat ini? Data server tidak ikut terhapus.`)) return;
    onDeleted(draft.id, draft.name);
  };

  return (
    <Modal open={Boolean(tenant)} onClose={onClose} title={`Kelola ${draft.name}`} maxWidth="xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Input
            label="Nama Institusi"
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <Select
            label="Status"
            value={draft.status}
            onChange={(e) => patch({ status: e.target.value as ApiTenant['status'] })}
          >
            <option value="active">Aktif</option>
            <option value="trial">Masa Uji Coba</option>
            <option value="suspended">Suspended</option>
          </Select>
          <Select
            label="Template Industri"
            value={draft.industry_template}
            onChange={(e) => patch({ industry_template: e.target.value as IndustryTemplate })}
          >
            <option value="retail">Retail / F&amp;B</option>
            <option value="manufacturing">Manufaktur / Bakery</option>
            <option value="services">Jasa / Perawatan</option>
          </Select>
          <Select
            label="Paket Langganan"
            value={draft.subscription_plan}
            onChange={(e) => {
              const next = e.target.value as SubscriptionPlan;
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      subscription_plan: next,
                      ai_quota_limit:
                        next === 'basic' ? 0 : next === 'plus_ai' ? 3000 : Math.max(d.ai_quota_limit ?? 0, 25000),
                    }
                  : d,
              );
            }}
          >
            <option value="basic">Basic</option>
            <option value="plus_ai">Plus AI</option>
            <option value="custom">Enterprise</option>
          </Select>
          <Input
            label="Kuota AI Bulanan"
            type="number"
            min={0}
            value={draft.ai_quota_limit ?? 0}
            onChange={(e) => patch({ ai_quota_limit: Math.max(0, Number(e.target.value) || 0) })}
          />
          <Input
            label="Basis Omset Bulanan"
            type="number"
            min={0}
            value={draft.monthly_revenue ?? 0}
            onChange={(e) => patch({ monthly_revenue: Math.max(0, Number(e.target.value) || 0) })}
            hint="Dipakai sebagai angka ringkasan pada panel institusi."
          />
        </div>

        <div className="pt-4 border-t border-sand">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <p className="text-caption text-fossil">Modul yang diizinkan untuk tenant ini</p>
            <p className="text-caption text-fossil tnum">
              {formatNumber(draft.ai_quota_used ?? 0)} / {formatNumber(draft.ai_quota_limit ?? 0)} token terpakai
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {MODULE_CATALOG.map((m) => {
              const on = draft.modules?.[m.key] ?? false;
              return (
                <div key={m.key} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-ash bg-paper">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink">{m.label}</p>
                    <p className="text-[11.5px] text-fossil leading-snug mt-0.5">{m.desc}</p>
                  </div>
                  <Toggle
                    checked={on}
                    label={`Modul ${m.label}`}
                    onChange={(val) =>
                      setDraft((d) => (d ? { ...d, modules: { ...(d.modules ?? {}), [m.key]: val } } : d))
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-sand">
          <Button variant="ghost" icon="trash" onClick={removeTenant}>
            Hapus dari daftar lokal
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button variant="primary" icon="check" disabled={isSaving} onClick={() => void save()}>
              {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function UserFormModal({
  open,
  onClose,
  tenants,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  tenants: ApiTenant[];
  onSubmit: (payload: {
    name: string;
    email: string;
    role: Role;
    targetTenantId: string;
    password: string;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('manager');
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setRole('manager');
      setTenantId(tenants[0]?.id ?? '');
      setPassword('');
    }
  }, [open, tenants]);

  const submit = async () => {
    setIsSaving(true);
    const ok = await onSubmit({ name, email, role, targetTenantId: tenantId || tenants[0]?.id || '', password });
    setIsSaving(false);
    return ok;
  };

  return (
    <Modal open={open} onClose={onClose} title="Buat Akun Pengguna" maxWidth="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Nama Lengkap" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Dimas Pratama" />
          <Input
            label="Email Login"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dimas@bisnis.test"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Peran" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="superadmin">Superadmin Institusi</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="cashier">Kasir</option>
            <option value="staff">Staff Gudang</option>
          </Select>
          <Select label="Institusi" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <Input
          label="Kata Sandi (opsional)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Bila kosong, server membuatkan kata sandi acak"
          hint="Kata sandi acak ditampilkan sekali setelah akun berhasil dibuat."
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" icon="plus" disabled={isSaving} onClick={() => void submit()}>
            {isSaving ? 'Membuat...' : 'Buat Akun'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function UserCommandModal({
  user,
  tenants,
  currentUserId,
  onClose,
  onSaved,
}: {
  user: ApiUser | null;
  tenants: ApiTenant[];
  currentUserId?: string;
  onClose: () => void;
  onSaved: (next: ApiUser) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ApiUser | null>(user);
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(user);
    setNewPassword('');
  }, [user]);

  if (!draft) return null;

  const isSelf = draft.id === currentUserId;
  const permissionEntries = RBAC_PERMISSIONS.filter((p) => draft.permissions && p.key in draft.permissions);
  const overridden = Object.entries(draft.permissions ?? {});

  const save = async () => {
    if (!draft.name.trim()) {
      toast({ title: 'Nama pengguna tidak boleh kosong', icon: 'warning' });
      return;
    }
    if (newPassword.trim() && newPassword.trim().length < 6) {
      toast({ title: 'Kata sandi baru minimal 6 karakter', icon: 'warning' });
      return;
    }
    setIsSaving(true);
    await onSaved(draft);
    setIsSaving(false);

    void apiFetch(`/v1/superadmin/users/${draft.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: draft.name.trim(),
        email: draft.email.trim(),
        role: draft.role,
        isActive: draft.is_active,
        permissions: draft.permissions,
        newPassword: newPassword.trim() || undefined,
      }),
    })
      .then(() => toast({ title: `${draft.name} tersimpan di server`, icon: 'check' }))
      .catch((err) => {
        toast({
          title: 'Perubahan hanya tersimpan di perangkat ini',
          description: err instanceof Error ? err.message : undefined,
          icon: 'warning',
        });
      });
  };

  const togglePermission = (key: string, val: boolean) => {
    setDraft((d) => (d ? { ...d, permissions: { ...d.permissions, [key]: val } } : d));
  };

  return (
    <Modal open={Boolean(user)} onClose={onClose} title={`Kelola ${draft.name}`} maxWidth="xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Input label="Nama Lengkap" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input
            label="Email Login"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            disabled={isSelf}
          />
          <Select label="Peran" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
            <option value="superadmin">Superadmin</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="cashier">Kasir</option>
            <option value="staff">Staff</option>
          </Select>
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-ash bg-paper">
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-ink">Status akun</p>
              <p className="text-caption text-fossil mt-0.5">
                {isSelf ? 'Akun sendiri tidak dapat dinonaktifkan.' : 'Menonaktifkan memutus seluruh sesi aktif.'}
              </p>
            </div>
            <Toggle
              checked={draft.is_active}
              disabled={isSelf}
              label={`Status ${draft.name}`}
              onChange={(val) => setDraft({ ...draft, is_active: val })}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-sand">
          <p className="text-caption text-fossil mb-1.5">Institusi</p>
          <p className="text-[15px] text-ink">
            {tenants.find((t) => t.id === draft.tenant_id)?.name ?? draft.tenant_id}
          </p>
        </div>

        <div className="pt-4 border-t border-sand">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-caption text-fossil">
              Override izin granular ({overridden.length} dari {RBAC_PERMISSIONS.length} kunci diubah)
            </p>
            {overridden.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon="close"
                onClick={() => setDraft({ ...draft, permissions: {} })}
              >
                Kembalikan ke Matriks Peran
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {RBAC_PERMISSIONS.map((perm) => {
              const raw = draft.permissions?.[perm.key];
              const isOverride = typeof raw === 'boolean';
              const isOn = raw === true;
              const isDenied = raw === false;
              return (
                <div
                  key={perm.key}
                  className={cn(
                    'flex items-center justify-between gap-3 p-3 rounded-xl border',
                    isDenied ? 'border-ink/30 bg-sand/60' : isOverride ? 'border-ink/25 bg-paper' : 'border-ash bg-paper',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink">{perm.label}</p>
                    <p className="text-[11.5px] text-fossil leading-snug mt-0.5 break-words">{perm.desc}</p>
                    <p className="text-[11px] font-mono text-pebble mt-0.5 break-all">{perm.key}</p>
                  </div>
                  <Toggle
                    checked={isOn}
                    label={`Izin ${perm.label}`}
                    onChange={(val) => togglePermission(perm.key, val)}
                  />
                </div>
              );
            })}
          </div>
          {permissionEntries.length === 0 && overridden.length === 0 && (
            <p className="text-caption text-fossil mt-2">
              Belum ada override. Izin mengikuti matriks peran secara otomatis.
            </p>
          )}
        </div>

        <div className="pt-4 border-t border-sand">
          <Input
            label="Atur Kata Sandi Baru"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimal 6 karakter"
            hint="Mengisi kolom ini memutus seluruh sesi aktif akun tersebut."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" icon="check" disabled={isSaving} onClick={() => void save()}>
            {isSaving ? 'Menyimpan...' : 'Simpan Akun'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
