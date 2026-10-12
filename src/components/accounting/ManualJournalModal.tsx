import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { toast } from '../../stores/toastStore';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { BalanceBadge, Notice, SelectBox, formatMoney, isoDate, num, type Account } from './shared';

interface DraftLine {
  key: number;
  accountId: string;
  direction: 'debit' | 'credit';
  amount: string;
  memo: string;
}

let lineKey = 0;
const newLine = (direction: 'debit' | 'credit' = 'debit'): DraftLine => ({
  key: ++lineKey,
  accountId: '',
  direction,
  amount: '',
  memo: '',
});

interface ManualJournalModalProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  onPosted: (number?: string) => void;
}

/** Hitung dalam sen supaya 0,1 + 0,2 tidak pernah dianggap tidak seimbang. */
function toCents(value: string): number {
  return Math.round(num(value) * 100);
}

export function ManualJournalModal({ open, onClose, accounts, onPosted }: ManualJournalModalProps) {
  const [entryDate, setEntryDate] = useState(isoDate());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newLine('debit'), newLine('credit')]);
  const [saving, setSaving] = useState(false);

  // Akun induk (punya anak) ditolak backend; jangan ditawarkan.
  const postable = useMemo(() => accounts.filter((a) => !a._count?.children), [accounts]);

  useEffect(() => {
    if (!open) return;
    setEntryDate(isoDate());
    setMemo('');
    setLines([newLine('debit'), newLine('credit')]);
  }, [open]);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      if (l.direction === 'debit') debit += toCents(l.amount);
      else credit += toCents(l.amount);
    }
    return { debit: debit / 100, credit: credit / 100 };
  }, [lines]);

  const filled = lines.filter((l) => l.accountId && toCents(l.amount) > 0);
  const incomplete = lines.some((l) => (l.accountId ? false : toCents(l.amount) > 0) || (l.accountId && toCents(l.amount) <= 0));
  const balanced = totals.debit > 0 && totals.debit === totals.credit;
  const canSubmit = Boolean(entryDate) && memo.trim().length >= 3 && filled.length >= 2 && !incomplete && balanced;

  const update = (key: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ number?: string }>('/v1/journals', {
        method: 'POST',
        body: JSON.stringify({
          entryDate,
          memo: memo.trim(),
          lines: filled.map((l) => ({
            accountId: l.accountId,
            [l.direction]: toCents(l.amount) / 100,
            memo: l.memo.trim() || undefined,
          })),
        }),
      });
      toast({ title: `Jurnal ${res?.number ?? ''} diposting.`.replace('  ', ' '), icon: 'check' });
      onPosted(res?.number);
      onClose();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal memposting jurnal.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Jurnal Manual" maxWidth="xl">
      <div className="space-y-4">
        <Notice>
          Jurnal yang sudah diposting tidak bisa diubah, hanya dibalik. Periksa akun dan nominal sebelum menyimpan.
        </Notice>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Tanggal"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            hint="Periode fiskal pada tanggal ini harus terbuka."
          />
          <Textarea
            label="Keterangan"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={500}
            placeholder="Mis. Penyesuaian beban dibayar di muka"
            rows={2}
          />
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => (
            <div
              key={l.key}
              className="rounded-xl border border-ash p-3 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[minmax(0,1fr)_110px_150px_auto] sm:gap-3 sm:items-end"
            >
              <SelectBox
                label={`Akun ${i + 1}`}
                value={l.accountId}
                onChange={(e) => update(l.key, { accountId: e.target.value })}
              >
                <option value="">Pilih akun</option>
                {postable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </SelectBox>
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <SelectBox
                  label="Sisi"
                  value={l.direction}
                  onChange={(e) => update(l.key, { direction: e.target.value as 'debit' | 'credit' })}
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
                  onChange={(e) => update(l.key, { amount: e.target.value })}
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
              <div className="sm:col-span-4">
                <Input
                  label="Catatan baris (opsional)"
                  value={l.memo}
                  maxLength={255}
                  onChange={(e) => update(l.key, { memo: e.target.value })}
                />
              </div>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            className="min-h-[44px]"
            disabled={lines.length >= 100}
            onClick={() => setLines((p) => [...p, newLine(totals.debit > totals.credit ? 'credit' : 'debit')])}
          >
            Tambah baris
          </Button>
        </div>

        <div className="rounded-xl bg-sand/50 px-4 py-3 grid grid-cols-2 gap-3 text-body-sm">
          <div className="min-w-0">
            <p className="text-caption text-fossil">Total debit</p>
            <p className="tnum text-ink break-words">{formatMoney(totals.debit)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-caption text-fossil">Total kredit</p>
            <p className="tnum text-ink break-words">{formatMoney(totals.credit)}</p>
          </div>
          <div className="col-span-2 flex items-center gap-2 flex-wrap">
            <BalanceBadge balanced={balanced} />
            {!balanced && (totals.debit > 0 || totals.credit > 0) && (
              <span className="text-caption text-fossil tnum">
                Selisih {formatMoney(Math.abs(totals.debit - totals.credit))}
              </span>
            )}
          </div>
        </div>

        {incomplete && <Notice>Setiap baris yang diisi harus punya akun dan nominal lebih dari nol.</Notice>}

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <Button variant="ghost" full onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" full disabled={!canSubmit || saving} onClick={submit}>
            {saving ? 'Memposting…' : 'Posting Jurnal'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
