import { useMemo, useState } from 'react';
import { formatDateTime, formatNumber } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import {
  FilterBar,
  LoadMore,
  Notice,
  SelectBox,
  maskSecrets,
  nextDayISO,
  useCursorList,
} from '../accounting/shared';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/controls';
import { DataTable, StatRow, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';

interface AuditUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  outcome: string;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  user: AuditUser | null;
}

interface Facets {
  entities: Array<{ entity: string; count: number }>;
  actions: Array<{ action: string; count: number }>;
}

const actionLabel: Record<string, string> = {
  create: 'Buat',
  update: 'Ubah',
  delete: 'Hapus',
  login: 'Masuk',
  register: 'Daftar',
  refresh: 'Perbarui sesi',
  close: 'Tutup',
  reverse: 'Balik',
};

const actionName = (a: string) => actionLabel[a] ?? a.replace(/_/g, ' ');
const entityName = (e: string) => e.replace(/_/g, ' ');

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

const show = (v: unknown): string => {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
};

/** Perbandingan per kunci bila before & after sama-sama objek; selain itu JSON mentah. */
function ChangeView({ before, after }: { before: unknown; after: unknown }) {
  const b = maskSecrets(before);
  const a = maskSecrets(after);

  if (b == null && a == null) {
    return <p className="text-body-sm text-fossil">Tidak ada data perubahan yang tersimpan.</p>;
  }

  if ((b == null || isRecord(b)) && (a == null || isRecord(a))) {
    const bo = (b ?? {}) as Record<string, unknown>;
    const ao = (a ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(bo), ...Object.keys(ao)])];
    return (
      <ul className="border border-ash rounded-xl divide-y divide-sand overflow-hidden">
        {keys.map((k) => {
          const changed = JSON.stringify(bo[k]) !== JSON.stringify(ao[k]);
          return (
            <li key={k} className={changed ? 'px-3.5 py-2.5 bg-chartreuse/15' : 'px-3.5 py-2.5'}>
              <p className="text-caption text-fossil break-all">
                {k}
                {changed && <span className="ml-2 text-ink">berubah</span>}
              </p>
              <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                <p className="min-w-0 break-words text-fossil">
                  <span className="text-caption text-pebble mr-1.5">Sebelum</span>
                  {show(bo[k])}
                </p>
                <p className="min-w-0 break-words text-ink">
                  <span className="text-caption text-pebble mr-1.5">Sesudah</span>
                  {show(ao[k])}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {[
        ['Sebelum', b],
        ['Sesudah', a],
      ].map(([label, value]) => (
        <div key={label as string}>
          <p className="text-caption text-fossil mb-1">{label as string}</p>
          <pre className="rounded-lg bg-sand/60 p-3 text-[12px] whitespace-pre-wrap break-all overflow-x-auto max-h-60">
            {JSON.stringify(value, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

export function AuditLogTab() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const facets = useResource<Facets>('/v1/audit/facets');
  const list = useCursorList<AuditLog>('/v1/audit/logs', {
    take: 40,
    entity: entity || undefined,
    action: action || undefined,
    outcome: outcome || undefined,
    from: from || undefined,
    to: to ? nextDayISO(to) : undefined,
  });

  const detail = useResource<AuditLog>(detailId ? `/v1/audit/logs/${detailId}` : null);

  const failures = list.rows.filter((r) => r.outcome === 'failure').length;
  const actors = useMemo(() => new Set(list.rows.map((r) => r.user?.id ?? 'sistem')).size, [list.rows]);

  const columns: Column<AuditLog>[] = [
    {
      key: 'time',
      header: 'Waktu',
      render: (r) => (
        <div className="min-w-0">
          <span className="text-ink">{formatDateTime(r.createdAt)}</span>
          <p className="text-caption text-fossil truncate">{r.user ? r.user.name || r.user.email : 'Sistem'}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Aksi',
      render: (r) => <Badge variant="neutral">{actionName(r.action)}</Badge>,
    },
    {
      key: 'entity',
      header: 'Objek',
      render: (r) => (
        <div className="min-w-0">
          <span className="capitalize break-words">{entityName(r.entity)}</span>
          {r.entityId && <p className="text-caption text-fossil truncate max-w-[180px]">{r.entityId}</p>}
        </div>
      ),
    },
    {
      key: 'outcome',
      header: 'Hasil',
      render: (r) =>
        r.outcome === 'success' ? <Badge variant="outline">Berhasil</Badge> : <Badge variant="ink" icon="warning">Gagal</Badge>,
    },
  ];

  const d = detail.data;

  return (
    <div className="space-y-4">
      <StatRow
        items={[
          { label: 'Total catatan', value: formatNumber(list.total ?? list.rows.length) },
          { label: 'Dimuat', value: formatNumber(list.rows.length) },
          { label: 'Gagal (dimuat)', value: formatNumber(failures), tone: failures > 0 ? 'accent' : 'default' },
          { label: 'Pelaku (dimuat)', value: formatNumber(actors) },
        ]}
      />

      <FilterBar>
        <SelectBox label="Objek" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">Semua objek</option>
          {(facets.data?.entities ?? []).map((f) => (
            <option key={f.entity} value={f.entity}>
              {entityName(f.entity)} ({f.count})
            </option>
          ))}
        </SelectBox>
        <SelectBox label="Aksi" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Semua aksi</option>
          {(facets.data?.actions ?? []).map((f) => (
            <option key={f.action} value={f.action}>
              {actionName(f.action)} ({f.count})
            </option>
          ))}
        </SelectBox>
        <SelectBox label="Hasil" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">Semua hasil</option>
          <option value="success">Berhasil</option>
          <option value="failure">Gagal</option>
        </SelectBox>
        <div className="grid grid-cols-2 gap-3 min-[420px]:col-span-2 lg:col-span-1">
          <Input label="Dari" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Sampai" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </FilterBar>

      <DataTable
        rows={list.rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(r) => setDetailId(r.id)}
        emptyIcon="shield"
        emptyTitle="Belum ada catatan"
        emptyBody="Tidak ada aktivitas yang cocok dengan filter ini."
      />
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />

      <Modal open={detailId !== null} onClose={() => setDetailId(null)} title="Detail Aktivitas" maxWidth="xl">
        {detail.loading && <div className="h-40 rounded-xl bg-sand/60 animate-pulse" aria-busy="true" />}
        {detail.error && (
          <div className="space-y-3">
            <Notice>{detail.error}</Notice>
            <Button variant="ghost" icon="sync" onClick={detail.reload}>
              Coba lagi
            </Button>
          </div>
        )}
        {d && !detail.loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm">
              <div>
                <p className="text-caption text-fossil">Waktu</p>
                <p className="text-ink">{formatDateTime(d.createdAt)}</p>
              </div>
              <div>
                <p className="text-caption text-fossil">Hasil</p>
                {d.outcome === 'success' ? <Badge variant="outline">Berhasil</Badge> : <Badge variant="ink" icon="warning">Gagal</Badge>}
              </div>
              <div className="min-w-0">
                <p className="text-caption text-fossil">Pengguna</p>
                <p className="text-ink break-words">{d.user ? `${d.user.name} (${d.user.role})` : 'Sistem'}</p>
                {d.user && <p className="text-caption text-fossil break-all">{d.user.email}</p>}
              </div>
              <div className="min-w-0">
                <p className="text-caption text-fossil">Aksi pada objek</p>
                <p className="text-ink break-words capitalize">
                  {actionName(d.action)} · {entityName(d.entity)}
                </p>
                {d.entityId && <p className="text-caption text-fossil break-all">{d.entityId}</p>}
              </div>
              <div className="min-w-0">
                <p className="text-caption text-fossil">Alamat IP</p>
                <p className="text-ink break-all">{d.ipAddress ?? '-'}</p>
              </div>
              <div className="min-w-0">
                <p className="text-caption text-fossil">Perangkat</p>
                <p className="text-ink break-words line-clamp-3">{d.userAgent ?? '-'}</p>
              </div>
            </div>
            {d.reason && <Notice>{d.reason}</Notice>}
            <div className="space-y-2">
              <h3 className="text-[16px] text-ink">Perubahan data</h3>
              <ChangeView before={d.before} after={d.after} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
