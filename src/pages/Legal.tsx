import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_CONTACT } from '../config/legal';
import { buildPrivacy, buildTerms, LEGAL_EFFECTIVE_DATE } from '../content/legal';
import { Icon } from '../components/icons/Icon';
import { Logo } from '../components/layout/Logo';

// Halaman publik Syarat & Ketentuan (/syarat-ketentuan) dan Kebijakan Privasi (/privasi).
// Isi naskah ada di content/legal.ts; identitas penyelenggara dari variabel build (config/legal.ts).

export type LegalKind = 'terms' | 'privacy';

export default function Legal({ kind }: { kind: LegalKind }) {
  const doc = useMemo(() => (kind === 'terms' ? buildTerms(LEGAL_CONTACT) : buildPrivacy(LEGAL_CONTACT)), [kind]);
  const other = kind === 'terms' ? { to: '/privasi', label: 'Kebijakan Privasi' } : { to: '/syarat-ketentuan', label: 'Syarat & Ketentuan' };

  useEffect(() => {
    const previous = document.title;
    document.title = `${doc.title} · Retalio`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, [doc.title]);

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
        <h1 className="text-[40px] leading-[1.05] font-light tracking-[-0.02em] text-ink sm:text-[56px]">{doc.title}</h1>
        <p className="mt-3 text-[16px] text-smoke">{doc.summary}</p>
        <p className="mt-2 text-caption text-fossil">Berlaku sejak {LEGAL_EFFECTIVE_DATE}</p>

        <nav aria-label="Isi halaman" className="mt-8 rounded-xl border border-ash bg-paper p-4">
          <p className="text-caption font-medium text-ink">Isi</p>
          <ol className="mt-2 grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-smoke hover:text-ink hover:underline underline-offset-4">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-9">
          {doc.sections.map((s) => (
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
            </section>
          ))}
        </div>

        <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-ash pt-6 text-body-sm text-fossil">
          <span>© 2026 Retalio ERP</span>
          <Link to={other.to} className="hover:text-ink hover:underline underline-offset-4">
            Baca juga: {other.label}
          </Link>
        </footer>
      </main>
    </div>
  );
}
