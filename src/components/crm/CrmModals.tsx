import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { apiFetch } from '../../lib/api';
import { listOf, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { LineItemsEditor, toDocumentLines, type EditorLine } from './LineItemsEditor';

export interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

const errText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

const optional = (v: string) => (v.trim() ? v.trim() : undefined);

/** Daftar pelanggan aktif untuk dropdown; hanya dimuat saat modal terbuka. */
export function useCustomerOptions(enabled: boolean) {
  const res = useResource<CustomerOption[]>('/v1/parties/customers?isActive=true', { enabled });
  return listOf<CustomerOption>(res.data);
}

function FooterButtons({ onCancel, busy, label, busyLabel, disabled }: { onCancel: () => void; busy: boolean; label: string; busyLabel?: string; disabled?: boolean }) {
  return (
    <div className="flex gap-2 pt-1">
      <Button type="button" variant="ghost" full onClick={onCancel}>
        Batal
      </Button>
      <Button type="submit" full disabled={busy || disabled}>
        {busy ? (busyLabel ?? 'Menyimpan…') : label}
      </Button>
    </div>
  );
}

// ============================== Konversi prospek → pelanggan ==============================

interface ConvertLeadProps {
  lead: { id: string; name: string; contactName: string; phone: string; email: string } | null;
  onClose: () => void;
  onDone: () => void;
}

export function ConvertLeadModal({ lead, onClose, onDone }: ConvertLeadProps) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [terms, setTerms] = useState('0');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setName(lead.name);
    setContact(lead.contactName);
    setPhone(lead.phone);
    setEmail(lead.email);
    setCity('');
    setAddress('');
    setTerms('0');
  }, [lead]);

  async function submit() {
    if (!lead) return;
    if (name.trim().length < 2) {
      toast({ title: 'Nama pelanggan minimal 2 huruf.', icon: 'warning' });
      return;
    }
    const days = Number(terms);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      toast({ title: 'Tempo pembayaran 0 sampai 365 hari.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const customer = await apiFetch<{ code: string; name: string }>(`/v1/crm/leads/${lead.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          contact: optional(contact),
          phone: optional(phone),
          email: optional(email),
          city: optional(city),
          address: optional(address),
          paymentTermDays: days,
        }),
      });
      toast({ title: `${customer.name} kini pelanggan (${customer.code}).`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal mengonversi prospek.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={lead !== null} onClose={onClose} title="Jadikan Pelanggan" maxWidth="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-body-sm text-fossil">
          Data prospek disalin ke master pelanggan dan prospek ditandai sudah dikonversi. Ubah bila perlu sebelum disimpan.
        </p>
        <Input label="Nama pelanggan" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Narahubung" value={contact} onChange={(e) => setContact(e.target.value)} />
          <Input label="Telepon" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Kota" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <Input label="Alamat" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input
          label="Tempo pembayaran (hari)"
          hint="0 berarti tunai. Dipakai untuk jatuh tempo faktur piutang."
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          inputMode="numeric"
        />
        <FooterButtons onCancel={onClose} busy={busy} label="Jadikan Pelanggan" />
      </form>
    </Modal>
  );
}

// ============================== Deal baru ==============================

const OPP_STAGES: Array<{ value: string; label: string }> = [
  { value: 'prospecting', label: 'Prospek' },
  { value: 'qualification', label: 'Kualifikasi' },
  { value: 'proposal', label: 'Penawaran' },
  { value: 'negotiation', label: 'Negosiasi' },
];

