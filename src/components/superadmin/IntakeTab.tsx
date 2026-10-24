import { useState } from 'react';
import { buildMailtoUrl, buildWhatsAppUrl } from '../../config/contact';
import { apiFetch } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select, Textarea } from '../ui/controls';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { Pagination } from '../ui/Pagination';

// Pengajuan calon klien dari Google Form (POST /v1/intake/google-form), lengkap dengan analisis AI.
// Data berisi informasi pribadi: endpoint-nya hanya untuk superadmin platform.

type Status = 'new' | 'contacted' | 'qualified' | 'closed';
type AnalysisStatus = 'pending' | 'done' | 'skipped' | 'failed';
type Fit = 'tinggi' | 'sedang' | 'rendah';

interface Analysis {
  ringkasan: string;
  kecocokan: Fit;
  alasan: string[];
  modulDisarankan: string[];
  paketDisarankan: 'basic' | 'plus_ai' | 'custom' | null;
  informasiKurang: string[];
  catatanSales: string[];
}

interface Row {
  id: string;
  createdAt: string;
  submittedAt: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  businessType: string | null;
  employeeRange: string | null;
  status: Status;
  analysisStatus: AnalysisStatus;
  analysis: Analysis | null;
}

interface Detail extends Row {
  answers: Array<{ question: string; answer: string | string[] }>;
  notes: string;
  analysisModel: string | null;
  analysisError: string | null;
  analyzedAt: string | null;
}

interface Page {
  data: Row[];
  meta: { page: number; limit: number; total: number };
}

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<Status, string> = {
  new: 'Baru',
  contacted: 'Sudah dihubungi',
  qualified: 'Prospek serius',
  closed: 'Selesai',
};
const PLAN_LABEL = { basic: 'Basic', plus_ai: '+AI', custom: 'Custom' } as const;
const FIT_VARIANT: Record<Fit, 'accent' | 'neutral' | 'outline'> = { tinggi: 'accent', sedang: 'neutral', rendah: 'outline' };
const ANALYSIS_LABEL: Record<Exclude<AnalysisStatus, 'done'>, string> = {
  pending: 'Analisis berjalan…',
  skipped: 'Analisis AI belum aktif',
  failed: 'Analisis gagal',
};

function answerText(a: string | string[]): string {
  return Array.isArray(a) ? a.join(', ') : a;
}

function FitBadge({ row }: { row: Pick<Row, 'analysis' | 'analysisStatus'> }) {
  if (row.analysis) {
    return (
      <Badge variant={FIT_VARIANT[row.analysis.kecocokan]} icon="sparkles">
        Cocok: {row.analysis.kecocokan}
      </Badge>
    );
  }
  return <Badge variant="outline">{ANALYSIS_LABEL[row.analysisStatus as Exclude<AnalysisStatus, 'done'>] ?? 'Belum dianalisis'}</Badge>;
}

