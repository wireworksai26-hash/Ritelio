import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatIDR } from '../../lib/format';
import { listOf, useDebounced, usePagedList, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/controls';
import { DataTable, RowAction, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';
import { SearchBox, errMsg, num } from './shared';

type Kind = 'suppliers' | 'customers';

interface Party {
  id: string;
  code: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  taxId: string | null;
  address: string;
  city: string;
  paymentTermDays: number;
  creditLimit: number | string | null;
  isActive: boolean;
}

interface FormState {
  code: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  taxId: string;
  address: string;
  city: string;
  paymentTermDays: string;
  creditLimit: string;
}

const emptyForm: FormState = {
  code: '',
  name: '',
  contact: '',
  email: '',
  phone: '',
  taxId: '',
  address: '',
  city: '',
  paymentTermDays: '',
  creditLimit: '',
};

const kindOptions: Array<{ value: Kind; label: string }> = [
  { value: 'suppliers', label: 'Pemasok' },
  { value: 'customers', label: 'Pelanggan' },
];

const PAGE_SIZE = 10;

export function PartiesTab() {
  const [kind, setKind] = useState<Kind>('suppliers');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const search = useDebounced(query.trim(), 300);

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (!showInactive) params.set('isActive', 'true');
  const list = useResource<unknown>(`/v1/parties/${kind}${params.toString() ? `?${params}` : ''}`);
  const rows = useMemo(() => listOf<Party>(list.data), [list.data]);
  const { page, setPage, totalPages, paged } = usePagedList(rows, PAGE_SIZE);

  const noun = kind === 'suppliers' ? 'pemasok' : 'pelanggan';

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ party: Party; action: 'deactivate' | 'delete' } | null>(null);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(p: Party) {
    setEditing(p);
    setForm({
      code: p.code,
      name: p.name,
      contact: p.contact ?? '',
      email: p.email ?? '',
      phone: p.phone ?? '',
      taxId: p.taxId ?? '',
      address: p.address ?? '',
      city: p.city ?? '',
      paymentTermDays: String(p.paymentTermDays ?? 0),
      creditLimit: p.creditLimit === null || p.creditLimit === undefined ? '' : String(num(p.creditLimit)),
    });
    setFormOpen(true);
  }

  async function save() {
    if (form.name.trim().length < 2) {
      toast({ title: `Nama ${noun} minimal 2 karakter.`, icon: 'warning' });
      return;
    }
    const term = form.paymentTermDays.trim();
    if (term && (!Number.isInteger(Number(term)) || Number(term) < 0 || Number(term) > 365)) {
      toast({ title: 'Tempo pembayaran harus 0-365 hari.', icon: 'warning' });
      return;
    }
    // Backend memvalidasi string kosong sebagai nilai tidak valid (email/kode), jadi hanya kirim yang terisi.
    const body: Record<string, unknown> = { name: form.name.trim() };
    const optional: Array<[keyof FormState, string]> = [
      ['contact', form.contact],
      ['email', form.email],
      ['phone', form.phone],
      ['taxId', form.taxId],
      ['address', form.address],
      ['city', form.city],
    ];
    for (const [key, value] of optional) {
      if (value.trim() || (editing && key !== 'email')) body[key] = value.trim();
    }
    if (term) body.paymentTermDays = Number(term);
    if (form.creditLimit.trim()) body.creditLimit = Number(form.creditLimit);
    if (!editing && form.code.trim()) body.code = form.code.trim();

    setBusy(true);
    try {
      await apiFetch(editing ? `/v1/parties/${kind}/${editing.id}` : `/v1/parties/${kind}`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      toast({ title: editing ? `Data ${noun} diperbarui.` : `${noun[0].toUpperCase()}${noun.slice(1)} ditambahkan.`, icon: 'check' });
      setFormOpen(false);
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal menyimpan.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === 'delete') {
        await apiFetch(`/v1/parties/${kind}/${confirm.party.id}`, { method: 'DELETE' });
        toast({ title: `${confirm.party.name} dihapus.`, icon: 'check' });
      } else {
        await apiFetch(`/v1/parties/${kind}/${confirm.party.id}/deactivate`, { method: 'POST', body: JSON.stringify({}) });
        toast({ title: `${confirm.party.name} dinonaktifkan.`, icon: 'check' });
      }
      setConfirm(null);
      list.reload();
    } catch (err) {
      // Backend menolak hapus bila sudah dipakai transaksi dan menyarankan nonaktifkan — tampilkan apa adanya.
      toast({ title: errMsg(err, 'Gagal memproses.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  async function reactivate(p: Party) {
    try {
      await apiFetch(`/v1/parties/${kind}/${p.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) });
      toast({ title: `${p.name} diaktifkan kembali.`, icon: 'check' });
      list.reload();
    } catch (err) {
      toast({ title: errMsg(err, 'Gagal mengaktifkan.'), icon: 'warning' });
    }
  }

  const columns: Column<Party>[] = [
    {
      key: 'name',
      header: kind === 'suppliers' ? 'Pemasok' : 'Pelanggan',
      render: (p) => (
        <>
          <p className="text-[15px] text-ink font-medium break-words">{p.name}</p>
          <p className="text-caption text-fossil">{p.code}</p>
        </>
      ),
    },
    {
      key: 'contact',
      header: 'Kontak',
      render: (p) =>
        p.contact || p.phone || p.email ? (
          <>
            {p.contact && <p className="text-body-sm text-ink break-words">{p.contact}</p>}
            {p.phone && <p className="text-caption text-fossil tnum">{p.phone}</p>}
            {p.email && <p className="text-caption text-fossil truncate">{p.email}</p>}
          </>
        ) : (
          <span className="text-pebble">-</span>
        ),
    },
    {
      key: 'term',
      header: 'Tempo',
      align: 'right',
      render: (p) => <span className="tnum">{p.paymentTermDays} hari</span>,
    },
    {
      key: 'credit',
      header: kind === 'suppliers' ? 'Batas kredit' : 'Limit kredit',
      mobileLabel: 'Limit kredit',
      align: 'right',
      hideOnMobile: true,
      render: (p) => (p.creditLimit === null ? <span className="text-pebble">-</span> : <span className="tnum">{formatIDR(num(p.creditLimit))}</span>),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge variant={p.isActive ? 'accent' : 'outline'}>{p.isActive ? 'Aktif' : 'Nonaktif'}</Badge>,
    },
  ];

  return (
    <div className="space-y-3">
      <Tabs
        options={kindOptions}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setPage(1);
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5">
        <SearchBox value={query} onChange={setQuery} placeholder={`Cari ${noun} (nama atau kode)`} />
        <Button variant="primary" icon="plus" onClick={openCreate}>
          Tambah {noun}
        </Button>
      </div>
      <label className="flex items-center gap-3 min-h-[40px] text-body-sm text-fossil">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="h-5 w-5 accent-[var(--color-ink)]"
        />
        Tampilkan yang nonaktif
      </label>

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(p) => p.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        emptyIcon="users"
        emptyTitle={search ? `Tidak ada ${noun} yang cocok` : `Belum ada ${noun}`}
        emptyBody={`Data ${noun} dipakai di pesanan, faktur, dan pembayaran.`}
        onRowClick={openEdit}
        page={page}
        totalPages={totalPages}
        totalItems={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        rowActions={(p) => (
          <>
            <RowAction icon="edit" label="Ubah" onClick={() => openEdit(p)} />
            {p.isActive ? (
              <RowAction icon="lock" label="Nonaktifkan" onClick={() => setConfirm({ party: p, action: 'deactivate' })} />
            ) : (
              <RowAction icon="check" label="Aktifkan kembali" onClick={() => reactivate(p)} />
            )}
            <RowAction icon="trash" label="Hapus" tone="danger" onClick={() => setConfirm({ party: p, action: 'delete' })} />
          </>
        )}
      />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Ubah ${noun}` : `Tambah ${noun}`} maxWidth="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Input label="Nama" value={form.name} maxLength={160} onChange={set('name')} />
            </div>
            {!editing && (
              <Input label="Kode" hint="Kosongkan untuk dibuat otomatis" value={form.code} maxLength={32} onChange={set('code')} />
            )}
            <Input label="Narahubung" value={form.contact} maxLength={120} onChange={set('contact')} />
            <Input label="Telepon" type="tel" inputMode="tel" value={form.phone} maxLength={40} onChange={set('phone')} />
            <Input label="Email" type="email" inputMode="email" value={form.email} maxLength={160} onChange={set('email')} />
            <Input label="NPWP" value={form.taxId} maxLength={40} onChange={set('taxId')} />
            <Input label="Kota" value={form.city} maxLength={120} onChange={set('city')} />
            <div className="sm:col-span-2">
              <Input label="Alamat" value={form.address} maxLength={255} onChange={set('address')} />
            </div>
            <Input
              label="Tempo pembayaran (hari)"
              type="number"
              inputMode="numeric"
              min="0"
              max="365"
              value={form.paymentTermDays}
              onChange={set('paymentTermDays')}
            />
            <Input
              label="Limit kredit (Rp)"
              type="number"
              inputMode="decimal"
              min="0"
              value={form.creditLimit}
              onChange={set('creditLimit')}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" full onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" full disabled={busy} onClick={save}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.action === 'delete' ? `Hapus ${noun}?` : `Nonaktifkan ${noun}?`}
        maxWidth="sm"
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              {confirm.action === 'delete'
                ? `${confirm.party.name} dihapus permanen. Bila sudah dipakai transaksi, sistem akan menolak dan Anda bisa menonaktifkannya.`
                : `${confirm.party.name} tidak muncul lagi di pilihan baru, riwayat transaksi tetap tersimpan.`}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" full onClick={() => setConfirm(null)}>
                Batal
              </Button>
              <Button variant="primary" full disabled={busy} onClick={runConfirm}>
                {busy ? 'Memproses…' : confirm.action === 'delete' ? 'Hapus' : 'Nonaktifkan'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
