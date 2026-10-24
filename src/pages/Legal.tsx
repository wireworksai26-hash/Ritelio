import { useMemo } from 'react';
import { LEGAL_CONTACT } from '../config/legal';
import { buildPrivacy, buildTerms, LEGAL_EFFECTIVE_DATE } from '../content/legal';
import { PublicPage } from '../components/layout/PublicPage';

// Halaman publik Syarat & Ketentuan (/syarat-ketentuan) dan Kebijakan Privasi (/privasi).
// Isi naskah ada di content/legal.ts; identitas penyelenggara dari variabel build (config/legal.ts).

export type LegalKind = 'terms' | 'privacy';

export default function Legal({ kind }: { kind: LegalKind }) {
  const doc = useMemo(() => (kind === 'terms' ? buildTerms(LEGAL_CONTACT) : buildPrivacy(LEGAL_CONTACT)), [kind]);
  const related = kind === 'terms' ? { to: '/privasi', label: 'Baca juga: Kebijakan Privasi' } : { to: '/syarat-ketentuan', label: 'Baca juga: Syarat & Ketentuan' };

  return <PublicPage title={doc.title} summary={doc.summary} meta={`Berlaku sejak ${LEGAL_EFFECTIVE_DATE}`} sections={doc.sections} related={related} />;
}