export function IntakeTab() {
  const [status, setStatus] = useState<'' | Status>('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const query = `/v1/intake/submissions?limit=${PAGE_SIZE}&page=${page}${status ? `&status=${status}` : ''}`;
  const list = useResource<Page>(query);
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-ink">Pengajuan calon klien</p>
          <p className="text-body-sm text-fossil mt-0.5">
            Jawaban Google Form masuk otomatis. AI membantu menilai kecocokan dan menyiapkan pertanyaan konsultasi; keputusan tetap di sales.
          </p>
        </div>
        <div className="flex items-end gap-2 shrink-0">
          <Select
            id="intake-filter-status"
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as '' | Status);
              setPage(1);
            }}
          >
            <option value="">Semua</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" icon="sync" disabled={list.loading} onClick={list.reload}>
            {list.loading ? 'Memuat...' : 'Muat Ulang'}
          </Button>
        </div>
      </Card>

      {list.error && (
        <Card className="p-4 text-body-sm text-ink" role="alert">
          {list.error}
        </Card>
      )}

      {!list.error && !list.loading && rows.length === 0 && (
        <Card>
          <EmptyState
            icon="document"
            title={status ? 'Tidak ada pengajuan dengan status ini' : 'Belum ada pengajuan'}
            body={
              status
                ? 'Coba status lain.'
                : 'Pengajuan muncul di sini begitu calon klien mengirim Google Form. Pastikan skrip formulir sudah terpasang (panduannya ada di docs/intake-google-form).'
            }
          />
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-4 hover:border-pebble transition-colors">
            <button type="button" onClick={() => setOpenId(r.id)} className="w-full text-left" aria-label={`Buka pengajuan ${r.contactName ?? 'tanpa nama'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-medium text-ink truncate">{r.contactName ?? 'Tanpa nama'}</span>
                {r.businessType && <Badge variant="outline">{r.businessType}</Badge>}
                {r.employeeRange && <Badge variant="neutral">{r.employeeRange}</Badge>}
                <Badge variant={r.status === 'new' ? 'ink' : 'neutral'}>{STATUS_LABEL[r.status]}</Badge>
                <FitBadge row={r} />
                {r.analysis?.paketDisarankan && <Badge variant="outline">Usulan AI: {PLAN_LABEL[r.analysis.paketDisarankan]}</Badge>}
              </div>
              <p className="mt-1.5 text-caption text-fossil">
                Dikirim {formatDateTime(r.submittedAt)}
                {r.contactPhone && ` · ${r.contactPhone}`}
                {r.contactEmail && ` · ${r.contactEmail}`}
              </p>
              {r.analysis && <p className="mt-2 text-body-sm text-smoke line-clamp-2">{r.analysis.ringkasan}</p>}
            </button>
          </Card>
        ))}
      </div>

      <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {openId && <IntakeDetail id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </div>
  );
}

function IntakeDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const detail = useResource<Detail>(`/v1/intake/submissions/${id}`);
  const [status, setStatus] = useState<Status | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = detail.data;

  const currentStatus = status ?? d?.status ?? 'new';
  const currentNotes = notes ?? d?.notes ?? '';

  async function save() {
    setBusy(true);
    try {
      await apiFetch(`/v1/intake/submissions/${id}`, { method: 'PATCH', body: JSON.stringify({ status: currentStatus, notes: currentNotes }) });
      toast({ title: 'Tindak lanjut tersimpan.', icon: 'check' });
      onChanged();
      detail.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan.', icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  async function reanalyze() {
    setBusy(true);
    try {
      await apiFetch(`/v1/intake/submissions/${id}/analyze`, { method: 'POST' });
      toast({ title: 'Analisis diperbarui.', icon: 'check' });
      onChanged();
      detail.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menganalisis ulang.', icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  const greeting = `Halo${d?.contactName ? ` ${d.contactName}` : ''}, terima kasih sudah mengisi formulir konsultasi Retalio. Kami ingin membantu menyiapkan konsultasinya.`;
  const whatsapp = d?.contactPhone ? buildWhatsAppUrl(d.contactPhone, greeting) : null;
  const a = d?.analysis ?? null;

  return (
    <Modal open onClose={onClose} title={d?.contactName ?? 'Pengajuan calon klien'} maxWidth="xl">
      {detail.loading && <p className="text-body-sm text-fossil">Memuat…</p>}
      {detail.error && <p className="text-body-sm text-ink" role="alert">{detail.error}</p>}
      {d && (
        <div className="space-y-5">
          <section aria-label="Kontak" className="flex flex-wrap items-center gap-2">
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-[14px] font-medium text-paper hover:bg-ink/90">
                <Icon name="chat" size={15} />
                WhatsApp {d.contactPhone}
              </a>
            )}
            {d.contactEmail && (
              <a href={buildMailtoUrl(d.contactEmail, 'Konsultasi Retalio', greeting)} className="inline-flex items-center gap-2 rounded-lg border border-ash px-3.5 py-2 text-[14px] text-ink hover:bg-sand">
                <Icon name="mail" size={15} />
                {d.contactEmail}
              </a>
            )}
            {!whatsapp && !d.contactEmail && <p className="text-body-sm text-fossil">Tidak ada kontak yang terbaca dari formulir.</p>}
          </section>

          <section aria-label="Analisis AI" className="rounded-xl border border-ash bg-bone p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[15px] text-ink">
                <Icon name="sparkles" size={16} /> Analisis AI
              </p>
              <Button variant="ghost" size="sm" icon="sync" disabled={busy} onClick={() => void reanalyze()}>
                Analisis ulang
              </Button>
            </div>
            {a ? (
              <div className="mt-3 space-y-3 text-body-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <FitBadge row={d} />
                  {a.paketDisarankan && <Badge variant="outline">Usulan paket: {PLAN_LABEL[a.paketDisarankan]}</Badge>}
                </div>
                <p className="text-ink">{a.ringkasan}</p>
                <Block title="Alasan" items={a.alasan} />
                {a.modulDisarankan.length > 0 && (
                  <div>
                    <p className="text-caption font-medium text-ink">Modul yang cocok</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {a.modulDisarankan.map((m) => (
                        <Badge key={m} variant="neutral">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <Block title="Tanyakan saat konsultasi (informasi yang belum ada)" items={a.informasiKurang} />
                <Block title="Catatan untuk sales" items={a.catatanSales} />
                <p className="text-caption text-fossil">
                  Usulan AI dari jawaban formulir{d.analysisModel ? ` (${d.analysisModel})` : ''}; bukan keputusan. Nama dan kontak tidak dikirim ke model.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-body-sm text-fossil">
                {d.analysisError ?? ANALYSIS_LABEL[d.analysisStatus as Exclude<AnalysisStatus, 'done'>] ?? 'Belum dianalisis.'}
              </p>
            )}
          </section>

          <section aria-label="Jawaban formulir">
            <p className="text-[15px] text-ink">Jawaban formulir</p>
            <dl className="mt-2 divide-y divide-sand rounded-xl border border-ash">
              {d.answers.map((qa, i) => (
                <div key={i} className="px-4 py-2.5">
                  <dt className="text-caption text-fossil">{qa.question}</dt>
                  <dd className="text-body-sm text-ink whitespace-pre-line">{answerText(qa.answer)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-label="Tindak lanjut" className="space-y-3">
            <p className="text-[15px] text-ink">Tindak lanjut</p>
            <Select id="intake-detail-status" label="Status" value={currentStatus} onChange={(e) => setStatus(e.target.value as Status)}>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Textarea id="intake-detail-notes" label="Catatan sales" value={currentNotes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Tutup
              </Button>
              <Button disabled={busy} onClick={() => void save()}>
                Simpan
              </Button>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-caption font-medium text-ink">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-smoke">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
