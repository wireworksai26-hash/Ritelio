import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/controls';
import { Modal } from '../components/ui/Modal';
import { Icon, type IconName } from '../components/icons/Icon';
import { Logo } from '../components/layout/Logo';
import { Reveal } from '../components/Reveal';
import { isAccessRestricted } from '../lib/api';
import { homePathFor, useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../stores/businessStore';
import { toast } from '../stores/toastStore';

const features: { icon: IconName; label: string; caption: string }[] = [
  {
    icon: 'pos',
    label: 'Kasir offline-first',
    caption: 'Transaksi tetap jalan tanpa internet.',
  },
  {
    icon: 'inventory',
    label: 'Stok real-time multi-gudang',
    caption: 'Dengan prediksi restock AI.',
  },
  {
    icon: 'assistant',
    label: 'Retalio Intelligence',
    caption: 'Menjawab dari data aktual, bukan tebakan.',
  },
];

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export default function Login() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);

  const businessTenant = useBusinessStore((s) => s.tenant);
  const businessUsers = useBusinessStore((s) => s.users);
  const updateUserPassword = useBusinessStore((s) => s.updateUserPassword);

  const [showBar, setShowBar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Rate Limiting State
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Reset Password Modal State
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<'email' | 'otp' | 'new_password' | 'success'>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Saring pengguna milik tenant aktif
  const tenantUsers = businessUsers.filter(
    (u) => u.tenant_id === businessTenant.id,
  );

  // Timer countdown untuk lockout rate-limit
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          setFailedAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading || lockoutRemaining > 0) return;

    setLoading(true);
    try {
      const u = await login(emailInput, passwordInput);
      setFailedAttempts(0);
      toast({ title: `Selamat datang, ${u.name}!`, icon: 'check' });
      navigate(homePathFor(u.role));
    } catch (err: any) {
      // Akun ditangguhkan bukan salah sandi: tampilkan alasannya tanpa menghitung percobaan gagal.
      if (isAccessRestricted(err)) {
        toast({ title: 'Akun tidak dapat masuk', description: err.message, icon: 'warning' });
        return;
      }
      const nextFailed = failedAttempts + 1;
      setFailedAttempts(nextFailed);

      if (nextFailed >= MAX_FAILED_ATTEMPTS) {
        setLockoutRemaining(LOCKOUT_SECONDS);
        toast({
          title: 'Akun dikunci sementara',
          description: `Terlalu banyak percobaan gagal. Tunggu ${LOCKOUT_SECONDS} detik.`,
          icon: 'lock',
        });
      } else {
        const sisa = MAX_FAILED_ATTEMPTS - nextFailed;
        toast({
          title: 'Login Gagal',
          description: `${err.message || 'Kredensial tidak valid'}. Sisa percobaan: ${sisa}x`,
          icon: 'warning',
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleStartReset() {
    setResetEmail(emailInput || (tenantUsers[0]?.email ?? ''));
    setResetStep('email');
    setResetOtp('');
    setGeneratedOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setResetOpen(true);
  }

  function handleSendOtp() {
    const clean = resetEmail.trim().toLowerCase();
    const inputUsername = clean.split('@')[0];

    const found = businessUsers.find((u) => {
      const uEmail = (u.email || '').toLowerCase().trim();
      const uName = (u.name || '').toLowerCase().trim();
      const uUsername = uEmail.split('@')[0];

      return (
        uEmail === clean ||
        uEmail.replace(/\.[a-z]{2,}$/i, '') === clean.replace(/\.[a-z]{2,}$/i, '') ||
        uUsername === clean ||
        uUsername === inputUsername ||
        uName === clean
      );
    });

    if (!found) {
      toast({ title: 'Username / Email tidak ditemukan di sistem', icon: 'warning' });
      return;
    }
    setResetEmail(found.email);
    // Generate kode 6-digit simulasi
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(code);
    setResetStep('otp');
    toast({ title: 'Kode verifikasi telah dikirim', icon: 'mail' });
  }

  function handleVerifyOtp() {
    if (resetOtp.trim() !== generatedOtp.trim()) {
      toast({ title: 'Kode verifikasi salah', icon: 'warning' });
      return;
    }
    setResetStep('new_password');
  }

  function handleSaveNewPassword() {
    if (newPassword.length < 6) {
      toast({ title: 'Kata sandi minimal 6 karakter', icon: 'warning' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Konfirmasi kata sandi tidak cocok', icon: 'warning' });
      return;
    }

    const ok = updateUserPassword(resetEmail, newPassword);
    if (ok) {
      setResetStep('success');
      setEmailInput(resetEmail);
      setPasswordInput(newPassword);
      toast({ title: 'Kata sandi berhasil diubah!', icon: 'check' });
    } else {
      toast({ title: 'Gagal mengubah kata sandi', icon: 'warning' });
    }
  }

  return (
    <div className="min-h-screen bg-bone flex flex-col">
      {showBar && (
        <div className="relative bg-charcoal text-paper text-body-sm text-center h-10 flex items-center justify-center px-10">
          Retalio ERP untuk usaha dan karyawan Indonesia
          <button
            type="button"
            aria-label="Tutup pengumuman"
            onClick={() => setShowBar(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-paper hover:opacity-70 transition-opacity"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Kolom kiri — editorial hero */}
        <aside className="hidden lg:flex flex-col justify-between flex-1 p-12">
          <Logo />
          <div className="flex flex-col gap-10">
            <Reveal>
              <div>
                <h1 className="text-display-lg font-light text-ink">
                  Kelola bisnis setenang membaca jurnal.
                </h1>
                <p className="text-[17px] text-fossil max-w-md mt-6">
                  POS offline-first, inventori real-time, laporan keuangan, dan akses multi-peran karyawan —
                  dalam satu PWA yang bisa diinstall.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.05}>
              <ul className="flex flex-col gap-4">
                {features.map((f) => (
                  <li key={f.icon} className="flex items-start gap-3">
                    <span className="inline-flex w-9 h-9 rounded-lg bg-sand items-center justify-center shrink-0">
                      <Icon name={f.icon} size={18} />
                    </span>
                    <div>
                      <p className="text-[15px] text-ink font-medium">{f.label}</p>
                      <p className="text-caption text-fossil mt-0.5">{f.caption}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <p className="text-caption text-fossil">© 2026 Retalio</p>
        </aside>

        {/* Kolom kanan — form login */}
        <main className="flex items-center justify-center p-6 lg:p-12 lg:w-[520px] w-full">
          <Reveal delay={0.1} className="w-full max-w-md">
            <div className="mb-4">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-[14px] text-fossil hover:text-ink transition-colors group"
              >
                <Icon name="arrow-left" size={16} className="transition-transform group-hover:-translate-x-0.5" />
                Kembali ke Beranda
              </Link>
            </div>

            <Card className="rounded-2xl w-full p-6 sm:p-8 shadow-sm">
              <div className="lg:hidden mb-6 flex items-center justify-between">
                <Logo compact />
              </div>

              <div>
                <h2 className="text-heading-sm font-semibold text-ink">Masuk ke Retalio</h2>
                <p className="text-caption text-fossil mt-1">
                  Portal Owner, Manager, Kasir, &amp; Tim Usaha
                </p>
              </div>

              {/* Rate Limit Alert */}
              {lockoutRemaining > 0 && (
                <div className="mt-4 p-3.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-body-sm flex items-start gap-2.5">
                  <Icon name="lock" size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[13.5px]">Login Terkunci Sementara</p>
                    <p className="text-[12px] mt-0.5">
                      Batas percobaan terlampaui. Coba lagi dalam{' '}
                      <strong className="tnum font-bold">{lockoutRemaining} detik</strong>.
                    </p>
                  </div>
                </div>
              )}

              {failedAttempts > 0 && lockoutRemaining === 0 && (
                <div className="mt-3 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-caption flex items-center justify-between">
                  <span>Percobaan login tidak valid</span>
                  <Badge variant="accent">Sisa {MAX_FAILED_ATTEMPTS - failedAttempts}x lagi</Badge>
                </div>
              )}

              {/* Form Input Login */}
              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
                <Input
                  label="Username / Email Login"
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="mis. ferry@newsembakery.id / owner@usaha.id"
                  disabled={lockoutRemaining > 0}
                  required
                  autoComplete="username"
                />

                <div className="space-y-1">
                  <div className="relative">
                    <Input
                      label="Kata Sandi"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Masukkan kata sandi"
                      disabled={lockoutRemaining > 0}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-8 text-fossil hover:text-ink text-caption"
                      tabIndex={-1}
                    >
                      {showPassword ? 'Sembunyikan' : 'Lihat'}
                    </button>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleStartReset}
                      className="text-caption text-fossil hover:text-ink transition-colors"
                    >
                      Lupa kata sandi?
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  full
                  size="lg"
                  iconRight="arrow-right"
                  disabled={loading || lockoutRemaining > 0}
                  className="mt-1"
                >
                  {lockoutRemaining > 0
                    ? `Terkunci (${lockoutRemaining}s)`
                    : loading
                      ? 'Memverifikasi…'
                      : 'Masuk ke Dashboard'}
                </Button>
              </form>

              <p className="text-center mt-6 text-body-sm text-fossil">
                Belum mendaftarkan usaha?{' '}
                <Link
                  to="/onboarding"
                  className="text-ink font-medium underline decoration-olive underline-offset-4"
                >
                  Daftar bisnis baru
                </Link>
              </p>
            </Card>
          </Reveal>
        </main>
      </div>

      {/* Modal Lupa & Reset Password */}
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset Kata Sandi"
        maxWidth="md"
      >
        {resetStep === 'email' && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              Masukkan email akun terdaftar Anda. Kode OTP verifikasi akan dikirimkan untuk mereset kata sandi.
            </p>
            <Input
              label="Username / Email Terdaftar"
              type="text"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="mis. ferry@newsembakery.id / owner@usaha.id"
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResetOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSendOtp}>
                Kirim Kode OTP
              </Button>
            </div>
          </div>
        )}

        {resetStep === 'otp' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-sand border border-ash text-center space-y-1">
              <p className="text-caption text-fossil">Kode OTP Verifikasi (Simulasi Langsung):</p>
              <p className="text-heading-sm font-bold text-ink tracking-widest font-mono">{generatedOtp}</p>
            </div>
            <p className="text-body-sm text-fossil">
              Masukkan 6 digit kode di atas untuk mengonfirmasi kepemilikan akun <strong className="text-ink">{resetEmail}</strong>:
            </p>
            <Input
              label="Kode OTP 6-Digit"
              value={resetOtp}
              onChange={(e) => setResetOtp(e.target.value)}
              placeholder="Contoh: 123456"
              maxLength={6}
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResetStep('email')}>
                Kembali
              </Button>
              <Button onClick={handleVerifyOtp}>
                Verifikasi OTP
              </Button>
            </div>
          </div>
        )}

        {resetStep === 'new_password' && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              Buat kata sandi baru untuk akun <strong className="text-ink">{resetEmail}</strong>:
            </p>
            <Input
              label="Kata Sandi Baru"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
            />
            <Input
              label="Konfirmasi Kata Sandi Baru"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ketik ulang kata sandi baru"
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResetOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSaveNewPassword}>
                Simpan Kata Sandi Baru
              </Button>
            </div>
          </div>
        )}

        {resetStep === 'success' && (
          <div className="space-y-4 text-center py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Icon name="check" size={24} />
            </div>
            <h3 className="text-h3 font-semibold text-ink">Kata Sandi Berhasil Diperbarui!</h3>
            <p className="text-body-sm text-fossil">
              Kata sandi baru Anda telah aktif. Silakan masuk menggunakan kredensial baru.
            </p>
            <div className="mt-6 flex justify-center">
              <Button full onClick={() => setResetOpen(false)}>
                Masuk Sekarang
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
