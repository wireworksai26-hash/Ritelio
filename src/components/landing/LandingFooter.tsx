import { useState, type FormEvent } from 'react';
import { SALES_EMAIL, SALES_WHATSAPP_DISPLAY, salesMailtoUrl, salesWhatsAppUrl } from '../../config/contact';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const GREETING = 'Halo Tim Retalio, saya ingin konsultasi tentang Retalio.';

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href?: string }> }> = [
  {
    title: 'PERUSAHAAN',
    links: [{ label: 'Tentang' }, { label: 'Blog' }, { label: 'Karier' }, { label: 'Kontak', href: '#kontak' }],
  },
  {
    title: 'PRODUK',
    links: [
      { label: 'Harga', href: '#harga' },
      { label: 'Semua modul', href: '#modul' },
      { label: 'Kasir & POS', href: '#fitur' },
      { label: 'Keuangan & Akuntansi', href: '#modul' },
      { label: 'Retalio Intelligence', href: '#fitur' },
    ],
  },
  {
    title: 'SUMBER DAYA',
    links: [{ label: 'Panduan' }, { label: 'Template' }, { label: 'Bantuan' }, { label: 'Status' }],
  },
  {
    title: 'SOLUSI',
    links: [{ label: 'Retail & F&B' }, { label: 'Manufaktur Kecil' }, { label: 'Jasa' }],
  },
];

export function LandingFooter() {
  const [email, setEmail] = useState('');
  const whatsapp = salesWhatsAppUrl(GREETING);

  const subscribe = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    toast({ title: 'Berhasil berlangganan', description: 'Insight bisnis dikirim tiap minggu.', icon: 'mail' });
    setEmail('');
  };

  return (
    <footer className="border-t border-ash">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 pt-16">
        <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="text-caption text-fossil">{col.title}</p>
                <ul className="mt-3 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href ?? '#'}
                        onClick={l.href ? undefined : (e) => e.preventDefault()}
                        className="text-[15px] text-smoke hover:text-ink transition-colors"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="space-y-4">
          <Card id="kontak" className="p-5 h-fit scroll-mt-24">
            <p className="text-[15px] text-ink">Konsultasi dengan sales</p>
            <p className="mt-1 text-body-sm text-fossil">
              Bingung memilih paket atau ingin tahu apakah Retalio cocok untuk usahamu? Hubungi tim sales kami.
            </p>
            <div className="mt-4 space-y-2.5 text-[15px]">
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink hover:underline underline-offset-4">
                  <Icon name="chat" size={16} />
                  WhatsApp {SALES_WHATSAPP_DISPLAY}
                </a>
              )}
              <a href={salesMailtoUrl('Konsultasi Retalio', GREETING)} className="flex items-center gap-2 text-ink hover:underline underline-offset-4">
                <Icon name="mail" size={16} />
                {SALES_EMAIL}
              </a>
            </div>
          </Card>

          <Card className="p-5 h-fit">
            <p className="text-[15px] text-ink">Insight bisnis tiap minggu</p>
            <p className="mt-1 text-body-sm text-fossil">
              Panduan operasional & AI untuk UKM. Tanpa spam.
            </p>
            <form onSubmit={subscribe} className="mt-4 flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@bisnismu.id"
                aria-label="Email untuk newsletter"
                className="flex-1 min-w-0 bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none"
              />
              <Button size="sm" type="submit">
                Langganan
              </Button>
            </form>
          </Card>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="mt-14 select-none overflow-hidden text-center font-light leading-[0.78] tracking-[-0.05em] text-ink text-[23vw]"
        >
          Retalio
        </div>
      </div>

      <div className="border-t border-ash">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-caption text-fossil">
          <span>© 2026 Retalio ERP</span>
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-ink transition-colors">Privasi</a>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-ink transition-colors">Syarat &amp; Ketentuan</a>
            <a href="#keamanan" className="hover:text-ink transition-colors">Keamanan</a>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-ink transition-colors">Status</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
