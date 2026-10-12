import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CompaniesPanel } from '../components/company/CompaniesPanel';
import { Reveal } from '../components/Reveal';
import { Icon, type IconName } from '../components/icons/Icon';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input, Select } from '../components/ui/controls';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Toggle } from '../components/ui/Toggle';
import { aiUsage, planById, plans } from '../data/plans';
import { cn, formatDateTime, formatIDR, formatNumber } from '../lib/format';
import { useBusinessStore } from '../stores/businessStore';
import { useModuleStore } from '../stores/moduleStore';
import { useSyncStore } from '../stores/syncStore';
import { useThemeStore } from '../stores/themeStore';
import { useAiConfigStore, AVAILABLE_NIM_MODELS, FALLBACK_OPTIONS } from '../stores/aiConfigStore';
import { toast } from '../stores/toastStore';
import type { CustomFieldType, IndustryTemplate, Role, SubscriptionPlan, User } from '../types';

const moduleIcons: Record<string, IconName> = {
  inventory: 'inventory',
  pos: 'pos',
  finance: 'finance',
  assistant: 'assistant',
  production: 'layers',
  booking: 'calendar',
};

const templates: Array<{ value: IndustryTemplate; label: string; icon: IconName }> = [
  { value: 'retail', label: 'Retail', icon: 'store' },
  { value: 'manufacturing', label: 'Manufaktur', icon: 'layers' },
  { value: 'services', label: 'Jasa', icon: 'calendar' },
];

const fieldTypeLabels: Record<CustomFieldType, string> = {
  text: 'teks',
  number: 'angka',
  date: 'tanggal',
  dropdown: 'dropdown',
};

const roleDescriptions: Record<Role, string> = {
  superadmin: 'Akses penuh institusi: Multi-tenant, global users, master AI, & audit log',
  owner: 'Akses penuh tenant: Laporan laba rugi, arus kas, aset inventori, & tim',
  admin: 'Operasional + konfigurasi modul bisnis & outlet',
  manager: 'Operasional outlet: Kasir POS, inventori, PO, & performa shift',
  cashier: 'Khusus kasir: Transaksi POS, pembayaran QRIS/Tunai, & cetak struk',
  staff: 'Khusus pergudangan: Cek stok fisik, scan barcode, & penerimaan barang',
};

const permissionLabels: Record<string, { label: string; desc: string }> = {
  pos_access: { label: 'Akses Kasir POS', desc: 'Buka menu kasir & proses transaksi penjualan' },
  inventory_access: { label: 'Kelola Stok & Gudang', desc: 'Lihat jumlah stok fisik & terima barang' },
  finance_access: { label: 'Akses Laporan Keuangan', desc: 'Lihat laba rugi, arus kas, dan margin usaha' },
  discount_permission: { label: 'Beri Diskon Penjualan', desc: 'Input diskon manual saat transaksi kasir' },
  void_transaction: { label: 'Void Transaksi', desc: 'Membatalkan transaksi yang sudah dibayar' },
  export_data: { label: 'Ekspor Laporan', desc: 'Download rekap transaksi format PDF & Excel' },
  manage_products: { label: 'Kelola Menu Produk', desc: 'Tambah, ubah harga, dan edit katalog produk' },
};

