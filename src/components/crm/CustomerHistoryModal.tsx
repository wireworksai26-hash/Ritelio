import { useMemo, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { Icon, type IconName } from '../icons/Icon';
import { apiFetch } from '../../lib/api';
import { formatDateTime, formatIDR } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';

interface HistoryResponse {
  customer: {
    id: string;
    code: string;
    name: string;
    phone: string;
    email: string;
    city: string;
    paymentTermDays: number;
    salesOrders: Array<{ id: string; number: string; total: number | string; status: string; createdAt: string }>;
  };
  summary: { totalOrders: number; totalValue: number; openComplaints: number };
  interactions: Array<{ id: string; type: string; summary: string; detail: string; interactionDate: string }>;
  complaints: Array<{ id: string; title: string; description: string; status: string; resolution: string; createdAt: string }>;
}

interface TimelineItem {
  key: string;
  at: string;
  icon: IconName;
  title: string;
  body?: string;
  badge?: { label: string; variant: 'accent' | 'neutral' | 'outline' | 'ink' };
}

const interactionLabel: Record<string, string> = {
  call: 'Telepon',
  email: 'Email',
  visit: 'Kunjungan',
  meeting: 'Pertemuan',
  note: 'Catatan',
};

const interactionIcon: Record<string, IconName> = {
  call: 'phone',
  email: 'mail',
  visit: 'store',
  meeting: 'users',
  note: 'edit',
};

const orderStatus: Record<string, string> = {
  draft: 'Draf',
  confirmed: 'Dikonfirmasi',
  fulfilled: 'Terpenuhi',
  cancelled: 'Dibatalkan',
};

const complaintStatus: Record<string, { label: string; variant: 'accent' | 'neutral' | 'outline' }> = {
  open: { label: 'Terbuka', variant: 'outline' },
  in_progress: { label: 'Diproses', variant: 'neutral' },
  resolved: { label: 'Selesai', variant: 'accent' },
};

interface CustomerHistoryModalProps {
  customerId: string | null;
  onClose: () => void;
  /** Dipanggil setelah data berubah (interaksi baru) supaya induk bisa menyegarkan daftar. */
  onChanged?: () => void;
  onAddComplaint?: (customerId: string) => void;
}

export function CustomerHistoryModal({ customerId, onClose, onChanged, onAddComplaint }: CustomerHistoryModalProps) {
  const history = useResource<HistoryResponse>(customerId ? `/v1/crm/customers/${customerId}/history` : null);
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState('call');
  const [summary, setSummary] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  const data = history.data;

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!data) return [];
    const items: TimelineItem[] = [
      ...data.customer.salesOrders.map<TimelineItem>((o) => ({
        key: `o-${o.id}`,
        at: o.createdAt,
        icon: 'receipt',
        title: `Pesanan ${o.number}`,
        body: formatIDR(Number(o.total)),
        badge: { label: orderStatus[o.status] ?? o.status, variant: o.status === 'fulfilled' ? 'ink' : 'outline' },
      })),
      ...data.interactions.map<TimelineItem>((i) => ({
        key: `i-${i.id}`,
        at: i.interactionDate,
        icon: interactionIcon[i.type] ?? 'chat',
        title: i.summary,
        body: i.detail || undefined,
        badge: { label: interactionLabel[i.type] ?? i.type, variant: 'neutral' },
      })),
      ...data.complaints.map<TimelineItem>((c) => ({
        key: `c-${c.id}`,
        at: c.createdAt,
        icon: 'warning',
        title: `Komplain: ${c.title}`,
        body: c.resolution || c.description || undefined,
        badge: complaintStatus[c.status] ?? { label: c.status, variant: 'outline' },
      })),
    ];
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [data]);

  async function saveInteraction() {
    if (!customerId) return;
    if (summary.trim().length < 2) {
      toast({ title: 'Ringkasan interaksi minimal 2 huruf.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/v1/crm/customers/${customerId}/interactions`, {
        method: 'POST',
        body: JSON.stringify({ type, summary: summary.trim(), detail: detail.trim() || undefined }),
      });
      toast({ title: 'Interaksi dicatat.', icon: 'check' });
      setSummary('');
      setDetail('');
      setFormOpen(false);
      history.reload();
      onChanged?.();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mencatat interaksi.', icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={customerId !== null} onClose={onClose} title={data ? data.customer.name : 'Riwayat Pelanggan'} maxWidth="xl">
      {history.loading && !data && <p className="text-body-sm text-fossil py-6 text-center">Memuat riwayat…</p>}
      {history.error && (
        <div className="py-4 space-y-3">
          <p className="text-body-sm text-ink">{history.error}</p>
          <Button variant="ghost" icon="sync" onClick={history.reload}>
            Coba lagi
          </Button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="text-body-sm text-fossil space-y-0.5 break-words">
            <p className="tnum">
              {data.customer.code}
              {data.customer.city ? ` · ${data.customer.city}` : ''}
              {data.customer.paymentTermDays ? ` · tempo ${data.customer.paymentTermDays} hari` : ' · tunai'}
            </p>
            {(data.customer.phone || data.customer.email) && (
              <p>{[data.customer.phone, data.customer.email].filter(Boolean).join(' · ')}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Pesanan', value: String(data.summary.totalOrders) },
              { label: 'Nilai', value: formatIDR(data.summary.totalValue) },
              { label: 'Komplain terbuka', value: String(data.summary.openComplaints) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-ash px-2.5 py-2.5 min-w-0">
                <p className="text-caption text-fossil truncate">{s.label}</p>
                <p className="text-[15px] sm:text-[17px] text-ink tnum break-words mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant={formOpen ? 'subtle' : 'primary'} icon="plus" full className="sm:w-auto" onClick={() => setFormOpen((v) => !v)}>
              Catat Interaksi
            </Button>
            {onAddComplaint && (
              <Button variant="ghost" icon="warning" full className="sm:w-auto" onClick={() => onAddComplaint(data.customer.id)}>
                Catat Komplain
              </Button>
            )}
          </div>

          {formOpen && (
            <form
              className="rounded-xl border border-ash bg-bone/40 p-3.5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void saveInteraction();
              }}
            >
              <Select label="Jenis" value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(interactionLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Input label="Ringkasan" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Bahas perpanjangan kontrak" />
              <Textarea label="Rincian (opsional)" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={2000} />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" full onClick={() => setFormOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" full disabled={busy}>
                  {busy ? 'Menyimpan…' : 'Simpan'}
                </Button>
              </div>
            </form>
          )}

          {timeline.length === 0 ? (
            <p className="text-body-sm text-fossil text-center py-6">Belum ada riwayat untuk pelanggan ini.</p>
          ) : (
            <ol className="relative border-l border-ash ml-3 space-y-4">
              {timeline.map((t) => (
                <li key={t.key} className="pl-5 relative">
                  <span className="absolute -left-[13px] top-0.5 h-6 w-6 rounded-full bg-paper border border-ash flex items-center justify-center text-fossil">
                    <Icon name={t.icon} size={13} />
                  </span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[15px] text-ink break-words min-w-0">{t.title}</p>
                    {t.badge && <Badge variant={t.badge.variant}>{t.badge.label}</Badge>}
                  </div>
                  {t.body && <p className="text-body-sm text-fossil break-words mt-0.5">{t.body}</p>}
                  <p className="text-caption text-pebble mt-0.5">{formatDateTime(t.at)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
}
