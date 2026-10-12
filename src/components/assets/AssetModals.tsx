import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { apiFetch } from '../../lib/api';
import { cn, formatDate, formatIDR, todayISO } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { NumberField } from './NumberField';
import {
  methodLabel,
  num,
  STATUS_LABEL,
  type DepreciationMethod,
  type DepreciationRunResult,
  type FiscalPeriod,
  type FixedAsset,
  type FixedAssetDetail,
} from './assetTypes';

const footer = 'flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1';

function ConfirmCheck({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-ash bg-bone px-4 py-3 min-h-[44px] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-ink)]"
      />
      <span className="text-body-sm text-ink min-w-0">{children}</span>
    </label>
  );
}

function Info({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-fossil">{label}</dt>
      <dd className={cn('text-[15px] break-words', strong ? 'text-ink font-medium tnum' : 'text-ink')}>{value}</dd>
    </div>
  );
}

export function StatusBadge({ status }: { status: FixedAsset['status'] }) {
  return (
    <Badge variant={status === 'active' ? 'accent' : status === 'disposed' ? 'outline' : 'neutral'}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ── Tambah aset ───────────────────────────────────────────────────────────

export function AddAssetModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(todayISO());
  const [cost, setCost] = useState('');
  const [salvage, setSalvage] = useState('');
  const [life, setLife] = useState('');
  const [method, setMethod] = useState<DepreciationMethod>('straight_line');
  const [ratePct, setRatePct] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const costN = Number(cost);
  const salvageN = salvage === '' ? 0 : Number(salvage);
  const lifeN = Number(life);
  const rateN = Number(ratePct);

  const problems: string[] = [];
  if (code && !/^[A-Za-z0-9._-]{2,32}$/.test(code.trim())) problems.push('Kode aset: huruf, angka, titik, strip, underscore (2-32 karakter).');
  if (cost !== '' && !(costN >= 1)) problems.push('Nilai perolehan minimal 1.');
  if (cost !== '' && salvageN >= costN) problems.push('Nilai sisa harus lebih kecil dari nilai perolehan.');
  if (life !== '' && !(Number.isInteger(lifeN) && lifeN >= 1 && lifeN <= 600)) problems.push('Masa manfaat 1-600 bulan (bilangan bulat).');
  if (method === 'declining_balance' && ratePct !== '' && !(rateN > 0 && rateN <= 90)) problems.push('Tarif saldo menurun harus di atas 0 dan maksimal 90%.');

  const ready =
    /^[A-Za-z0-9._-]{2,32}$/.test(code.trim()) &&
    name.trim().length >= 2 &&
    costN >= 1 &&
    salvageN >= 0 &&
    salvageN < costN &&
    Number.isInteger(lifeN) &&
    lifeN >= 1 &&
    lifeN <= 600 &&
    (method === 'straight_line' || (rateN > 0 && rateN <= 90)) &&
    Boolean(date);

  const monthlyEstimate = ready && method === 'straight_line' ? (costN - salvageN) / lifeN : null;

  function reset() {
    setCode('');
    setName('');
    setCategory('');
    setLocation('');
    setDate(todayISO());
    setCost('');
    setSalvage('');
    setLife('');
    setMethod('straight_line');
    setRatePct('');
    setError(null);
  }

  async function submit() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/assets', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          ...(category.trim() ? { category: category.trim() } : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
          acquisitionDate: date,
          acquisitionCost: Math.round(costN * 100) / 100,
          salvageValue: Math.round(salvageN * 100) / 100,
          usefulLifeMonths: lifeN,
          depreciationMethod: method,
          ...(method === 'declining_balance' ? { decliningRate: Math.round((rateN / 100) * 1e6) / 1e6 } : {}),
        }),
      });
      toast({ title: 'Aset tetap dicatat.', icon: 'check' });
      reset();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan aset.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title="Tambah aset tetap" maxWidth="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Kode aset" value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. AST-001" autoCapitalize="characters" />
          <Input label="Nama aset" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Oven Rotary" />
          <Input label="Kategori (opsional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Mesin, Kendaraan, IT…" />
          <Input label="Lokasi (opsional)" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="mis. Outlet Dago" />
          <Input label="Tanggal perolehan" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          <NumberField label="Nilai perolehan (Rp)" value={cost} onChange={setCost} min="1" />
          <NumberField label="Nilai sisa (Rp)" value={salvage} onChange={setSalvage} hint="Nilai aset di akhir masa manfaat. Boleh 0." />
          <NumberField label="Masa manfaat (bulan)" value={life} onChange={setLife} step="1" min="1" max="600" hint="mis. 60 bulan = 5 tahun" />
          <Select label="Metode penyusutan" value={method} onChange={(e) => setMethod(e.target.value as DepreciationMethod)}>
            <option value="straight_line">Garis lurus</option>
            <option value="declining_balance">Saldo menurun</option>
          </Select>
          {method === 'declining_balance' && (
            <NumberField
              label="Tarif penyusutan (%)"
              value={ratePct}
              onChange={setRatePct}
              step="0.01"
              max="90"
              hint="Persen dari nilai buku (di atas nilai sisa) yang disusutkan pada tiap periode."
            />
          )}
        </div>

        {problems.length > 0 && (
          <ul className="space-y-1" role="alert">
            {problems.map((p) => (
              <li key={p} className="text-caption text-rose-700">
                {p}
              </li>
            ))}
          </ul>
        )}

        {monthlyEstimate !== null && (
          <p className="text-body-sm text-fossil">
            Perkiraan penyusutan <span className="text-ink tnum">{formatIDR(monthlyEstimate)}</span> per bulan.
          </p>
        )}

        <p className="text-caption text-fossil">
          Menyimpan aset otomatis menjurnal Dr Aset Tetap / Cr Kas sebesar nilai perolehan pada tanggal perolehan.
        </p>

        {error && (
          <p className="text-body-sm text-rose-700 break-words" role="alert">
            {error}
          </p>
        )}

        <div className={footer}>
          <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button full className="sm:w-auto min-h-[44px]" onClick={submit} disabled={!ready || saving}>
            {saving ? 'Menyimpan…' : 'Simpan aset'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Jalankan penyusutan ───────────────────────────────────────────────────

export function DepreciationModal({
  open,
  periods,
  activeCount,
  onClose,
  onDone,
}: {
  open: boolean;
  periods: FiscalPeriod[];
  activeCount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const openPeriods = useMemo(() => periods.filter((p) => p.status === 'open'), [periods]);
  const [periodId, setPeriodId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DepreciationRunResult | null>(null);

  const selected = openPeriods.find((p) => p.id === periodId) ?? openPeriods[0] ?? null;

  function close() {
    if (saving) return;
    const hadResult = result !== null;
    setConfirmed(false);
    setError(null);
    setResult(null);
    setPeriodId('');
    if (hadResult) onDone();
    else onClose();
  }

  async function run() {
    if (!selected || !confirmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<DepreciationRunResult>('/v1/assets/depreciation/run', {
        method: 'POST',
        body: JSON.stringify({ periodId: selected.id }),
      });
      setResult(res);
      toast({ title: `Penyusutan periode ${res.period ?? selected.code} selesai.`, icon: 'check' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menjalankan penyusutan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Jalankan penyusutan" maxWidth="md">
      {result ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Info label="Diproses" value={`${result.processed} aset`} strong />
            <Info label="Dilewati" value={`${result.skipped} aset`} strong />
            <Info label="Total beban" value={formatIDR(num(result.totalDepreciation))} strong />
          </div>
          {result.message && <p className="text-body-sm text-fossil">{result.message}</p>}
          {result.data && result.data.length > 0 && (
            <ul className="divide-y divide-sand rounded-xl border border-ash max-h-64 overflow-y-auto">
              {result.data.map((r) => (
                <li key={r.code} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-[14px] text-ink truncate min-w-0">{r.code}</span>
                  <span className="text-[14px] tnum text-ink shrink-0">{formatIDR(r.depreciation)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className={footer}>
            <Button full className="sm:w-auto min-h-[44px]" onClick={close}>
              Selesai
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {openPeriods.length === 0 ? (
            <p className="text-body-sm text-fossil">
              Tidak ada periode fiskal yang masih terbuka. Penyusutan hanya bisa dijalankan pada periode terbuka.
            </p>
          ) : (
            <>
              <Select label="Periode" value={selected?.id ?? ''} onChange={(e) => setPeriodId(e.target.value)}>
                {openPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.code} ({p.code})
                  </option>
                ))}
              </Select>
              <p className="text-body-sm text-fossil">
                {activeCount} aset aktif akan disusutkan. Aset yang sudah disusutkan pada periode ini dilewati otomatis, jadi aman bila terpencet dua kali.
              </p>
              <div className="rounded-xl border border-ash bg-bone px-4 py-3 text-caption text-fossil">
                Setiap aset menghasilkan jurnal Dr Beban Penyusutan / Cr Akumulasi Penyusutan pada tanggal di dalam periode terpilih. Jurnal yang sudah diposting tidak bisa diedit, hanya dibalik.
              </div>
              <ConfirmCheck checked={confirmed} onChange={setConfirmed}>
                Saya paham penyusutan periode <strong>{selected?.code}</strong> akan memposting jurnal ke buku besar.
              </ConfirmCheck>
            </>
          )}
          {error && (
            <p className="text-body-sm text-rose-700 break-words" role="alert">
              {error}
            </p>
          )}
          <div className={footer}>
            <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={close} disabled={saving}>
              Batal
            </Button>
            <Button full className="sm:w-auto min-h-[44px]" onClick={run} disabled={!selected || !confirmed || saving || activeCount === 0}>
              {saving ? 'Memproses…' : 'Jalankan penyusutan'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Hapus buku aset ───────────────────────────────────────────────────────

export function DisposeModal({
  asset,
  onClose,
  onDone,
}: {
  asset: FixedAsset | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [proceeds, setProceeds] = useState('');
  const [date, setDate] = useState(todayISO());
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  if (asset && asset.id !== lastId) {
    setLastId(asset.id);
    setProceeds('');
    setDate(todayISO());
    setConfirmed(false);
    setError(null);
  }
  if (!asset && lastId !== null) setLastId(null);

  const book = asset ? num(asset.bookValue) : 0;
  const proceedsN = proceeds === '' ? 0 : Number(proceeds);
  const proceedsOk = Number.isFinite(proceedsN) && proceedsN >= 0;
  const gainLoss = Math.round((proceedsN - book) * 100) / 100;

  async function submit() {
    if (!asset || !confirmed || !proceedsOk) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/v1/assets/${asset.id}/dispose`, {
        method: 'POST',
        body: JSON.stringify({ proceeds: Math.round(proceedsN * 100) / 100, disposalDate: date }),
      });
      toast({ title: `Aset ${asset.code} dihapus buku.`, icon: 'check' });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus buku aset.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={Boolean(asset)} onClose={saving ? () => {} : onClose} title={asset ? `Hapus buku ${asset.code}` : undefined} maxWidth="md">
      {asset && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-ash bg-bone px-4 py-3">
            <Info label="Aset" value={asset.name} />
            <Info label="Nilai buku saat ini" value={formatIDR(book)} strong />
          </dl>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumberField label="Hasil penjualan (Rp)" value={proceeds} onChange={setProceeds} hint="Kosongkan bila aset dibuang tanpa hasil." />
            <Input label="Tanggal penghapusan" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {proceedsOk && (
            <p className="text-body-sm text-fossil">
              {gainLoss === 0 ? (
                'Tidak ada laba atau rugi pelepasan.'
              ) : (
                <>
                  Perkiraan {gainLoss > 0 ? 'laba' : 'rugi'} pelepasan:{' '}
                  <span className={cn('tnum font-medium', gainLoss > 0 ? 'text-ink' : 'text-rose-700')}>{formatIDR(Math.abs(gainLoss))}</span>
                </>
              )}
            </p>
          )}
          <div className="rounded-xl border border-rose-200 px-4 py-3 text-caption text-rose-700">
            Tindakan ini tidak bisa dibatalkan dari layar ini: aset keluar dari daftar aktif dan jurnal pelepasan diposting ke buku besar.
          </div>
          <ConfirmCheck checked={confirmed} onChange={setConfirmed}>
            Saya paham dan ingin menghapus buku aset <strong>{asset.code}</strong>.
          </ConfirmCheck>
          {error && (
            <p className="text-body-sm text-rose-700 break-words" role="alert">
              {error}
            </p>
          )}
          <div className={footer}>
            <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button full className="sm:w-auto min-h-[44px]" onClick={submit} disabled={!confirmed || !proceedsOk || saving}>
              {saving ? 'Memproses…' : 'Hapus buku aset'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Detail aset + jadwal penyusutan ───────────────────────────────────────

export function AssetDetailModal({
  asset,
  periods,
  onClose,
  onDispose,
}: {
  asset: FixedAsset | null;
  periods: FiscalPeriod[];
  onClose: () => void;
  onDispose: (a: FixedAsset) => void;
}) {
  const detail = useResource<FixedAssetDetail>(asset ? `/v1/assets/${asset.id}` : null);
  const periodCode = (id: string) => periods.find((p) => p.id === id)?.code ?? '-';

  // Jadwal terbaru di atas; endpoint mengurutkan naik berdasarkan waktu dibuat
  const schedules = useMemo(() => [...(detail.data?.schedules ?? [])].reverse(), [detail.data]);

  return (
    <Modal open={Boolean(asset)} onClose={onClose} title={asset ? asset.name : undefined} maxWidth="lg">
      {asset && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={asset.status} />
            <span className="text-body-sm text-fossil tnum">{asset.code}</span>
            {asset.category && <Badge variant="outline">{asset.category}</Badge>}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Info label="Lokasi" value={asset.location || '-'} />
            <Info label="Tanggal perolehan" value={formatDate(asset.acquisitionDate)} />
            <Info label="Nilai perolehan" value={formatIDR(num(asset.acquisitionCost))} strong />
            <Info label="Akumulasi penyusutan" value={formatIDR(num(asset.accumulatedDepreciation))} strong />
            <Info label="Nilai buku" value={formatIDR(num(asset.bookValue))} strong />
            <Info label="Nilai sisa" value={formatIDR(num(asset.salvageValue))} />
            <Info label="Metode" value={methodLabel(asset)} />
            <Info label="Masa manfaat" value={`${asset.usefulLifeMonths} bulan`} />
            {asset.status === 'disposed' && (
              <>
                <Info label="Dihapus buku" value={asset.disposedAt ? formatDate(asset.disposedAt) : '-'} />
                <Info label="Hasil penjualan" value={formatIDR(num(asset.disposalProceeds))} />
              </>
            )}
          </dl>

          <section aria-label="Jadwal penyusutan">
            <p className="text-caption text-fossil mb-2">Riwayat penyusutan</p>
            {!detail.data && !detail.error && <div className="h-20 rounded-xl bg-sand/60 animate-pulse" />}
            {detail.error && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-ash px-4 py-3">
                <p className="text-body-sm text-fossil min-w-0 break-words">{detail.error}</p>
                <Button variant="ghost" size="sm" icon="sync" onClick={detail.reload} className="min-h-[40px] shrink-0">
                  Ulangi
                </Button>
              </div>
            )}
            {detail.data && schedules.length === 0 && (
              <p className="text-body-sm text-fossil rounded-xl border border-ash px-4 py-3">Belum ada penyusutan yang dijalankan untuk aset ini.</p>
            )}
            {schedules.length > 0 && (
              <ul className="divide-y divide-sand rounded-xl border border-ash max-h-60 overflow-y-auto">
                <li className="px-4 py-2 grid grid-cols-3 gap-3 bg-bone text-caption text-fossil sticky top-0">
                  <span>Periode</span>
                  <span className="text-right">Penyusutan</span>
                  <span className="text-right">Nilai buku</span>
                </li>
                {schedules.map((s) => (
                  <li key={s.id} className="px-4 py-2.5 grid grid-cols-3 gap-3 items-baseline">
                    <span className="text-[14px] text-ink tnum">{periodCode(s.periodId)}</span>
                    <span className="text-[14px] text-ink tnum text-right">{formatIDR(num(s.depreciation))}</span>
                    <span className="text-[13px] text-fossil tnum text-right">{formatIDR(num(s.bookValue))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className={footer}>
            <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={onClose}>
              Tutup
            </Button>
            {asset.status !== 'disposed' && (
              <Button variant="subtle" full className="sm:w-auto min-h-[44px]" onClick={() => onDispose(asset)}>
                Hapus buku aset
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
