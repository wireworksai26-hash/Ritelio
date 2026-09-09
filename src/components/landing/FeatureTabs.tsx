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
        <p className="text-caption text-fossil">Jurnal otomatis</p>
        <p className="mt-1 text-body-sm text-ink">Penjualan → Kas (D) / Pendapatan (K) · tanpa input manual</p>
      </div>
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
          Laba bersih 7 hari terakhir Rp 2,84 jt — margin kotor 46%. Sabtu adalah hari terbaikmu.
        </p>
        <p className="mt-2.5 border-t border-sand pt-2 text-caption text-fossil">
          Berdasarkan: sales_transactions:7 hari · financial_entries:7 hari
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
    eyebrow: 'POS OFFLINE-FIRST',
    heading: 'Jual kapan saja — bahkan tanpa internet.',
    body: 'Kasir cepat dengan multi-pembayaran (Tunai, QRIS, Debit, Transfer). Saat koneksi putus, transaksi tetap berjalan, struk tetap tercetak, dan semuanya tersinkron otomatis begitu online kembali.',
    links: ['Lihat fitur POS', 'Pelajari mode offline'],
    visual: <JualVisual />,
  },
  {
    id: 'kelola',
    label: 'Kelola',
    eyebrow: 'INVENTORI & KEUANGAN',
    heading: 'Kelola stok dan uang dari satu tempat.',
    body: 'Stok real-time lintas gudang dengan alert saat menipis. Setiap penjualan otomatis menjadi jurnal — laba rugi dan arus kas selalu mutakhir tanpa pembukuan manual.',
    links: ['Lihat kontrol inventori', 'Lihat laporan keuangan'],
    visual: <KelolaVisual />,
  },
  {
    id: 'pahami',
    label: 'Pahami',
    eyebrow: 'RETALIO INTELLIGENCE',
    heading: 'Pahami bisnismu lewat pertanyaan sederhana.',
    body: 'Tanya apa saja dalam bahasa sehari-hari — penjualan, stok, proyeksi kas. AI menjawab dari data aktual, selalu menyertakan sumber, dan tidak pernah mengeksekusi tanpa persetujuanmu.',
    links: ['Kenali Retalio Intelligence', 'Prinsip AI kami'],
    visual: <PahamiVisual />,
  },
];

// Tab besar ala maze.co (Recruit/Research/Analyze) — autoplay + progress hairline
export function FeatureTabs() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % TABS.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [active]);

  const tab = TABS[active];

  return (
    <div className="rounded-2xl border border-ash bg-paper p-6 lg:p-10">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Fitur utama">
        {TABS.map((t, i) => (
          <div key={t.id} className="flex flex-col">
            <button
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={cn(
                'rounded-lg px-4 py-2 text-[26px] lg:text-heading-lg font-light leading-tight transition-colors duration-150',
                active === i ? 'bg-sand text-ink' : 'text-pebble hover:text-fossil',
              )}
            >
              {t.label}
            </button>
            <span className="mx-4 mt-1 h-[2px] rounded-full bg-sand overflow-hidden">
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

      <div key={tab.id} className="fade-in mt-10 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="flex items-center gap-2 text-caption text-fossil">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-olive" />
            {tab.eyebrow}
          </p>
          <h3 className="mt-3 text-heading-lg font-light text-ink">{tab.heading}</h3>
          <p className="mt-4 text-[17px] text-fossil leading-relaxed">{tab.body}</p>
          <div className="mt-6 space-y-2.5">
            {tab.links.map((l) => (
              <a
                key={l}
                href="#harga"
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
