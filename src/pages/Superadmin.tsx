import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../components/icons/Icon';
import { Reveal } from '../components/Reveal';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input, Select } from '../components/ui/controls';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { Stat } from '../components/ui/Stat';
import { Tabs } from '../components/ui/Tabs';
import { formatDate, formatDateTime, formatIDR, formatNumber } from '../lib/format';
import { maskApiKey } from '../lib/security';
import { AVAILABLE_NIM_MODELS, FALLBACK_OPTIONS, useAiConfigStore } from '../stores/aiConfigStore';
import { useBusinessStore } from '../stores/businessStore';
import { toast } from '../stores/toastStore';
import type { AuditLog, IndustryTemplate, Role, SubscriptionPlan, Tenant, User } from '../types';

const defaultAuditLogs: AuditLog[] = [
  {
    id: 'log-1',
    tenant_id: 'tenant-newsem',
    user_id: 'u-newsem-owner',
    user_name: 'Owner Newsem Bakery',
    action: 'AUTH_LOGIN_SUCCESS',
    category: 'auth',
    details: 'Login berhasil via web portal dengan otentikasi JWT.',
    ip_address: '192.168.1.10',
    timestamp: new Date().toISOString(),
    status: 'success',
  },
  {
    id: 'log-2',
    tenant_id: 'tenant-newsem',
    user_id: 'u-newsem-ferry',
    user_name: 'Ferry (Manager)',
    action: 'INVENTORY_STOCK_UPDATE',
    category: 'inventory',
    details: 'Penyesuaian stok batch produksi roti di Gudang Produksi.',
    ip_address: '192.168.1.12',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    status: 'success',
  },
  {
    id: 'log-3',
    tenant_id: 'tenant-global',
    user_id: 'u-superadmin',
    user_name: 'Super Admin',
    action: 'SYSTEM_SETTINGS_UPDATE',
    category: 'system',
    details: 'Sinkronisasi konfigurasi AI engine dan kuota komputasi tenant.',
    ip_address: '127.0.0.1',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    status: 'success',
  },
];

type SuperadminTab = 'tenants' | 'users' | 'audit' | 'system';

