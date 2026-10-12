import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatDate, formatDateTime, formatNumber } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { FilterBar, Notice, SectionTitle, SelectBox, formatMoney, isoDate, num } from '../accounting/shared';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/controls';
import { DataTable, StatRow, type Column } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';

type Category = 'vat' | 'withholding' | 'other';
type Direction = 'output' | 'input';
type Source = 'official' | 'estimate';

interface TaxBracket {
  id: string;
  sortOrder: number;
  lowerBound: number | string;
  upperBound: number | string | null;
  ratePercent: number | string;
}

interface TaxRule {
  id: string;
  code: string;
  name: string;
  category: Category;
  direction: Direction;
  basisType: string;
  rate: number | string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceRef: string | null;
  source: Source;
  isActive: boolean;
  brackets: TaxBracket[];
}

interface TaxComputation {
  id: string;
  documentType: string;
  documentId: string;
  direction: Direction;
  baseAmount: number | string;
  taxAmount: number | string;
  source: Source;
  ruleSnapshot: unknown;
  computedAt: string;
  taxRule: { code: string; name: string; source: Source; rate: number | string | null } | null;
}

const categoryLabel: Record<Category, string> = { vat: 'PPN', withholding: 'Pemotongan', other: 'Lainnya' };
const directionLabel: Record<Direction, string> = { output: 'Keluaran', input: 'Masukan' };

/** Badge sumber angka. Estimasi sengaja mencolok: belum boleh dipakai untuk pelaporan resmi. */
export function SourceBadge({ source }: { source: Source }) {
  return source === 'official' ? (
    <Badge variant="accent" icon="check">
      Resmi
    </Badge>
  ) : (
    <Badge variant="ink" icon="warning">
      Estimasi
    </Badge>
  );
}

const percent = (fraction: number | string | null) =>
  fraction === null ? '—' : `${Number((num(fraction) * 100).toFixed(4))}%`;

const docType = (t: string) => t.replace(/_/g, ' ');

// ── Aturan ──────────────────────────────────────────────────────────────────

interface BracketForm {
  key: number;
  lower: string;
  upper: string;
  rate: string;
}

let bracketSeq = 0;
const newBracket = (): BracketForm => ({ key: ++bracketSeq, lower: '', upper: '', rate: '' });

interface RuleForm {
  code: string;
  name: string;
  category: Category;
  direction: Direction;
  basisType: string;
  mode: 'flat' | 'bracket';
  ratePct: string;
  effectiveFrom: string;
  effectiveTo: string;
  sourceRef: string;
  source: Source;
  brackets: BracketForm[];
}

const emptyRuleForm = (): RuleForm => ({
  code: '',
  name: '',
  category: 'vat',
  direction: 'output',
  basisType: 'net',
  mode: 'flat',
  ratePct: '',
  effectiveFrom: isoDate(),
  effectiveTo: '',
  sourceRef: '',
  source: 'estimate',
  brackets: [newBracket()],
});

