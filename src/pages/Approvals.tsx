import { useMemo, useState } from 'react';
import {
  ApprovalCard,
  TimesheetSummary,
  approverLabel,
  documentTypeLabel,
  statusBadge,
  type ApprovalRequest,
  type TimesheetContext,
} from '../components/approvals/ApprovalCard';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field, Select, Textarea } from '../components/ui/controls';
import { StatRow } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Pagination } from '../components/ui/Pagination';
import { Tabs } from '../components/ui/Tabs';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { listOf, usePagedList, useResource } from '../lib/useResource';
import { toast } from '../stores/toastStore';

type TabKey = 'pending' | 'approved' | 'rejected' | 'all';

interface TimesheetList {
  data: TimesheetContext[];
}

const PAGE_SIZE = 10;

export default function Approvals() {
  const [tab, setTab] = useState<TabKey>('pending');
  const [type, setType] = useState('');

  const approvals = useResource<unknown>('/v1/approvals');
  const all = useMemo(() => listOf<ApprovalRequest>(approvals.data), [approvals.data]);

  const hasTimesheets = all.some((a) => a.documentType === 'timesheet');
  const timesheets = useResource<TimesheetList>('/v1/operations/timesheets?take=500', { enabled: hasTimesheets });
  const timesheetById = useMemo(
    () => new Map(listOf<TimesheetContext>(timesheets.data).map((t) => [t.id, t])),
    [timesheets.data],
  );

  const counts = useMemo(
    () => ({
      pending: all.filter((a) => a.status === 'pending').length,
      approved: all.filter((a) => a.status === 'approved').length,
      rejected: all.filter((a) => a.status === 'rejected').length,
    }),
    [all],
  );

  const types = useMemo(() => Array.from(new Set(all.map((a) => a.documentType))).sort(), [all]);

  const rows = useMemo(
    () =>
      all.filter(
        (a) => (tab === 'all' || a.status === tab) && (!type || a.documentType === type),
      ),
    [all, tab, type],
  );
  const { page, setPage, totalPages, paged } = usePagedList(rows, PAGE_SIZE);

  const tabOptions: Array<{ value: TabKey; label: string }> = [
    { value: 'pending', label: `Menunggu${counts.pending ? ` (${counts.pending})` : ''}` },
    { value: 'approved', label: 'Disetujui' },
    { value: 'rejected', label: 'Ditolak' },
    { value: 'all', label: 'Semua' },
  ];

  const [decision, setDecision] = useState<{ request: ApprovalRequest; kind: 'approved' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const detail = useResource<ApprovalRequest | null>(selected ? `/v1/approvals/${selected.id}` : null);
  // Tampilkan data dari daftar dulu supaya modal tidak kosong selagi detail dimuat.
  const shown = detail.data && detail.data.id === selected?.id ? detail.data : selected;

  function openDecision(request: ApprovalRequest, kind: 'approved' | 'rejected') {
    setDecision({ request, kind });
    setNote('');
  }

  async function submitDecision() {
    if (!decision) return;
    const trimmed = note.trim();
    if (decision.kind === 'rejected' && trimmed.length < 3) {
      toast({ title: 'Alasan penolakan wajib diisi.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/v1/approvals/${decision.request.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision: decision.kind, note: trimmed || undefined }),
      });
      toast({ title: decision.kind === 'approved' ? 'Disetujui.' : 'Ditolak.', icon: 'check' });
      setDecision(null);
      setSelected(null);
      approvals.reload();
    } catch (err) {
      // Pesan backend (mis. role tidak ditugaskan pada tahap ini) cukup jelas; tampilkan apa adanya.
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan keputusan.', icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Persetujuan"
        subtitle="Putuskan dokumen yang menunggu tanpa berpindah halaman"
        actions={
          <Button variant="subtle" icon="sync" onClick={approvals.reload} disabled={approvals.loading}>
            Muat ulang
          </Button>
        }
      />

      <StatRow
        items={[
          { label: 'Menunggu keputusan', value: counts.pending, tone: counts.pending > 0 ? 'accent' : 'default' },
          { label: 'Disetujui', value: counts.approved },
          { label: 'Ditolak', value: counts.rejected },
          { label: 'Total permintaan', value: all.length },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-2.5 sm:items-center">
        <Tabs
          options={tabOptions}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPage(1);
          }}
        />
        {types.length > 1 && (
          <Select
            aria-label="Filter jenis dokumen"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua jenis</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {documentTypeLabel(t)}
              </option>
            ))}
          </Select>
        )}
      </div>

      {approvals.error ? (
        <Card className="p-6">
          <EmptyState
            icon="warning"
            title="Gagal memuat persetujuan"
            body={approvals.error}
            action={
              <Button variant="ghost" icon="sync" onClick={approvals.reload}>
                Coba lagi
              </Button>
            }
          />
        </Card>
      ) : approvals.loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-busy="true" aria-label="Memuat persetujuan">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-xl bg-sand/60 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={tab === 'pending' ? 'check' : 'clipboard'}
            title={tab === 'pending' ? 'Tidak ada yang menunggu' : 'Belum ada data'}
            body={
              tab === 'pending'
                ? 'Dokumen yang butuh persetujuan Anda akan muncul di sini.'
                : 'Tidak ada permintaan persetujuan untuk filter ini.'
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {paged.map((r) => (
              <ApprovalCard
                key={r.id}
                request={r}
                timesheet={r.documentType === 'timesheet' ? timesheetById.get(r.documentId) : undefined}
                busy={busy}
                onOpen={() => setSelected(r)}
                onApprove={() => openDecision(r, 'approved')}
                onReject={() => openDecision(r, 'rejected')}
              />
            ))}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={rows.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      <Modal
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={decision?.kind === 'approved' ? 'Setujui dokumen?' : 'Tolak dokumen?'}
        maxWidth="md"
      >
        {decision && (
          <div className="space-y-4">
            <div className="rounded-lg border border-ash bg-sand/40 px-3.5 py-3 min-w-0">
              <p className="text-[15px] text-ink break-words">{documentTypeLabel(decision.request.documentType)}</p>
              {decision.request.documentType === 'timesheet' && timesheetById.get(decision.request.documentId) && (
                <div className="mt-2.5">
                  <TimesheetSummary sheet={timesheetById.get(decision.request.documentId) as TimesheetContext} />
                </div>
              )}
              {decision.request.note && <p className="text-caption text-fossil mt-2 break-words">{decision.request.note}</p>}
            </div>
            <Field
              label={decision.kind === 'rejected' ? 'Alasan penolakan' : 'Catatan'}
              hint={decision.kind === 'rejected' ? 'Wajib diisi. Pemohon akan membacanya.' : 'Opsional'}
            >
              <Textarea
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder={decision.kind === 'rejected' ? 'Mis. nilai tidak sesuai kesepakatan' : 'Opsional'}
                className="min-h-[88px]"
              />
            </Field>
            <p className="text-caption text-fossil">Keputusan tercatat di jejak audit dan tidak bisa diubah.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" size="lg" className="min-h-[48px]" onClick={() => setDecision(null)}>
                Batal
              </Button>
              <Button variant="primary" size="lg" className="min-h-[48px]" disabled={busy} onClick={submitDecision}>
                {busy ? 'Menyimpan…' : decision.kind === 'approved' ? 'Setujui' : 'Tolak'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={shown ? documentTypeLabel(shown.documentType) : ''}
        maxWidth="lg"
      >
        {shown && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-body-sm">
              <div>
                <p className="text-caption text-fossil">Status</p>
                <Badge variant={(statusBadge[shown.status] ?? statusBadge.pending).variant} className="mt-1">
                  {(statusBadge[shown.status] ?? { label: shown.status }).label}
                </Badge>
              </div>
              <div>
                <p className="text-caption text-fossil">Diajukan</p>
                <p className="text-ink">{formatDateTime(shown.submittedAt)}</p>
              </div>
              <div className="col-span-2 min-w-0">
                <p className="text-caption text-fossil">ID dokumen</p>
                <p className="text-ink tnum break-all">{shown.documentId}</p>
              </div>
              {shown.note && (
                <div className="col-span-2 min-w-0">
                  <p className="text-caption text-fossil">Catatan pengajuan</p>
                  <p className="text-ink break-words">{shown.note}</p>
                </div>
              )}
            </div>

            {shown.documentType === 'timesheet' && timesheetById.get(shown.documentId) && (
              <Card className="p-3.5">
                <TimesheetSummary sheet={timesheetById.get(shown.documentId) as TimesheetContext} />
              </Card>
            )}

            <div>
              <p className="text-caption text-fossil mb-2">Alur persetujuan</p>
              <ol className="space-y-2">
                {shown.steps.map((s) => {
                  const b = statusBadge[s.status] ?? statusBadge.pending;
                  const isCurrent = shown.status === 'pending' && s.stepOrder === shown.currentStep;
                  return (
                    <li
                      key={s.id}
                      className={`rounded-xl border px-3.5 py-3 min-w-0 ${isCurrent ? 'border-ink/40 bg-sand/40' : 'border-ash'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[14px] text-ink min-w-0 break-words">
                          Tahap {s.stepOrder} · {approverLabel(s)}
                        </p>
                        <Badge variant={b.variant} className="shrink-0">
                          {s.status === 'pending' && !isCurrent ? 'Antre' : b.label}
                        </Badge>
                      </div>
                      {s.actedAt && <p className="text-caption text-fossil mt-1">{formatDateTime(s.actedAt)}</p>}
                      {s.note && <p className="text-body-sm text-smoke mt-1.5 break-words">{s.note}</p>}
                    </li>
                  );
                })}
              </ol>
              {detail.loading && <p className="text-caption text-pebble mt-2">Memperbarui rincian…</p>}
              {detail.error && <p className="text-caption text-fossil mt-2">Rincian terbaru gagal dimuat: {detail.error}</p>}
            </div>

            {shown.status === 'pending' && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" size="lg" className="min-h-[48px]" onClick={() => openDecision(shown, 'rejected')}>
                  Tolak
                </Button>
                <Button variant="primary" size="lg" icon="check" className="min-h-[48px]" onClick={() => openDecision(shown, 'approved')}>
                  Setujui
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
