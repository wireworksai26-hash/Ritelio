import { useState } from 'react';
import { buildMailtoUrl, buildWhatsAppUrl, ONBOARDING_FORM_URL } from '../../config/contact';
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

// Data awal klien dari Google Form 2 (POST /v1/intake/onboarding-form), dikirim setelah klien berlangganan.
// Berisi data pribadi dan data usaha: endpoint-nya hanya untuk superadmin platform.

type Status = 'new' | 'in_progress' | 'done';

interface Row {
  id: string;
  createdAt: string;
  submittedAt: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  tenantId: string | null;
  tenantName: string | null;
  status: Status;
}

interface Detail extends Row {
  answers: Array<{ question: string; answer: string | string[] }>;
  notes: string;
}

interface Page {
  data: Row[];
  meta: { page: number; limit: number; total: number };
}

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<Status, string> = {
  new: 'Baru',
  in_progress: 'Sedang diproses',
  done: 'Selesai',
};

function answerText(a: string | string[]): string {
  return Array.isArray(a) ? a.join(', ') : a;
}

export function OnboardingTab() {
  const [status, setStatus] = useState<'' | Status>('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const query = `/v1/intake/onboarding?limit=${PAGE_SIZE}&page=${page}${status ? `&status=${status}` : ''}`;
  const list = useResource<Page>(query);
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  async function copyFormLink() {
    if (!ONBOARDING_FORM_URL) return;
    try {
      await navigator.clipboard.writeText(ONBOARDING_FORM_URL);
      toast({ title: 'Tautan formulir disalin.', icon: 'check' });
    } catch {
      toast({ title: 'Browser tidak mengizinkan menyalin otomatis.', icon: 'warning' });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] text-ink">Data awal klien</p>
          <p className="text-body-sm text-fossil mt-0.5">
            Jawaban Google Form 2 yang diisi klien setelah berlangganan: produk, stok awal, outlet, karyawan, supplier, pelanggan, saldo awal, pajak,
            dan metode bayar. Data ini belum masuk ke akun klien; tim memasukkannya setelah ditinjau.
          </p>
        </div>
        <div className="flex items-end gap-2 shrink-0">
          <Select
            id="onboarding-filter-status"
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

      <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3" aria-label="Tautan formulir untuk klien">
        <div className="min-w-0">
          <p className="text-[15px] text-ink">Tautan formulir untuk klien</p>
          {ONBOARDING_FORM_URL ? (
            <p className="text-body-sm text-fossil mt-0.5 break-all">{ONBOARDING_FORM_URL}</p>
          ) : (
            <p className="text-body-sm text-fossil mt-0.5">
              Belum diatur. Isi variabel <span className="font-mono">VITE_ONBOARDING_FORM_URL</span> dengan alamat Google Form 2, lalu build ulang.
            </p>
          )}
        </div>
        {ONBOARDING_FORM_URL && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" icon="document" onClick={() => void copyFormLink()}>
              Salin tautan
            </Button>
            <a href={ONBOARDING_FORM_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-ash px-3.5 py-2 text-[14px] text-ink hover:bg-sand">
              Buka formulir
            </a>
          </div>
        )}
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
            title={status ? 'Tidak ada data dengan status ini' : 'Belum ada data awal klien'}
            body={
              status
                ? 'Coba status lain.'
                : 'Data muncul di sini begitu klien mengirim Google Form 2. Pastikan skrip formulir sudah terpasang (panduannya ada di docs/intake-google-form).'
            }
          />
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-4 hover:border-pebble transition-colors">
            <button type="button" onClick={() => setOpenId(r.id)} className="w-full text-left" aria-label={`Buka data awal ${r.contactName ?? 'tanpa nama'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-medium text-ink truncate">{r.contactName ?? 'Tanpa nama'}</span>
                <Badge variant={r.status === 'new' ? 'ink' : 'neutral'}>{STATUS_LABEL[r.status]}</Badge>
                {r.tenantName ? <Badge variant="accent">Akun: {r.tenantName}</Badge> : <Badge variant="outline">Akun belum cocok</Badge>}
              </div>
              <p className="mt-1.5 text-caption text-fossil">
                Dikirim {formatDateTime(r.submittedAt)}
                {r.contactPhone && ` · ${r.contactPhone}`}
                {r.contactEmail && ` · ${r.contactEmail}`}
              </p>
            </button>
          </Card>
        ))}
      </div>

      <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {openId && <OnboardingDetail id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </div>
  );
}

function OnboardingDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const detail = useResource<Detail>(`/v1/intake/onboarding/${id}`);
  const [status, setStatus] = useState<Status | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = detail.data;

  const currentStatus = status ?? d?.status ?? 'new';
  const currentNotes = notes ?? d?.notes ?? '';

  async function save() {
    setBusy(true);
    try {
      await apiFetch(`/v1/intake/onboarding/${id}`, { method: 'PATCH', body: JSON.stringify({ status: currentStatus, notes: currentNotes }) });
      toast({ title: 'Tindak lanjut tersimpan.', icon: 'check' });
      onChanged();
      detail.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan.', icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  async function copyAll() {
    if (!d) return;
    const text = d.answers.map((qa) => `${qa.question}\n${answerText(qa.answer)}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Seluruh jawaban disalin.', icon: 'check' });
    } catch {
      toast({ title: 'Browser tidak mengizinkan menyalin otomatis.', icon: 'warning' });
    }
  }

  const greeting = `Halo${d?.contactName ? ` ${d.contactName}` : ''}, data awal usaha Anda sudah kami terima. Kami akan menyiapkannya di akun Retalio Anda.`;
  const whatsapp = d?.contactPhone ? buildWhatsAppUrl(d.contactPhone, greeting) : null;

  return (
    <Modal open onClose={onClose} title={d?.contactName ?? 'Data awal klien'} maxWidth="xl">
      {detail.loading && <p className="text-body-sm text-fossil">Memuat…</p>}
      {detail.error && <p className="text-body-sm text-ink" role="alert">{detail.error}</p>}
      {d && (
        <div className="space-y-5">
          <section aria-label="Kontak dan akun" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-[14px] font-medium text-paper hover:bg-ink/90">
                  <Icon name="chat" size={15} />
                  WhatsApp {d.contactPhone}
                </a>
              )}
              {d.contactEmail && (
                <a href={buildMailtoUrl(d.contactEmail, 'Data awal akun Retalio', greeting)} className="inline-flex items-center gap-2 rounded-lg border border-ash px-3.5 py-2 text-[14px] text-ink hover:bg-sand">
                  <Icon name="mail" size={15} />
                  {d.contactEmail}
                </a>
              )}
              {!whatsapp && !d.contactEmail && <p className="text-body-sm text-fossil">Tidak ada kontak yang terbaca dari formulir.</p>}
            </div>
            <p className="text-body-sm text-fossil">
              {d.tenantName
                ? `Email cocok dengan akun "${d.tenantName}" (hanya petunjuk, periksa dulu sebelum memasukkan data).`
                : 'Email belum cocok dengan akun mana pun, atau cocok dengan lebih dari satu akun. Pastikan akun klien yang benar sebelum memasukkan data.'}
            </p>
          </section>

          <section aria-label="Jawaban formulir">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] text-ink">Jawaban formulir</p>
              <Button variant="ghost" size="sm" icon="document" onClick={() => void copyAll()}>
                Salin semua
              </Button>
            </div>
            <dl className="mt-2 divide-y divide-sand rounded-xl border border-ash">
              {d.answers.map((qa, i) => (
                <div key={i} className="px-4 py-2.5">
                  <dt className="text-caption text-fossil">{qa.question}</dt>
                  <dd className="text-body-sm text-ink whitespace-pre-line break-words">{answerText(qa.answer)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-label="Tindak lanjut" className="space-y-3">
            <p className="text-[15px] text-ink">Tindak lanjut</p>
            <Select id="onboarding-detail-status" label="Status" value={currentStatus} onChange={(e) => setStatus(e.target.value as Status)}>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Textarea id="onboarding-detail-notes" label="Catatan tim" value={currentNotes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
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
