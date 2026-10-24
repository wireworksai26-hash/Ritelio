import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { toCsv, downloadTextFile } from '../../lib/csv';
import { formatDateTime } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input, Select } from '../ui/controls';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { Pagination } from '../ui/Pagination';

// Pelanggan newsletter dari formulir footer halaman depan (POST /v1/newsletter/subscribe).
// Berisi alamat email orang luar: endpoint-nya hanya untuk superadmin platform.

type Status = 'pending' | 'confirmed' | 'unsubscribed';

interface Row {
  id: string;
  email: string;
  status: Status;
  source: string;
  consentAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
}

interface Page {
  data: Row[];
  meta: { page: number; limit: number; total: number; counts: Record<Status | 'all', number> };
}

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Menunggu konfirmasi',
  confirmed: 'Aktif',
  unsubscribed: 'Berhenti',
};
const STATUS_VARIANT: Record<Status, 'ink' | 'accent' | 'outline'> = { pending: 'ink', confirmed: 'accent', unsubscribed: 'outline' };

type Pending = { kind: 'unsubscribe' | 'delete'; row: Row } | null;

export function NewsletterTab() {
  const [status, setStatus] = useState<'' | Status>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const query = `/v1/newsletter/subscribers?limit=${PAGE_SIZE}&page=${page}${status ? `&status=${status}` : ''}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`;
  const list = useResource<Page>(query);
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;
  const counts = list.data?.meta.counts;

  async function exportCsv() {
    setBusy(true);
    try {
      const res = await apiFetch<{ data: Array<Record<string, unknown>> }>('/v1/newsletter/subscribers/export');
      const csv = toCsv(res.data, [
        { key: 'email', header: 'Email' },
        { key: 'status', header: 'Status' },
        { key: 'source', header: 'Sumber' },
        { key: 'consentAt', header: 'Waktu persetujuan' },
        { key: 'confirmedAt', header: 'Waktu konfirmasi' },
        { key: 'unsubscribedAt', header: 'Waktu berhenti' },
        { key: 'createdAt', header: 'Dicatat' },
      ]);
      downloadTextFile(`pelanggan-newsletter-${new Date().toLocaleDateString('sv-SE')}.csv`, csv);
      toast({ title: `${res.data.length} alamat diekspor.`, icon: 'check' });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mengekspor.', icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'unsubscribe') {
        await apiFetch(`/v1/newsletter/subscribers/${pending.row.id}/unsubscribe`, { method: 'POST' });
        toast({ title: 'Ditandai berhenti.', icon: 'check' });
      } else {
        await apiFetch(`/v1/newsletter/subscribers/${pending.row.id}`, { method: 'DELETE' });
        toast({ title: 'Alamat dihapus permanen.', icon: 'check' });
      }
      setPending(null);
      list.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal memproses.', icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] text-ink">Pelanggan newsletter</p>
            <p className="text-body-sm text-fossil mt-0.5">
              Email yang ditulis pengunjung di footer halaman depan. Pengiriman newsletter belum aktif, jadi semua alamat berstatus menunggu konfirmasi:
              konfirmasi lewat email baru berjalan setelah pengiriman email dipasang.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 shrink-0">
            <Input
              id="newsletter-search"
              label="Cari email"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="cth. gmail"
            />
            <Select
              id="newsletter-filter-status"
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
            <Button variant="ghost" size="sm" icon="document" disabled={busy || (counts?.all ?? 0) === 0} onClick={() => void exportCsv()}>
              Ekspor CSV
            </Button>
          </div>
        </div>
        {counts && (
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Ringkasan jumlah">
            {(
              [
                ['Semua', counts.all],
                [STATUS_LABEL.pending, counts.pending],
                [STATUS_LABEL.confirmed, counts.confirmed],
                [STATUS_LABEL.unsubscribed, counts.unsubscribed],
              ] as Array<[string, number]>
            ).map(([label, n]) => (
              <div key={label} className="rounded-xl border border-ash px-4 py-3">
                <dt className="text-caption text-fossil">{label}</dt>
                <dd className="text-[22px] font-light text-ink">{n}</dd>
              </div>
            ))}
          </dl>
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
            icon="mail"
            title={status || q ? 'Tidak ada alamat yang cocok' : 'Belum ada pelanggan newsletter'}
            body={status || q ? 'Coba ubah pencarian atau status.' : 'Alamat muncul di sini begitu pengunjung mengisi formulir di footer halaman depan.'}
          />
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-medium text-ink break-all">{r.email}</span>
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                <p className="mt-1 text-caption text-fossil">
                  Menyetujui {formatDateTime(r.consentAt)}
                  {r.confirmedAt && ` · Konfirmasi ${formatDateTime(r.confirmedAt)}`}
                  {r.unsubscribedAt && ` · Berhenti ${formatDateTime(r.unsubscribedAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.status !== 'unsubscribed' && (
                  <Button variant="ghost" size="sm" onClick={() => setPending({ kind: 'unsubscribe', row: r })} aria-label={`Tandai berhenti ${r.email}`}>
                    Tandai berhenti
                  </Button>
                )}
                <Button variant="ghost" size="sm" icon="trash" onClick={() => setPending({ kind: 'delete', row: r })} aria-label={`Hapus ${r.email}`}>
                  Hapus
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <Modal open={pending !== null} onClose={() => setPending(null)} title={pending?.kind === 'delete' ? 'Hapus alamat?' : 'Tandai berhenti?'}>
        {pending && (
          <div className="space-y-4">
            <p className="text-body-sm text-smoke">
              {pending.kind === 'delete'
                ? `${pending.row.email} akan dihapus permanen dari daftar dan tidak bisa dikembalikan. Pakai ini untuk permintaan penghapusan data.`
                : `${pending.row.email} tidak akan menerima newsletter lagi. Alamatnya tetap tercatat sebagai berhenti, supaya tidak ditambahkan ulang tanpa persetujuan baru.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPending(null)}>
                Batal
              </Button>
              <Button disabled={busy} onClick={() => void confirmAction()}>
                {pending.kind === 'delete' ? 'Hapus permanen' : 'Tandai berhenti'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
