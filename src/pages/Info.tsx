import { useCallback, useEffect, useMemo, useState } from 'react';
import { INTAKE_FORM_URL, SALES_EMAIL, SALES_WHATSAPP_DISPLAY, salesWhatsAppUrl } from '../config/contact';
import { LEGAL_CONTACT } from '../config/legal';
import { buildAbout, buildGuide, buildHelp, buildTemplates, type InfoDocument } from '../content/info';
import { getCleanApiUrl } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { PublicPage } from '../components/layout/PublicPage';

// Halaman informasi dari menu footer: Tentang (/tentang), Panduan (/panduan), Template (/template),
// Bantuan (/bantuan), dan Status layanan (/status).

export type InfoKind = 'about' | 'guide' | 'templates' | 'help' | 'status';

function buildDoc(kind: Exclude<InfoKind, 'status'>): InfoDocument {
  switch (kind) {
    case 'about':
      return buildAbout(LEGAL_CONTACT);
    case 'guide':
      return buildGuide();
    case 'templates':
      return buildTemplates();
    case 'help':
      return buildHelp({
        email: SALES_EMAIL,
        whatsappUrl: salesWhatsAppUrl('Halo Tim Retalio, saya butuh bantuan.'),
        whatsappLabel: SALES_WHATSAPP_DISPLAY,
        formUrl: INTAKE_FORM_URL,
      });
  }
}

type Check = { state: 'idle' } | { state: 'ok'; at: Date } | { state: 'degraded'; at: Date; detail: string } | { state: 'down'; at: Date };

/** Satu pemeriksaan GET /v1/health. Hanya mengukur keadaan saat ini, tanpa riwayat. */
async function checkHealth(): Promise<Check> {
  const at = new Date();
  try {
    const res = await fetch(getCleanApiUrl('/v1/health'), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const body = (await res.json().catch(() => null)) as { status?: string; database?: string } | null;
    if (res.ok && body?.status === 'ok' && body.database === 'up') return { state: 'ok', at };
    if (body && typeof body === 'object') return { state: 'degraded', at, detail: body.database === 'down' ? 'Database tidak dapat dijangkau.' : 'Server menjawab dengan status tidak normal.' };
    return { state: 'down', at };
  } catch {
    return { state: 'down', at };
  }
}

function StatusPanel() {
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setCheck(await checkHealth());
    setBusy(false);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const headline =
    check.state === 'ok'
      ? { label: 'Semua layanan berjalan normal', variant: 'accent' as const }
      : check.state === 'degraded'
        ? { label: 'Ada gangguan sebagian', variant: 'ink' as const }
        : check.state === 'down'
          ? { label: 'Layanan tidak dapat dijangkau', variant: 'ink' as const }
          : { label: 'Memeriksa…', variant: 'outline' as const };

  return (
    <section aria-label="Status saat ini" className="mt-10 rounded-xl border border-ash bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant={headline.variant}>{headline.label}</Badge>
          {check.state !== 'idle' && <span className="text-caption text-fossil">Diperiksa {formatDateTime(check.at.toISOString())}</span>}
        </div>
        <Button variant="ghost" size="sm" icon="sync" disabled={busy} onClick={() => void run()}>
          {busy ? 'Memeriksa…' : 'Periksa ulang'}
        </Button>
      </div>
      <dl className="mt-4 divide-y divide-sand text-body-sm">
        <div className="flex items-center justify-between py-2.5">
          <dt className="text-smoke">Server aplikasi</dt>
          <dd className="text-ink">{check.state === 'ok' || check.state === 'degraded' ? 'Merespons' : check.state === 'down' ? 'Tidak merespons' : '…'}</dd>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <dt className="text-smoke">Database</dt>
          <dd className="text-ink">{check.state === 'ok' ? 'Terhubung' : check.state === 'degraded' ? check.detail : check.state === 'down' ? 'Tidak diketahui' : '…'}</dd>
        </div>
      </dl>
      <p className="mt-4 text-caption text-fossil">
        Halaman ini memeriksa kondisi saat kamu membukanya, bukan riwayat gangguan. Kalau ada masalah, hubungi tim kami lewat halaman Bantuan.
      </p>
    </section>
  );
}

export default function Info({ kind }: { kind: InfoKind }) {
  const doc = useMemo<InfoDocument>(
    () =>
      kind === 'status'
        ? {
            title: 'Status layanan',
            summary: 'Apakah Retalio sedang bisa dipakai saat ini.',
            sections: [],
          }
        : buildDoc(kind),
    [kind],
  );

  const related =
    kind === 'help' ? { to: '/panduan', label: 'Baca juga: Panduan memulai' } : kind === 'status' ? { to: '/bantuan', label: 'Butuh bantuan? Buka halaman Bantuan' } : undefined;

  return (
    <PublicPage title={doc.title} summary={doc.summary} sections={doc.sections} toc={kind === 'about' || kind === 'help'} related={related}>
      {kind === 'status' && <StatusPanel />}
    </PublicPage>
  );
}
