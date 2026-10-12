import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input, Select, Textarea } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { Icon } from '../icons/Icon';
import { apiFetch } from '../../lib/api';
import { formatIDR, formatNumber, todayISO } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';

const errText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const opt = (v: string) => (v.trim() ? v.trim() : undefined);
const num = (v: string): number => Number(v.replace(',', '.'));
const money = (n: number) => Math.round(n * 100) / 100;
const currentMonth = () => new Date().toISOString().slice(0, 7);

export interface EmployeeOption {
  id: string;
  employeeNo: string;
  fullName: string;
}

interface DepartmentOption {
  id: string;
  code: string;
  name: string;
}

interface PositionOption {
  id: string;
  code: string;
  name: string;
  baseSalary: number | string;
  departmentId: string | null;
}

function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

function Footer({ onCancel, busy, label, busyLabel = 'Menyimpan…', disabled }: { onCancel: () => void; busy: boolean; label: string; busyLabel?: string; disabled?: boolean }) {
  return (
    <div className="flex gap-2 pt-1">
      <Button type="button" variant="ghost" full onClick={onCancel}>
        Batal
      </Button>
      <Button type="submit" full disabled={busy || disabled}>
        {busy ? busyLabel : label}
      </Button>
    </div>
  );
}

function EmployeeSelect({ label = 'Karyawan', value, onChange, employees }: { label?: string; value: string; onChange: (v: string) => void; employees: EmployeeOption[] }) {
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pilih karyawan…</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.employeeNo} · {e.fullName}
        </option>
      ))}
    </Select>
  );
}

// ============================== Karyawan ==============================

