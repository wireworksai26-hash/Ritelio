import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Select, Textarea } from '../components/ui/controls';
import { PriceInputWithQuickAdd } from '../components/ui/PriceInputWithQuickAdd';
import { Icon, type IconName } from '../components/icons/Icon';
import { Logo, LogoMark } from '../components/layout/Logo';
import { Reveal } from '../components/Reveal';
import { apiFetch } from '../lib/api';
import { cn } from '../lib/format';
import { isNetworkError } from '../lib/offline';
import { PASSWORD_HINT, ownerAccountProblem } from '../lib/onboardingValidation';
import { listOf } from '../lib/useResource';
import { useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../stores/businessStore';
import { useModuleStore } from '../stores/moduleStore';
import { useOutletStore } from '../stores/outletStore';
import { toast } from '../stores/toastStore';
import { plans } from '../data/plans';
import { formatIDR } from '../lib/format';
import type { IndustryTemplate, SubscriptionPlan, User } from '../types';

const TOTAL_STEPS = 6;

const templates: { key: IndustryTemplate; icon: IconName; title: string; desc: string }[] = [
  { key: 'retail', icon: 'store', title: 'Retail', desc: 'Inventori + POS + Keuangan' },
  { key: 'manufacturing', icon: 'layers', title: 'Manufaktur', desc: 'Inventori + Produksi + Keuangan' },
  { key: 'services', icon: 'calendar', title: 'Jasa', desc: 'Booking + POS + Keuangan' },
];

const installBenefits = [
  'Bekerja offline, sinkron otomatis',
  'Notifikasi stok & laporan penjualan',
  'Ringan — tanpa perlu install dari app store',
];

const stepMeta: { title: string; sub: string }[] = [
  {
    title: 'Tentang bisnismu',
    sub: 'Ceritakan sedikit tentang bisnismu — Retalio menyiapkan sisanya.',
  },
  {
    title: 'Template industri',
    sub: 'Template menentukan modul yang aktif. Bisa diubah kapan saja tanpa menghapus data.',
  },
  {
    title: 'Outlet pertama',
    sub: 'Outlet adalah lokasi fisik tempat kamu berjualan. Tambah lagi nanti dari Pengaturan.',
  },
  {
    title: 'Produk pertama',
    sub: 'Satu produk cukup untuk mulai berjualan hari ini.',
  },
  {
    title: 'Pilih paket langganan',
    sub: 'Pilih paket yang sesuai untuk skala bisnismu. Fitur AI hanya aktif jika kamu memilih paket +AI.',
  },
  {
    title: 'Install aplikasi',
    sub: 'Retalio adalah PWA — install langsung dari browser, tanpa app store.',
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    businessName: '',
    industry: 'retail' as IndustryTemplate,
    subscriptionPlan: 'basic' as SubscriptionPlan,
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    outletName: '',
    outletAddress: '',
    productName: '',
    productUnit: 'pcs',
    productPrice: '25000',
    productStock: '50',
  });

  const next = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));

  // Mode demo lokal tanpa backend. Hanya dipakai di build dev saat server tidak terjangkau.
  function finishLocally() {
    const cleanSlug = form.businessName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'usaha';
    const { tenant: newTenant, outlet: newOutlet, ownerUser } = useBusinessStore.getState().registerBusiness({
      businessName: form.businessName,
      industry: form.industry,
      subscriptionPlan: form.subscriptionPlan,
      ownerName: form.ownerName.trim() || `Owner ${form.businessName || 'Bisnis'}`,
      ownerEmail: form.ownerEmail.trim() || `owner@${cleanSlug}.id`,
      ownerPassword: form.ownerPassword,
      outletName: form.outletName,
      outletAddress: form.outletAddress,
      productName: form.productName,
      productUnit: form.productUnit,
      productPrice: form.productPrice,
      productStock: form.productStock,
    });
    useAuthStore.getState().setUser(ownerUser);
    useOutletStore.getState().setSelected(newOutlet.id);
    useModuleStore.getState().setTemplate(form.industry);
    toast({
      title: `Selamat datang di ${newTenant.name}!`,
      description: `Mode demo lokal: data hanya tersimpan di browser ini.`,
      icon: 'info',
    });
    navigate('/app');
  }

  // Daftar di server: bisnis + akun owner, lalu outlet dan produk awal. Akun adalah yang terpenting;
  // bila outlet/produk gagal tersimpan, pengguna tetap masuk dan diberi tahu apa yang perlu ditambah manual.
  async function registerOnServer() {
    const user = await useAuthStore.getState().registerOwner({
      businessName: form.businessName,
      industryTemplate: form.industry,
      ownerName: form.ownerName,
      email: form.ownerEmail,
      password: form.ownerPassword,
    });
    useModuleStore.getState().setTemplate(form.industry);

    let setupNote = '';
    try {
      const outlet = await apiFetch<{ id: string; name: string }>('/v1/outlets', {
        method: 'POST',
        body: JSON.stringify({ name: form.outletName.trim() || 'Outlet Utama', address: form.outletAddress.trim() }),
      });
      useOutletStore.getState().setSelected(outlet.id);

      if (form.productName.trim()) {
        const warehouses = listOf<{ id: string; outletId?: string | null }>(await apiFetch('/v1/inventory/warehouses'));
        const warehouse = warehouses.find((w) => w.outletId === outlet.id) ?? warehouses[0];
        const stock = Number(form.productStock) || 0;
        await apiFetch('/v1/inventory/products', {
          method: 'POST',
          body: JSON.stringify({
            name: form.productName.trim(),
            unit: form.productUnit.trim() || 'pcs',
            sellPrice: Number(form.productPrice) || 0,
            ...(stock > 0 && warehouse ? { initialStock: stock, warehouseId: warehouse.id } : {}),
          }),
        });
      }
    } catch {
      setupNote = ' Outlet atau produk awal belum tersimpan; tambahkan dari menu Pengaturan dan Inventori.';
    }

    await useBusinessStore.getState().fetchBusinessData().catch(() => {});
    toast({
      title: `Selamat datang, ${user.name}!`,
      description: `Akun ${form.businessName.trim()} siap dipakai.${setupNote}`,
      icon: 'check',
    });
    navigate('/app');
  }

  async function finish() {
    if (submitting) return;
    const problem = ownerAccountProblem(form);
    if (problem) {
      setStep(0);
      toast({ title: 'Lengkapi akun owner dulu', description: problem, icon: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      await registerOnServer();
    } catch (err) {
      if (import.meta.env.DEV && isNetworkError(err)) {
        finishLocally();
        return;
      }
      const message = err instanceof Error ? err.message : 'Coba lagi sebentar lagi.';
      // Galat soal akun (email sudah dipakai, kata sandi ditolak) hanya bisa dibetulkan di langkah pertama.
      if (/email|kata sandi|terdaftar/i.test(message)) setStep(0);
      toast({ title: 'Pendaftaran gagal', description: message, icon: 'warning' });
    } finally {
      setSubmitting(false);
    }
  }

  const ownerProblem = ownerAccountProblem(form);

  const meta = stepMeta[step];

  return (
    <div className="min-h-screen bg-bone flex flex-col">
      <header className="border-b border-ash px-6 sm:px-12 py-5 max-w-4xl w-full mx-auto">
        <div className="flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={() => {
              if (step > 0) setStep((s) => s - 1);
              else navigate('/');
            }}
            className="inline-flex items-center gap-1.5 text-[14px] text-fossil hover:text-ink transition-colors group"
          >
            <Icon name="arrow-left" size={15} className="transition-transform group-hover:-translate-x-0.5" />
            {step > 0 ? 'Langkah Sebelumnya' : 'Kembali ke Beranda'}
          </button>
        </div>
        <div className="mt-6 h-[3px] rounded-full bg-ash overflow-hidden">
          <div
            className="bg-ink h-full transition-all duration-300"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-caption text-fossil mt-2">
          <span>Langkah {step + 1} dari {TOTAL_STEPS}</span>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="hover:text-ink transition-colors"
            >
              ← Kembali ke langkah {step}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-10">
        <div className="w-full max-w-2xl">
          <Reveal key={step}>
            <h1 className="text-heading-lg font-light text-ink">{meta.title}</h1>
            <p className="text-[15px] text-fossil mt-2 max-w-lg">{meta.sub}</p>

            {step === 0 && (
              <div className="mt-8 flex flex-col gap-4 max-w-md">
                <Input
                  label="Nama usaha / brand"
                  placeholder="mis. Geprek Juara / Kopi Senja"
                  value={form.businessName}
                  onChange={(e) => {
                    const bName = e.target.value;
                    setForm({ ...form, businessName: bName });
                  }}
                  required
                />
                <Select
                  label="Jenis industri"
                  value={form.industry}
                  onChange={(e) =>
                    setForm({ ...form, industry: e.target.value as IndustryTemplate })
                  }
                >
                  <option value="retail">Retail / F&B (Resto, Kafe, Toko)</option>
                  <option value="manufacturing">Manufaktur / Bakery / Konveksi</option>
                  <option value="services">Jasa &amp; Perawatan</option>
                </Select>

                <div className="pt-2 border-t border-sand space-y-3">
                  <p className="text-caption text-ink font-semibold flex items-center gap-1.5">
                    <Icon name="user" size={14} />
                    Akun Login Owner
                  </p>
                  <Input
                    label="Nama Owner"
                    placeholder="mis. Hendra Setiawan"
                    value={form.ownerName}
                    onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  />
                  <Input
                    label="Email Login Owner"
                    type="email"
                    placeholder="mis. owner@geprekjuara.id"
                    autoComplete="email"
                    value={form.ownerEmail}
                    onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                    hint="Digunakan untuk masuk ke sistem dan mengelola bisnis"
                  />
                  <div className="relative">
                    <Input
                      label="Kata Sandi Akun Owner"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Buat kata sandi"
                      autoComplete="new-password"
                      hint={PASSWORD_HINT}
                      value={form.ownerPassword}
                      onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-8 text-fossil hover:text-ink text-caption"
                      tabIndex={-1}
                    >
                      {showPass ? 'Sembunyikan' : 'Lihat'}
                    </button>
                  </div>
                  {ownerProblem && (form.ownerName || form.ownerEmail || form.ownerPassword) && (
                    <p className="text-caption text-rose-700" role="alert">
                      {ownerProblem}
                    </p>
                  )}
                  <p className="text-caption text-fossil">
                    Dengan melanjutkan, kamu menyetujui{' '}
                    <Link to="/syarat-ketentuan" target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">
                      Syarat &amp; Ketentuan
                    </Link>{' '}
                    dan{' '}
                    <Link to="/privasi" target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">
                      Kebijakan Privasi
                    </Link>
                    .
                  </p>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="mt-8 grid sm:grid-cols-3 gap-3">
                {templates.map((t) => {
                  const active = form.industry === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setForm({ ...form, industry: t.key })}
                      className="text-left"
                    >
                      <Card
                        className={cn(
                          'p-5 h-full transition-colors',
                          active ? 'border-ink bg-sand/40 shadow-sm ring-1 ring-ink/20' : 'border-ash hover:border-pebble',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="inline-flex w-9 h-9 rounded-lg bg-sand items-center justify-center">
                            <Icon name={t.icon} size={18} />
                          </span>
                          {active && <Badge variant="ink">Dipilih</Badge>}
                        </div>
                        <p className="text-[15px] text-ink font-medium mt-4">{t.title}</p>
                        <p className="text-caption text-fossil mt-1">{t.desc}</p>
                      </Card>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 2 && (
              <div className="mt-8 flex flex-col gap-5 max-w-md">
                <Input
                  label="Nama outlet"
                  placeholder="mis. Outlet Pusat"
                  value={form.outletName}
                  onChange={(e) => setForm({ ...form, outletName: e.target.value })}
                />
                <Textarea
                  label="Alamat outlet"
                  placeholder="mis. Jl. Sudirman No. 45"
                  value={form.outletAddress}
                  onChange={(e) => setForm({ ...form, outletAddress: e.target.value })}
                />
              </div>
            )}

            {step === 3 && (
              <div className="mt-8 flex flex-col gap-5 max-w-md">
                <Input
                  label={
                    form.industry === 'services'
                      ? 'Nama layanan perdana'
                      : form.industry === 'manufacturing'
                        ? 'Nama produk / hasil produksi perdana'
                        : 'Nama produk perdana'
                  }
                  placeholder={
                    form.industry === 'services'
                      ? 'mis. Paket Cuci Mobil + Waxing / Potong Rambut'
                      : form.industry === 'manufacturing'
                        ? 'mis. Roti Tawar Gandum (Batch) / Kemeja Katun'
                        : 'mis. Kopi Susu Gula Aren / Kaos Polos'
                  }
                  value={form.productName}
                  onChange={(e) => setForm({ ...form, productName: e.target.value })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Satuan Unit"
                    value={form.productUnit}
                    onChange={(e) => setForm({ ...form, productUnit: e.target.value })}
                  >
                    {form.industry === 'services' ? (
                      <>
                        <option value="layanan">Layanan</option>
                        <option value="sesi">Sesi</option>
                        <option value="jam">Jam</option>
                        <option value="paket">Paket</option>
                        <option value="orang">Orang</option>
                      </>
                    ) : form.industry === 'manufacturing' ? (
                      <>
                        <option value="unit">Unit</option>
                        <option value="batch">Batch</option>
                        <option value="lusin">Lusin</option>
                        <option value="kg">Kg</option>
                        <option value="meter">Meter</option>
                        <option value="lembar">Lembar</option>
                      </>
                    ) : (
                      <>
                        <option value="pcs">Pcs</option>
                        <option value="porsi">Porsi</option>
                        <option value="cup">Cup</option>
                        <option value="botol">Botol</option>
                        <option value="box">Box</option>
                        <option value="kg">Kg</option>
                      </>
                    )}
                  </Select>

                  <Input
                    label={form.industry === 'services' ? 'Kapasitas awal (sesi)' : 'Stok awal fisik'}
                    type="number"
                    min={0}
                    value={form.productStock}
                    onChange={(e) => setForm({ ...form, productStock: e.target.value })}
                  />
                </div>

                <PriceInputWithQuickAdd
                  label="Harga Jual"
                  value={Number(form.productPrice) || 0}
                  onChange={(val) => setForm({ ...form, productPrice: String(val) })}
                  min={1000}
                  step={1000}
                  hint="Kamu bisa menggunakan tombol cepat atau slider untuk menentukan harga jual."
                />
              </div>
            )}

            {/* Step 4: Pilih Paket Langganan */}
            {step === 4 && (
              <div className="mt-8 grid sm:grid-cols-3 gap-3.5">
                {plans.map((p) => {
                  const active = form.subscriptionPlan === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setForm({ ...form, subscriptionPlan: p.id })}
                      className="text-left flex flex-col h-full"
                    >
                      <Card
                        className={cn(
                          'p-4 sm:p-5 flex-1 flex flex-col justify-between transition-all rounded-2xl',
                          active
                            ? 'border-ink bg-sand/50 shadow-md ring-2 ring-ink'
                            : 'border-ash bg-paper hover:border-pebble',
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5 mb-2">
                            <span className="text-h4 font-bold text-ink">{p.name}</span>
                            {p.badge && (
                              <Badge variant="accent" className="text-[10px] px-1.5 py-0.5">
                                {p.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[12.5px] text-fossil leading-snug">{p.tagline}</p>
                          <div className="my-3 pt-3 border-t border-sand">
                            <span className="text-heading-sm font-bold text-ink">
                              {p.monthlyPrice ? formatIDR(p.monthlyPrice) : 'Kustom'}
                            </span>
                            {p.monthlyPrice && <span className="text-caption text-fossil"> /bulan</span>}
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
                        <div className="mt-4 pt-3">
                          <Badge variant={active ? 'ink' : 'outline'} className="w-full justify-center py-1 text-[12px]">
                            {active ? '✓ Paket Dipilih' : 'Pilih Paket'}
                          </Badge>
                        </div>
                      </Card>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 5: Install PWA */}
            {step === 5 && (
              <Card className="mt-8 p-6 flex gap-4 rounded-2xl">
                <LogoMark size={44} />
                <div>
                  <p className="text-[15px] font-semibold text-ink">Install Retalio di Perangkat</p>
                  <p className="text-caption text-fossil mt-1">
                    Akses instan dari layar utama HP / Laptop, kasir offline-first, dan bebas biaya app store.
                  </p>
                  <ul className="mt-4 flex flex-col gap-2">
                    {installBenefits.map((b) => (
                      <li key={b} className="flex items-center gap-2">
                        <Icon name="check" size={14} className="text-olive" />
                        <span className="text-body-sm text-ink">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            )}
          </Reveal>
        </div>
      </main>

      <footer className="max-w-2xl mx-auto w-full px-6 pb-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            icon="arrow-left"
            onClick={() => {
              if (step > 0) setStep((s) => s - 1);
              else navigate('/');
            }}
          >
            Kembali
          </Button>
          {step > 0 && step < TOTAL_STEPS - 1 && (
            <Button variant="ghost" onClick={next}>
              Lewati
            </Button>
          )}
          {step === TOTAL_STEPS - 1 && (
            <Button variant="ghost" onClick={finish} disabled={submitting}>
              Nanti saja
            </Button>
          )}
        </div>
        {step < TOTAL_STEPS - 1 ? (
          <Button
            iconRight="arrow-right"
            onClick={next}
            disabled={step === 0 && ownerProblem !== null}
          >
            Lanjut
          </Button>
        ) : (
          <Button icon="check" onClick={finish} disabled={submitting}>
            {submitting ? 'Mendaftarkan akun…' : 'Selesai & buka Dashboard'}
          </Button>
        )}
      </footer>
    </div>
  );
}