function RulesSection() {
  const rules = useResource<TaxRule[]>('/v1/tax/rules');
  const rows = listOf<TaxRule>(rules.data);

  const [form, setForm] = useState<RuleForm | null>(null);
  const [edit, setEdit] = useState<TaxRule | null>(null);
  const [editName, setEditName] = useState('');
  const [closeTarget, setCloseTarget] = useState<TaxRule | null>(null);
  const [closeDate, setCloseDate] = useState(isoDate());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const estimateCount = rows.filter((r) => r.source === 'estimate' && r.isActive).length;

  async function createRule() {
    if (!form) return;
    const bracketMode = form.category === 'withholding' && form.mode === 'bracket';
    if (form.code.trim().length < 2 || form.name.trim().length < 2) {
      toast({ title: 'Kode dan nama aturan minimal 2 karakter.', icon: 'warning' });
      return;
    }
    if (form.basisType.trim().length < 2) {
      toast({ title: 'Dasar pengenaan wajib diisi.', icon: 'warning' });
      return;
    }
    if (!form.effectiveFrom) {
      toast({ title: 'Tanggal mulai berlaku wajib diisi.', icon: 'warning' });
      return;
    }

    let payloadRate: number | undefined;
    let brackets: Array<{ lowerBound: number; upperBound?: number; ratePercent: number }> | undefined;

    if (bracketMode) {
      brackets = form.brackets
        .filter((b) => b.lower !== '' || b.upper !== '' || b.rate !== '')
        .map((b) => ({
          lowerBound: num(b.lower),
          ...(b.upper !== '' ? { upperBound: num(b.upper) } : {}),
          ratePercent: num(b.rate),
        }));
      const invalid = brackets.some((b) => b.ratePercent < 0 || b.ratePercent > 100 || (b.upperBound !== undefined && b.upperBound <= b.lowerBound));
      if (brackets.length === 0 || invalid) {
        toast({ title: 'Lengkapi bracket: batas atas harus di atas batas bawah, tarif 0–100%.', icon: 'warning' });
        return;
      }
    } else {
      const pct = num(form.ratePct);
      if (form.ratePct === '' || pct < 0 || pct > 100) {
        toast({ title: 'Tarif harus antara 0 dan 100%.', icon: 'warning' });
        return;
      }
      // Backend menyimpan tarif sebagai pecahan (0,11 untuk 11%).
      payloadRate = Number((pct / 100).toFixed(6));
    }

    setSaving(true);
    try {
      await apiFetch('/v1/tax/rules', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          category: form.category,
          direction: form.direction,
          basisType: form.basisType.trim(),
          ...(payloadRate !== undefined ? { rate: payloadRate } : {}),
          ...(brackets ? { brackets } : {}),
          effectiveFrom: form.effectiveFrom,
          ...(form.effectiveTo ? { effectiveTo: form.effectiveTo } : {}),
          ...(form.sourceRef.trim() ? { sourceRef: form.sourceRef.trim() } : {}),
          source: form.source,
        }),
      });
      toast({ title: 'Aturan pajak ditambahkan.', icon: 'check' });
      setForm(null);
      rules.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan aturan.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function patchRule(id: string, body: Record<string, unknown>, done: string) {
    setSaving(true);
    try {
      await apiFetch(`/v1/tax/rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast({ title: done, icon: 'check' });
      setEdit(null);
      rules.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal memperbarui aturan.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function closeRule() {
    if (!closeTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/tax/rules/${closeTarget.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ effectiveTo: closeDate }),
      });
      toast({ title: `Versi ${closeTarget.code} ditutup.`, icon: 'check' });
      setCloseTarget(null);
      rules.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menutup versi.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  const updateBracket = (key: number, patch: Partial<BracketForm>) =>
    setForm((f) => (f ? { ...f, brackets: f.brackets.map((b) => (b.key === key ? { ...b, ...patch } : b)) } : f));

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Aturan pajak"
        hint="Tarif adalah data. Versi baru dibuat dengan tanggal berlaku berbeda, versi lama ditutup."
        action={
          <Button variant="primary" size="sm" icon="plus" className="min-h-[40px]" onClick={() => setForm(emptyRuleForm())}>
            Aturan
          </Button>
        }
      />

      {estimateCount > 0 && (
        <Notice>
          <strong className="text-ink">{estimateCount} aturan aktif berlabel Estimasi.</strong> Angka ini belum diverifikasi terhadap
          regulasi resmi dan hanya layak untuk simulasi, bukan pelaporan pajak.
        </Notice>
      )}

      {rules.error ? (
        <Card className="p-6">
          <EmptyState
            icon="warning"
            title="Gagal memuat aturan pajak"
            body={rules.error}
            action={
              <Button variant="ghost" icon="sync" onClick={rules.reload}>
                Coba lagi
              </Button>
            }
          />
        </Card>
      ) : rules.loading ? (
        <Card className="p-6 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-sand animate-pulse" />
          ))}
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon="document" title="Belum ada aturan pajak" body="Tambahkan aturan PPN atau pemotongan pajak." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map((r) => {
            const open = expanded === r.id;
            return (
              <Card key={r.id} className={r.isActive ? 'p-4' : 'p-4 opacity-70'}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="tnum text-[15px] text-ink break-all">{r.code}</span>
                      <SourceBadge source={r.source} />
                      {!r.isActive && <Badge variant="outline">Nonaktif</Badge>}
                    </div>
                    <p className="text-body-sm text-fossil mt-1 break-words">{r.name}</p>
                  </div>
                  <p className="tnum text-[20px] font-light text-ink shrink-0">
                    {r.rate !== null ? percent(r.rate) : r.brackets.length > 0 ? 'Bertingkat' : '—'}
                  </p>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm">
                  <div>
                    <dt className="text-caption text-fossil">Jenis</dt>
                    <dd className="text-ink">
                      {categoryLabel[r.category]} · {directionLabel[r.direction]}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-caption text-fossil">Dasar</dt>
                    <dd className="text-ink break-words">{r.basisType.replace(/_/g, ' ')}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-caption text-fossil">Berlaku</dt>
                    <dd className="text-ink">
                      {formatDate(r.effectiveFrom)} – {r.effectiveTo ? formatDate(r.effectiveTo) : 'sekarang'}
                    </dd>
                  </div>
                  {r.sourceRef && (
                    <div className="col-span-2 min-w-0">
                      <dt className="text-caption text-fossil">Dasar hukum</dt>
                      <dd className="text-ink break-words">{r.sourceRef}</dd>
                    </div>
                  )}
                </dl>

                {r.brackets.length > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : r.id)}
                      aria-expanded={open}
                      className="inline-flex items-center gap-1.5 min-h-[40px] text-body-sm text-ink"
                    >
                      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={15} />
                      {r.brackets.length} lapisan tarif
                    </button>
                    {open && (
                      <ul className="mt-1 border border-ash rounded-lg divide-y divide-sand text-[13px]">
                        {r.brackets.map((b) => (
                          <li key={b.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                            <span className="tnum text-fossil min-w-0 break-words">
                              {formatNumber(num(b.lowerBound))} – {b.upperBound === null ? 'tak terbatas' : formatNumber(num(b.upperBound))}
                            </span>
                            <span className="tnum text-ink shrink-0">{num(b.ratePercent)}%</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="subtle"
                    size="sm"
                    icon="edit"
                    className="min-h-[40px]"
                    onClick={() => {
                      setEdit(r);
                      setEditName(r.name);
                    }}
                  >
                    Ubah
                  </Button>
                  {!r.effectiveTo && r.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="lock"
                      className="min-h-[40px]"
                      onClick={() => {
                        setCloseTarget(r);
                        setCloseDate(isoDate());
                      }}
                    >
                      Tutup versi
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)} title="Aturan Pajak Baru" maxWidth="xl">
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Kode" value={form.code} maxLength={40} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PPN_OUT" />
              <Input label="Nama" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="PPN Keluaran" />
              <SelectBox label="Kategori" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category, mode: 'flat' })}>
                <option value="vat">PPN</option>
                <option value="withholding">Pemotongan (mis. PPh)</option>
                <option value="other">Lainnya</option>
              </SelectBox>
              <SelectBox label="Arah" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as Direction })}>
                <option value="output">Keluaran (penjualan)</option>
                <option value="input">Masukan (pembelian)</option>
              </SelectBox>
              <Input
                label="Dasar pengenaan"
                value={form.basisType}
                maxLength={40}
                onChange={(e) => setForm({ ...form, basisType: e.target.value })}
                hint="Contoh: net, monthly_gross"
              />
              <SelectBox label="Sumber angka" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as Source })}>
                <option value="estimate">Estimasi (belum diverifikasi)</option>
                <option value="official">Resmi (sudah diverifikasi)</option>
              </SelectBox>
              <Input label="Berlaku mulai" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
              <Input label="Berlaku sampai (opsional)" type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} />
            </div>

            {form.source === 'official' && (
              <Notice>Tandai Resmi hanya bila angka sudah dicocokkan dengan peraturan yang berlaku dan dasar hukum diisi.</Notice>
            )}

            <Input
              label="Dasar hukum (opsional)"
              value={form.sourceRef}
              maxLength={120}
              onChange={(e) => setForm({ ...form, sourceRef: e.target.value })}
              placeholder="Mis. UU HPP No. 7/2021"
            />

            {form.category === 'withholding' && (
              <SelectBox label="Bentuk tarif" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as 'flat' | 'bracket' })}>
                <option value="flat">Tarif tetap</option>
                <option value="bracket">Bertingkat (bracket)</option>
              </SelectBox>
            )}

            {form.category === 'withholding' && form.mode === 'bracket' ? (
              <div className="space-y-3">
                {form.brackets.map((b, i) => (
                  <div key={b.key} className="rounded-xl border border-ash p-3 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[1fr_1fr_110px_auto] sm:gap-3 sm:items-end">
                    <Input label={`Batas bawah ${i + 1}`} type="number" inputMode="decimal" min="0" value={b.lower} onChange={(e) => updateBracket(b.key, { lower: e.target.value })} />
                    <Input label="Batas atas" type="number" inputMode="decimal" min="0" value={b.upper} onChange={(e) => updateBracket(b.key, { upper: e.target.value })} placeholder="Kosong = tak terbatas" />
                    <Input label="Tarif (%)" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={b.rate} onChange={(e) => updateBracket(b.key, { rate: e.target.value })} />
                    <Button
                      variant="subtle"
                      size="sm"
                      icon="trash"
                      className="min-h-[44px] w-full sm:w-auto"
                      disabled={form.brackets.length <= 1}
                      onClick={() => setForm({ ...form, brackets: form.brackets.filter((x) => x.key !== b.key) })}
                      aria-label={`Hapus lapisan ${i + 1}`}
                    >
                      <span className="sm:hidden">Hapus lapisan</span>
                    </Button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" icon="plus" className="min-h-[44px]" onClick={() => setForm({ ...form, brackets: [...form.brackets, newBracket()] })}>
                  Tambah lapisan
                </Button>
              </div>
            ) : (
              <Input
                label="Tarif (%)"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.0001"
                value={form.ratePct}
                onChange={(e) => setForm({ ...form, ratePct: e.target.value })}
                placeholder="11"
              />
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <Button variant="ghost" full onClick={() => setForm(null)}>
                Batal
              </Button>
              <Button variant="primary" full disabled={saving} onClick={createRule}>
                {saving ? 'Menyimpan…' : 'Simpan Aturan'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={edit !== null} onClose={() => setEdit(null)} title="Ubah Aturan" maxWidth="md">
        {edit && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              Tarif tidak bisa diubah supaya perhitungan lama tetap terbaca. Untuk tarif baru, tambahkan versi dengan tanggal berlaku baru.
            </p>
            <Input label="Nama" value={editName} maxLength={120} onChange={(e) => setEditName(e.target.value)} />
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="ghost"
                full
                disabled={saving}
                onClick={() => patchRule(edit.id, { isActive: !edit.isActive }, edit.isActive ? 'Aturan dinonaktifkan.' : 'Aturan diaktifkan.')}
              >
                {edit.isActive ? 'Nonaktifkan' : 'Aktifkan'}
              </Button>
              <Button
                variant="primary"
                full
                disabled={saving || editName.trim().length < 2 || editName.trim() === edit.name}
                onClick={() => patchRule(edit.id, { name: editName.trim() }, 'Nama aturan diperbarui.')}
              >
                {saving ? 'Menyimpan…' : 'Simpan Nama'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={closeTarget !== null} onClose={() => setCloseTarget(null)} title="Tutup Versi Aturan" maxWidth="sm">
        {closeTarget && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              Menutup <strong className="text-ink">{closeTarget.code}</strong> menghentikan aturan ini pada tanggal yang dipilih. Aturan yang
              sudah dipakai perhitungan akan ditolak backend; buat versi baru saja.
            </p>
            <Input label="Berlaku sampai" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="ghost" full onClick={() => setCloseTarget(null)}>
                Batal
              </Button>
              <Button variant="primary" full disabled={saving || !closeDate} onClick={closeRule}>
                {saving ? 'Memproses…' : 'Tutup Versi'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Perhitungan ─────────────────────────────────────────────────────────────

function ComputationsSection() {
  const state = useResource<TaxComputation[]>('/v1/tax/computations?take=200');
  const all = listOf<TaxComputation>(state.data);
  const [type, setType] = useState('');
  const [source, setSource] = useState('');
  const [detail, setDetail] = useState<TaxComputation | null>(null);

  const types = useMemo(() => [...new Set(all.map((c) => c.documentType))], [all]);
  const rows = useMemo(
    () => all.filter((c) => (!type || c.documentType === type) && (!source || c.source === source)),
    [all, type, source],
  );

  const totalTax = rows.reduce((s, c) => s + num(c.taxAmount), 0);
  const estimated = rows.filter((c) => c.source === 'estimate').length;

  const columns: Column<TaxComputation>[] = [
    {
      key: 'doc',
      header: 'Dokumen',
      render: (c) => (
        <div className="min-w-0">
          <span className="capitalize text-ink">{docType(c.documentType)}</span>
          <p className="text-caption text-fossil truncate max-w-[200px]">{c.documentId}</p>
        </div>
      ),
    },
    {
      key: 'rule',
      header: 'Aturan',
      render: (c) => (
        <span className="text-fossil break-words">
          {c.taxRule?.code ?? '—'} · {directionLabel[c.direction]}
        </span>
      ),
    },
    { key: 'base', header: 'Dasar', align: 'right', hideOnMobile: true, render: (c) => <span className="tnum">{formatMoney(num(c.baseAmount))}</span> },
    { key: 'tax', header: 'Pajak', align: 'right', render: (c) => <span className="tnum text-ink">{formatMoney(num(c.taxAmount))}</span> },
    { key: 'source', header: 'Sumber', render: (c) => <SourceBadge source={c.source} /> },
    { key: 'at', header: 'Dihitung', hideOnMobile: true, render: (c) => <span className="text-caption text-fossil">{formatDateTime(c.computedAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <StatRow
        items={[
          { label: 'Perhitungan', value: formatNumber(rows.length) },
          { label: 'Total pajak', value: formatMoney(totalTax) },
          { label: 'Berlabel estimasi', value: formatNumber(estimated), tone: estimated > 0 ? 'accent' : 'default' },
          { label: 'Jenis dokumen', value: formatNumber(types.length) },
        ]}
      />
      {estimated > 0 && (
        <Notice>
          {formatNumber(estimated)} perhitungan memakai tarif Estimasi. Jangan dijadikan dasar pelaporan sebelum aturannya ditandai Resmi.
        </Notice>
      )}

      <FilterBar>
        <SelectBox label="Jenis dokumen" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Semua dokumen</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {docType(t)}
            </option>
          ))}
        </SelectBox>
        <SelectBox label="Sumber angka" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Semua sumber</option>
          <option value="official">Resmi</option>
          <option value="estimate">Estimasi</option>
        </SelectBox>
      </FilterBar>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
        onRowClick={setDetail}
        emptyIcon="receipt"
        emptyTitle="Belum ada perhitungan pajak"
        emptyBody="Perhitungan tercatat otomatis saat faktur penjualan atau pembelian dibuat. Menampilkan 200 terbaru."
      />

      <Modal open={detail !== null} onClose={() => setDetail(null)} title="Rincian Perhitungan" maxWidth="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-body-sm">
              <div>
                <p className="text-caption text-fossil">Dasar</p>
                <p className="tnum text-ink break-words">{formatMoney(num(detail.baseAmount))}</p>
              </div>
              <div>
                <p className="text-caption text-fossil">Pajak</p>
                <p className="tnum text-ink break-words">{formatMoney(num(detail.taxAmount))}</p>
              </div>
              <div>
                <p className="text-caption text-fossil">Sumber angka</p>
                <SourceBadge source={detail.source} />
              </div>
              <div>
                <p className="text-caption text-fossil">Dihitung</p>
                <p className="text-ink">{formatDateTime(detail.computedAt)}</p>
              </div>
              <div className="col-span-2 min-w-0">
                <p className="text-caption text-fossil">Dokumen</p>
                <p className="text-ink break-all capitalize">
                  {docType(detail.documentType)} <span className="normal-case text-fossil">{detail.documentId}</span>
                </p>
              </div>
            </div>
            <div>
              <p className="text-caption text-fossil mb-1">Salinan aturan saat dihitung</p>
              <pre className="rounded-lg bg-sand/60 p-3 text-[12px] whitespace-pre-wrap break-all overflow-x-auto max-h-60">
                {JSON.stringify(detail.ruleSnapshot, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function TaxTab() {
  const [view, setView] = useState<'aturan' | 'hitung'>('aturan');
  return (
    <div className="space-y-4">
      <Tabs
        options={[
          { value: 'aturan', label: 'Aturan' },
          { value: 'hitung', label: 'Riwayat Perhitungan' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'aturan' ? <RulesSection /> : <ComputationsSection />}
    </div>
  );
}
