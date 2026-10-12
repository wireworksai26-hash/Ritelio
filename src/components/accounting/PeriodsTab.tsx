import { useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatDate, formatNumber } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/controls';
import { StatRow } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { BalanceBadge, Notice, SectionTitle, SelectBox, formatMoney, num, type Account } from './shared';

interface FiscalPeriod {
  id: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  closedAt: string | null;
  fiscalYear: { name: string; isClosed: boolean } | null;
}

interface OpeningLine {
  key: number;
  accountCode: string;
  direction: 'debit' | 'credit';
  amount: string;
}

let lineSeq = 0;
const newLine = (): OpeningLine => ({ key: ++lineSeq, accountCode: '', direction: 'debit', amount: '' });

export function PeriodsTab() {
  const periods = useResource<FiscalPeriod[]>('/v1/finance/fiscal-periods');
  const accounts = useResource<{ data: Account[] }>('/v1/finance/accounts');

  const rows = listOf<FiscalPeriod>(periods.data);
  const accountRows = listOf<Account>(accounts.data);

  const [closeTarget, setCloseTarget] = useState<FiscalPeriod | null>(null);
  const [openingModal, setOpeningModal] = useState(false);
  const [periodId, setPeriodId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<OpeningLine[]>([newLine(), newLine()]);
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, FiscalPeriod[]>();
    for (const p of rows) {
      const key = p.fiscalYear?.name ?? 'Tanpa tahun fiskal';
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [rows]);

  const openCount = rows.filter((p) => p.status === 'open').length;
  // Backend hanya menerima saldo awal pada periode Januari yang masih terbuka.
  const openingPeriods = rows.filter((p) => p.status === 'open' && p.code.endsWith('-01'));

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      const cents = Math.round(num(l.amount) * 100);
      if (l.direction === 'debit') debit += cents;
      else credit += cents;
    }
    return { debit: debit / 100, credit: credit / 100 };
  }, [lines]);

  const filled = lines.filter((l) => l.accountCode && num(l.amount) > 0);
  const duplicate = new Set(filled.map((l) => l.accountCode)).size !== filled.length;
  const balanced = totals.debit > 0 && totals.debit === totals.credit;
  const canSubmit = Boolean(periodId) && filled.length >= 2 && !duplicate && balanced;

  function openOpening() {
    setPeriodId(openingPeriods[0]?.id ?? '');
    setNote('');
    setLines([newLine(), newLine()]);
    setOpeningModal(true);
  }

  const updateLine = (key: number, patch: Partial<OpeningLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function closePeriod() {
    if (!closeTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/v1/finance/fiscal-periods/${closeTarget.id}/close`, { method: 'POST' });
      toast({ title: `Periode ${closeTarget.name} ditutup.`, icon: 'check' });
      setCloseTarget(null);
      periods.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menutup periode.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function submitOpening() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await apiFetch('/v1/finance/opening-balances', {
        method: 'POST',
        body: JSON.stringify({
          periodId,
          note: note.trim() || undefined,
          lines: filled.map((l) => ({
            accountCode: l.accountCode,
            direction: l.direction,
            amount: Math.round(num(l.amount) * 100) / 100,
          })),
        }),
      });
      toast({ title: 'Saldo awal dicatat.', icon: 'check' });
      setOpeningModal(false);
      periods.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mencatat saldo awal.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <StatRow
        items={[
          { label: 'Total periode', value: formatNumber(rows.length) },
          { label: 'Terbuka', value: formatNumber(openCount), tone: 'accent' },
          { label: 'Ditutup', value: formatNumber(rows.length - openCount) },
          { label: 'Tahun fiskal', value: formatNumber(grouped.length) },
        ]}
      />

      <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] text-ink">Saldo awal</p>
          <p className="text-body-sm text-fossil mt-0.5">
            Dicatat sekali pada periode Januari yang masih terbuka, sebelum jurnal periode itu diposting. Total debit harus sama dengan total kredit.
          </p>
        </div>
        <Button
          variant="subtle"
          icon="plus"
          className="sm:shrink-0"
          disabled={openingPeriods.length === 0}
          onClick={openOpening}
        >
          Input Saldo Awal
        </Button>
      </Card>

      <SectionTitle title="Periode fiskal" hint="Periode yang ditutup tidak menerima jurnal baru." />

      {periods.error ? (
        <Card className="p-6">
          <EmptyState
            icon="warning"
            title="Gagal memuat periode"
            body={periods.error}
            action={
              <Button variant="ghost" icon="sync" onClick={periods.reload}>
                Coba lagi
              </Button>
            }
          />
        </Card>
      ) : periods.loading ? (
        <Card className="p-6 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-sand animate-pulse" />
          ))}
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon="calendar" title="Belum ada periode fiskal" body="Periode dibuat otomatis oleh backend saat perusahaan disiapkan." />
        </Card>
      ) : (
        grouped.map(([year, items]) => (
          <section key={year} className="space-y-2">
            <h3 className="text-caption uppercase tracking-[0.08em] text-pebble">{year}</h3>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-sand">
                {items.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 sm:px-6 py-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sand text-smoke">
                      <Icon name={p.status === 'open' ? 'calendar' : 'lock'} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-ink truncate">{p.name}</p>
                      <p className="text-caption text-fossil truncate">
                        {formatDate(p.startDate)} – {formatDate(p.endDate)}
                        {p.closedAt ? ` · ditutup ${formatDate(p.closedAt)}` : ''}
                      </p>
                    </div>
                    {p.status === 'open' ? (
                      <>
                        <Badge variant="accent" className="hidden min-[420px]:inline-flex">
                          Terbuka
                        </Badge>
                        <Button variant="ghost" size="sm" className="min-h-[40px] shrink-0" onClick={() => setCloseTarget(p)}>
                          Tutup
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline">Ditutup</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}

      <Modal open={closeTarget !== null} onClose={() => setCloseTarget(null)} title="Tutup Periode" maxWidth="sm">
        {closeTarget && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              Menutup <strong className="text-ink">{closeTarget.name}</strong> mengunci semua jurnal pada periode ini. Backend menolak
              penutupan bila masih ada jurnal draf atau total debit dan kredit tidak sama.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="ghost" full onClick={() => setCloseTarget(null)}>
                Batal
              </Button>
              <Button variant="primary" full icon="lock" disabled={saving} onClick={closePeriod}>
                {saving ? 'Memproses…' : 'Tutup Periode'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={openingModal} onClose={() => setOpeningModal(false)} title="Input Saldo Awal" maxWidth="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectBox label="Periode (Januari)" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {openingPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectBox>
            <Input label="Catatan (opsional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={l.key} className="rounded-xl border border-ash p-3 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[minmax(0,1fr)_120px_140px_auto] sm:gap-3 sm:items-end">
                <SelectBox
                  label={`Akun ${i + 1}`}
                  value={l.accountCode}
                  onChange={(e) => updateLine(l.key, { accountCode: e.target.value })}
                >
                  <option value="">Pilih akun</option>
                  {accountRows.map((a) => (
                    <option key={a.id} value={a.code}>
                      {a.code} {a.name}
                    </option>
                  ))}
                </SelectBox>
                <div className="grid grid-cols-2 gap-3 sm:contents">
                  <SelectBox
                    label="Sisi"
                    value={l.direction}
                    onChange={(e) => updateLine(l.key, { direction: e.target.value as 'debit' | 'credit' })}
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Kredit</option>
                  </SelectBox>
                  <Input
                    label="Nominal"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={l.amount}
                    onChange={(e) => updateLine(l.key, { amount: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <Button
                  variant="subtle"
                  size="sm"
                  icon="trash"
                  className="min-h-[44px] w-full sm:w-auto"
                  disabled={lines.length <= 2}
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  aria-label={`Hapus baris ${i + 1}`}
                >
                  <span className="sm:hidden">Hapus baris</span>
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" icon="plus" className="min-h-[44px]" onClick={() => setLines((p) => [...p, newLine()])}>
              Tambah baris
            </Button>
          </div>

          <div className="rounded-xl bg-sand/50 px-4 py-3 grid grid-cols-2 gap-3 text-body-sm">
            <div>
              <p className="text-caption text-fossil">Total debit</p>
              <p className="tnum text-ink break-words">{formatMoney(totals.debit)}</p>
            </div>
            <div>
              <p className="text-caption text-fossil">Total kredit</p>
              <p className="tnum text-ink break-words">{formatMoney(totals.credit)}</p>
            </div>
            <div className="col-span-2 flex items-center gap-2 flex-wrap">
              <BalanceBadge balanced={balanced} />
              {!balanced && (totals.debit > 0 || totals.credit > 0) && (
                <span className="text-caption text-fossil tnum">Selisih {formatMoney(Math.abs(totals.debit - totals.credit))}</span>
              )}
            </div>
          </div>

          {duplicate && <Notice>Satu akun hanya boleh muncul sekali pada saldo awal.</Notice>}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <Button variant="ghost" full onClick={() => setOpeningModal(false)}>
              Batal
            </Button>
            <Button variant="primary" full disabled={!canSubmit || saving} onClick={submitOpening}>
              {saving ? 'Menyimpan…' : 'Catat Saldo Awal'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
