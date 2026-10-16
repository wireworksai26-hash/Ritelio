import { useState } from 'react';
import { Reveal } from '../Reveal';
import { Icon, type IconName } from '../icons/Icon';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface ErpModule {
  icon: IconName;
  title: string;
  summary: string;
  features: string[];
}

// Hanya fitur yang sudah ada di aplikasi. Tambahkan baris di sini setelah fiturnya benar-benar rilis.
const MODULES: ErpModule[] = [
  {
    icon: 'finance',
    title: 'Keuangan & Akuntansi',
    summary: 'Buku besar yang terisi dari transaksi, dengan laporan siap pakai.',
    features: ['Buku besar & jurnal', 'Piutang & utang', 'Rekonsiliasi bank', 'Aset tetap & penyusutan', 'Laba rugi, neraca, arus kas'],
  },
  {
    icon: 'users',
    title: 'SDM & Payroll',
    summary: 'Dari kehadiran sampai slip gaji.',
    features: ['Absensi & lembur', 'Cuti', 'Gaji + PPh 21', 'Rekrutmen & onboarding', 'KPI & target'],
  },
  {
    icon: 'inventory',
    title: 'Inventori & Gudang',
    summary: 'Stok per gudang yang selalu terbarui.',
    features: ['Stok real-time', 'Multi-gudang & transfer', 'Opname dengan scan barcode', 'Reorder otomatis jadi draf PO'],
  },
  {
    icon: 'truck',
    title: 'Pembelian & Pengadaan',
    summary: 'Permintaan, persetujuan, sampai PO ke pemasok.',
    features: ['Permintaan pembelian', 'Purchase order', 'Kirim PO via WhatsApp/email', 'Skor kinerja pemasok'],
  },
  {
    icon: 'handshake',
    title: 'Penjualan & CRM',
    summary: 'Dari prospek sampai faktur.',
    features: ['Prospek & peluang', 'Penawaran & sales order', 'Riwayat pelanggan', 'Komplain'],
  },
  {
    icon: 'factory',
    title: 'Manufaktur',
    summary: 'Rencana produksi yang tahu bahan dan kapasitas.',
    features: ['BOM bertingkat', 'Perencanaan bahan (MRP)', 'Jadwal produksi & mesin', 'Kontrol mutu per tahap'],
  },
  {
    icon: 'route',
    title: 'Rantai Pasok & Logistik',
    summary: 'Armada dan pengiriman dalam satu daftar.',
    features: ['Armada & bahan bakar', 'Status & riwayat pengiriman', 'Prakiraan permintaan'],
  },
  {
    icon: 'clipboard',
    title: 'Manajemen Proyek',
    summary: 'Jam kerja tim berubah jadi tagihan klien.',
    features: ['Timesheet & penagihan', 'Alokasi tim', 'Milestone & Gantt'],
  },
  {
    icon: 'wrench',
    title: 'Aset & Perawatan',
    summary: 'Perawatan terjadwal sebelum mesin rusak.',
    features: ['Jadwal perawatan berkala', 'Work order', 'Biaya perawatan masuk jurnal'],
  },
  {
    icon: 'shield',
    title: 'Kepatuhan & Risiko',
    summary: 'Pajak dan jejak aktivitas yang bisa diperiksa.',
    features: ['PPN otomatis', 'Jejak audit (siapa, apa, kapan)', 'Periode fiskal terkunci'],
  },
  {
    icon: 'layers',
    title: 'Platform',
    summary: 'Yang menyatukan semua modul.',
    features: ['Dashboard ringkasan', 'Hak akses per peran', 'Multi-perusahaan & mata uang', 'Sensor IoT', 'OCR invoice & asisten AI', 'Aplikasi PWA di HP'],
  },
];

const MOBILE_PREVIEW = 6;

export function ModuleGrid() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <Reveal className="text-center max-w-2xl mx-auto" duration={0.8} y={30}>
        <p className="inline-flex items-center gap-2 text-caption text-fossil">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-olive" />
          MODUL
        </p>
        <h2 className="mt-4 text-[30px] sm:text-heading-lg font-light text-ink leading-[1.1]">
          Sebelas modul, satu data.
        </h2>
        <p className="mt-4 text-[16px] sm:text-[17px] text-fossil leading-relaxed">
          Pakai yang kamu perlukan hari ini. Modul lain sudah tersambung ke data yang sama saat bisnismu butuh.
        </p>
      </Reveal>

      <div className="mt-10 sm:mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {MODULES.map((m, i) => (
          <Card
            key={m.title}
            className={`p-5 sm:p-6 ${!expanded && i >= MOBILE_PREVIEW ? 'hidden sm:block' : ''}`}
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand text-ink">
                <Icon name={m.icon} size={20} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[18px] font-light text-ink leading-snug">{m.title}</h3>
                <p className="mt-1 text-body-sm text-fossil">{m.summary}</p>
              </div>
            </div>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {m.features.map((f) => (
                <li key={f} className="rounded-md bg-sand px-2 py-1 text-caption text-smoke">
                  {f}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-center sm:hidden">
        <Button variant="ghost" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? 'Tampilkan lebih sedikit' : `Tampilkan semua ${MODULES.length} modul`}
        </Button>
      </div>
    </div>
  );
}
