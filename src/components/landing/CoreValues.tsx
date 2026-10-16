import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/format';
import { toast } from '../../stores/toastStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon, type IconName } from '../icons/Icon';

const AUTOPLAY_MS = 6000;

function RolesVisual() {
  const roles: Array<[string, string]> = [
    ['Kasir', 'Kasir, Notifikasi'],
    ['Staff gudang', 'Inventori, Notifikasi'],
    ['Manajer', 'Penjualan, Gudang, Pengadaan, Manufaktur'],
    ['Owner', 'Semua modul'],
  ];
  return (
    <Card className="w-full max-w-sm p-5">
      <p className="text-caption text-fossil">Menu yang terlihat per peran</p>
      <div className="mt-3 space-y-2.5">
        {roles.map(([role, menus]) => (
          <div key={role} className="rounded-lg border border-ash bg-paper px-3.5 py-2.5">
            <p className="text-body-sm text-ink">{role}</p>
            <p className="text-caption text-fossil">{menus}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-caption text-fossil">Server menolak akses di luar peran, bukan hanya menyembunyikan menunya.</p>
    </Card>
  );
}

function OfflineVisual() {
  return (
    <Card className="w-full max-w-sm p-5">
      <div className="flex items-center justify-between">
        <Badge variant="accent" icon="offline">Mode Offline</Badge>
        <span className="text-caption text-fossil tnum">3 transaksi dalam antrean</span>
      </div>
      <div className="mt-4 space-y-2">
        {['Rp 96.000 · QRIS', 'Rp 44.000 · Tunai', 'Rp 70.000 · Debit'].map((t) => (
          <div key={t} className="flex items-center gap-2.5 rounded-lg border border-ash bg-paper px-3.5 py-2.5 text-body-sm text-ink">
            <Icon name="clock" size={14} className="text-pebble" />
            {t}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-caption text-fossil">
        <Icon name="sync" size={13} />
        Tersinkron otomatis saat koneksi kembali
      </div>
    </Card>
  );
}

function SingleSourceVisual() {
  const flow: Array<[IconName, string]> = [
    ['pos', 'Transaksi dicatat'],
    ['inventory', 'Stok bergerak'],
    ['finance', 'Jurnal terbentuk'],
    ['chart', 'Laporan terisi'],
  ];
  return (
    <Card className="w-full max-w-lg p-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {flow.map(([icon, label], i) => (
          <div key={label} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-2 rounded-xl border border-ash bg-paper px-4 py-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sand text-ink">
                <Icon name={icon} size={17} />
              </span>
              <span className="text-caption text-ink whitespace-nowrap">{label}</span>
            </div>
            {i < flow.length - 1 && <Icon name="arrow-right" size={16} className="text-pebble" />}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ExplainableAiVisual() {
  return (
    <Card className="w-full max-w-sm p-5">
      <Badge variant="accent" icon="assistant">Saran AI</Badge>
      <p className="mt-3 text-[15px] text-ink leading-relaxed">
        Buat PO 60 pcs Croissant Mentega ke CV Dairy Fresh sebelum Jumat.
      </p>
      <p className="mt-2.5 border-t border-sand pt-2 text-caption text-fossil">
        Berdasarkan: inventory_stock:stk-6 · stock_movements:14 hari
      </p>
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => toast({ title: 'Ini contoh tampilan', description: 'Di aplikasi, saran menunggu persetujuanmu.', icon: 'info' })}>Terapkan</Button>
        <Button size="sm" variant="ghost" onClick={() => toast({ title: 'Ini contoh tampilan', icon: 'info' })}>Abaikan</Button>
      </div>
    </Card>
  );
}

interface Value {
  id: string;
  label: string;
  sub: string;
  heading: string;
  body: string;
  bg: string;
  visual: ReactNode;
}

const VALUES: Value[] = [
  {
    id: 'peran',
    label: 'Per Peran',
    sub: 'Akses sesuai tugas',
    heading: 'Setiap orang hanya melihat bagiannya.',
    body: 'Kasir melihat kasir, staf gudang melihat stok, manajer melihat penjualan dan pengadaan, owner melihat seluruhnya. Aturan ini ditegakkan di server, jadi mengetik alamat halaman lain tidak membukanya.',
    bg: 'bg-lavender/40',
    visual: <RolesVisual />,
  },
  {
    id: 'offline',
    label: 'Offline-first',
    sub: 'Selalu bisa jualan',
    heading: 'Internet putus, kasir tetap jalan.',
    body: 'Kasir dirancang offline-first: transaksi tersimpan di perangkat, struk tetap tercetak, dan antrean tersinkron otomatis saat online. Modul lain seperti akuntansi dan pengadaan membutuhkan koneksi.',
    bg: 'bg-sand',
    visual: <OfflineVisual />,
  },
  {
    id: 'single-source',
    label: 'Satu Kebenaran',
    sub: 'Tanpa rekap manual',
    heading: 'Satu sumber untuk semua angka.',
    body: 'Penjualan, penerimaan barang, dan penggajian menghasilkan jurnal di buku besar yang sama, dan laporan dibaca dari sana. Jurnal yang sudah diposting tidak diedit, hanya dibalik dengan jurnal pembalik.',
    bg: 'bg-paper border border-ash',
    visual: <SingleSourceVisual />,
  },
  {
    id: 'explainable-ai',
    label: 'AI Terjelaskan',
    sub: 'Bukan kotak hitam',
    heading: 'AI yang menyebut sumbernya.',
    body: 'Setiap insight menyertakan data yang dipakai, dan setiap rekomendasi menunggu persetujuanmu. Retalio Intelligence menyarankan, kamu yang memutuskan.',
    bg: 'bg-chartreuse',
    visual: <ExplainableAiVisual />,
  },
];

// Core values: 4 tab vertikal dengan autoplay
export function CoreValues() {
  const [active, setActive] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % VALUES.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [active]);

  const value = VALUES[active];

  return (
    <div className="rounded-2xl border border-ash bg-paper p-6 lg:p-10">
      <div className="grid lg:grid-cols-[260px_1fr] gap-8 lg:gap-12">
        <div role="tablist" aria-label="Nilai platform" className="flex lg:flex-col gap-1 overflow-x-auto">
          {VALUES.map((v, i) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className="relative min-w-[160px] lg:min-w-0 text-left py-3.5 lg:border-b lg:border-ash"
            >
              <span
                className={cn(
                  'block text-heading-sm font-light transition-colors duration-150',
                  active === i ? 'text-ink' : 'text-pebble hover:text-fossil',
                )}
              >
                {v.label}
              </span>
              <span className="text-caption text-fossil">{v.sub}</span>
              {active === i && (
                <span className="absolute bottom-0 left-0 hidden lg:block h-[2px] w-full bg-sand overflow-hidden rounded-full">
                  <span
                    key={active}
                    className="block h-full bg-ink tab-progress"
                    style={{ animationDuration: `${AUTOPLAY_MS}ms` }}
                  />
                </span>
              )}
            </button>
          ))}
        </div>

        <div key={value.id} className="fade-in">
          <h3 className="text-heading font-light text-ink">{value.heading}</h3>
          <p className="mt-3 text-[17px] text-fossil leading-relaxed max-w-xl">{value.body}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button size="sm" iconRight="arrow-right" onClick={() => navigate('/onboarding')}>Mulai gratis</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const el = document.getElementById('fitur');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Lihat Fitur
            </Button>
          </div>
        </div>
      </div>

      <div
        key={`visual-${value.id}`}
        className={cn('fade-in mt-10 flex min-h-[260px] items-center justify-center rounded-xl p-6 lg:p-10', value.bg)}
      >
        {value.visual}
      </div>
    </div>
  );
}