export function OpportunityModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const customers = useCustomerOptions(open);
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState('prospecting');
  const [closeDate, setCloseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setCustomerId('');
      setValue('');
      setStage('prospecting');
      setCloseDate('');
      setNotes('');
    }
  }, [open]);

  async function submit() {
    if (title.trim().length < 2) {
      toast({ title: 'Judul deal minimal 2 huruf.', icon: 'warning' });
      return;
    }
    const amount = value.trim() ? Number(value.replace(',', '.')) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: 'Nilai deal tidak valid.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/crm/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          customerId: customerId || undefined,
          value: Math.round(amount * 100) / 100,
          stage,
          expectedCloseDate: closeDate ? new Date(closeDate).toISOString() : undefined,
          notes: optional(notes),
        }),
      });
      toast({ title: 'Deal ditambahkan.', icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal menyimpan deal.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah Deal" maxWidth="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input label="Judul deal" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pengadaan kopi bulanan" />
        <Select label="Pelanggan (opsional)" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Belum ada pelanggan</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Nilai (Rp)" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" />
          <Select label="Tahap awal" value={stage} onChange={(e) => setStage(e.target.value)}>
            {OPP_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <Input label="Perkiraan closing" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
        <Textarea label="Catatan" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        <FooterButtons onCancel={onClose} busy={busy} label="Simpan Deal" />
      </form>
    </Modal>
  );
}

// ============================== Penawaran / Pesanan baru ==============================

export function DocumentModal({
  mode,
  open,
  onClose,
  onDone,
}: {
  mode: 'quotation' | 'order';
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const customers = useCustomerOptions(open);
  const warehousesRes = useResource<Warehouse[]>('/v1/inventory/warehouses?isActive=true', { enabled: open && mode === 'order' });
  const warehouses = listOf<Warehouse>(warehousesRes.data);

  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomerId('');
      setWarehouseId('');
      setValidUntil('');
      setNote('');
      setLines([]);
    }
  }, [open]);

  const isOrder = mode === 'order';

  async function submit() {
    if (isOrder && !customerId) {
      toast({ title: 'Pilih pelanggan.', icon: 'warning' });
      return;
    }
    if (isOrder && !warehouseId) {
      toast({ title: 'Pilih gudang asal stok.', icon: 'warning' });
      return;
    }
    const doc = toDocumentLines(lines);
    if ('error' in doc) {
      toast({ title: doc.error, icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch<{ number: string }>(isOrder ? '/v1/crm/sales-orders' : '/v1/crm/quotations', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customerId || undefined,
          ...(isOrder ? { warehouseId } : { validUntil: validUntil ? new Date(validUntil).toISOString() : undefined }),
          note: optional(note),
          lines: doc.lines,
        }),
      });
      toast({ title: `${isOrder ? 'Pesanan' : 'Penawaran'} ${result.number} dibuat.`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal membuat dokumen.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isOrder ? 'Pesanan Baru' : 'Penawaran Baru'} maxWidth="xl">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={isOrder ? 'Pelanggan' : 'Pelanggan (opsional)'} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">{isOrder ? 'Pilih pelanggan…' : 'Tanpa pelanggan'}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
          {isOrder ? (
            <Select label="Gudang asal stok" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Pilih gudang…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </Select>
          ) : (
            <Input label="Berlaku sampai" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          )}
        </div>

        <LineItemsEditor lines={lines} onChange={setLines} />

        <Textarea label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        <FooterButtons onCancel={onClose} busy={busy} label={isOrder ? 'Buat Pesanan' : 'Buat Penawaran'} />
      </form>
    </Modal>
  );
}

// ============================== Komplain ==============================

export function ComplaintModal({ open, onClose, onDone, customerId }: { open: boolean; onClose: () => void; onDone: () => void; customerId?: string }) {
  const customers = useCustomerOptions(open && !customerId);
  const [pick, setPick] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPick(customerId ?? '');
      setTitle('');
      setDescription('');
    }
  }, [open, customerId]);

  async function submit() {
    if (!pick) {
      toast({ title: 'Pilih pelanggan.', icon: 'warning' });
      return;
    }
    if (title.trim().length < 3) {
      toast({ title: 'Judul komplain minimal 3 huruf.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/crm/complaints', {
        method: 'POST',
        body: JSON.stringify({ customerId: pick, title: title.trim(), description: optional(description) }),
      });
      toast({ title: 'Komplain dicatat.', icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal mencatat komplain.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Catat Komplain" maxWidth="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!customerId && (
          <Select label="Pelanggan" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Pilih pelanggan…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
        )}
        <Input label="Judul" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Barang datang rusak" />
        <Textarea label="Rincian" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        <FooterButtons onCancel={onClose} busy={busy} label="Simpan Komplain" />
      </form>
    </Modal>
  );
}

export function ResolveComplaintModal({
  complaint,
  onClose,
  onDone,
}: {
  complaint: { id: string; title: string; status: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (complaint) setResolution('');
  }, [complaint]);

  async function submit(status: 'in_progress' | 'resolved') {
    if (!complaint) return;
    if (status === 'resolved' && resolution.trim().length < 3) {
      toast({ title: 'Tulis penyelesaian singkat sebelum menutup komplain.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/v1/crm/complaints/${complaint.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status, resolution: optional(resolution) }),
      });
      toast({ title: status === 'resolved' ? 'Komplain diselesaikan.' : 'Komplain ditandai diproses.', icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal memperbarui komplain.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={complaint !== null} onClose={onClose} title={complaint ? `Komplain: ${complaint.title}` : ''} maxWidth="md">
      <div className="space-y-4">
        <Textarea
          label="Penyelesaian / tindak lanjut"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          maxLength={2000}
          placeholder="Barang diganti, saldo dikembalikan, dll."
        />
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          {complaint?.status === 'open' && (
            <Button variant="ghost" full disabled={busy} onClick={() => void submit('in_progress')}>
              Tandai Diproses
            </Button>
          )}
          <Button full disabled={busy} onClick={() => void submit('resolved')}>
            {busy ? 'Menyimpan…' : 'Selesaikan'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