const tabOptions: Array<{ value: SuperadminTab; label: string }> = [
  { value: 'tenants', label: 'Tenant & Institusi' },
  { value: 'users', label: 'Pengguna Global' },
  { value: 'audit', label: 'Audit Log & Keamanan' },
  { value: 'system', label: 'AI Engine & Server' },
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

export default function Superadmin() {
  const allTenantsStore = useBusinessStore((s) => s.allTenants);
  const storeUsers = useBusinessStore((s) => s.users);
  const currentTenant = useBusinessStore((s) => s.tenant);

  const [tab, setTab] = useState<SuperadminTab>('tenants');
  const [tenants, setTenants] = useState<Tenant[]>(allTenantsStore);
  const [usersList, setUsersList] = useState<User[]>(storeUsers);

  // Sync state if store updates
  useEffect(() => {
    setTenants(allTenantsStore);
  }, [allTenantsStore]);

  useEffect(() => {
    setUsersList(storeUsers);
  }, [storeUsers]);

  // Tenant state
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenantPage, setTenantPage] = useState(1);
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantTemplate, setNewTenantTemplate] = useState<IndustryTemplate>('retail');
  const [newTenantPlan, setNewTenantPlan] = useState<SubscriptionPlan>('plus_ai');
  const TENANT_PAGE_SIZE = 4;

  // Users state
  const [userQuery, setUserQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [userPage, setUserPage] = useState(1);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('manager');
  const [newUserTenant, setNewUserTenant] = useState<string>(currentTenant.id);
  const USER_PAGE_SIZE = 6;

  // Audit state
  const [auditQuery, setAuditQuery] = useState('');
  const [auditCategory, setAuditCategory] = useState<string>('all');
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PAGE_SIZE = 5;

  // AI Configuration State for Superadmin Master
  const aiApiKey = useAiConfigStore((s) => s.apiKey);
  const setAiApiKey = useAiConfigStore((s) => s.setApiKey);
  const aiPrimaryModel = useAiConfigStore((s) => s.primaryModel);
  const setAiPrimaryModel = useAiConfigStore((s) => s.setPrimaryModel);
  const aiFallbackModel = useAiConfigStore((s) => s.fallbackModel);
  const setAiFallbackModel = useAiConfigStore((s) => s.setFallbackModel);
  const aiBaseUrl = useAiConfigStore((s) => s.baseUrl);
  const setAiBaseUrl = useAiConfigStore((s) => s.setBaseUrl);
  const aiTemperature = useAiConfigStore((s) => s.temperature);
  const setAiTemperature = useAiConfigStore((s) => s.setTemperature);
  const aiIsEnabled = useAiConfigStore((s) => s.isEnabled);
  const setAiIsEnabled = useAiConfigStore((s) => s.setIsEnabled);
  const testAiConnection = useAiConfigStore((s) => s.testConnection);
  const lastTestStatus = useAiConfigStore((s) => s.lastTestStatus);
  const lastTestLatency = useAiConfigStore((s) => s.lastTestLatency);
  const lastTestMessage = useAiConfigStore((s) => s.lastTestMessage);

  const [localApiKey, setLocalApiKey] = useState(aiApiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingAi, setIsTestingAi] = useState(false);

  useEffect(() => {
    setLocalApiKey(aiApiKey);
  }, [aiApiKey]);

  const handleSaveAiConfig = () => {
    setAiApiKey(localApiKey);
    toast({ title: 'Pengaturan Master AI NVIDIA NIM berhasil disimpan', icon: 'check' });
  };

  const handleTestAi = async () => {
    setAiApiKey(localApiKey);
    setIsTestingAi(true);
    const res = await testAiConnection();
    setIsTestingAi(false);
    if (res.success) {
      toast({ title: `Koneksi AI Berhasil (${res.latency}ms)`, icon: 'check' });
    } else {
      toast({ title: 'Gagal menghubungkan ke NVIDIA NIM', icon: 'warning' });
    }
  };

  // Stats calculation
  const totalRevenue = tenants.reduce((acc, t) => acc + (t.monthly_revenue ?? 0), 0);
  const totalUsers = usersList.length;
  const activeTenants = tenants.filter((t) => t.status === 'active').length;
  const totalAiTokens = tenants.reduce((acc, t) => acc + (t.ai_quota_used ?? 0), 0);

  // Filtered tenants
  const filteredTenants = useMemo(() => {
    const q = tenantQuery.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
  }, [tenants, tenantQuery]);

  const totalTenantPages = Math.max(1, Math.ceil(filteredTenants.length / TENANT_PAGE_SIZE));
  const pagedTenants = useMemo(() => {
    return filteredTenants.slice((tenantPage - 1) * TENANT_PAGE_SIZE, tenantPage * TENANT_PAGE_SIZE);
  }, [filteredTenants, tenantPage]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return usersList.filter((u) => {
      const matchQuery = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchTenant = tenantFilter === 'all' || u.tenant_id === tenantFilter;
      return matchQuery && matchRole && matchTenant;
    });
  }, [usersList, userQuery, roleFilter, tenantFilter]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USER_PAGE_SIZE));
  const pagedUsers = useMemo(() => {
    return filteredUsers.slice((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE);
  }, [filteredUsers, userPage]);

  // Filtered audit logs
  const filteredAudit = useMemo(() => {
    const q = auditQuery.trim().toLowerCase();
    return defaultAuditLogs.filter((l) => {
      const matchQuery = !q || l.user_name.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.details.toLowerCase().includes(q);
      const matchCat = auditCategory === 'all' || l.category === auditCategory;
      return matchQuery && matchCat;
    });
  }, [auditQuery, auditCategory]);

  const totalAuditPages = Math.max(1, Math.ceil(filteredAudit.length / AUDIT_PAGE_SIZE));
  const pagedAudit = useMemo(() => {
    return filteredAudit.slice((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE);
  }, [filteredAudit, auditPage]);

  // Tenant Action
  const toggleTenantStatus = (tenantId: string) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id === tenantId) {
          const nextStatus = t.status === 'active' ? 'suspended' : 'active';
          toast({
            title: `Tenant ${t.name} diubah ke ${nextStatus === 'active' ? 'Aktif' : 'Suspended'}`,
            icon: nextStatus === 'active' ? 'check' : 'warning',
          });
          return { ...t, status: nextStatus };
        }
        return t;
      }),
    );
  };

  const handleAddTenant = () => {
    if (!newTenantName.trim()) return;
    const newT: Tenant = {
      id: `tenant-${Date.now().toString().slice(-3)}`,
      name: newTenantName.trim(),
      industry_template: newTenantTemplate,
      subscription_plan: newTenantPlan,
      status: 'active',
      created_at: new Date().toISOString(),
      monthly_revenue: 0,
      outlets_count: 1,
      users_count: 1,
      ai_quota_used: 0,
      ai_quota_limit: newTenantPlan === 'plus_ai' ? 5000 : 1000,
      settings: { currency: 'IDR', timezone: 'Asia/Jakarta' },
    };
    setTenants((prev) => [newT, ...prev]);
    setAddTenantOpen(false);
    setNewTenantName('');
    toast({ title: `Tenant "${newT.name}" berhasil didaftarkan`, icon: 'check' });
  };

  const handleAddUser = () => {
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const newU: User = {
      id: `u-${Date.now().toString().slice(-3)}`,
      tenant_id: newUserTenant,
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      role: newUserRole,
      permissions: { all: newUserRole === 'owner' },
      is_active: true,
      last_login: 'Belum pernah',
    };
    setUsersList((prev) => [newU, ...prev]);
    setAddUserOpen(false);
    setNewUserName('');
    setNewUserEmail('');
    toast({ title: `Pengguna ${newU.name} berhasil dibuat`, icon: 'check' });
  };

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      <Reveal>
        <PageHeader
          title="Superadmin Institusi"
          subtitle="Manajemen global multi-tenant, kontrol akun institusi, AI cluster, dan audit keamanan sistem."
          actions={
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="subtle"
                icon="sync"
                onClick={() => toast({ title: 'Koneksi ke semua tenant aktif & sinkron', icon: 'check' })}
              >
                Health Check
              </Button>
              <Button
                variant="primary"
                icon="plus"
                onClick={() => {
                  if (tab === 'users') setAddUserOpen(true);
                  else setAddTenantOpen(true);
                }}
              >
                {tab === 'users' ? 'Tambah User' : 'Tambah Tenant'}
              </Button>
            </div>
          }
        />
      </Reveal>

      {/* Statistik Utama Institusi */}
      <Reveal stagger={0.06}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 w-full min-w-0">
          <Stat
            label="Total Institusi / Tenant"
            value={`${activeTenants} / ${tenants.length}`}
            hint="tenant aktif"
            trend="up"
          />
          <Stat
            label="Total Pengguna Global"
            value={formatNumber(totalUsers)}
            hint="seluruh cabang"
          />
          <Stat
            label="Volume Omset Terpantau"
            value={formatIDR(totalRevenue)}
            hint="per bulan (multi-tenant)"
          />
          <Stat
            label="AI Token Terkonsumsi"
            value={`${formatNumber(totalAiTokens)} tok`}
            hint="cluster Gemini 2.5"
          />
        </div>
      </Reveal>

      <Tabs options={tabOptions} value={tab} onChange={setTab} />

      {/* TAB 1: MANAJEMEN TENANT */}
      {tab === 'tenants' && (
        <div className="space-y-4 w-full min-w-0">
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full">
            <div className="relative flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble" />
              <input
                value={tenantQuery}
                onChange={(e) => {
                  setTenantQuery(e.target.value);
                  setTenantPage(1);
                }}
                placeholder="Cari nama tenant atau ID…"
                className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-8 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
              />
              {tenantQuery && (
                <button
                  onClick={() => {
                    setTenantQuery('');
                    setTenantPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fossil hover:text-ink text-body-sm"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <Reveal className="w-full min-w-0" stagger={0.03} key={`tenants-${tenantQuery}-${tenantPage}`}>
            {filteredTenants.length === 0 ? (
              <Card>
                <EmptyState
                  icon="search"
                  title="Tenant tidak ditemukan"
                  body="Coba kata kunci pencarian tenant lain."
                />
              </Card>
            ) : (
              <div className="space-y-3 w-full min-w-0">
                {pagedTenants.map((t) => {
                  const quotaPct = Math.round(((t.ai_quota_used ?? 0) / (t.ai_quota_limit ?? 1)) * 100);
                  const isSuspended = t.status === 'suspended';
                  return (
                    <Card
                      key={t.id}
                      className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full min-w-0 hover:border-ink transition-colors"
                    >
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[16px] sm:text-[17px] font-medium text-ink truncate">
                            {t.name}
                          </span>
                          <Badge variant="outline">{templateLabels[t.industry_template]}</Badge>
                          <Badge variant={t.subscription_plan === 'custom' ? 'ink' : 'accent'}>
                            {t.subscription_plan.toUpperCase()}
                          </Badge>
                          <Badge variant={isSuspended ? 'ink' : 'neutral'}>
                            {isSuspended ? 'Suspended' : t.status === 'trial' ? 'Trial 14 Hari' : 'Aktif'}
                          </Badge>
                        </div>
                        <p className="text-caption text-fossil">
                          ID: <span className="tnum font-mono">{t.id}</span> · Terdaftar sejak {formatDate(t.created_at ?? '2025-01-01')} · {t.outlets_count ?? 1} Outlet · {t.users_count ?? 1} Akun
                        </p>
                        <div className="flex items-center gap-3 pt-1 text-caption text-smoke">
                          <span>
                            Omset: <span className="font-medium tnum text-ink">{formatIDR(t.monthly_revenue ?? 0)}/bln</span>
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1.5">
                            AI Quota:
                            <span className="inline-block w-16 sm:w-24 bg-sand rounded-full h-2 overflow-hidden align-middle">
                              <span
                                className="block bg-ink h-full rounded-full"
                                style={{ width: `${Math.min(quotaPct, 100)}%` }}
                              />
                            </span>
                            <span className="tnum text-[11px]">{t.ai_quota_used ?? 0}/{t.ai_quota_limit ?? 1000} ({quotaPct}%)</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-sand">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={isSuspended ? 'check' : 'close'}
                          onClick={() => toggleTenantStatus(t.id)}
                        >
                          {isSuspended ? 'Aktifkan' : 'Suspend'}
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          icon="settings"
                          onClick={() =>
                            toast({
                              title: `Panel modul & kuota ${t.name} disinkronkan`,
                              icon: 'check',
                            })
                          }
                        >
                          Kelola Tenant
                        </Button>
                      </div>
                    </Card>
                  );
                })}

                <Pagination
                  currentPage={tenantPage}
                  totalPages={totalTenantPages}
                  totalItems={filteredTenants.length}
                  pageSize={TENANT_PAGE_SIZE}
                  onPageChange={setTenantPage}
                />
              </div>
            )}
          </Reveal>
        </div>
      )}

      {/* TAB 2: PENGGUNA GLOBAL */}
      {tab === 'users' && (
        <div className="space-y-4 w-full min-w-0">
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full">
            <div className="relative flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble" />
              <input
                value={userQuery}
                onChange={(e) => {
                  setUserQuery(e.target.value);
                  setUserPage(1);
                }}
                placeholder="Cari nama pengguna atau email…"
                className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-8 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
              />
              {userQuery && (
                <button
                  onClick={() => {
                    setUserQuery('');
                    setUserPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fossil hover:text-ink text-body-sm"
                >
                  ✕
                </button>
              )}
            </div>
            <Select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setUserPage(1);
              }}
              className="sm:w-44"
            >
              <option value="all">Semua Role</option>
              <option value="superadmin">Superadmin</option>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="cashier">Kasir</option>
              <option value="staff">Staff</option>
            </Select>
            <Select
              value={tenantFilter}
              onChange={(e) => {
                setTenantFilter(e.target.value);
                setUserPage(1);
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

          <Card className="overflow-hidden w-full min-w-0">
            {filteredUsers.length === 0 ? (
              <EmptyState
                icon="search"
                title="Pengguna tidak ditemukan"
                body="Coba kata kunci atau filter lain."
              />
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-ash text-caption text-fossil font-normal">
                      <th className="px-4 sm:px-6 py-3">Nama & Email</th>
                      <th className="px-4 sm:px-6 py-3">Institusi / Tenant</th>
                      <th className="px-4 sm:px-6 py-3">Peran (Role)</th>
                      <th className="px-4 sm:px-6 py-3">Status</th>
                      <th className="px-4 sm:px-6 py-3">Login Terakhir</th>
                      <th className="px-4 sm:px-6 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {pagedUsers.map((u) => {
                      const t = tenants.find((item) => item.id === u.tenant_id);
                      return (
                        <tr key={u.id} className="hover:bg-sand/30 transition-colors">
                          <td className="px-4 sm:px-6 py-3.5">
                            <p className="text-[14.5px] font-medium text-ink">{u.name}</p>
                            <p className="text-caption text-fossil">{u.email}</p>
                          </td>
                          <td className="px-4 sm:px-6 py-3.5">
                            <span className="text-[14px] text-ink">{t ? t.name : 'Global Institusi'}</span>
                          </td>
                          <td className="px-4 sm:px-6 py-3.5">
                            <Badge variant={roleBadgeColors[u.role]}>
                              {u.role.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-4 sm:px-6 py-3.5">
                            <Badge variant={u.is_active ? 'neutral' : 'ink'}>
                              {u.is_active ? 'Aktif' : 'Nonaktif'}
                            </Badge>
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 text-caption text-fossil">
                            {u.last_login?.includes('T') ? formatDateTime(u.last_login) : (u.last_login ?? 'Baru')}
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon="edit"
                              onClick={() => toast({ title: `Kredensial ${u.name} siap dikelola`, icon: 'edit' })}
                            >
                              Edit
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 sm:px-6 pb-4">
              <Pagination
                currentPage={userPage}
                totalPages={totalUserPages}
                totalItems={filteredUsers.length}
                pageSize={USER_PAGE_SIZE}
                onPageChange={setUserPage}
              />
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: AUDIT LOG */}
      {tab === 'audit' && (
        <div className="space-y-4 w-full min-w-0">
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full">
            <div className="relative flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble" />
              <input
                value={auditQuery}
                onChange={(e) => {
                  setAuditQuery(e.target.value);
                  setAuditPage(1);
                }}
                placeholder="Cari aktivitas, user, atau detail event log…"
                className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-8 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
              />
              {auditQuery && (
                <button
                  onClick={() => {
                    setAuditQuery('');
                    setAuditPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fossil hover:text-ink text-body-sm"
                >
                  ✕
                </button>
              )}
            </div>
            <Select
              value={auditCategory}
              onChange={(e) => {
                setAuditCategory(e.target.value);
                setAuditPage(1);
              }}
              className="sm:w-48"
            >
              <option value="all">Semua Kategori</option>
              <option value="auth">Otentikasi (Auth)</option>
              <option value="transaction">Transaksi & POS</option>
              <option value="inventory">Inventori</option>
              <option value="billing">Keuangan & Billing</option>
              <option value="system">Sistem</option>
            </Select>
          </div>

          <Reveal className="space-y-3 w-full min-w-0" key={`audit-${auditQuery}-${auditPage}`}>
            {filteredAudit.length === 0 ? (
              <Card>
                <EmptyState
                  icon="search"
                  title="Audit log kosong"
                  body="Tidak ada event log yang cocok dengan filter."
                />
              </Card>
            ) : (
              <div className="space-y-3 w-full min-w-0">
                {pagedAudit.map((log) => (
                  <Card key={log.id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full min-w-0">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={log.status === 'success' ? 'neutral' : 'accent'}>
                          {log.category.toUpperCase()}
                        </Badge>
                        <span className="text-[14.5px] font-medium text-ink font-mono">{log.action}</span>
                        <span className="text-caption text-fossil">oleh {log.user_name}</span>
                      </div>
                      <p className="text-[14px] text-smoke leading-relaxed break-words">{log.details}</p>
                      <p className="text-caption text-fossil">
                        IP: <span className="font-mono">{log.ip_address}</span> · {formatDateTime(log.timestamp)}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {log.status.toUpperCase()}
                    </Badge>
                  </Card>
                ))}

                <Pagination
                  currentPage={auditPage}
                  totalPages={totalAuditPages}
                  totalItems={filteredAudit.length}
                  pageSize={AUDIT_PAGE_SIZE}
                  onPageChange={setAuditPage}
                />
              </div>
            )}
          </Reveal>
        </div>
      )}

      {/* TAB 4: SYSTEM & MASTER AI ENGINE */}
      {tab === 'system' && (
        <div className="space-y-6 w-full min-w-0">
          <Card className="p-5 border-l-4 border-l-ink">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-[17px] font-semibold text-ink flex items-center gap-2">
                  <Icon name="assistant" size={20} />
                  Master NVIDIA NIM AI Engine (Server-Level)
                </h3>
                <p className="text-[14px] text-smoke mt-1">
                  Seluruh tenant (owner & kasir) menggunakan API Key terpusat ini. Kunci API dirahasiakan & diproteksi dari akses tenant biasa.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant={aiIsEnabled ? 'primary' : 'subtle'}
                  size="sm"
                  onClick={() => {
                    setAiIsEnabled(!aiIsEnabled);
                    toast({
                      title: !aiIsEnabled ? 'AI Cluster Diaktifkan' : 'AI Cluster Dinonaktifkan',
                      icon: !aiIsEnabled ? 'check' : 'warning',
                    });
                  }}
                >
                  {aiIsEnabled ? 'Status: AI Aktif' : 'Status: AI Nonaktif'}
                </Button>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-sand grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* API Key Master */}
              <div className="space-y-2">
                <label className="text-[13.5px] font-medium text-ink flex items-center justify-between">
                  <span>Master NVIDIA NIM API Key</span>
                  {aiApiKey && (
                    <span className="text-caption font-mono text-fossil">
                      Tersimpan: {maskApiKey(aiApiKey)}
                    </span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={localApiKey}
                    onChange={(e) => setLocalApiKey(e.target.value)}
                    placeholder="nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-paper border border-pebble/70 rounded-lg pl-3 pr-20 py-2.5 text-[14px] font-mono placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-caption text-fossil hover:text-ink px-2 py-1 rounded bg-sand/60"
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <p className="text-caption text-fossil">
                  Dapatkan API Key di <span className="font-mono text-ink">build.nvidia.com</span> (gratis 1,000 credits).
                </p>
              </div>

              {/* Base Endpoint URL */}
              <div className="space-y-2">
                <label className="text-[13.5px] font-medium text-ink">
                  Inference Base URL
                </label>
                <input
                  type="text"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder="https://integrate.api.nvidia.com/v1"
                  className="w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[14px] font-mono placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
                />
                <p className="text-caption text-fossil">
                  Standar OpenAI-compatible endpoint NVIDIA NIM.
                </p>
              </div>

              {/* Primary Model Selection */}
              <div className="space-y-2">
                <label className="text-[13.5px] font-medium text-ink flex items-center justify-between">
                  <span>Model Utama (Primary LLM)</span>
                  <Badge variant="accent">Default</Badge>
                </label>
                <select
                  value={aiPrimaryModel}
                  onChange={(e) => setAiPrimaryModel(e.target.value)}
                  className="w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[14.5px] focus:border-ink focus:outline-none transition-colors"
                >
                  {AVAILABLE_NIM_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.provider}) {m.badge ? `— ${m.badge}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-caption text-fossil">
                  {AVAILABLE_NIM_MODELS.find((m) => m.id === aiPrimaryModel)?.description}
                </p>
              </div>

              {/* Fallback Model Selection */}
              <div className="space-y-2">
                <label className="text-[13.5px] font-medium text-ink flex items-center justify-between">
                  <span>Model Cadangan (Fallback LLM)</span>
                  <Badge variant="outline">Auto-Failover</Badge>
                </label>
                <select
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
                <p className="text-caption text-fossil">
                  Otomatis digunakan bila kuota habis, rate-limit, atau jaringan offline.
                </p>
              </div>

              {/* Temperature */}
              <div className="space-y-2">
                <label className="text-[13.5px] font-medium text-ink flex items-center justify-between">
                  <span>Kreativitas / Temperature: <strong className="font-mono text-ink">{aiTemperature}</strong></span>
                  <span className="text-caption text-fossil">{aiTemperature <= 0.3 ? 'Presisi & Deterministik' : 'Kreatif'}</span>
                </label>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.1"
                  value={aiTemperature}
                  onChange={(e) => setAiTemperature(parseFloat(e.target.value))}
                  className="w-full accent-ink"
                />
                <p className="text-caption text-fossil">
                  Nilai 0.2 - 0.4 disarankan untuk kalkulator HPP & rekonsiliasi data bisnis.
                </p>
              </div>

              {/* Tombol Aksi & Status */}
              <div className="flex flex-col justify-end gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    icon="check"
                    className="flex-1"
                    onClick={handleSaveAiConfig}
                  >
                    Simpan Master Config
                  </Button>
                  <Button
                    variant="subtle"
                    icon="sync"
                    disabled={isTestingAi}
                    onClick={handleTestAi}
                  >
                    {isTestingAi ? 'Mengetes...' : 'Tes Koneksi API'}
                  </Button>
                </div>
                {lastTestStatus && lastTestStatus !== 'idle' && (
                  <div
                    className={`p-3 rounded-lg text-[13px] ${
                      lastTestStatus === 'success'
                        ? 'bg-ink/5 border border-ink/20 text-ink'
                        : 'bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300'
                    }`}
                  >
                    <p className="font-medium flex items-center gap-1.5">
                      <Icon name={lastTestStatus === 'success' ? 'check' : 'warning'} size={14} />
                      {lastTestStatus === 'success' ? 'Koneksi Berhasil' : 'Koneksi Bermasalah'}
                      {lastTestLatency ? ` (${lastTestLatency}ms)` : ''}
                    </p>
                    <p className="text-caption mt-0.5 opacity-90 break-words">{lastTestMessage}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Monitoring Cluster & PWA */}
          <div className="grid lg:grid-cols-2 gap-5 w-full min-w-0">
            <Card>
              <CardHeader title="AI Assistant & Inference Cluster" subtitle="Status pemakaian cluster model NVIDIA NIM" />
              <CardBody className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-sand">
                  <span className="text-[14.5px] text-ink">Active Primary Model</span>
                  <Badge variant="accent" icon="assistant">{aiPrimaryModel}</Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-sand">
                  <span className="text-[14.5px] text-ink">Active Fallback Model</span>
                  <Badge variant="outline">{aiFallbackModel}</Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-sand">
                  <span className="text-[14.5px] text-ink">Cluster Response Latency</span>
                  <span className="tnum font-medium text-ink">{lastTestLatency ? `${lastTestLatency}ms` : '420ms'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-[14.5px] text-ink">Security Scrubbing</span>
                  <Badge variant="neutral" icon="check">Auto-Redact NIK/Card/Tokens</Badge>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="PWA Offline Sync & Queue Monitor" subtitle="Status antrean data lokal seluruh perangkat kasir" />
              <CardBody className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-sand">
                  <span className="text-[14.5px] text-ink">Service Worker Version</span>
                  <span className="tnum font-mono text-ink">v0.22.0 (Active)</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-sand">
                  <span className="text-[14.5px] text-ink">Conflict Resolution Protocol</span>
                  <Badge variant="outline">Client Timestamp + Server Hash</Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-sand">
                  <span className="text-[14.5px] text-ink">Global Sync Success Rate</span>
                  <span className="tnum font-medium text-ink">99.98%</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-[14.5px] text-ink">Pending Multi-tenant Sync</span>
                  <Badge variant="neutral">0 antre (Clean)</Badge>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* Modal Tambah Tenant */}
      <Modal open={addTenantOpen} onClose={() => setAddTenantOpen(false)} title="Daftarkan Tenant / Institusi Baru" maxWidth="lg">
        <div className="space-y-4">
          <Input
            label="Nama Tenant / Bisnis"
            value={newTenantName}
            onChange={(e) => setNewTenantName(e.target.value)}
            placeholder="mis. Kopi Senja Nusantara"
          />
          <Select
            label="Template Industri"
            value={newTenantTemplate}
            onChange={(e) => setNewTenantTemplate(e.target.value as IndustryTemplate)}
          >
            <option value="retail">Retail / Kafe / F&B</option>
            <option value="manufacturing">Manufaktur / Bakery</option>
            <option value="services">Jasa / Barbershop / Salon</option>
          </Select>
          <Select
            label="Paket Langganan"
            value={newTenantPlan}
            onChange={(e) => setNewTenantPlan(e.target.value as SubscriptionPlan)}
          >
            <option value="basic">Basic (Rp 99.000 / bln)</option>
            <option value="plus_ai">Plus AI (Rp 299.000 / bln)</option>
            <option value="custom">Enterprise Custom (Rp 899.000 / bln)</option>
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAddTenantOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" icon="plus" onClick={handleAddTenant}>
              Daftarkan Tenant
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Tambah Pengguna */}
      <Modal open={addUserOpen} onClose={() => setAddUserOpen(false)} title="Tambah Pengguna Institusi Baru" maxWidth="lg">
        <div className="space-y-4">
          <Input
            label="Nama Lengkap"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            placeholder="mis. Dimas Pratama"
          />
          <Input
            label="Email"
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="dimas@bisnis.id"
          />
          <Select
            label="Peran (Role)"
            value={newUserRole}
            onChange={(e) => setNewUserRole(e.target.value as Role)}
          >
            <option value="owner">Owner (Pemilik Bisnis)</option>
            <option value="manager">Manager (Manajer Toko)</option>
            <option value="cashier">Kasir (Cashier POS)</option>
            <option value="staff">Staff (Staff Gudang)</option>
            <option value="superadmin">Superadmin (Institusi)</option>
          </Select>
          <Select
            label="Institusi / Tenant"
            value={newUserTenant}
            onChange={(e) => setNewUserTenant(e.target.value)}
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAddUserOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" icon="plus" onClick={handleAddUser}>
              Simpan Pengguna
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
