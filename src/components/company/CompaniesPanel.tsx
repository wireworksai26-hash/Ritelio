import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Field, Input, Select } from '../ui/controls';
import { DataTable, type Column } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { listOf, useResource } from '../../lib/useResource';
import { toast } from '../../stores/toastStore';
import { CompanySwitcher, type CompanyOption } from './CompanySwitcher';

interface Company extends CompanyOption {
  legalName: string | null;
  taxId: string | null;
  countryCode: string;
  isActive: boolean;
  parent: { id: string; code: string; name: string } | null;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

interface ExchangeRate {
  id: string;
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  rate: number | string;
  effectiveDate: string;
  source: string;
}

const todayDate = () => new Date().toISOString().slice(0, 10);

const rateFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 8 });

export function CompaniesPanel() {
  const companies = useResource<Company[]>('/v1/companies');
  const currencies = useResource<Currency[]>('/v1/companies/currencies');
  const companyRows = useMemo(() => listOf<Company>(companies.data), [companies.data]);
  const currencyRows = useMemo(() => listOf<Currency>(currencies.data), [currencies.data]);

  const [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    if (!selectedId && companyRows.length > 0) setSelectedId(companyRows[0].id);
  }, [companyRows, selectedId]);

  const rates = useResource<ExchangeRate[]>(selectedId ? `/v1/companies/${selectedId}/exchange-rates` : null);
  const rateRows = useMemo(() => listOf<ExchangeRate>(rates.data), [rates.data]);

  const [companyModal, setCompanyModal] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [currency, setCurrency] = useState('IDR');
  const [parentId, setParentId] = useState('');
  const [saving, setSaving] = useState(false);

  const [rateModal, setRateModal] = useState(false);
  const [base, setBase] = useState('USD');
  const [quote, setQuote] = useState('IDR');
  const [rate, setRate] = useState('');
  const [effective, setEffective] = useState(todayDate());

  async function createCompany() {
    if (code.trim().length < 2 || name.trim().length < 2) {
      toast({ title: 'Kode dan nama perusahaan wajib diisi.', icon: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/v1/companies', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          defaultCurrencyCode: currency,
          ...(legalName.trim() ? { legalName: legalName.trim() } : {}),
          ...(taxId.trim() ? { taxId: taxId.trim() } : {}),
          ...(parentId ? { parentId } : {}),
        }),
      });
      toast({ title: 'Perusahaan ditambahkan.', icon: 'check' });
      setCompanyModal(false);
      setCode('');
      setName('');
      setLegalName('');
      setTaxId('');
      setParentId('');
      companies.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function saveRate() {
    const value = Number(rate.replace(',', '.'));
    if (!selectedId || !Number.isFinite(value) || value <= 0) {
      toast({ title: 'Isi kurs dengan angka lebih dari 0.', icon: 'warning' });
      return;
    }
    if (base === quote) {
      toast({ title: 'Mata uang asal dan tujuan harus berbeda.', icon: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/v1/companies/${selectedId}/exchange-rates`, {
        method: 'POST',
        body: JSON.stringify({
          baseCurrencyCode: base,
          quoteCurrencyCode: quote,
          rate: value,
          effectiveDate: effective,
        }),
      });
      toast({ title: 'Kurs disimpan.', icon: 'check' });
      setRateModal(false);
      setRate('');
      rates.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan kurs.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  const companyColumns: Column<Company>[] = [
    {
      key: 'name',
      header: 'Perusahaan',
      render: (c) => (
        <div className="min-w-0">
          <p className="text-ink truncate">{c.name}</p>
          <p className="text-caption text-fossil">{c.code}</p>
        </div>
      ),
    },
    { key: 'currency', header: 'Mata uang', render: (c) => <span className="tnum">{c.defaultCurrencyCode}</span> },
    { key: 'parent', header: 'Induk', render: (c) => c.parent?.name ?? '-' },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge variant={c.isActive ? 'accent' : 'outline'}>{c.isActive ? 'Aktif' : 'Nonaktif'}</Badge>,
    },
  ];

  const rateColumns: Column<ExchangeRate>[] = [
    {
      key: 'pair',
      header: 'Pasangan',
      render: (r) => (
        <span className="text-ink">
          {r.baseCurrencyCode} / {r.quoteCurrencyCode}
        </span>
      ),
    },
    { key: 'rate', header: 'Kurs', align: 'right', render: (r) => <span className="tnum">{rateFormatter.format(Number(r.rate))}</span> },
    { key: 'date', header: 'Berlaku', render: (r) => formatDate(r.effectiveDate) },
    { key: 'source', header: 'Sumber', hideOnMobile: true, render: (r) => (r.source === 'manual' ? 'Manual' : r.source) },
  ];

  return (
    <Card>
      <CardHeader
        title="Perusahaan & Kurs"
        subtitle="Entitas akuntansi dalam satu grup usaha dan kurs mata uang yang dipakai laporan konsolidasi."
        action={
          <Button size="sm" icon="plus" onClick={() => setCompanyModal(true)}>
            Perusahaan
          </Button>
        }
      />
      <CardBody className="space-y-5">
        <DataTable
          rows={companyRows}
          columns={companyColumns}
          rowKey={(c) => c.id}
          loading={companies.loading}
          error={companies.error}
          onRetry={companies.reload}
          emptyIcon="building"
          emptyTitle="Belum ada perusahaan"
          emptyBody="Tambahkan anak perusahaan atau cabang untuk laporan konsolidasi."
        />

        <p className="text-caption text-fossil">
          Perusahaan aktif dipilih dari bilah atas dan berlaku untuk semua modul. Laporan konsolidasi tetap membaca
          semua perusahaan sekaligus.
        </p>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <CompanySwitcher companies={companyRows} value={selectedId} onChange={setSelectedId} label="Kurs untuk perusahaan" />
            </div>
            <Button variant="ghost" icon="plus" disabled={!selectedId} onClick={() => setRateModal(true)}>
              Atur kurs
            </Button>
          </div>
          {selectedId && (
            <DataTable
              rows={rateRows}
              columns={rateColumns}
              rowKey={(r) => r.id}
              loading={rates.loading}
              error={rates.error}
              onRetry={rates.reload}
              emptyIcon="globe"
              emptyTitle="Belum ada kurs"
              emptyBody="Kurs dibutuhkan agar laporan bisa digabung lintas mata uang."
            />
          )}
        </div>
      </CardBody>

      <Modal open={companyModal} onClose={() => setCompanyModal(false)} title="Tambah Perusahaan" maxWidth="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Kode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. CAB-SBY" />
          <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Nama hukum (opsional)" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          <Input label="NPWP (opsional)" value={taxId} onChange={(e) => setTaxId(e.target.value)} inputMode="numeric" />
          <Select label="Mata uang utama" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencyRows.length === 0 && <option value="IDR">IDR</option>}
            {currencyRows.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
          <Select label="Perusahaan induk" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Tidak ada</option>
            {companyRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-caption text-fossil mt-3">Bagan akun disalin dari perusahaan utama dan bisa diubah terpisah.</p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={() => setCompanyModal(false)}>
            Batal
          </Button>
          <Button onClick={createCompany} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </Modal>

      <Modal open={rateModal} onClose={() => setRateModal(false)} title="Atur Kurs" maxWidth="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Mata uang asal" value={base} onChange={(e) => setBase(e.target.value)}>
            {currencyRows.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
          <Select label="Mata uang tujuan" value={quote} onChange={(e) => setQuote(e.target.value)}>
            {currencyRows.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
          <Input
            label={`Kurs (1 ${base} = … ${quote})`}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="mis. 16250"
          />
          <Field label="Berlaku mulai">
            <input
              type="date"
              value={effective}
              onChange={(e) => setEffective(e.target.value)}
              className="w-full bg-paper border border-pebble/70 rounded-lg px-3 py-2.5 text-[16px] sm:text-[15px] text-ink focus:border-ink focus:outline-none"
            />
          </Field>
        </div>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={() => setRateModal(false)}>
            Batal
          </Button>
          <Button onClick={saveRate} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan kurs'}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
