import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { formatIDR, todayISO } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { Toggle } from '../ui/Toggle';
import { prefillFromOcr, type PrefillLine } from './ocrPrefill';

interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

/** Hasil OCR yang sedang ditinjau; bila ada, tagihan dibuat lewat endpoint OCR. */
export interface OcrContext {
  id: string;
  fields: Record<string, unknown>;
  confidence: number;
  imageUrl?: string;
}

interface FormLine extends PrefillLine {
  key: string;
  accountId: string;
}

let seq = 0;
const newLine = (p?: Partial<PrefillLine>): FormLine => ({
  key: `bl${++seq}`,
  accountId: '',
  description: p?.description ?? '',
  amount: p?.amount ?? '',
});

const money = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

interface BillFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  ocr?: OcrContext | null;
}

export function BillFormModal({ open, onClose, onCreated, ocr }: BillFormModalProps) {
  const suppliers = useResource<unknown>('/v1/parties/suppliers?isActive=true', { enabled: open });
  const accounts = useResource<unknown>('/v1/finance/accounts', { enabled: open });

  const supplierOptions = useMemo(() => listOf<SupplierOption>(suppliers.data), [suppliers.data]);
  // Hanya akun beban/aset yang boleh di-debit pada tagihan; backend menolak sisanya.
  const accountOptions = useMemo(
    () => listOf<AccountOption>(accounts.data).filter((a) => a.type === 'expense' || a.type === 'asset'),
    [accounts.data],
  );

  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [billDate, setBillDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState('');
  const [applyTax, setApplyTax] = useState(true);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  // Reset setiap kali dibuka
  useEffect(() => {
    if (!open) return;
    setSupplierId('');
    setInvoiceNo('');
    setBillDate(todayISO());
    setDueDate('');
    setApplyTax(true);
    setNote('');
    setLines([newLine()]);
    setPrefilledFor(null);
  }, [open, ocr?.id]);

  // Isi dari hasil OCR sekali, setelah daftar pemasok siap supaya nama bisa dicocokkan
  useEffect(() => {
    if (!open || !ocr || prefilledFor === ocr.id) return;
    // Tunggu daftar pemasok benar-benar tiba (atau gagal): `loading` baru menyala
    // setelah render pertama, jadi tidak cukup untuk memutuskan.
    if (suppliers.data === null && !suppliers.error) return;
    const p = prefillFromOcr(ocr.fields, supplierOptions);
    setSupplierId(p.supplierId);
    setInvoiceNo(p.supplierInvoiceNumber);
    if (p.billDate) setBillDate(p.billDate);
    setLines(p.lines.map((l) => newLine(l)));
    setPrefilledFor(ocr.id);
  }, [open, ocr, prefilledFor, suppliers.data, suppliers.error, supplierOptions]);

  const total = lines.reduce((s, l) => s + money(l.amount), 0);

  const patch = (key: string, p: Partial<FormLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  function validate(): string | null {
    if (!supplierId) return 'Pilih pemasok.';
    if (!billDate) return 'Tanggal tagihan wajib diisi.';
    if (dueDate && dueDate < billDate) return 'Jatuh tempo tidak boleh lebih awal dari tanggal tagihan.';
    for (const [i, l] of lines.entries()) {
      if (!l.accountId) return `Baris ${i + 1}: pilih akun beban/aset.`;
      if (!(money(l.amount) > 0)) return `Baris ${i + 1}: nilai harus lebih dari 0.`;
    }
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) {
      toast({ title: problem, icon: 'warning' });
      return;
    }
    const payload = {
      supplierId,
      ...(invoiceNo.trim() ? { supplierInvoiceNumber: invoiceNo.trim() } : {}),
      billDate,
      ...(dueDate ? { dueDate } : {}),
      applyTax,
      ...(note.trim() ? { note: note.trim() } : {}),
      lines: lines.map((l) => ({
        accountId: l.accountId,
        ...(l.description.trim() ? { description: l.description.trim() } : {}),
        amount: money(l.amount),
      })),
    };

    setSaving(true);
    try {
      if (ocr) {
        // Simpan koreksi manusia dulu: backend menolak hasil OCR yang masih needs_review.
        await apiFetch(`/v1/ocr/results/${ocr.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...ocr.fields,
            invoiceNumber: invoiceNo.trim() || null,
            invoiceDate: billDate,
            subtotal: total,
            supplierId,
          }),
        });
        const bill = await apiFetch<{ number: string }>(`/v1/ocr/results/${ocr.id}/create-bill`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast({ title: `Tagihan ${bill.number} dibuat dari invoice.`, icon: 'check' });
      } else {
        const bill = await apiFetch<{ number: string }>('/v1/payables/bills', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast({ title: `Tagihan ${bill.number} dicatat.`, icon: 'check' });
      }
      onCreated();
      onClose();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan tagihan.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  const loadError = suppliers.error || accounts.error;
  const ocrTotal = ocr ? Number(ocr.fields.total) : NaN;
  const ocrTax = ocr ? Number(ocr.fields.taxAmount) : NaN;

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={ocr ? 'Periksa invoice hasil pindai' : 'Catat tagihan pemasok'}
      maxWidth="xl"
    >
      <div className="space-y-4">
        {ocr && (
          <div className="rounded-xl border border-ash bg-bone p-3 flex gap-3 min-w-0">
            {ocr.imageUrl && (
              <a href={ocr.imageUrl} target="_blank" rel="noreferrer" className="shrink-0" aria-label="Lihat foto invoice">
                <img src={ocr.imageUrl} alt="Foto invoice" className="h-20 w-16 object-cover rounded-lg border border-ash" />
              </a>
            )}
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={ocr.confidence >= 0.7 ? 'accent' : 'outline'} icon="sparkles">
                  Keyakinan {Math.round(ocr.confidence * 100)}%
                </Badge>
              </div>
              <p className="text-body-sm text-fossil break-words">
                Terbaca di invoice:{' '}
                {Number.isFinite(ocrTotal) ? `total ${formatIDR(ocrTotal)}` : 'total tidak terbaca'}
                {Number.isFinite(ocrTax) && ocrTax > 0 ? `, PPN ${formatIDR(ocrTax)}` : ''}. Cocokkan dengan dokumen asli
                sebelum menyimpan.
              </p>
            </div>
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-ash p-3 text-body-sm text-fossil flex items-center justify-between gap-3">
            <span className="min-w-0 break-words">Gagal memuat pemasok/akun: {loadError}</span>
            <Button
              variant="ghost"
              size="sm"
              icon="sync"
              className="min-h-[40px] shrink-0"
              onClick={() => {
                suppliers.reload();
                accounts.reload();
              }}
            >
              Ulangi
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Pemasok" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">{suppliers.loading ? 'Memuat…' : 'Pilih pemasok'}</option>
            {supplierOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </Select>
          <Input
            label="No. faktur pemasok"
            hint="Opsional. Mencegah faktur yang sama tercatat dua kali."
            value={invoiceNo}
            maxLength={64}
            onChange={(e) => setInvoiceNo(e.target.value)}
          />
          <Input label="Tanggal tagihan" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          <Input
            label="Jatuh tempo"
            type="date"
            value={dueDate}
            min={billDate}
            hint="Kosong = ikut termin pembayaran pemasok."
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="space-y-2.5">
          <p className="text-caption text-fossil">Rincian biaya (nilai sebelum PPN)</p>
          {lines.map((line, i) => (
            <div key={line.key} className="rounded-xl border border-ash bg-bone/60 p-3 space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-caption text-fossil">Baris {i + 1}</p>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                    aria-label={`Hapus baris ${i + 1}`}
                    className="p-2.5 -m-2.5 rounded-lg text-pebble hover:text-rose-700 hover:bg-sand"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
              <Select label="Akun beban/aset" value={line.accountId} onChange={(e) => patch(line.key, { accountId: e.target.value })}>
                <option value="">{accounts.loading ? 'Memuat…' : 'Pilih akun'}</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Keterangan"
                  value={line.description}
                  maxLength={255}
                  onChange={(e) => patch(line.key, { description: e.target.value })}
                />
                <Input
                  label="Nilai (Rp)"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={line.amount}
                  placeholder="0"
                  onChange={(e) => patch(line.key, { amount: e.target.value })}
                />
              </div>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            full
            className="min-h-[44px]"
            onClick={() => setLines((ls) => [...ls, newLine()])}
          >
            Tambah baris
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-ash px-4 py-3">
          <div className="min-w-0">
            <p className="text-body-sm text-ink">Hitung PPN masukan otomatis</p>
            <p className="text-caption text-fossil">Tarif diambil dari aturan pajak aktif.</p>
          </div>
          <Toggle checked={applyTax} onChange={setApplyTax} label="Hitung PPN masukan otomatis" />
        </div>

        <Textarea label="Catatan (opsional)" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]" />

        <div className="rounded-xl bg-sand/60 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-body-sm text-fossil">Total sebelum PPN</span>
          <span className="tnum text-[17px] text-ink font-medium">{formatIDR(total)}</span>
        </div>
        <p className="text-caption text-fossil">
          Langsung dijurnal ke buku besar: Dr beban/aset, Cr Hutang Usaha. Jurnal yang sudah terposting hanya bisa dibalik, tidak
          diedit.
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" full className="sm:w-auto min-h-[44px]" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button full className="sm:w-auto min-h-[44px]" onClick={submit} disabled={saving || suppliers.loading || accounts.loading}>
            {saving ? 'Menyimpan…' : 'Simpan tagihan'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