export default function Settings() {
  const tenant = useBusinessStore((s) => s.tenant);
  const outlets = useBusinessStore((s) => s.outlets);
  const users = useBusinessStore((s) => s.users);
  const updateTenant = useBusinessStore((s) => s.updateTenant);
  const resetToDemo = useBusinessStore((s) => s.resetToDemo);
  const addUser = useBusinessStore((s) => s.addUser);
  const updateUserPermissions = useBusinessStore((s) => s.updateUserPermissions);
  const updateUserRole = useBusinessStore((s) => s.updateUserRole);
  const deleteUser = useBusinessStore((s) => s.deleteUser);
  const toggleUserStatus = useBusinessStore((s) => s.toggleUserStatus);
  const setSubscriptionPlan = useBusinessStore((s) => s.setSubscriptionPlan);

  const modules = useModuleStore((s) => s.modules);
  const customFields = useModuleStore((s) => s.customFields);
  const template = useModuleStore((s) => s.template);
  const toggle = useModuleStore((s) => s.toggle);
  const addCustomField = useModuleStore((s) => s.addCustomField);
  const removeCustomField = useModuleStore((s) => s.removeCustomField);
  const setTemplate = useModuleStore((s) => s.setTemplate);

  const isOnline = useSyncStore((s) => s.isOnline);
  const setOnline = useSyncStore((s) => s.setOnline);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const pendingLocal = useSyncStore((s) => s.pendingLocal);

  const navigate = useNavigate();
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<IndustryTemplate | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [selType, setSelType] = useState<CustomFieldType>('text');
  const [selModule, setSelModule] = useState('inventory');
  const [editBizOpen, setEditBizOpen] = useState(false);
  const [bizNameInput, setBizNameInput] = useState(tenant.name);

  // Modal Tambah Karyawan
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newUserRole, setNewUserRole] = useState<Role>('cashier');
  const [newUserOutlet, setNewUserOutlet] = useState(outlets[0]?.id || '');
  const [newUserPerms, setNewUserPerms] = useState<Record<string, boolean>>({
    pos_access: true,
    inventory_access: false,
    finance_access: false,
    discount_permission: false,
    void_transaction: false,
    export_data: false,
    manage_products: false,
  });

  // State kartu user yang sedang dibuka permission detailnya
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Konfigurasi AI NVIDIA NIM
  const aiConfig = useAiConfigStore();
  const [showNimKey, setShowNimKey] = useState(false);
  const [isTestingNim, setIsTestingNim] = useState(false);
  const [customPlanModalOpen, setCustomPlanModalOpen] = useState(false);

  const currentPlan = planById(tenant.subscription_plan);

  const activeModules = modules.filter((m) => m.is_active);
  const moduleValue = activeModules.some((m) => m.module_key === selModule)
    ? selModule
    : (activeModules[0]?.module_key ?? '');

  // Filter users khusus tenant aktif (data riil)
  const tenantUsers = users.filter((u) => u.tenant_id === tenant.id);

  // Helper pembuat slug nama usaha
  const bizSlug = tenant.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'usaha';

  function handleEmployeeNameChange(name: string) {
    setNewUserName(name);
    const cleanFirstName = name.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
    if (cleanFirstName) {
      setNewUserEmail(`${cleanFirstName}@${bizSlug}`);
      setNewUserPassword(`${cleanFirstName}123`);
    } else {
      setNewUserEmail('');
      setNewUserPassword('');
    }
  }

  function copyText(text: string, title = 'Berhasil disalin ke clipboard') {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast({ title, icon: 'copy' });
    }
  }

  const addField = () => {
    const label = newLabel.trim();
    if (!label || !moduleValue) return;
    addCustomField({
      module_key: moduleValue,
      label,
      type: selType,
      options: selType === 'dropdown' ? ['Opsi 1', 'Opsi 2'] : undefined,
    });
    toast({ title: 'Field ditambahkan', icon: 'check' });
    setNewLabel('');
  };

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          title="Pengaturan"
          subtitle="Profil usaha, tema tampilan, langganan, modul, template industri, form builder, dan peran."
        />
      </Reveal>

      {/* Profil Usaha & Outlet */}
      <Reveal delay={0.01}>
        <Card>
          <CardHeader
            title="Profil Usaha"
            subtitle="Informasi institusi bisnis dan cabang terdaftar"
            action={
              <Button
                variant="ghost"
                size="sm"
                icon="settings"
                onClick={() => {
                  setBizNameInput(tenant.name);
                  setEditBizOpen(true);
                }}
              >
                Ubah Profil
              </Button>
            }
          />
          <CardBody>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-h3 font-semibold text-ink">{tenant.name}</h3>
                  <Badge variant="ink">{tenant.industry_template.toUpperCase()}</Badge>
                </div>
                <p className="text-body-sm text-fossil mt-1">
                  ID Tenant: <code className="text-caption bg-sand/60 px-1.5 py-0.5 rounded">{tenant.id}</code> ·{' '}
                  {outlets.length} Cabang Outlet Terdaftar
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-sand grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {outlets.map((o) => (
                <div key={o.id} className="p-3 rounded-xl border border-ash bg-paper/60 flex items-start gap-3">
                  <span className="w-8 h-8 rounded-lg bg-sand inline-flex items-center justify-center text-ink shrink-0 mt-0.5">
                    <Icon name="store" size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-ink truncate">{o.name}</p>
                    <p className="text-caption text-fossil truncate">{o.address}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </Reveal>

      {/* Tema & Tampilan */}
      <Reveal delay={0.02}>
        <Card>
          <CardHeader title="Tema & Tampilan" subtitle="Pilih preferensi tema visual aplikasi Retalio." />
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {[
                { key: 'light', label: 'Terang', icon: 'sun' as const, desc: 'Warm bone editorial paper' },
                { key: 'dark', label: 'Gelap', icon: 'moon' as const, desc: 'Obsidian dark sleek contrast' },
                { key: 'system', label: 'Otomatis', icon: 'settings' as const, desc: 'Mengikuti preferensi sistem OS' },
              ].map((t) => {
                const currentMode = useThemeStore((s) => s.mode);
                const active = currentMode === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      useThemeStore.getState().setMode(t.key as any);
                      toast({ title: `Tema diubah ke mode ${t.label}`, icon: t.icon });
                    }}
                    className={cn(
                      'p-3.5 sm:p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-3',
                      active
                        ? 'border-ink bg-sand/60 shadow-sm ring-1 ring-ink/20'
                        : 'border-ash bg-paper hover:border-pebble',
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="w-8 h-8 rounded-lg bg-bone inline-flex items-center justify-center text-ink">
                        <Icon name={t.icon} size={16} />
                      </span>
                      {active && <Badge variant="ink">Aktif</Badge>}
                    </div>
                    <div>
                      <p className="text-[14.5px] font-medium text-ink">{t.label}</p>
                      <p className="text-[11.5px] text-fossil mt-0.5">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mode Ringan / Lite Mode untuk HP Spek Menengah */}
            <div className="mt-4 pt-4 border-t border-sand flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-sand inline-flex items-center justify-center text-ink shrink-0">
                  <Icon name="sparkles" size={16} />
                </span>
                <div>
                  <p className="text-[14px] font-medium text-ink">Mode Kinerja Cepat (Lite Mode)</p>
                  <p className="text-caption text-fossil">
                    Menonaktifkan animasi scroll berat &amp; efek blur agar aplikasi berjalan instan dan mulus di HP.
                  </p>
                </div>
              </div>
              <Toggle
                checked={useThemeStore((s) => s.liteMode)}
                label="Mode Ringan"
                onChange={(val) => {
                  useThemeStore.getState().setLiteMode(val);
                  toast({
                    title: val ? 'Mode Ringan Diaktifkan (Lebih Cepat)' : 'Animasi Halus Diaktifkan',
                    icon: 'check',
                  });
                }}
              />
            </div>
          </CardBody>
        </Card>
      </Reveal>

      {/* Langganan & kuota AI */}
      <Reveal delay={0.03}>
        <Card>
          <CardHeader title="Langganan" subtitle="Paket aktif, kuota AI, dan tagihan usaha." />
          <CardBody>
            <div className="flex flex-wrap items-center gap-4">
              <span className="w-9 h-9 rounded-lg bg-sand inline-flex items-center justify-center shrink-0">
                <Icon name="wallet" size={16} className="text-smoke" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                  Paket {currentPlan.name}
                  {tenant.subscription_plan === 'basic' && (
                    <Badge variant="neutral">Tanpa AI</Badge>
                  )}
                  {tenant.subscription_plan === 'plus_ai' && (
                    <Badge variant="ink" icon="assistant">
                      Retalio Intelligence Aktif
                    </Badge>
                  )}
                  {tenant.subscription_plan === 'custom' && (
                    <Badge variant="accent">Enterprise Unlimited</Badge>
                  )}
                </p>
                <p className="text-body-sm text-fossil mt-0.5">
                  {tenant.subscription_plan === 'basic'
                    ? 'Paket operasional standar (Kasir, Inventori, Keuangan). Fitur AI tidak aktif.'
                    : currentPlan.tagline}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                <Button
                  variant="primary"
                  size="sm"
                  icon="wallet"
                  className="flex-1 sm:flex-initial"
                  onClick={() => setPlansModalOpen(true)}
                >
                  Ganti / Upgrade Paket
                </Button>
              </div>
            </div>

            {tenant.subscription_plan !== 'basic' && (
              <div className="mt-5 border-t border-sand pt-4">
                <div className="mb-2 flex items-center justify-between text-caption text-fossil">
                  <span>Kuota AI Bulan Ini</span>
                  <span className="tnum font-medium text-ink">
                    {formatNumber(tenant.ai_quota_used || 0)} / {formatNumber(tenant.ai_quota_limit || 1000)} query
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-sand overflow-hidden">
                  <div
                    className="h-full rounded-full bg-ink"
                    style={{
                      width: `${Math.min(100, Math.round(((tenant.ai_quota_used || 0) / (tenant.ai_quota_limit || 1000)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-caption text-fossil">
                  Kuota otomatis diperbarui setiap tanggal 1.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </Reveal>

      {/* Status AI Retalio Intelligence (Dikelola Superadmin) */}
      <Reveal delay={0.04}>
        <Card>
          <CardHeader
            title="Retalio Intelligence &amp; AI Engine"
            subtitle="Asisten bisnis AI dikelola secara terpusat oleh Server Superadmin Retalio."
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-sand/50 border border-ash">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-chartreuse/70 inline-flex items-center justify-center text-ink shrink-0">
                  <Icon name="sparkles" size={18} />
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-ink">Retalio Intelligence Ready</p>
                  <p className="text-[12px] text-fossil">
                    {tenant.subscription_plan === 'basic'
                      ? 'Paket Anda saat ini Basic. Upgrade ke Paket +AI untuk mengaktifkan asisten cerdas.'
                      : 'Koneksi AI aktif & terhubung ke Server Superadmin. Siap digunakan di seluruh menu.'}
                  </p>
                </div>
              </div>
              <Badge variant={tenant.subscription_plan === 'basic' ? 'outline' : 'ink'} icon="assistant">
                {tenant.subscription_plan === 'basic' ? 'Perlu +AI' : 'AI Engine Aktif'}
              </Badge>
            </div>
            <p className="text-[12px] text-fossil leading-relaxed">
              Anda tidak perlu memasukkan API key manual. Retalio mengotomatiskan analisis inventori, kalkulator bisnis cerdas, dan rangkuman harian langsung dari server institusi.
            </p>
          </CardBody>
        </Card>
      </Reveal>

      {/* Manajemen modul */}
      <Reveal delay={0.05}>
        <Card>
          <CardHeader
            title="Manajemen Modul"
            subtitle="Nonaktifkan modul hanya menyembunyikan navigasi — data tidak pernah dihapus."
          />
          <CardBody>
            <div className="divide-y divide-sand">
              {modules.map((m) => {
                const isAssistant = m.module_key === 'assistant';
                const isPlanRestricted = isAssistant && tenant.subscription_plan === 'basic';

                return (
                  <div key={m.module_key} className="flex items-center gap-4 py-4">
                    <span className="w-9 h-9 rounded-lg bg-sand inline-flex items-center justify-center shrink-0">
                      <Icon name={moduleIcons[m.module_key] ?? 'layers'} size={16} className="text-smoke" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[15px] font-medium text-ink">{m.label}</p>
                        {isPlanRestricted && (
                          <Badge variant="outline" className="text-[10px]">Perlu Paket +AI</Badge>
                        )}
                      </div>
                      <p className="text-body-sm text-fossil">{m.description}</p>
                    </div>
                    <Toggle
                      checked={m.is_active}
                      label={`Modul ${m.label}`}
                      onChange={() => {
                        if (isPlanRestricted) {
                          toast({
                            title: 'Fitur Retalio Intelligence terkunci',
                            description: 'Silakan ganti paket langganan ke Paket +AI terlebih dahulu.',
                            icon: 'warning',
                          });
                          setPlansModalOpen(true);
                          return;
                        }
                        toggle(m.module_key);
                        toast({
                          title: `Modul ${m.label} ${m.is_active ? 'dinonaktifkan' : 'diaktifkan'}`,
                          icon: 'layers',
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </Reveal>

      {/* Template industri */}
      <Reveal delay={0.1}>
        <Card>
          <CardHeader title="Template Industri" subtitle={`Template aktif: ${template}`} />
          <CardBody>
            <div className="grid sm:grid-cols-3 gap-3">
              {templates.map((t) => {
                const active = template === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => !active && setPendingTemplate(t.value)}
                    className={cn(
                      'bg-paper border rounded-xl p-4 text-left transition-colors duration-150',
                      active ? 'border-ink' : 'border-ash hover:border-pebble',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="w-9 h-9 rounded-lg bg-sand inline-flex items-center justify-center">
                        <Icon name={t.icon} size={16} className="text-smoke" />
                      </span>
                      {active && <Badge variant="accent">Aktif</Badge>}
                    </div>
                    <p className="mt-3 text-[15px] text-ink">{t.label}</p>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </Reveal>

      {/* Form builder */}
      <Reveal delay={0.15}>
        <Card>
          <CardHeader
            title="Form Builder"
            subtitle="Tambah field kustom ke modul — langsung muncul di form."
          />
          <CardBody>
            <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
              <Select
                label="Modul"
                value={moduleValue}
                onChange={(e) => setSelModule(e.target.value)}
              >
                {activeModules.map((m) => (
                  <option key={m.module_key} value={m.module_key}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Nama field"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="cth. Nomor Batch"
              />
              <Select
                label="Tipe"
                value={selType}
                onChange={(e) => setSelType(e.target.value as CustomFieldType)}
              >
                <option value="text">Teks</option>
                <option value="number">Angka</option>
                <option value="date">Tanggal</option>
                <option value="dropdown">Dropdown</option>
              </Select>
              <Button variant="primary" icon="plus" onClick={addField}>
                Tambah
              </Button>
            </div>

            {customFields.length === 0 ? (
              <p className="text-caption text-fossil mt-5">Belum ada field kustom.</p>
            ) : (
              <div className="mt-5 space-y-2">
                {customFields.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 rounded-lg border border-ash px-3.5 py-2.5"
                  >
                    <Badge variant="outline">{f.module_key}</Badge>
                    <span className="flex-1 text-[15px] text-ink">{f.label}</span>
                    <span className="text-caption text-fossil">{fieldTypeLabels[f.type]}</span>
                    <button
                      type="button"
                      aria-label={`Hapus field ${f.label}`}
                      className="text-pebble hover:text-ink transition-colors"
                      onClick={() => {
                        removeCustomField(f.id);
                        toast({ title: 'Field dihapus', icon: 'trash' });
                      }}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </Reveal>

      {/* Tim Karyawan & Hak Akses Peran */}
      <Reveal delay={0.18}>
        <CompaniesPanel />
      </Reveal>

      <Reveal delay={0.2}>
        <Card>
          <CardHeader
            title="Tim Karyawan & Hak Akses Peran"
            subtitle="Owner dapat menambah staf, mengatur peran bawahan, dan mengaktifkan izin akses via toggle."
            action={
              <Button
                variant="primary"
                size="sm"
                icon="plus"
                onClick={() => setAddUserOpen(true)}
              >
                Tambah Karyawan
              </Button>
            }
          />
          <CardBody>
            <div className="space-y-4">
              {tenantUsers.length === 0 ? (
                <p className="text-body-sm text-fossil py-2">Belum ada karyawan terdaftar.</p>
              ) : (
                tenantUsers.map((u) => {
                  const isOwner = u.role === 'owner';
                  const isExpanded = expandedUserId === u.id;
                  const perms = u.permissions || {};

                  return (
                    <div
                      key={u.id}
                      className="border border-ash rounded-xl p-4 bg-paper/50 hover:border-pebble transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start sm:items-center gap-3">
                          <span className="w-10 h-10 rounded-xl bg-sand inline-flex items-center justify-center text-ink shrink-0 font-medium">
                            {u.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[15px] font-semibold text-ink">{u.name}</p>
                              <Badge
                                variant={
                                  u.role === 'owner'
                                    ? 'ink'
                                    : u.role === 'manager'
                                      ? 'accent'
                                      : 'neutral'
                                }
                              >
                                {u.role.toUpperCase()}
                              </Badge>
                              {u.is_active === false && <Badge variant="outline">Nonaktif</Badge>}
                            </div>
                            <p className="text-caption text-fossil mt-0.5">
                              {u.email} ·{' '}
                              {outlets.find((o) => o.id === u.outlet_id)?.name || 'Semua Cabang'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {!isOwner && (
                            <div className="flex items-center gap-1.5 mr-2">
                              <span className="text-caption text-pebble">Status:</span>
                              <Toggle
                                checked={u.is_active !== false}
                                label={`Status ${u.name}`}
                                onChange={() => {
                                  toggleUserStatus(u.id);
                                  toast({
                                    title: `Status ${u.name} diubah`,
                                    icon: 'user',
                                  });
                                }}
                              />
                            </div>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            icon="copy"
                            title="Salin username dan password untuk karyawan"
                            onClick={() => {
                              const passText = u.password ? `\nKata Sandi: ${u.password}` : '';
                              const text = `*Kredensial Login Retalio*\nUsaha: ${tenant.name}\nNama: ${u.name}\nUsername/Email: ${u.email}${passText}\nPeran: ${u.role.toUpperCase()}`;
                              copyText(text, `Kredensial ${u.name} disalin!`);
                            }}
                          >
                            Salin Info
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            icon="settings"
                            onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                          >
                            {isExpanded ? 'Tutup Izin' : 'Atur Izin'}
                          </Button>

                          {!isOwner && (
                            <button
                              type="button"
                              aria-label={`Hapus ${u.name}`}
                              className="p-1.5 text-pebble hover:text-ink rounded-lg hover:bg-sand transition-colors"
                              onClick={() => {
                                if (confirm(`Hapus akun karyawan ${u.name}?`)) {
                                  deleteUser(u.id);
                                  toast({ title: `Karyawan ${u.name} dihapus`, icon: 'trash' });
                                }
                              }}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Panel Detail Toggle Izin Akses */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-sand grid grid-cols-1 md:grid-cols-2 gap-3 bg-bone/40 p-3.5 rounded-lg">
                          <p className="md:col-span-2 text-caption text-ink font-semibold flex items-center gap-1.5">
                            <Icon name="settings" size={14} />
                            Hak Akses Granular untuk {u.name}:
                          </p>

                          {Object.entries(permissionLabels).map(([key, info]) => {
                            const isGranted = isOwner ? true : !!perms[key];

                            return (
                              <div
                                key={key}
                                className="flex items-center justify-between p-2.5 rounded-lg border border-ash/80 bg-paper gap-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-[13.5px] font-medium text-ink">{info.label}</p>
                                  <p className="text-[11.5px] text-fossil line-clamp-1">{info.desc}</p>
                                </div>
                                <Toggle
                                  checked={isGranted}
                                  disabled={isOwner}
                                  label={info.label}
                                  onChange={(val) => {
                                    if (isOwner) return;
                                    updateUserPermissions(u.id, { [key]: val });
                                    toast({
                                      title: `${info.label} ${val ? 'Diaktifkan' : 'Dinonaktifkan'} untuk ${u.name}`,
                                      icon: val ? 'check' : 'warning',
                                    });
                                  }}
                                />
                              </div>
                            );
                          })}

                          {isOwner && (
                            <p className="md:col-span-2 text-caption text-pebble italic">
                              * Akun Owner memiliki akses penuh ke seluruh fitur dan sistem.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </CardBody>
        </Card>
      </Reveal>

      {/* Konektivitas & offline */}
      <Reveal delay={0.25}>
        <Card>
          <CardHeader title="Konektivitas & Offline" />
          <CardBody>
            <div className="flex items-center gap-4 py-1">
              <span className="w-9 h-9 rounded-lg bg-sand inline-flex items-center justify-center shrink-0">
                <Icon name="sync" size={16} className="text-smoke" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-ink">Simulasi mode offline</p>
                <p className="text-body-sm text-fossil">
                  Uji perilaku POS & antrean sinkronisasi tanpa memutus internet.
                </p>
              </div>
              <Toggle
                checked={!isOnline}
                label="Simulasi mode offline"
                onChange={(v) => {
                  if (!v) {
                    const n = pendingLocal.length;
                    setOnline(true);
                    toast({ title: n > 0 ? `Kembali online. Mengirim ${n} antrean ke server.` : 'Kembali online.', icon: 'online' });
                  } else {
                    setOnline(false);
                  }
                }}
              />
            </div>
            <div className="border-t border-sand mt-4 pt-4">
              <p className="text-caption text-fossil">
                Sinkron terakhir: {lastSyncAt ? formatDateTime(lastSyncAt) : '—'} · Antrean lokal:{' '}
                {pendingLocal.length}
              </p>
            </div>
          </CardBody>
        </Card>
      </Reveal>

      {/* Konfirmasi ganti template */}
      <Modal
        open={pendingTemplate !== null}
        onClose={() => setPendingTemplate(null)}
        title="Ganti template industri?"
        maxWidth="md"
      >
        <p className="text-body-sm text-fossil">
          Navigasi akan menyesuaikan. Data produk, stok, dan transaksi tidak berubah.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingTemplate(null)}>
            Batal
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (pendingTemplate) {
                setTemplate(pendingTemplate);
                toast({
                  title: `Template diganti ke ${templates.find((t) => t.value === pendingTemplate)?.label}`,
                  icon: 'check',
                });
              }
              setPendingTemplate(null);
            }}
          >
            Ganti Template
          </Button>
        </div>
      </Modal>

      {/* Modal Tambah Karyawan */}
      <Modal
        open={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        title="Tambah Anggota Tim / Karyawan"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-sand/60 border border-ash/80 text-caption text-ink flex items-start gap-2.5">
            <Icon name="sparkles" size={16} className="text-olive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[13px]">Auto-Generate Username &amp; Kata Sandi</p>
              <p className="text-fossil text-[12px] mt-0.5">
                Cukup ketikkan nama karyawan, sistem akan otomatis membuatkan username <code className="font-mono bg-paper px-1 py-0.5 rounded text-ink">nama@{bizSlug}</code> dan kata sandi simpel <code className="font-mono bg-paper px-1 py-0.5 rounded text-ink">nama123</code>.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Nama Lengkap Karyawan"
              value={newUserName}
              onChange={(e) => handleEmployeeNameChange(e.target.value)}
              placeholder="mis. Fahmi"
              required
            />
            <Input
              label={`Username / Email Login (@${bizSlug})`}
              type="text"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              placeholder={`mis. fahmi@${bizSlug}`}
              required
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 items-start">
            <div className="space-y-1">
              <div className="relative">
                <Input
                  label="Kata Sandi (Otomatis &amp; Simpel)"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="mis. fahmi123"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-8 text-fossil hover:text-ink text-caption"
                  tabIndex={-1}
                >
                  {showNewPassword ? 'Sembunyikan' : 'Lihat'}
                </button>
              </div>
              <p className="text-[11.5px] text-fossil">Kata sandi default praktis, tidak rumit untuk karyawan.</p>
            </div>

            <div className="pt-7">
              <Button
                variant="subtle"
                full
                size="md"
                icon="copy"
                onClick={() => {
                  if (!newUserName.trim()) {
                    toast({ title: 'Ketik nama karyawan terlebih dahulu', icon: 'warning' });
                    return;
                  }
                  const text = `*Kredensial Login Retalio*\nUsaha: ${tenant.name}\nNama: ${newUserName}\nUsername: ${newUserEmail}\nKata Sandi: ${newUserPassword}\nPeran: ${newUserRole.toUpperCase()}`;
                  copyText(text, 'Kredensial login disalin! Siap dikirim ke karyawan');
                }}
              >
                Salin Kredensial Login
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Select
              label="Peran / Jabatan"
              value={newUserRole}
              onChange={(e) => {
                const r = e.target.value as Role;
                setNewUserRole(r);
                // Preset default perms based on role
                if (r === 'admin') {
                  setNewUserPerms({
                    pos_access: true,
                    inventory_access: true,
                    finance_access: true,
                    discount_permission: true,
                    void_transaction: true,
                    export_data: true,
                    manage_products: true,
                  });
                } else if (r === 'manager') {
                  setNewUserPerms({
                    pos_access: true,
                    inventory_access: true,
                    finance_access: false,
                    discount_permission: true,
                    void_transaction: true,
                    export_data: false,
                    manage_products: true,
                  });
                } else if (r === 'cashier') {
                  setNewUserPerms({
                    pos_access: true,
                    inventory_access: false,
                    finance_access: false,
                    discount_permission: false,
                    void_transaction: false,
                    export_data: false,
                    manage_products: false,
                  });
                } else if (r === 'staff') {
                  setNewUserPerms({
                    pos_access: false,
                    inventory_access: true,
                    finance_access: false,
                    discount_permission: false,
                    void_transaction: false,
                    export_data: false,
                    manage_products: false,
                  });
                }
              }}
            >
              <option value="admin">Admin Operasional</option>
              <option value="manager">Manager Outlet</option>
              <option value="cashier">Kasir POS</option>
              <option value="staff">Staff Gudang / Inventori</option>
            </Select>

            <Select
              label="Penugasan Outlet"
              value={newUserOutlet || (outlets[0]?.id ?? '')}
              onChange={(e) => setNewUserOutlet(e.target.value)}
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="pt-2">
            <p className="text-caption text-ink font-semibold mb-2">Setel Izin Akses Granular (Toggle):</p>
            <div className="grid sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
              {Object.entries(permissionLabels).map(([key, info]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-ash bg-bone/30 gap-2"
                >
                  <span className="text-[13px] text-ink truncate">{info.label}</span>
                  <Toggle
                    checked={!!newUserPerms[key]}
                    label={info.label}
                    onChange={(val) => setNewUserPerms((prev) => ({ ...prev, [key]: val }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAddUserOpen(false)}>
            Batal
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!newUserName.trim() || !newUserEmail.trim()) {
                toast({ title: 'Nama dan Email/Username wajib diisi', icon: 'warning' });
                return;
              }

              const cleanEmail = newUserEmail.trim().includes('@')
                ? newUserEmail.trim()
                : `${newUserEmail.trim()}@${bizSlug}`;

              const newU: User = {
                id: `u-${Date.now()}`,
                tenant_id: tenant.id,
                name: newUserName.trim(),
                email: cleanEmail,
                password: newUserPassword.trim() || `${newUserName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'karyawan'}123`,
                role: newUserRole,
                outlet_id: newUserOutlet || outlets[0]?.id || null,
                permissions: newUserPerms,
                is_active: true,
                last_login: undefined,
              };

              addUser(newU);
              toast({ title: `Karyawan ${newU.name} (${newU.role.toUpperCase()}) berhasil ditambahkan!`, icon: 'check' });
              setAddUserOpen(false);
              setNewUserName('');
              setNewUserEmail('');
              setNewUserPassword('');
            }}
          >
            Simpan Karyawan
          </Button>
        </div>
      </Modal>

      {/* Modal Ubah Profil Usaha */}
      <Modal
        open={editBizOpen}
        onClose={() => setEditBizOpen(false)}
        title="Ubah Profil Usaha"
        maxWidth="md"
      >
        <div className="space-y-4">
          <Input
            label="Nama Usaha / Brand"
            value={bizNameInput}
            onChange={(e) => setBizNameInput(e.target.value)}
            placeholder="mis. Toko Ritel Maju Jaya"
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditBizOpen(false)}>
            Batal
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!bizNameInput.trim()) {
                toast({ title: 'Nama usaha tidak boleh kosong', icon: 'warning' });
                return;
              }
              updateTenant({ name: bizNameInput.trim() });
              toast({ title: 'Profil usaha diperbarui!', icon: 'check' });
              setEditBizOpen(false);
            }}
          >
            Simpan Perubahan
          </Button>
        </div>
      </Modal>

      {/* Modal Pilih & Ganti Paket Langganan */}
      <Modal
        open={plansModalOpen}
        onClose={() => setPlansModalOpen(false)}
        title="Ganti Paket Langganan Usaha"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <p className="text-body-sm text-fossil">
            Pilih paket yang sesuai dengan skala dan kebutuhan bisnismu. Perubahan paket langsung berlaku seketika.
          </p>

          <div className="grid sm:grid-cols-3 gap-3.5 pt-2">
            {plans.map((p) => {
              const active = tenant.subscription_plan === p.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'p-4 sm:p-5 flex flex-col justify-between rounded-2xl border transition-all',
                    active
                      ? 'border-ink bg-sand/60 shadow-md ring-2 ring-ink'
                      : 'border-ash bg-paper hover:border-pebble',
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-h4 font-bold text-ink">{p.name}</span>
                      {p.badge && (
                        <Badge variant="accent" className="text-[10px] px-1.5 py-0.5">
                          {p.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[12px] text-fossil leading-snug">{p.tagline}</p>
                    <div className="my-3 pt-3 border-t border-sand">
                      <span className="text-heading-sm font-bold text-ink">
                        {p.monthlyPrice ? formatIDR(p.monthlyPrice) : 'Kustom'}
                      </span>
                      {p.monthlyPrice && <span className="text-caption text-fossil"> /bln</span>}
                    </div>
                    <ul className="space-y-1.5 mt-2">
                      {p.features.slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[12px] text-ink leading-tight">
                          <Icon name="check" size={13} className="text-olive shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 pt-3 border-t border-sand/60">
                    {active ? (
                      <Badge variant="ink" className="w-full justify-center py-1.5 text-[12px]">
                        ✓ Paket Aktif Saat Ini
                      </Badge>
                    ) : p.id === 'custom' ? (
                      <div className="space-y-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          full
                          onClick={() => {
                            setSubscriptionPlan('custom');
                            toast({
                              title: 'Paket Custom Enterprise Diaktifkan!',
                              description: 'Semua kuota dan batas outlet telah dibuka tanpa batas.',
                              icon: 'check',
                            });
                            setPlansModalOpen(false);
                          }}
                        >
                          Aktifkan Custom Plan
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          full
                          onClick={() => {
                            setPlansModalOpen(false);
                            setCustomPlanModalOpen(true);
                          }}
                        >
                          Konsultasi Fitur Khusus
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        full
                        onClick={() => {
                          setSubscriptionPlan(p.id);
                          toast({
                            title: `Paket berhasil diubah ke ${p.name}!`,
                            description: p.id === 'basic' ? 'Fitur AI dinonaktifkan.' : 'Fitur Retalio Intelligence telah aktif.',
                            icon: 'check',
                          });
                          setPlansModalOpen(false);
                        }}
                      >
                        Pilih {p.name}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="ghost" onClick={() => setPlansModalOpen(false)}>
            Tutup
          </Button>
        </div>
      </Modal>

      {/* Modal Konsultasi Custom Plan Enterprise */}
      <Modal
        open={customPlanModalOpen}
        onClose={() => setCustomPlanModalOpen(false)}
        title="Paket Custom &amp; Enterprise Retalio"
        maxWidth="lg"
      >
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-chartreuse/20 border border-chartreuse/50">
            <h3 className="text-body font-semibold text-ink flex items-center gap-2">
              <Icon name="sparkles" size={17} />
              Solusi Khusus Franchise, Waralaba, &amp; Pabrik Multi-Cabang
            </h3>
            <p className="text-[13px] text-ink/80 mt-1 leading-relaxed">
              Paket Custom Retalio dirancang khusus untuk bisnis yang membutuhkan arsitektur terisolasi, integrasi hardware POS khusus, dan model AI privat.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3.5">
            <div className="p-3.5 rounded-xl border border-ash bg-paper">
              <p className="text-[13.5px] font-semibold text-ink flex items-center gap-1.5">
                <Icon name="store" size={15} className="text-olive" />
                Unlimited Outlets &amp; Gudang
              </p>
              <p className="text-[12px] text-fossil mt-1">
                Kelola puluhan cabang dan gudang transit dengan sinkronisasi inventori terpusat secara real-time.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-ash bg-paper">
              <p className="text-[13.5px] font-semibold text-ink flex items-center gap-1.5">
                <Icon name="assistant" size={15} className="text-olive" />
                Dedicated Private NVIDIA NIM
              </p>
              <p className="text-[12px] text-fossil mt-1">
                Dedicated server / endpoint AI on-premise dengan fine-tuning khusus data penjualan &amp; resep bisnismu.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-ash bg-paper">
              <p className="text-[13.5px] font-semibold text-ink flex items-center gap-1.5">
                <Icon name="pos" size={15} className="text-olive" />
                Integrasi Hardware POS &amp; ERP
              </p>
              <p className="text-[12px] text-fossil mt-1">
                Dukungan printer thermal LAN/Bluetooth, timbangan digital, barcode scanner, dan webhook API ERP.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-ash bg-paper">
              <p className="text-[13.5px] font-semibold text-ink flex items-center gap-1.5">
                <Icon name="user" size={15} className="text-olive" />
                SLA 99.9% &amp; Onboarding Privat
              </p>
              <p className="text-[12px] text-fossil mt-1">
                Dedicated Account Manager, pelatihan tim staf langsung, serta bantuan migrasi database gratis.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-sand bg-bone flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Ingin berdiskusi dengan tim teknis Retalio?</p>
              <p className="text-[12px] text-fossil">Kami siap menyusun proposal arsitektur dan penawaran sesuai kebutuhan bisnismu.</p>
            </div>
            <a
              href="https://wa.me/6281234567890?text=Halo%20Tim%20Retalio,%20saya%20tertarik%20konsultasi%20Paket%20Custom%20Enterprise"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-ink text-white text-[13px] font-medium hover:bg-ink/90 transition-colors whitespace-nowrap"
            >
              <Icon name="sparkles" size={15} />
              Chat WhatsApp Enterprise
            </a>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCustomPlanModalOpen(false)}>
            Tutup
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setSubscriptionPlan('custom');
              toast({ title: 'Paket Custom Enterprise diaktifkan!', icon: 'check' });
              setCustomPlanModalOpen(false);
            }}
          >
            Aktifkan Custom Plan di Akun Ini
          </Button>
        </div>
      </Modal>
    </div>
  );
}