export function PositionModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const departments = listOf<DepartmentOption>(useResource<DepartmentOption[]>('/v1/hrm/departments', { enabled: open }).data);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [salary, setSalary] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCode('');
      setName('');
      setDepartmentId('');
      setSalary('');
    }
  }, [open]);

  async function submit() {
    if (code.trim().length < 2 || name.trim().length < 2) {
      toast({ title: 'Kode dan nama jabatan minimal 2 huruf.', icon: 'warning' });
      return;
    }
    const base = salary.trim() ? num(salary) : 0;
    if (!Number.isFinite(base) || base < 0) {
      toast({ title: 'Gaji pokok tidak valid.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/hrm/positions', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim(), name: name.trim(), departmentId: departmentId || undefined, baseSalary: money(base) }),
      });
      toast({ title: 'Jabatan dibuat.', icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal membuat jabatan.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Jabatan Baru" maxWidth="md">
      <Form onSubmit={submit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Kode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BRS" />
          <Input label="Nama jabatan" value={name} onChange={(e) => setName(e.target.value)} placeholder="Barista" />
        </div>
        <Select label="Departemen (opsional)" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">Tanpa departemen</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Input label="Gaji pokok standar (Rp)" hint="Dipakai sebagai isian awal saat menambah karyawan." value={salary} onChange={(e) => setSalary(e.target.value)} inputMode="decimal" />
        <Footer onCancel={onClose} busy={busy} label="Simpan Jabatan" />
      </Form>
    </Modal>
  );
}

export function EmployeeModal({ open, onClose, onDone, onAddPosition }: { open: boolean; onClose: () => void; onDone: () => void; onAddPosition?: () => void }) {
  const departments = listOf<DepartmentOption>(useResource<DepartmentOption[]>('/v1/hrm/departments', { enabled: open }).data);
  const positions = listOf<PositionOption>(useResource<PositionOption[]>('/v1/hrm/positions', { enabled: open }).data);

  const [employeeNo, setEmployeeNo] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [type, setType] = useState('permanent');
  const [hireDate, setHireDate] = useState(todayISO());
  const [salary, setSalary] = useState('');
  const [bank, setBank] = useState('');
  const [taxId, setTaxId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployeeNo('');
      setFullName('');
      setEmail('');
      setPhone('');
      setDepartmentId('');
      setPositionId('');
      setType('permanent');
      setHireDate(todayISO());
      setSalary('');
      setBank('');
      setTaxId('');
    }
  }, [open]);

  function pickPosition(id: string) {
    setPositionId(id);
    const p = positions.find((x) => x.id === id);
    if (p) {
      if (!salary.trim() && Number(p.baseSalary) > 0) setSalary(String(Number(p.baseSalary)));
      if (!departmentId && p.departmentId) setDepartmentId(p.departmentId);
    }
  }

  async function submit() {
    if (employeeNo.trim().length < 2 || fullName.trim().length < 2) {
      toast({ title: 'Nomor induk dan nama lengkap wajib diisi.', icon: 'warning' });
      return;
    }
    const base = salary.trim() ? num(salary) : 0;
    if (!Number.isFinite(base) || base < 0) {
      toast({ title: 'Gaji pokok tidak valid.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/hrm/employees', {
        method: 'POST',
        body: JSON.stringify({
          employeeNo: employeeNo.trim(),
          fullName: fullName.trim(),
          email: opt(email),
          phone: opt(phone),
          departmentId: departmentId || undefined,
          positionId: positionId || undefined,
          employmentType: type,
          hireDate: new Date(hireDate).toISOString(),
          baseSalary: money(base),
          bankAccount: opt(bank),
          taxId: opt(taxId),
        }),
      });
      toast({ title: `${fullName.trim()} ditambahkan.`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal menambah karyawan.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Karyawan Baru" maxWidth="xl">
      <Form onSubmit={submit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Nomor induk" value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value)} placeholder="EMP-001" />
          <Input label="Nama lengkap" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Telepon" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <Select label="Departemen" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Tanpa departemen</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select label="Jabatan" value={positionId} onChange={(e) => pickPosition(e.target.value)}>
            <option value="">Tanpa jabatan</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select label="Status kerja" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="permanent">Tetap</option>
            <option value="contract">Kontrak</option>
            <option value="intern">Magang</option>
          </Select>
          <Input label="Tanggal masuk" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          <Input label="Gaji pokok (Rp)" value={salary} onChange={(e) => setSalary(e.target.value)} inputMode="decimal" />
          <Input label="Rekening bank" value={bank} onChange={(e) => setBank(e.target.value)} inputMode="numeric" />
          <Input label="NPWP" value={taxId} onChange={(e) => setTaxId(e.target.value)} inputMode="numeric" />
        </div>
        {onAddPosition && positions.length === 0 && (
          <p className="text-caption text-fossil">
            Belum ada jabatan.{' '}
            <button type="button" className="underline text-ink min-h-[32px]" onClick={onAddPosition}>
              Buat jabatan
            </button>
          </p>
        )}
        <Footer onCancel={onClose} busy={busy} label="Simpan Karyawan" />
      </Form>
    </Modal>
  );
}

export function TerminateModal({ employee, onClose, onDone }: { employee: EmployeeOption | null; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (employee) setDate(todayISO());
  }, [employee]);

  async function submit() {
    if (!employee) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/hrm/employees/${employee.id}/terminate`, { method: 'POST', body: JSON.stringify({ date: new Date(date).toISOString() }) });
      toast({ title: `${employee.fullName} dinonaktifkan.`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal menonaktifkan karyawan.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={employee !== null} onClose={onClose} title={employee ? `Akhiri masa kerja ${employee.fullName}?` : ''} maxWidth="sm">
      <Form onSubmit={submit}>
        <p className="text-body-sm text-fossil">Karyawan menjadi nonaktif dan tidak ikut payroll berikutnya. Riwayat tetap tersimpan.</p>
        <Input label="Tanggal berakhir" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Footer onCancel={onClose} busy={busy} label="Akhiri Masa Kerja" />
      </Form>
    </Modal>
  );
}

// ============================== Cuti ==============================

export function LeaveRequestModal({ open, employees, onClose, onDone }: { open: boolean; employees: EmployeeOption[]; onClose: () => void; onDone: () => void }) {
  const [employeeId, setEmployeeId] = useState('');
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployeeId('');
      setStart(todayISO());
      setEnd(todayISO());
      setReason('');
    }
  }, [open]);

  async function submit() {
    if (!employeeId) {
      toast({ title: 'Pilih karyawan.', icon: 'warning' });
      return;
    }
    if (end < start) {
      toast({ title: 'Tanggal akhir tidak boleh sebelum tanggal mulai.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/hrm/leaves', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          startDate: new Date(start).toISOString(),
          endDate: new Date(end).toISOString(),
          reason: opt(reason),
        }),
      });
      toast({ title: 'Pengajuan cuti dicatat.', icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal mengajukan cuti.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajukan Cuti" maxWidth="md">
      <Form onSubmit={submit}>
        <EmployeeSelect value={employeeId} onChange={setEmployeeId} employees={employees} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Mulai" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="Sampai" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Textarea label="Alasan (opsional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
        <Footer onCancel={onClose} busy={busy} label="Ajukan" />
      </Form>
    </Modal>
  );
}

// ============================== Payroll ==============================

interface OverrideRow {
  key: number;
  employeeId: string;
  overtimeAmount: string;
  bonusAmount: string;
  otherEarning: string;
  otherDeduction: string;
  bpjsKesehatan: string;
  bpjsKetenagakerjaan: string;
}

let overrideSeq = 0;
const blankOverride = (): OverrideRow => ({
  key: ++overrideSeq,
  employeeId: '',
  overtimeAmount: '',
  bonusAmount: '',
  otherEarning: '',
  otherDeduction: '',
  bpjsKesehatan: '',
  bpjsKetenagakerjaan: '',
});

const OVERRIDE_FIELDS: Array<{ key: keyof Omit<OverrideRow, 'key' | 'employeeId'>; label: string }> = [
  { key: 'bonusAmount', label: 'Bonus' },
  { key: 'overtimeAmount', label: 'Lembur' },
  { key: 'otherEarning', label: 'Tunjangan lain' },
  { key: 'otherDeduction', label: 'Potongan lain' },
  { key: 'bpjsKesehatan', label: 'BPJS Kesehatan' },
  { key: 'bpjsKetenagakerjaan', label: 'BPJS Ketenagakerjaan' },
];

export function PayrollRunModal({ open, employees, onClose, onDone }: { open: boolean; employees: EmployeeOption[]; onClose: () => void; onDone: () => void }) {
  const [period, setPeriod] = useState(currentMonth());
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPeriod(currentMonth());
      setRows([]);
    }
  }, [open]);

  const patch = (key: number, next: Partial<OverrideRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...next } : r)));

  async function submit() {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      toast({ title: 'Pilih bulan payroll.', icon: 'warning' });
      return;
    }
    const overrides: Array<Record<string, string | number>> = [];
    for (const r of rows) {
      if (!r.employeeId) {
        toast({ title: 'Pilih karyawan untuk setiap penyesuaian, atau hapus barisnya.', icon: 'warning' });
        return;
      }
      const o: Record<string, string | number> = { employeeId: r.employeeId };
      for (const f of OVERRIDE_FIELDS) {
        const raw = r[f.key].trim();
        if (!raw) continue;
        const n = num(raw);
        if (!Number.isFinite(n) || n < 0) {
          toast({ title: `${f.label} tidak valid.`, icon: 'warning' });
          return;
        }
        o[f.key] = money(n);
      }
      overrides.push(o);
    }
    setBusy(true);
    try {
      await apiFetch('/v1/hrm/payroll/runs', { method: 'POST', body: JSON.stringify({ period, overrides: overrides.length ? overrides : undefined }) });
      toast({ title: `Payroll ${period} dihitung sebagai draf.`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal menghitung payroll.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Hitung Payroll" maxWidth="xl">
      <Form onSubmit={submit}>
        <Input label="Periode" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} hint="Gaji pokok, lembur dari absensi, dan PPh 21 dihitung otomatis. Hasilnya draf sampai Anda memostingnya." />

        <div className="space-y-2.5">
          <p className="text-[15px] text-ink">Bonus & potongan per karyawan</p>
          {rows.map((r) => (
            <div key={r.key} className="rounded-xl border border-ash bg-bone/40 p-3 space-y-2.5">
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <EmployeeSelect value={r.employeeId} onChange={(v) => patch(r.key, { employeeId: v })} employees={employees} />
                </div>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                  aria-label="Hapus penyesuaian"
                  className="p-2.5 mb-0.5 rounded-lg text-pebble hover:text-ink hover:bg-sand shrink-0"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {OVERRIDE_FIELDS.map((f) => (
                  <Input key={f.key} label={f.label} value={r[f.key]} onChange={(e) => patch(r.key, { [f.key]: e.target.value })} inputMode="decimal" placeholder="0" />
                ))}
              </div>
            </div>
          ))}
          <Button type="button" variant="subtle" size="sm" icon="plus" onClick={() => setRows((prev) => [...prev, blankOverride()])}>
            Tambah penyesuaian
          </Button>
        </div>

        <Footer onCancel={onClose} busy={busy} label="Hitung Payroll" busyLabel="Menghitung…" />
      </Form>
    </Modal>
  );
}

interface PayrollRunDetail {
  id: string;
  period: string;
  status: string;
  totalGross: number | string;
  totalDeduction: number | string;
  totalNet: number | string;
  totalEmployerCost: number | string;
  items: Array<{
    id: string;
    gross: number | string;
    pph21Amount: number | string;
    pph21Source: string;
    totalDeduction: number | string;
    net: number | string;
    employee: { employeeNo: string; fullName: string };
  }>;
}

const sourceBadge: Record<string, { variant: 'accent' | 'outline'; label: string }> = {
  official: { variant: 'accent', label: 'Tarif resmi' },
  estimate: { variant: 'outline', label: 'Tarif estimasi' },
};

export function PayrollDetailModal({ runId, onClose, onChanged }: { runId: string | null; onClose: () => void; onChanged: () => void }) {
  const detail = useResource<PayrollRunDetail>(runId ? `/v1/hrm/payroll/runs/${runId}` : null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = detail.data;

  useEffect(() => {
    if (runId) setConfirm(false);
  }, [runId]);

  const estimateCount = run ? run.items.filter((i) => i.pph21Source === 'estimate').length : 0;

  async function post() {
    if (!run) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/hrm/payroll/runs/${run.id}/post`, { method: 'POST', body: JSON.stringify({}) });
      toast({ title: `Payroll ${run.period} diposting ke buku besar.`, icon: 'check' });
      setConfirm(false);
      detail.reload();
      onChanged();
    } catch (err) {
      toast({ title: errText(err, 'Gagal memposting payroll.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={runId !== null} onClose={onClose} title={run ? `Payroll ${run.period}` : 'Payroll'} maxWidth="xl">
      {detail.loading && !run && <p className="text-body-sm text-fossil text-center py-6">Memuat…</p>}
      {detail.error && (
        <div className="space-y-3 py-3">
          <p className="text-body-sm text-ink">{detail.error}</p>
          <Button variant="ghost" icon="sync" onClick={detail.reload}>
            Coba lagi
          </Button>
        </div>
      )}
      {run && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={run.status === 'posted' ? 'ink' : 'neutral'}>{run.status === 'posted' ? 'Diposting' : 'Draf'}</Badge>
            <span className="text-body-sm text-fossil tnum">{run.items.length} karyawan</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Total kotor', value: formatIDR(Number(run.totalGross)) },
              { label: 'Total potongan', value: formatIDR(Number(run.totalDeduction)) },
              { label: 'Dibayarkan', value: formatIDR(Number(run.totalNet)) },
              { label: 'Biaya perusahaan', value: formatIDR(Number(run.totalEmployerCost)) },
            ].map((s) => (
              <Card key={s.label} className="px-3 py-2.5 min-w-0">
                <p className="text-caption text-fossil truncate">{s.label}</p>
                <p className="text-[15px] text-ink tnum break-words mt-0.5">{s.value}</p>
              </Card>
            ))}
          </div>

          {estimateCount > 0 && (
            <div className="rounded-xl border border-ash bg-chartreuse/20 px-3.5 py-3 text-body-sm text-ink">
              PPh 21 untuk {estimateCount} karyawan memakai <strong>tarif estimasi</strong>, bukan tarif resmi. Cocokkan dengan aturan pajak yang berlaku sebelum memostingnya.
            </div>
          )}

          <Card className="overflow-hidden">
            <ul className="divide-y divide-sand">
              {run.items.map((i) => {
                const badge = sourceBadge[i.pph21Source];
                return (
                  <li key={i.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] text-ink break-words">{i.employee.fullName}</p>
                        <p className="text-caption text-fossil tnum">{i.employee.employeeNo}</p>
                      </div>
                      <p className="text-[15px] text-ink tnum shrink-0">{formatIDR(Number(i.net))}</p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fossil tnum">
                      <span>Kotor {formatIDR(Number(i.gross))}</span>
                      <span>Potongan {formatIDR(Number(i.totalDeduction))}</span>
                      <span className="inline-flex items-center gap-1.5">
                        PPh 21 {formatIDR(Number(i.pph21Amount))}
                        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {run.status !== 'posted' &&
            (confirm ? (
              <div className="rounded-xl border border-ink/30 p-3.5 space-y-3">
                <p className="text-body-sm text-ink">
                  Posting menulis jurnal beban gaji ke buku besar dan mengunci payroll ini. Setelah diposting tidak bisa dihitung ulang.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" full onClick={() => setConfirm(false)}>
                    Batal
                  </Button>
                  <Button full disabled={busy} onClick={post}>
                    {busy ? 'Memposting…' : 'Ya, Posting'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button full icon="check" onClick={() => setConfirm(true)}>
                Posting ke Buku Besar
              </Button>
            ))}
        </div>
      )}
    </Modal>
  );
}

// ============================== Rekrutmen ==============================

export interface PostingOption {
  id: string;
  title: string;
  status: string;
}

export function ApplicantModal({ open, postings, onClose, onDone }: { open: boolean; postings: PostingOption[]; onClose: () => void; onDone: () => void }) {
  const openPostings = postings.filter((p) => p.status === 'open');
  const [jobPostingId, setJobPostingId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [coverNote, setCoverNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setJobPostingId(openPostings.length === 1 ? openPostings[0].id : '');
      setFullName('');
      setEmail('');
      setPhone('');
      setResumeUrl('');
      setCoverNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    if (!jobPostingId) {
      toast({ title: 'Pilih lowongan.', icon: 'warning' });
      return;
    }
    if (fullName.trim().length < 2) {
      toast({ title: 'Nama pelamar minimal 2 huruf.', icon: 'warning' });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast({ title: 'Email pelamar tidak valid.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/recruitment/applicants', {
        method: 'POST',
        body: JSON.stringify({ jobPostingId, fullName: fullName.trim(), email: email.trim(), phone: opt(phone), resumeUrl: opt(resumeUrl), coverNote: opt(coverNote) }),
      });
      toast({ title: 'Pelamar dicatat.', icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal mencatat pelamar.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah Pelamar" maxWidth="md">
      <Form onSubmit={submit}>
        <Select label="Lowongan" value={jobPostingId} onChange={(e) => setJobPostingId(e.target.value)}>
          <option value="">{openPostings.length ? 'Pilih lowongan…' : 'Belum ada lowongan terbuka'}</option>
          {openPostings.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Nama lengkap" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Telepon" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <Input label="Tautan CV" value={resumeUrl} onChange={(e) => setResumeUrl(e.target.value)} inputMode="url" placeholder="https://" />
        </div>
        <Textarea label="Catatan pelamar" value={coverNote} onChange={(e) => setCoverNote(e.target.value)} maxLength={2000} />
        <Footer onCancel={onClose} busy={busy} label="Simpan Pelamar" />
      </Form>
    </Modal>
  );
}

export function HireModal({ applicant, onClose, onDone }: { applicant: { id: string; fullName: string } | null; onClose: () => void; onDone: () => void }) {
  const [salary, setSalary] = useState('');
  const [hireDate, setHireDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (applicant) {
      setSalary('');
      setHireDate(todayISO());
    }
  }, [applicant]);

  async function submit() {
    if (!applicant) return;
    const base = num(salary);
    if (!Number.isFinite(base) || base <= 0) {
      toast({ title: 'Isi gaji pokok yang disepakati (lebih dari 0).', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/v1/recruitment/applicants/${applicant.id}/hire`, {
        method: 'POST',
        body: JSON.stringify({ baseSalary: money(base), hireDate: new Date(hireDate).toISOString() }),
      });
      toast({ title: `${applicant.fullName} resmi menjadi karyawan.`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal merekrut.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={applicant !== null} onClose={onClose} title={applicant ? `Rekrut ${applicant.fullName}` : ''} maxWidth="sm">
      <Form onSubmit={submit}>
        <p className="text-body-sm text-fossil">Data pelamar disalin menjadi karyawan baru dengan nomor induk otomatis.</p>
        <Input label="Gaji pokok disepakati (Rp)" value={salary} onChange={(e) => setSalary(e.target.value)} inputMode="decimal" />
        <Input label="Tanggal masuk" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
        <Footer onCancel={onClose} busy={busy} label="Rekrut" />
      </Form>
    </Modal>
  );
}

// ============================== Kinerja ==============================

export interface KpiOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export function KpiModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [higher, setHigher] = useState(true);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCode('');
      setName('');
      setUnit('');
      setHigher(true);
      setDescription('');
    }
  }, [open]);

  async function submit() {
    if (code.trim().length < 2 || name.trim().length < 2) {
      toast({ title: 'Kode dan nama KPI minimal 2 huruf.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/v1/performance/kpis', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim(), unit: opt(unit), higherIsBetter: higher, description: opt(description) }),
      });
      toast({ title: 'KPI dibuat.', icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal membuat KPI.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="KPI Baru" maxWidth="md">
      <Form onSubmit={submit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Kode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SALES-MTD" />
          <Input label="Satuan" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Rp, %, unit" />
        </div>
        <Input label="Nama indikator" value={name} onChange={(e) => setName(e.target.value)} placeholder="Penjualan bulanan" />
        <Select label="Arah penilaian" value={higher ? 'up' : 'down'} onChange={(e) => setHigher(e.target.value === 'up')}>
          <option value="up">Makin tinggi makin baik (penjualan, kepuasan)</option>
          <option value="down">Makin rendah makin baik (biaya, keterlambatan)</option>
        </Select>
        <Textarea label="Deskripsi (opsional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        <Footer onCancel={onClose} busy={busy} label="Simpan KPI" />
      </Form>
    </Modal>
  );
}

interface TargetRow {
  key: number;
  kpiId: string;
  target: string;
  weight: string;
}

let targetSeq = 0;
const blankTarget = (): TargetRow => ({ key: ++targetSeq, kpiId: '', target: '', weight: '1' });

export function TargetsModal({ open, employees, kpis, onClose, onDone }: { open: boolean; employees: EmployeeOption[]; kpis: KpiOption[]; onClose: () => void; onDone: () => void }) {
  const [employeeId, setEmployeeId] = useState('');
  const [period, setPeriod] = useState(currentMonth());
  const [rows, setRows] = useState<TargetRow[]>([blankTarget()]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployeeId('');
      setPeriod(currentMonth());
      setRows([blankTarget()]);
    }
  }, [open]);

  const patch = (key: number, next: Partial<TargetRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...next } : r)));

  async function submit() {
    if (!employeeId) {
      toast({ title: 'Pilih karyawan.', icon: 'warning' });
      return;
    }
    if (!/^\d{4}-(Q[1-4]|\d{2})$/.test(period.trim())) {
      toast({ title: 'Periode berformat YYYY-MM atau YYYY-Q1 sampai Q4.', icon: 'warning' });
      return;
    }
    const targets: Array<{ kpiId: string; employeeId: string; target: number; weight: number }> = [];
    for (const r of rows) {
      const t = num(r.target);
      const w = num(r.weight || '1');
      if (!r.kpiId || !Number.isFinite(t) || t < 0 || !Number.isFinite(w) || w < 0 || w > 100) {
        toast({ title: 'Lengkapi KPI, target (≥ 0), dan bobot (0 sampai 100) di setiap baris.', icon: 'warning' });
        return;
      }
      targets.push({ kpiId: r.kpiId, employeeId, target: money(t), weight: money(w) });
    }
    setBusy(true);
    try {
      await apiFetch('/v1/performance/targets', { method: 'POST', body: JSON.stringify({ period: period.trim(), targets }) });
      toast({ title: `${targets.length} target disimpan.`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal menyimpan target.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tetapkan Target KPI" maxWidth="lg">
      <Form onSubmit={submit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EmployeeSelect value={employeeId} onChange={setEmployeeId} employees={employees} />
          <Input label="Periode" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-10 atau 2026-Q4" />
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.key} className="rounded-xl border border-ash bg-bone/40 p-3 space-y-2.5">
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <Select label="Indikator" value={r.kpiId} onChange={(e) => patch(r.key, { kpiId: e.target.value })}>
                    <option value="">Pilih KPI…</option>
                    {kpis.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.code} · {k.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                    aria-label="Hapus baris target"
                    className="p-2.5 mb-0.5 rounded-lg text-pebble hover:text-ink hover:bg-sand shrink-0"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Input label="Target" value={r.target} onChange={(e) => patch(r.key, { target: e.target.value })} inputMode="decimal" />
                <Input label="Bobot" value={r.weight} onChange={(e) => patch(r.key, { weight: e.target.value })} inputMode="decimal" />
              </div>
            </div>
          ))}
          <Button type="button" variant="subtle" size="sm" icon="plus" onClick={() => setRows((prev) => [...prev, blankTarget()])}>
            Tambah indikator
          </Button>
        </div>
        <Footer onCancel={onClose} busy={busy} label="Simpan Target" />
      </Form>
    </Modal>
  );
}

export function ActualModal({ target, onClose, onDone }: { target: { id: string; employeeName: string; kpiName: string; unit: string; targetValue: number } | null; onClose: () => void; onDone: () => void }) {
  const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) setActual('');
  }, [target]);

  async function submit() {
    if (!target) return;
    const v = num(actual);
    if (actual.trim() === '' || !Number.isFinite(v)) {
      toast({ title: 'Isi angka pencapaian.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/v1/performance/targets/${target.id}/actual`, { method: 'PATCH', body: JSON.stringify({ actual: money(v) }) });
      toast({ title: 'Pencapaian dicatat.', icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal mencatat pencapaian.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={target !== null} onClose={onClose} title={target ? `Pencapaian ${target.kpiName}` : ''} maxWidth="sm">
      <Form onSubmit={submit}>
        {target && (
          <p className="text-body-sm text-fossil">
            {target.employeeName} · target <span className="tnum text-ink">{formatNumber(target.targetValue)}</span> {target.unit}
          </p>
        )}
        <Input label="Pencapaian aktual" value={actual} onChange={(e) => setActual(e.target.value)} inputMode="decimal" />
        <Footer onCancel={onClose} busy={busy} label="Simpan" />
      </Form>
    </Modal>
  );
}

export function ReviewModal({ open, employees, onClose, onDone }: { open: boolean; employees: EmployeeOption[]; onClose: () => void; onDone: () => void }) {
  const [employeeId, setEmployeeId] = useState('');
  const [period, setPeriod] = useState(currentMonth());
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [submitFinal, setSubmitFinal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployeeId('');
      setPeriod(currentMonth());
      setStrengths('');
      setImprovements('');
      setSubmitFinal(false);
    }
  }, [open]);

  async function submit() {
    if (!employeeId) {
      toast({ title: 'Pilih karyawan.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ score: number | string; grade: string }>('/v1/performance/review', {
        method: 'POST',
        body: JSON.stringify({ employeeId, period: period.trim(), strengths: opt(strengths), improvements: opt(improvements), submit: submitFinal }),
      });
      toast({ title: `Penilaian tersimpan. Skor ${formatNumber(Number(res.score))}, predikat ${res.grade}.`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: errText(err, 'Gagal menyimpan penilaian.'), icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Penilaian Kinerja" maxWidth="md">
      <Form onSubmit={submit}>
        <p className="text-body-sm text-fossil">Skor dihitung dari pencapaian target KPI pada periode itu. Isi pencapaian aktual lebih dulu.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EmployeeSelect value={employeeId} onChange={setEmployeeId} employees={employees} />
          <Input label="Periode" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-10 atau 2026-Q4" />
        </div>
        <Textarea label="Kekuatan" value={strengths} onChange={(e) => setStrengths(e.target.value)} maxLength={2000} />
        <Textarea label="Yang perlu ditingkatkan" value={improvements} onChange={(e) => setImprovements(e.target.value)} maxLength={2000} />
        <label className="flex items-start gap-3 cursor-pointer min-h-[40px]">
          <input type="checkbox" checked={submitFinal} onChange={(e) => setSubmitFinal(e.target.checked)} className="mt-1 h-4 w-4 accent-[#1c1c1c] shrink-0" />
          <span className="text-body-sm text-ink">Ajukan sebagai final. Tanpa ini penilaian tersimpan sebagai draf.</span>
        </label>
        <Footer onCancel={onClose} busy={busy} label="Simpan Penilaian" />
      </Form>
    </Modal>
  );
}

