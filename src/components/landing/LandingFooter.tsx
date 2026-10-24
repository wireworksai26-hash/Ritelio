import { Link } from 'react-router-dom';
import { INTAKE_FORM_URL, SALES_EMAIL, SALES_WHATSAPP_DISPLAY, salesMailtoUrl, salesWhatsAppUrl } from '../../config/contact';
import { toast } from '../../stores/toastStore';
import { NewsletterForm } from './NewsletterForm';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const GREETING = 'Halo Tim Retalio, saya ingin konsultasi tentang Retalio.';

// Setiap menu footer punya tujuan: `href` untuk bagian halaman depan ('#...') atau halaman ('/...'), atau `soon`
// untuk menu yang halamannya belum bisa diisi dengan data yang ada. Menu `soon` tetap tampil dan memberi keterangan
// saat diklik, bukan tautan kosong. Ganti ke `href` begitu halamannya tersedia.
type FooterLink = { label: string; href: string } | { label: string; soon: { title: string; description: string } };

const COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: 'PERUSAHAAN',
    links: [
      { label: 'Tentang', href: '/tentang' },
      {
        label: 'Blog',
        soon: { title: 'Blog belum tersedia', description: 'Belum ada artikel yang diterbitkan. Ada yang ingin ditanyakan? Hubungi tim kami lewat bagian Kontak.' },
      },
      {
        label: 'Karier',
        soon: { title: 'Halaman karier belum dibuka', description: 'Belum ada informasi lowongan di situs ini. Untuk pertanyaan, hubungi tim kami lewat bagian Kontak.' },
      },
      { label: 'Kontak', href: '#kontak' },
    ],
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
    links: [
      { label: 'Panduan', href: '/panduan' },
      { label: 'Template', href: '/template' },
      { label: 'Bantuan', href: '/bantuan' },
      { label: 'Status', href: '/status' },
    ],
  },
  {
    title: 'SOLUSI',
    links: [
      { label: 'Retail & F&B', href: '#solusi' },
      { label: 'Manufaktur Kecil', href: '#solusi' },
      { label: 'Jasa', href: '#solusi' },
    ],
  },
];

const linkClass = 'text-[15px] text-smoke hover:text-ink transition-colors';

function FooterMenuLink({ link }: { link: FooterLink }) {
  if ('soon' in link) {
    const { soon } = link;
    return (
      <button type="button" className={`${linkClass} text-left`} onClick={() => toast({ title: soon.title, description: soon.description, icon: 'warning' })}>
        {link.label}
      </button>
    );
  }
  if (link.href.startsWith('/')) {
    return (
      <Link to={link.href} className={linkClass}>
        {link.label}
      </Link>
    );
  }
  return (
    <a href={link.href} className={linkClass}>
      {link.label}
    </a>
  );
}

export function LandingFooter() {
  const whatsapp = salesWhatsAppUrl(GREETING);

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
                      <FooterMenuLink link={l} />
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
              {INTAKE_FORM_URL && (
                <a href={INTAKE_FORM_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink hover:underline underline-offset-4">
                  <Icon name="document" size={16} />
                  Isi formulir &amp; jadwalkan konsultasi
                </a>
              )}
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
            <p className="text-[15px] text-ink">Insight bisnis, dua kali sebulan</p>
            <p className="mt-1 text-body-sm text-fossil">
              Panduan operasional & AI untuk UKM. Tanpa spam.
            </p>
            <NewsletterForm />
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
            <Link to="/privasi" className="hover:text-ink transition-colors">Privasi</Link>
            <Link to="/syarat-ketentuan" className="hover:text-ink transition-colors">Syarat &amp; Ketentuan</Link>
            <a href="#keamanan" className="hover:text-ink transition-colors">Keamanan</a>
            <Link to="/status" className="hover:text-ink transition-colors">Status</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
