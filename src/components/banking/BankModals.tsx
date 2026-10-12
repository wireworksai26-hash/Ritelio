import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';
import { apiFetch } from '../../lib/api';
import { cn, formatDate, formatIDR, todayISO } from '../../lib/format';
import { toast } from '../../stores/toastStore';
import { num, parseStatementCsv, type BankAccount, type BankStatement } from './bankingTypes';

const footer = 'flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1';

// ── Rekening baru ─────────────────────────────────────────────────────────

export function AccountModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id?: string) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [currency, setCurrency] = useState('IDR');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeOk = /^[A-Za-z0-9._-]{2,32}$/.test(code.trim());
  const nameOk = name.trim().length >= 2;
  const currencyOk = /^[A-Za-z]{3}$/.test(currency.trim());

  function reset() {
    setCode('');
    setName('');
    setBankName('');
    setAccountNumber('');
    setAccountCode('');
    setCurrency('IDR');
    setError(null);
  }

  async function submit() {
    if (!codeOk || !nameOk || !currencyOk) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<BankAccount>('/v1/banking/accounts', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
          ...(accountNumber.trim() ? { accountNumber: accountNumber.trim() } : {}),
          ...(accountCode.trim() ? { accountCode: accountCode.trim() } : {}),
          currencyCode: currency.trim().toUpperCase(),
        }),
      });
      toast({ title: 'Rekening ditambahkan.', icon: 'check' });
      reset();
      onSaved(created?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan rekening.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title="Tambah rekening" maxWidth="md">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Kode rekening"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="mis. BCA-01"
            autoCapitalize="characters"
            hint={code && !codeOk ? 'Huruf, angka, titik, strip, underscore (2-32 karakter).' : undefined}
          />
          <Input label="Nama rekening" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. BCA Operasional" />
          <Input label="Nama bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          <Input
            label="Nomor rekening"
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
          <Input
            label="Kode akun kas di COA"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            placeholder="1000"
            hint="Kosongkan untuk memakai akun Kas (1000)."
          />
          <Input
            label="Mata uang"
            value={currency}
            maxLength={3}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            hint={currency && !currencyOk ? 'Kode 3 huruf, mis. IDR.' : undefined}
          />
        </div>
        {error && <p className="text-body-sm text-rose-700 break-words">{error}</p>}
        <div className={footer}>
          <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button full className="sm:w-auto min-h-[44px]" onClick={submit} disabled={!codeOk || !nameOk || !currencyOk || saving}>
            {saving ? 'Menyimpan…' : 'Simpan rekening'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Tambah / impor mutasi ─────────────────────────────────────────────────

type ImportMode = 'single' | 'csv';

export function StatementModal({
  account,
  onClose,
  onSaved,
}: {
  account: BankAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<ImportMode>('single');
  const [date, setDate] = useState(todayISO());
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [csv, setCsv] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);

  const parsed = useMemo(() => parseStatementCsv(csv), [csv]);
  const validRows = parsed.filter((r) => !r.error);
  const badRows = parsed.filter((r) => r.error);

  const value = Number(amount);
  const singleOk = description.trim().length > 0 && Number.isFinite(value) && value > 0 && Boolean(date);

  function close() {
    if (saving) return;
    setDescription('');
    setReference('');
    setAmount('');
    setCsv('');
    setFailures([]);
    setProgress(null);
    onClose();
  }

  async function saveSingle() {
    if (!account || !singleOk) return;
    setSaving(true);
    try {
      await apiFetch('/v1/banking/statements', {
        method: 'POST',
        body: JSON.stringify({
          bankAccountId: account.id,
          statementDate: date,
          description: description.trim(),
          reference: reference.trim(),
          amount: (direction === 'in' ? 1 : -1) * Math.round(value * 100) / 100,
        }),
      });
      toast({ title: 'Mutasi ditambahkan.', icon: 'check' });
      setDescription('');
      setReference('');
      setAmount('');
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan mutasi.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function saveCsv() {
    if (!account || validRows.length === 0) return;
    setSaving(true);
    setFailures([]);
    setProgress({ done: 0, total: validRows.length });
    const failed: string[] = [];
    let ok = 0;
    // Berurutan, bukan paralel: urutan createdAt menentukan urutan tampil mutasi di tanggal yang sama
    for (const row of validRows) {
      try {
        await apiFetch('/v1/banking/statements', {
          method: 'POST',
          body: JSON.stringify({
            bankAccountId: account.id,
            statementDate: row.statementDate,
            description: row.description,
            reference: row.reference,
            amount: row.amount,
          }),
        });
        ok += 1;
      } catch (err) {
        failed.push(`Baris ${row.line}: ${err instanceof Error ? err.message : 'gagal'}`);
      }
      setProgress({ done: ok + failed.length, total: validRows.length });
    }
    setSaving(false);
    if (ok > 0) onSaved();
    if (failed.length === 0) {
      toast({ title: `${ok} mutasi diimpor.`, icon: 'check' });
      setCsv('');
      setProgress(null);
      onClose();
    } else {
      // Baris yang sudah masuk dibuang dari kotak teks agar tombol impor ulang tidak membuat duplikat
      const failedLines = new Set(failed.map((f) => Number(f.match(/^Baris (\d+)/)?.[1])));
      setCsv(
        csv
          .split(/\r?\n/)
          .filter((_, i) => failedLines.has(i + 1))
          .join('\n'),
      );
      setFailures(failed);
      toast({ title: `${ok} berhasil, ${failed.length} gagal. Baris gagal dibiarkan di kotak untuk diperbaiki.`, icon: 'warning' });
    }
  }

  return (
    <Modal open={Boolean(account)} onClose={close} title={account ? `Mutasi · ${account.name}` : undefined} maxWidth="lg">
      <div className="space-y-4">
        <Tabs
          options={[
            { value: 'single' as ImportMode, label: 'Satu mutasi' },
            { value: 'csv' as ImportMode, label: 'Tempel banyak (CSV)' },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === 'single' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Tanggal" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            <Select label="Jenis" value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
              <option value="in">Uang masuk</option>
              <option value="out">Uang keluar</option>
            </Select>
            <div className="sm:col-span-2">
              <Input label="Keterangan di mutasi bank" value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <Input label="Referensi (opsional)" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
            <Field label="Jumlah" hint={value > 0 ? `${direction === 'in' ? '+' : '-'}${formatIDR(value)}` : undefined}>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Jumlah"
                className="w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[16px] sm:text-[15px] text-ink tnum focus:border-ink focus:outline-none"
              />
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              label="Data mutasi, satu baris per transaksi"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={'2026-10-01, Setoran tunai, 1500000\n2026-10-02, Bayar supplier, TRF-88, -750000'}
              hint="Kolom: tanggal, keterangan, [referensi], jumlah. Jumlah negatif = uang keluar. Salin langsung dari Excel juga bisa."
              className="min-h-[140px] font-mono text-[13px]"
              spellCheck={false}
            />
            {csv.trim() && (
              <div className="rounded-xl border border-ash bg-bone px-4 py-3 space-y-1.5">
                <p className="text-body-sm text-ink">
                  <span className="tnum font-medium">{validRows.length}</span> baris siap diimpor
                  {badRows.length > 0 && (
                    <>
                      , <span className="tnum font-medium text-rose-700">{badRows.length}</span> bermasalah
                    </>
                  )}
                  .
                </p>
                {badRows.slice(0, 4).map((r) => (
                  <p key={r.line} className="text-caption text-rose-700 break-words">
                    Baris {r.line}: {r.error}
                  </p>
                ))}
                {badRows.length > 4 && <p className="text-caption text-fossil">dan {badRows.length - 4} baris lain.</p>}
              </div>
            )}
            {progress && (
              <div>
                <div className="h-2 rounded-full bg-sand overflow-hidden">
                  <div className="h-full bg-ink transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <p className="text-caption text-fossil mt-1 tnum">
                  {progress.done} / {progress.total}
                </p>
              </div>
            )}
            {failures.length > 0 && (
              <div className="rounded-xl border border-rose-200 px-4 py-3 space-y-1">
                {failures.slice(0, 5).map((f) => (
                  <p key={f} className="text-caption text-rose-700 break-words">
                    {f}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={footer}>
          <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={close} disabled={saving}>
            Tutup
          </Button>
          {mode === 'single' ? (
            <Button full className="sm:w-auto min-h-[44px]" onClick={saveSingle} disabled={!singleOk || saving}>
              {saving ? 'Menyimpan…' : 'Simpan mutasi'}
            </Button>
          ) : (
            <Button full className="sm:w-auto min-h-[44px]" onClick={saveCsv} disabled={validRows.length === 0 || saving}>
              {saving ? 'Mengimpor…' : `Impor ${validRows.length || ''} baris`.trim()}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Rekonsiliasi ──────────────────────────────────────────────────────────

type ReconcileChoice = 'match' | 'manual';

export function ReconcileModal({
  statement,
  onClose,
  onDone,
}: {
  statement: BankStatement | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [choice, setChoice] = useState<ReconcileChoice>('match');
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  // Isi ulang form saat baris mutasi lain dibuka
  if (statement && statement.id !== lastId) {
    setLastId(statement.id);
    setChoice('match');
    setAmount(String(Math.abs(num(statement.amount))));
    setEntryDate(statement.statementDate.slice(0, 10));
    setError(null);
  }
  if (!statement && lastId !== null) setLastId(null);

  const value = Number(amount);
  const matchOk = Number.isFinite(value) && value > 0 && Boolean(entryDate);
  const incoming = statement ? num(statement.amount) >= 0 : true;

  async function submit() {
    if (!statement) return;
    if (choice === 'match' && !matchOk) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/banking/reconcile', {
        method: 'POST',
        body: JSON.stringify(
          choice === 'match'
            ? { statementId: statement.id, match: true, amount: Math.round(value * 100) / 100, entryDate }
            : { statementId: statement.id, match: false },
        ),
      });
      toast({ title: choice === 'match' ? 'Mutasi cocok dengan jurnal kas.' : 'Mutasi ditandai selesai tanpa pencocokan.', icon: 'check' });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal merekonsiliasi.');
    } finally {
      setSaving(false);
    }
  }

  const choices: Array<{ value: ReconcileChoice; title: string; body: string }> = [
    {
      value: 'match',
      title: 'Cocokkan dengan catatan kas',
      body: 'Sistem mencari jurnal kas dengan nominal yang sama. Pilih ini bila transaksinya sudah Anda catat di pembukuan.',
    },
    {
      value: 'manual',
      title: 'Tandai selesai tanpa pencocokan',
      body: 'Untuk mutasi yang memang tidak ada pasangannya di pembukuan. Tidak membuat jurnal apa pun.',
    },
  ];

  return (
    <Modal open={Boolean(statement)} onClose={saving ? () => {} : onClose} title="Cocokkan mutasi" maxWidth="md">
      {statement && (
        <div className="space-y-4">
          <div className="rounded-xl border border-ash bg-bone px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] text-ink break-words">{statement.description}</p>
              <p className="text-caption text-fossil">
                {formatDate(statement.statementDate)}
                {statement.reference ? ` · ${statement.reference}` : ''}
              </p>
            </div>
            <p className={cn('text-[15px] tnum font-medium shrink-0', incoming ? 'text-ink' : 'text-rose-700')}>
              {incoming ? '+' : '-'}
              {formatIDR(Math.abs(num(statement.amount)))}
            </p>
          </div>

          <div className="space-y-2" role="radiogroup" aria-label="Cara rekonsiliasi">
            {choices.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={choice === c.value}
                onClick={() => {
                  setChoice(c.value);
                  setError(null);
                }}
                className={cn(
                  'w-full text-left rounded-xl border px-4 py-3 min-h-[56px] transition-colors',
                  choice === c.value ? 'border-ink bg-sand' : 'border-ash bg-paper hover:border-pebble',
                )}
              >
                <span className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 rounded-full border',
                      choice === c.value ? 'border-ink bg-ink ring-2 ring-inset ring-sand' : 'border-pebble',
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-[15px] text-ink">{c.title}</span>
                    <span className="block text-caption text-fossil mt-0.5">{c.body}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          {choice === 'match' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nominal di pembukuan">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Nominal di pembukuan"
                  className="w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[16px] sm:text-[15px] text-ink tnum focus:border-ink focus:outline-none"
                />
              </Field>
              <Input
                label="Dicatat sejak tanggal"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                hint="Dicari pada tanggal ini atau sesudahnya. Mundurkan bila pencatatan lebih awal."
              />
            </div>
          )}

          {error && (
            <p className="text-body-sm text-rose-700 break-words" role="alert">
              {error}
            </p>
          )}

          <div className={footer}>
            <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button full className="sm:w-auto min-h-[44px]" onClick={submit} disabled={saving || (choice === 'match' && !matchOk)}>
              {saving ? 'Memproses…' : choice === 'match' ? 'Cocokkan' : 'Tandai selesai'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
