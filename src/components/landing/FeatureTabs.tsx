import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Icon } from '../icons/Icon';

const AUTOPLAY_MS = 8000;

function JualVisual() {
  return (
    <Card className="p-5 bg-bone">
      <div className="flex items-center justify-between">
        <p className="text-caption text-fossil">Kasir · Outlet Kemang</p>
        <Badge variant="accent" icon="offline">Offline-ready</Badge>
      </div>
      <div className="mt-4 space-y-2.5">
        {[
          ['2× Kopi Susu Kelana', 'Rp 44.000'],
          ['1× Es Kopi Aren', 'Rp 24.000'],
          ['1× Pain au Chocolat', 'Rp 28.000'],
        ].map(([n, p]) => (
          <div key={n} className="flex justify-between rounded-lg border border-ash bg-paper px-3.5 py-2.5 text-body-sm">
            <span className="text-ink">{n}</span>
            <span className="tnum text-fossil">{p}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-body-sm text-fossil">Total · QRIS</span>
        <span className="tnum text-heading-sm font-light text-ink">Rp 96.000</span>
      </div>
      <div className="mt-3 rounded-lg bg-ink text-paper text-center text-[15px] py-2.5">Bayar</div>
      <p className="mt-3 text-caption text-fossil">Tanpa internet? Transaksi tersimpan lokal dan tersinkron otomatis.</p>
    </Card>
  );
}

function KelolaVisual() {
  return (
    <Card className="p-5 bg-bone">
      <p className="text-caption text-fossil">Stok Gudang Kemang</p>
      <div className="mt-3 space-y-2.5">
        {[
          ['Kopi Susu Kelana', 'Aman', 'neutral'],
          ['Croissant Mentega', 'Sisa 6', 'accent'],
          ['Donat Gula', 'Habis', 'ink'],
        ].map(([n, s, v]) => (
          <div key={n as string} className="flex items-center justify-between rounded-lg border border-ash bg-paper px-3.5 py-2.5">
            <span className="text-body-sm text-ink">{n}</span>
            <Badge variant={v as 'neutral' | 'accent' | 'ink'}>{s}</Badge>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-ash bg-paper px-3.5 py-3">
        <p className="text-caption text-fossil">Draf PO dari stok minimum</p>
        <p className="mt-1 text-body-sm text-ink">CV Dairy Fresh: 2 item, menunggu persetujuan</p>
      </div>
    </Card>
  );
}

function ProduksiVisual() {
  return (
    <Card className="p-5 bg-bone">
      <div className="flex items-center justify-between">
        <p className="text-caption text-fossil">Order produksi PRD-00018</p>
        <Badge variant="neutral">Berjalan</Badge>
      </div>
      <div className="mt-4 rounded-lg border border-ash bg-paper px-3.5 py-3">
        <p className="text-body-sm text-ink">Roti Tawar Gandum</p>
        <div className="mt-2 h-1.5 rounded-full bg-sand overflow-hidden">
          <div className="h-full w-[80%] rounded-full bg-ink" />
        </div>
        <p className="mt-1.5 text-caption text-fossil tnum">240 dari 300 unit</p>
      </div>
      <div className="mt-3 space-y-2">
        {[
          ['Adonan', 'Lolos'],
          ['Pemanggangan', 'Lolos'],
          ['Kemasan akhir', 'Menunggu'],
        ].map(([n, s]) => (
          <div key={n} className="flex items-center justify-between rounded-lg border border-ash bg-paper px-3.5 py-2 text-body-sm">
            <span className="text-ink">{n}</span>
            <span className="text-caption text-fossil">{s}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function KeuanganVisual() {
  return (
    <Card className="p-5 bg-bone">
      <p className="text-caption text-fossil">Jurnal otomatis dari penerimaan barang</p>
      <div className="mt-3 rounded-lg border border-ash bg-paper px-3.5 py-3 text-body-sm">
        <div className="flex justify-between gap-3"><span className="text-ink">Persediaan</span><span className="tnum text-fossil">D 4.500.000</span></div>
        <div className="mt-1.5 flex justify-between gap-3"><span className="text-ink">PPN Masukan</span><span className="tnum text-fossil">D 495.000</span></div>
        <div className="mt-1.5 flex justify-between gap-3 border-t border-sand pt-1.5"><span className="text-ink">Utang Usaha</span><span className="tnum text-fossil">K 4.995.000</span></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-lg border border-ash bg-paper px-3.5 py-2.5">
          <p className="text-caption text-fossil">Neraca</p>
          <p className="text-body-sm text-ink">Seimbang</p>
        </div>
        <div className="rounded-lg border border-ash bg-paper px-3.5 py-2.5">
          <p className="text-caption text-fossil">Periode Okt 2026</p>
          <p className="text-body-sm text-ink">Terbuka</p>
        </div>
      </div>
    </Card>
  );
}

function SdmVisual() {
  return (
    <Card className="p-5 bg-bone">
      <div className="flex items-center justify-between">
        <p className="text-caption text-fossil">Payroll Oktober 2026</p>
        <Badge variant="outline">Draf</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {[
          ['Gaji pokok', 'Rp 4.200.000'],
          ['Lembur 6 jam', 'Rp 210.000'],
          ['Potongan', '- Rp 120.000'],
          ['PPh 21', '- Rp 85.000'],
        ].map(([n, v]) => (
          <div key={n} className="flex justify-between gap-3 rounded-lg border border-ash bg-paper px-3.5 py-2 text-body-sm">
            <span className="text-ink">{n}</span>
            <span className="tnum text-fossil">{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-caption text-fossil">Setelah diposting, gaji menjadi jurnal beban dan utang gaji.</p>
    </Card>
  );
}

function PahamiVisual() {
  return (
    <Card className="p-5 bg-bone">
      <div className="ml-auto max-w-[85%] rounded-xl bg-sand px-3.5 py-2.5 text-body-sm text-ink">
        Berapa laba bersih minggu ini?
      </div>
      <div className="mt-3 rounded-xl border border-ash bg-paper px-4 py-3">
        <Badge variant="accent" icon="assistant">AI</Badge>
        <p className="mt-2 text-body-sm text-ink leading-relaxed">
          Laba bersih 7 hari terakhir Rp 2,84 jt dengan margin kotor 46%. Sabtu adalah hari terbaikmu.
        </p>
        <p className="mt-2.5 border-t border-sand pt-2 text-caption text-fossil">
          Berdasarkan: sales_transactions:7 hari
        </p>
      </div>
    </Card>
  );
}

interface FeatureTab {
  id: string;
  label: string;
  eyebrow: string;
  heading: string;
  body: string;
  links: string[];
  visual: ReactNode;
}

const TABS: FeatureTab[] = [
  {
    id: 'jual',
    label: 'Jual',
    eyebrow: 'KASIR, PENJUALAN, CRM',
    heading: 'Jual di toko, lacak prospek, kirim penawaran.',
    body: 'Kasir menerima tunai, QRIS, debit, dan transfer, dan tetap jalan saat internet putus. Untuk penjualan ke perusahaan lain, catat prospek sampai peluang, buat penawaran, ubah jadi pesanan, lalu terbitkan faktur.',
    links: ['Lihat modul penjualan'],
    visual: <JualVisual />,
  },
  {
    id: 'kelola',
    label: 'Kelola',
    eyebrow: 'INVENTORI & PENGADAAN',
    heading: 'Tahu stok yang tersisa dan kapan harus beli.',
    body: 'Stok per gudang, transfer antar gudang, dan stock opname dengan scan barcode. Saat stok menyentuh batas minimum, Retalio menyusun draf PO per pemasok. Permintaan pembelian disetujui dulu, lalu PO dikirim lewat WhatsApp atau email.',
    links: ['Lihat modul gudang', 'Lihat modul pengadaan'],
    visual: <KelolaVisual />,
  },
  {
    id: 'produksi',
    label: 'Produksi',
    eyebrow: 'MANUFAKTUR, PROYEK, LOGISTIK',
    heading: 'Rencanakan produksi sampai barangnya terkirim.',
    body: 'Susun BOM bertingkat, hitung kebutuhan bahan lewat MRP, jadwalkan mesin, dan catat pemeriksaan mutu di tiap tahap. Untuk bisnis jasa ada proyek dengan milestone, jam kerja yang bisa ditagihkan ke klien, serta armada dan perawatan berkala.',
    links: ['Lihat modul manufaktur', 'Lihat modul proyek'],
    visual: <ProduksiVisual />,
  },
  {
    id: 'keuangan',
    label: 'Keuangan',
    eyebrow: 'AKUNTANSI & PAJAK',
    heading: 'Pembukuan yang terisi dari transaksi harian.',
    body: 'Penjualan, penerimaan barang, dan penggajian menjadi jurnal di buku besar. Ada piutang dan utang, rekonsiliasi bank, penyusutan aset tetap, PPN otomatis, serta laporan laba rugi, neraca, dan arus kas. Periode yang sudah ditutup tidak menerima jurnal baru.',
    links: ['Lihat modul keuangan'],
    visual: <KeuanganVisual />,
  },
  {
    id: 'sdm',
    label: 'SDM',
    eyebrow: 'ABSENSI, CUTI, PAYROLL',
    heading: 'Absensi, cuti, dan gaji di satu tempat.',
    body: 'Catat kehadiran dan lembur, kelola pengajuan cuti, lalu hitung gaji lengkap dengan PPh 21 dan posting ke jurnal. Rekrutmen berjalan dari lowongan sampai karyawan baru, dengan target KPI per orang.',
    links: ['Lihat modul SDM'],
    visual: <SdmVisual />,
  },
  {
    id: 'pahami',
    label: 'Pahami',
    eyebrow: 'RETALIO INTELLIGENCE',
    heading: 'Tanya datamu dengan bahasa sehari-hari.',
    body: 'Tanyakan penjualan, stok, atau proyeksi kas. Jawabannya memakai data aktual dan menyebut sumbernya. Retalio Intelligence juga membaca foto invoice pemasok dan menyarankan pembelian, tetapi tidak menjalankan apa pun tanpa persetujuanmu.',
    links: ['Kenali Retalio Intelligence'],
    visual: <PahamiVisual />,
  },
];

// Tab besar dengan autoplay + garis progres hairline
export function FeatureTabs() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % TABS.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [active]);

  const tab = TABS[active];

  return (
    <div className="rounded-2xl border border-ash bg-paper p-5 sm:p-6 lg:p-10">
      <div className="flex flex-wrap gap-x-1 gap-y-3 sm:gap-2" role="tablist" aria-label="Fitur utama">
        {TABS.map((t, i) => (
          <div key={t.id} className="flex flex-col">
            <button
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={cn(
                'rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-[20px] sm:text-[26px] lg:text-heading-lg font-light leading-tight transition-colors duration-150',
                active === i ? 'bg-sand text-ink' : 'text-pebble hover:text-fossil',
              )}
            >
              {t.label}
            </button>
            <span className="mx-3 sm:mx-4 mt-1 h-[2px] rounded-full bg-sand overflow-hidden">
              {active === i && (
                <span
                  key={active}
                  className="block h-full bg-ink tab-progress"
                  style={{ animationDuration: `${AUTOPLAY_MS}ms` }}
                />
              )}
            </span>
          </div>
        ))}
      </div>

      <div key={tab.id} className="fade-in mt-8 sm:mt-10 grid lg:grid-cols-2 gap-8 lg:gap-10 items-center">
        <div>
          <p className="flex items-center gap-2 text-caption text-fossil">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-olive" />
            {tab.eyebrow}
          </p>
          <h3 className="mt-3 text-[26px] sm:text-heading-lg font-light text-ink leading-[1.1]">{tab.heading}</h3>
          <p className="mt-4 text-[16px] sm:text-[17px] text-fossil leading-relaxed">{tab.body}</p>
          <div className="mt-6 space-y-2.5">
            {tab.links.map((l) => (
              <a
                key={l}
                href="#modul"
                className="group flex w-fit items-center gap-2 text-[15px] text-ink"
              >
                <span className="underline decoration-olive underline-offset-4">{l}</span>
                <Icon name="arrow-right" size={15} className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </a>
            ))}
          </div>
        </div>
        {tab.visual}
      </div>
    </div>
  );
}
