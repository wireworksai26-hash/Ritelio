import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LegalSection, SectionLink } from '../../content/legal';
import { Icon } from '../icons/Icon';
import { Logo } from './Logo';

// Kerangka halaman publik di luar aplikasi (Syarat & Ketentuan, Privasi, Tentang, Panduan, dst.): header dengan
// logo, judul, daftar isi, bagian-bagian teks, dan tautan ke halaman terkait.

export interface PublicPageProps {
  title: string;
  summary: string;
  /** Baris kecil di bawah ringkasan, mis. tanggal berlaku. */
  meta?: string;
  sections: LegalSection[];
  /** Tampilkan daftar isi (cocok untuk halaman panjang). */
  toc?: boolean;
  related?: { to: string; label: string };
  /** Isi tambahan di antara bagian-bagian dan footer, mis. pemeriksaan status langsung. */
  children?: ReactNode;
}

const linkClass = 'inline-flex items-center gap-1.5 rounded-lg border border-ash bg-paper px-3.5 py-2 text-[14px] text-ink hover:bg-sand transition-colors';

function SectionLinkItem({ link }: { link: SectionLink }) {
  if (link.to) return <Link to={link.to} className={linkClass}>{link.label}</Link>;
  const external = !!link.href && /^https?:\/\//.test(link.href);
  return (
    <a href={link.href} className={linkClass} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {link.label}
    </a>
  );
}

export function PublicPage({ title, summary, meta, sections, toc = true, related, children }: PublicPageProps) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Retalio`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-bone text-ink">
      <header className="border-b border-ash">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" aria-label="Retalio, kembali ke beranda">
            <Logo />
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-body-sm text-fossil hover:text-ink transition-colors">
            <Icon name="arrow-left" size={15} />
            Beranda
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[860px] px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-[40px] leading-[1.05] font-light tracking-[-0.02em] text-ink sm:text-[56px]">{title}</h1>
        <p className="mt-3 text-[16px] text-smoke">{summary}</p>
        {meta && <p className="mt-2 text-caption text-fossil">{meta}</p>}

        {toc && sections.length > 1 && (
          <nav aria-label="Isi halaman" className="mt-8 rounded-xl border border-ash bg-paper p-4">
            <p className="text-caption font-medium text-ink">Isi</p>
            <ol className="mt-2 grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-smoke hover:text-ink hover:underline underline-offset-4">
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="mt-10 space-y-9">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="text-[20px] font-medium text-ink">{s.heading}</h2>
              {s.paragraphs?.map((p) => (
                <p key={p} className="mt-3 text-[16px] leading-relaxed text-smoke">
                  {p}
                </p>
              ))}
              {s.bullets && (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-smoke marker:text-fossil">
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              {s.links && s.links.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.links.map((l) => (
                    <SectionLinkItem key={l.label} link={l} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

        {children}

        <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-ash pt-6 text-body-sm text-fossil">
          <span>© 2026 Retalio ERP</span>
          {related && (
            <Link to={related.to} className="hover:text-ink hover:underline underline-offset-4">
              {related.label}
            </Link>
          )}
        </footer>
      </main>
    </div>
  );
}
