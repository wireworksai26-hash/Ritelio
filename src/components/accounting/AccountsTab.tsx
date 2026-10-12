import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { cn, formatNumber } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/controls';
import { StatRow } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import {
  FilterBar,
  SelectBox,
  accountTypeLabel,
  type AccountNode,
  type AccountType,
} from './shared';

interface FlatAccount {
  node: AccountNode;
  depth: number;
}

const TYPES = Object.keys(accountTypeLabel) as AccountType[];

function flatten(nodes: AccountNode[], depth = 0, out: FlatAccount[] = []): FlatAccount[] {
  for (const node of nodes) {
    out.push({ node, depth });
    flatten(node.children, depth + 1, out);
  }
  return out;
}

function descendantIds(node: AccountNode, acc = new Set<string>()): Set<string> {
  for (const child of node.children) {
    acc.add(child.id);
    descendantIds(child, acc);
  }
  return acc;
}

interface FormState {
  id: string | null;
  code: string;
  name: string;
  type: AccountType;
  parentId: string;
  locked: boolean;
}

const emptyForm: FormState = { id: null, code: '', name: '', type: 'asset', parentId: '', locked: false };

export function AccountsTab() {
  const tree = useResource<{ data: AccountNode[] }>('/v1/finance/accounts/tree');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountNode | null>(null);
  const [saving, setSaving] = useState(false);

  const roots = tree.data?.data ?? [];
  const flat = useMemo(() => flatten(roots), [roots]);

  const filtering = query.trim() !== '' || typeFilter !== '';
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flat.filter(
      ({ node }) =>
        (!typeFilter || node.type === typeFilter) &&
        (!q || `${node.code} ${node.name}`.toLowerCase().includes(q)),
    );
  }, [flat, query, typeFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { node } of flat) c[node.type] = (c[node.type] ?? 0) + 1;
    return c;
  }, [flat]);

  // Induk yang valid: bukan akun itu sendiri maupun turunannya (mencegah siklus).
  const parentOptions = useMemo(() => {
    if (!form) return [];
    const blocked = new Set<string>();
    if (form.id) {
      blocked.add(form.id);
      const self = flat.find((f) => f.node.id === form.id);
      if (self) descendantIds(self.node).forEach((id) => blocked.add(id));
    }
    return flat.filter((f) => !blocked.has(f.node.id));
  }, [flat, form]);

  function openCreate() {
    setForm({ ...emptyForm });
  }

  function openEdit(node: AccountNode) {
    setForm({
      id: node.id,
      code: node.code,
      name: node.name,
      type: node.type,
      parentId: node.parentId ?? '',
      locked: (node._count?.journalLines ?? 0) > 0,
    });
  }

  function onParentChange(parentId: string) {
    setForm((f) => {
      if (!f) return f;
      const parent = flat.find((x) => x.node.id === parentId)?.node;
      // Akun baru mewarisi tipe induknya; saat edit tipe dibiarkan sesuai pilihan.
      return { ...f, parentId, type: parent && !f.id ? parent.type : f.type };
    });
  }

  async function save() {
    if (!form) return;
    const code = form.code.trim();
    const name = form.name.trim();
    if (!form.id && !/^\d{1,8}(\.\d{1,8})?$/.test(code)) {
      toast({ title: 'Kode akun harus angka, boleh bertingkat (mis. 1.101).', icon: 'warning' });
      return;
    }
    if (name.length < 2) {
      toast({ title: 'Nama akun minimal 2 karakter.', icon: 'warning' });
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await apiFetch(`/v1/finance/accounts/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            type: form.locked ? undefined : form.type,
            parentId: form.parentId || null,
          }),
        });
        toast({ title: 'Akun diperbarui.', icon: 'check' });
      } else {
        await apiFetch('/v1/finance/accounts', {
          method: 'POST',
          body: JSON.stringify({
            code,
            name,
            type: form.type,
            ...(form.parentId ? { parentId: form.parentId } : {}),
          }),
        });
        toast({ title: 'Akun ditambahkan.', icon: 'check' });
      }
      setForm(null);
      tree.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan akun.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/finance/accounts/${deleteTarget.id}`, { method: 'DELETE' });
      toast({ title: `Akun ${deleteTarget.code} dihapus.`, icon: 'check' });
      setDeleteTarget(null);
      tree.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menghapus akun.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  const deletable = (n: AccountNode) => n.children.length === 0 && (n._count?.journalLines ?? 0) === 0;

  return (
    <div className="space-y-4">
      <StatRow
        items={[
          { label: 'Total akun', value: formatNumber(flat.length) },
          { label: 'Aset', value: formatNumber(counts.asset ?? 0) },
          { label: 'Kewajiban & ekuitas', value: formatNumber((counts.liability ?? 0) + (counts.equity ?? 0)) },
          { label: 'Pendapatan & beban', value: formatNumber((counts.revenue ?? 0) + (counts.expense ?? 0)) },
        ]}
      />

      <FilterBar>
        <div className="min-[420px]:col-span-2 lg:col-span-2 relative self-end">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kode atau nama akun"
            aria-label="Cari akun"
            className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-3 py-2.5 text-[16px] sm:text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
          />
        </div>
        <SelectBox label="Tipe" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Semua tipe</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {accountTypeLabel[t]}
            </option>
          ))}
        </SelectBox>
        <div className="self-end">
          <Button variant="primary" icon="plus" full onClick={openCreate}>
            Tambah Akun
          </Button>
        </div>
      </FilterBar>

      {tree.error ? (
        <Card className="p-6">
          <EmptyState
            icon="warning"
            title="Gagal memuat bagan akun"
            body={tree.error}
            action={
              <Button variant="ghost" icon="sync" onClick={tree.reload}>
                Coba lagi
              </Button>
            }
          />
        </Card>
      ) : tree.loading ? (
        <Card className="p-6 space-y-3" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-sand animate-pulse" />
          ))}
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon="document"
            title={filtering ? 'Akun tidak ditemukan' : 'Bagan akun masih kosong'}
            body={filtering ? 'Ubah kata kunci atau filter tipe.' : 'Tambahkan akun pertama untuk mulai mencatat jurnal.'}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-sand">
            {visible.map(({ node, depth }) => {
              const used = node._count?.journalLines ?? 0;
              // Saat difilter, hierarki terputus sehingga indentasi tidak berarti.
              const indent = filtering ? 0 : Math.min(depth, 4) * 14;
              return (
                <li key={node.id} className="flex items-center gap-2 pr-2 sm:pr-4 py-2.5" style={{ paddingLeft: 16 + indent }}>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[15px] text-ink break-words', node.children.length > 0 && 'font-medium')}>
                      <span className="tnum text-fossil mr-2">{node.code}</span>
                      {node.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{accountTypeLabel[node.type]}</Badge>
                      <span className="text-caption text-fossil">
                        {used > 0 ? `${formatNumber(used)} baris jurnal` : 'Belum dipakai'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(node)}
                    aria-label={`Ubah akun ${node.code}`}
                    className="p-2.5 rounded-lg text-pebble hover:text-ink hover:bg-sand transition-colors"
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(node)}
                    disabled={!deletable(node)}
                    aria-label={`Hapus akun ${node.code}`}
                    title={
                      deletable(node)
                        ? 'Hapus akun'
                        : node.children.length > 0
                          ? 'Masih punya akun anak'
                          : 'Sudah dipakai jurnal'
                    }
                    className="p-2.5 rounded-lg text-pebble hover:text-rose-700 hover:bg-sand transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? 'Ubah Akun' : 'Tambah Akun'}
        maxWidth="md"
      >
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Kode"
                value={form.code}
                disabled={form.id !== null}
                inputMode="decimal"
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="1.101"
                hint={form.id ? 'Kode tidak bisa diubah di sini.' : 'Angka, boleh bertingkat.'}
              />
              <SelectBox
                label="Tipe"
                value={form.type}
                disabled={form.locked}
                onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
                hint={form.locked ? 'Sudah dipakai jurnal, tipe terkunci.' : undefined}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {accountTypeLabel[t]}
                  </option>
                ))}
              </SelectBox>
            </div>
            <Input
              label="Nama akun"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={160}
              placeholder="Kas Kecil"
            />
            <SelectBox label="Akun induk" value={form.parentId} onChange={(e) => onParentChange(e.target.value)}>
              <option value="">Tanpa induk</option>
              {parentOptions.map(({ node }) => (
                <option key={node.id} value={node.id}>
                  {node.code} {node.name}
                </option>
              ))}
            </SelectBox>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <Button variant="ghost" full onClick={() => setForm(null)}>
                Batal
              </Button>
              <Button variant="primary" full disabled={saving} onClick={save}>
                {saving ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Hapus Akun" maxWidth="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              Hapus akun{' '}
              <strong className="text-ink">
                {deleteTarget.code} {deleteTarget.name}
              </strong>
              ? Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="ghost" full onClick={() => setDeleteTarget(null)}>
                Batal
              </Button>
              <Button variant="primary" full disabled={saving} onClick={remove}>
                {saving ? 'Menghapus…' : 'Hapus'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
