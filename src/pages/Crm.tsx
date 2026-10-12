import { useMemo, useState } from 'react';
import { Reveal } from '../components/Reveal';
import { Icon } from '../components/icons/Icon';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field, Input, Select } from '../components/ui/controls';
import { DataTable, RowAction, StatRow, type Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { apiFetch } from '../lib/api';
import { formatDate, formatIDR } from '../lib/format';
import { listOf, useResource } from '../lib/useResource';
import { toast } from '../stores/toastStore';
import { ComplaintModal, ConvertLeadModal, DocumentModal, OpportunityModal, ResolveComplaintModal } from '../components/crm/CrmModals';
import { CustomerHistoryModal } from '../components/crm/CustomerHistoryModal';

type TabKey = 'pipeline' | 'quotation' | 'order' | 'pelanggan' | 'komplain';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'pipeline', label: 'Pipeline & Kutipan' },
  { value: 'quotation', label: 'Penawaran' },
  { value: 'order', label: 'Pesanan' },
  { value: 'pelanggan', label: 'Pelanggan' },
  { value: 'komplain', label: 'Komplain' },
];

interface Lead {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  notes: string;
  createdAt: string;
}

interface Opportunity {
  id: string;
  title: string;
  value: number | string;
  stage: string;
  probability: number;
  expectedCloseDate: string | null;
  customer: { code: string; name: string } | null;
  createdAt: string;
}

interface Quotation {
  id: string;
  number: string;
  status: string;
  total: number | string;
  validUntil: string | null;
  customer: { code: string; name: string } | null;
  opportunity: { id: string; title: string } | null;
  salesOrder: { id: string; number: string; status: string } | null;
  lines: Array<{ id: string; qty: number | string; price: number | string; product: { sku: string; name: string } }>;
}

interface SalesOrder {
  id: string;
  number: string;
  status: string;
  total: number | string;
  customer: { code: string; name: string } | null;
  warehouse: { code: string; name: string } | null;
  quotation: { id: string; number: string } | null;
  lines: Array<{ qty: number | string; price: number | string; product: { sku: string; name: string } }>;
}

interface Complaint {
  id: string;
  title: string;
  status: string;
  description: string;
  resolution: string;
  customer: { code: string; name: string } | null;
  createdAt: string;
}

interface CustomerRow {
  id: string;
  code: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  city: string;
  paymentTermDays: number;
}

const complaintBadge: Record<string, { variant: 'outline' | 'neutral' | 'accent'; label: string }> = {
  open: { variant: 'outline', label: 'Terbuka' },
  in_progress: { variant: 'neutral', label: 'Diproses' },
  resolved: { variant: 'accent', label: 'Selesai' },
};

interface PipelineData {
  byStage: Array<{ stage: string; count: number; value: number }>;
  openCount: number;
  openValue: number;
  weightedValue: number;
  winRatePct: number;
  forecastByMonth: Array<{ month: string; count: number; value: number; weightedValue: number }>;
}

const stageLabel: Record<string, string> = {
  new: 'Baru',
  contacted: 'Dihubungi',
  qualified: 'Lolos',
  lost: 'Hilang',
  prospecting: 'Prospek',
  qualification: 'Kualifikasi',
  proposal: 'Penawaran',
  negotiation: 'Negosiasi',
  closed_won: 'Menang',
  closed_lost: 'Kalah',
};

const quotationBadge: Record<string, { variant: 'outline' | 'neutral' | 'ink' | 'accent'; label: string }> = {
  draft: { variant: 'outline', label: 'Draf' },
  sent: { variant: 'neutral', label: 'Terkirim' },
  accepted: { variant: 'accent', label: 'Diterima' },
  rejected: { variant: 'outline', label: 'Ditolak' },
  expired: { variant: 'outline', label: 'Kedaluwarsa' },
  converted: { variant: 'ink', label: 'Jadi Pesanan' },
};

const orderBadge: Record<string, { variant: 'outline' | 'neutral' | 'ink'; label: string }> = {
  draft: { variant: 'outline', label: 'Draf' },
  confirmed: { variant: 'neutral', label: 'Dikonfirmasi' },
  fulfilled: { variant: 'ink', label: 'Terpenuhi' },
  cancelled: { variant: 'outline', label: 'Dibatalkan' },
};

// 'converted' sengaja tidak ada: prospek menjadi pelanggan lewat konversi (membuat master pelanggan), bukan pindah tahap.
const LEAD_FLOW = ['new', 'contacted', 'qualified'];

export default function Crm() {
  const [tab, setTab] = useState<TabKey>('pipeline');
  const [query, setQuery] = useState('');

  const leads = useResource<Lead[]>('/v1/crm/leads');
  const opportunities = useResource<Opportunity[]>('/v1/crm/opportunities');
  const pipeline = useResource<PipelineData>('/v1/crm/pipeline');
  const quotations = useResource<Quotation[]>('/v1/crm/quotations');
  const orders = useResource<SalesOrder[]>('/v1/crm/sales-orders');
  const complaints = useResource<Complaint[]>('/v1/crm/complaints');
  const customers = useResource<CustomerRow[]>('/v1/parties/customers?isActive=true');

  const [convertTarget, setConvertTarget] = useState<Lead | null>(null);
  const [oppModal, setOppModal] = useState(false);
  const [docModal, setDocModal] = useState<'quotation' | 'order' | null>(null);
  const [complaintModal, setComplaintModal] = useState<{ customerId?: string } | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Complaint | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const [leadModal, setLeadModal] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadContact, setLeadContact] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [saving, setSaving] = useState(false);

  const [stageTarget, setStageTarget] = useState<Lead | null>(null);
  const [nextStage, setNextStage] = useState('');
  const [quotationDetail, setQuotationDetail] = useState<Quotation | null>(null);
  const [orderDetail, setOrderDetail] = useState<SalesOrder | null>(null);

  const leadRows = useMemo(
    () => listOf<Lead>(leads.data).filter((l) => `${l.name} ${l.contactName}`.toLowerCase().includes(query.toLowerCase())),
    [leads.data, query],
  );
  const oppRows = useMemo(
    () =>
      listOf<Opportunity>(opportunities.data).filter((o) =>
        `${o.title} ${o.customer?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [opportunities.data, query],
  );
  const quotationRows = useMemo(
    () =>
      listOf<Quotation>(quotations.data).filter((q) =>
        `${q.number} ${q.customer?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [quotations.data, query],
  );
  const orderRows = useMemo(
    () =>
      listOf<SalesOrder>(orders.data).filter((o) =>
        `${o.number} ${o.customer?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [orders.data, query],
  );
  const complaintRows = listOf<Complaint>(complaints.data);
  const customerRows = useMemo(
    () =>
      listOf<CustomerRow>(customers.data).filter((c) =>
        `${c.code} ${c.name} ${c.contact ?? ''}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [customers.data, query],
  );

  const resetLeadForm = () => {
    setLeadName('');
    setLeadContact('');
    setLeadPhone('');
    setLeadEmail('');
    setLeadSource('');
  };

  async function createLead() {
    if (leadName.trim().length < 2) {
      toast({ title: 'Nama prospek wajib diisi.', icon: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/v1/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          name: leadName.trim(),
          contactName: leadContact.trim(),
          phone: leadPhone.trim(),
          email: leadEmail.trim(),
          source: leadSource.trim(),
        }),
      });
      toast({ title: 'Prospek ditambahkan.', icon: 'check' });
      setLeadModal(false);
      resetLeadForm();
      leads.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function moveLeadStage(lead: Lead, status: string) {
    try {
      await apiFetch(`/v1/crm/leads/${lead.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      toast({ title: `Prospek dipindahkan ke ${stageLabel[status] ?? status}.`, icon: 'check' });
      setStageTarget(null);
      leads.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal memindahkan tahap.', icon: 'warning' });
    }
  }

  async function moveOpportunityStage(opp: Opportunity, stage: string) {
    try {
      await apiFetch(`/v1/crm/opportunities/${opp.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage }),
      });
      toast({ title: `Deal dipindahkan ke ${stageLabel[stage] ?? stage}.`, icon: 'check' });
      opportunities.reload();
      pipeline.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal memindahkan tahap.', icon: 'warning' });
    }
  }

  async function moveQuotationStatus(quotation: Quotation, status: string) {
    try {
      await apiFetch(`/v1/crm/quotations/${quotation.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      toast({ title: `Penawaran ${status === 'accepted' ? 'diterima' : status}.`, icon: 'check' });
      setQuotationDetail(null);
      quotations.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mengubah status.', icon: 'warning' });
    }
  }

  async function convertQuotation(quotation: Quotation) {
    try {
      const result = await apiFetch<{ number: string }>(`/v1/crm/quotations/${quotation.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast({ title: `Pesanan ${result.number} dibuat dari penawaran.`, icon: 'check' });
      setQuotationDetail(null);
      quotations.reload();
      orders.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal membuat pesanan.', icon: 'warning' });
    }
  }

  async function fulfilOrder(order: SalesOrder) {
    try {
      await apiFetch(`/v1/crm/sales-orders/${order.id}/fulfil`, { method: 'POST', body: JSON.stringify({}) });
      toast({ title: `Pesanan ${order.number} dipenuhi.`, icon: 'check' });
      setOrderDetail(null);
      orders.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal memenuhi pesanan.', icon: 'warning' });
    }
  }

  const leadColumns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Prospek',
      render: (l) => (
        <>
          <p className="text-[15px] text-ink font-medium">{l.name}</p>
          <p className="text-caption text-fossil">{l.contactName || l.source || '-'}</p>
        </>
      ),
    },
    {
      key: 'contact',
      header: 'Kontak',
      render: (l) => (
        <>
          {l.email && <p className="text-body-sm text-ink truncate">{l.email}</p>}
          {l.phone && <p className="text-caption text-fossil tnum">{l.phone}</p>}
          {!l.email && !l.phone && <span className="text-pebble">-</span>}
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (l) => (
        <Badge variant={l.status === 'converted' ? 'ink' : l.status === 'lost' ? 'outline' : 'neutral'}>
          {stageLabel[l.status] ?? l.status}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Dibuat',
      align: 'right',
      render: (l) => <span className="text-caption text-fossil">{formatDate(l.createdAt)}</span>,
    },
  ];

  const oppColumns: Column<Opportunity>[] = [
    {
      key: 'title',
      header: 'Deal',
      render: (o) => (
        <>
          <p className="text-[15px] text-ink font-medium">{o.title}</p>
          <p className="text-caption text-fossil">{o.customer?.name ?? 'Belum ada pelanggan'}</p>
        </>
      ),
    },
    {
      key: 'value',
      header: 'Nilai',
      align: 'right',
      render: (o) => <span className="tnum text-[15px] text-ink">{formatIDR(Number(o.value))}</span>,
    },
    {
      key: 'stage',
      header: 'Tahap',
      render: (o) => (
        <Select
          value={o.stage}
          onChange={(e) => moveOpportunityStage(o, e.target.value)}
          className="!py-1 !px-2 !text-body-sm w-auto min-w-[150px]"
          aria-label={`Tahap ${o.title}`}
        >
          {Object.keys(stageLabel)
            .filter((s) => ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'].includes(s))
            .map((s) => (
              <option key={s} value={s}>
                {stageLabel[s]}
              </option>
            ))}
        </Select>
      ),
    },
    {
      key: 'prob',
      header: 'Peluang',
      align: 'right',
      render: (o) => <span className="tnum text-body-sm text-fossil">{o.probability}%</span>,
    },
  ];

  const quotationColumns: Column<Quotation>[] = [
    {
      key: 'number',
      header: 'Penawaran',
      render: (q) => (
        <>
          <p className="text-[15px] text-ink font-medium tnum">{q.number}</p>
          <p className="text-caption text-fossil">{q.customer?.name ?? 'Tanpa pelanggan'}</p>
        </>
      ),
    },
    {
      key: 'total',
      header: 'Nilai',
      align: 'right',
      render: (q) => <span className="tnum text-[15px] text-ink">{formatIDR(Number(q.total))}</span>,
    },
    {
      key: 'valid',
      header: 'Berlaku s.d.',
      align: 'right',
      render: (q) => <span className="text-caption text-fossil">{q.validUntil ? formatDate(q.validUntil) : '-'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (q) => {
        const badge = quotationBadge[q.status] ?? { variant: 'outline' as const, label: q.status };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
  ];

  const orderColumns: Column<SalesOrder>[] = [
    {
      key: 'number',
      header: 'Pesanan',
      render: (o) => (
        <>
          <p className="text-[15px] text-ink font-medium tnum">{o.number}</p>
          <p className="text-caption text-fossil">
            {o.customer?.name ?? '-'}
            {o.quotation ? ` · dari ${o.quotation.number}` : ''}
          </p>
        </>
      ),
    },
    {
      key: 'total',
      header: 'Nilai',
      align: 'right',
      render: (o) => <span className="tnum text-[15px] text-ink">{formatIDR(Number(o.total))}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => {
        const badge = orderBadge[o.status] ?? { variant: 'outline' as const, label: o.status };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
  ];

  const complaintColumns: Column<Complaint>[] = [
    {
      key: 'title',
      header: 'Komplain',
      render: (c) => (
        <>
          <p className="text-[15px] text-ink font-medium break-words">{c.title}</p>
          <p className="text-caption text-fossil">{c.customer?.name ?? '-'}</p>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const badge = complaintBadge[c.status] ?? { variant: 'outline' as const, label: c.status };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      key: 'created',
      header: 'Masuk',
      align: 'right',
      render: (c) => <span className="text-caption text-fossil">{formatDate(c.createdAt)}</span>,
    },
  ];

  const customerColumns: Column<CustomerRow>[] = [
    {
      key: 'name',
      header: 'Pelanggan',
      render: (c) => (
        <>
          <p className="text-[15px] text-ink font-medium break-words">{c.name}</p>
          <p className="text-caption text-fossil tnum">{c.code}</p>
        </>
      ),
    },
    {
      key: 'contact',
      header: 'Kontak',
      render: (c) => (
        <>
          {c.contact && <p className="text-body-sm text-ink truncate">{c.contact}</p>}
          {c.phone && <p className="text-caption text-fossil tnum">{c.phone}</p>}
          {!c.contact && !c.phone && <span className="text-pebble">-</span>}
        </>
      ),
    },
    { key: 'city', header: 'Kota', hideOnMobile: true, render: (c) => <span className="text-body-sm text-fossil">{c.city || '-'}</span> },
    {
      key: 'terms',
      header: 'Tempo',
      align: 'right',
      render: (c) => <span className="tnum text-body-sm text-fossil">{c.paymentTermDays ? `${c.paymentTermDays} hari` : 'Tunai'}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Penjualan & CRM"
        subtitle="Prospek, deal, penawaran sampai pesanan"
        actions={
          tab === 'quotation' ? (
            <Button variant="primary" icon="plus" full onClick={() => setDocModal('quotation')}>
              Penawaran Baru
            </Button>
          ) : tab === 'order' ? (
            <Button variant="primary" icon="plus" full onClick={() => setDocModal('order')}>
              Pesanan Baru
            </Button>
          ) : tab === 'komplain' ? (
            <Button variant="primary" icon="plus" full onClick={() => setComplaintModal({})}>
              Catat Komplain
            </Button>
          ) : tab === 'pelanggan' ? undefined : (
            <>
              <Button variant="ghost" icon="target" onClick={() => setOppModal(true)}>
                Tambah Deal
              </Button>
              <Button variant="primary" icon="plus" onClick={() => setLeadModal(true)}>
                Tambah Prospek
              </Button>
            </>
          )
        }
      />

      <StatRow
        items={[
          { label: 'Deal terbuka', value: pipeline.data?.openCount ?? '-' },
          { label: 'Nilai terbuka', value: formatIDR(pipeline.data?.openValue ?? 0) },
          { label: 'Nilai berbobot', value: formatIDR(pipeline.data?.weightedValue ?? 0) },
          { label: 'Tingkat menang', value: `${pipeline.data?.winRatePct ?? 0}%`, tone: 'accent' },
        ]}
      />

      <Tabs options={tabOptions} value={tab} onChange={setTab} />

      <Reveal>
        <div className="relative">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, nomor, atau pelanggan…"
            className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-3 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
          />
        </div>
      </Reveal>

      {tab === 'pipeline' && (
        <div className="space-y-5">
          <DataTable
            rows={leadRows}
            columns={leadColumns}
            rowKey={(l) => l.id}
            loading={leads.loading}
            error={leads.error}
            onRetry={leads.reload}
            emptyIcon="users"
            emptyTitle="Belum ada prospek"
            emptyBody="Tambahkan prospek pertama untuk memulai pipeline."
            emptyAction={
              <Button variant="ghost" icon="plus" onClick={() => setLeadModal(true)}>
                Tambah Prospek
              </Button>
            }
            rowActions={(l) => {
              if (l.status === 'converted' || l.status === 'lost') return null;
              if (l.status === 'qualified') {
                return (
                  <>
                    <RowAction icon="users" label={`Jadikan ${l.name} pelanggan`} tone="primary" onClick={() => setConvertTarget(l)} />
                    <RowAction
                      icon="close"
                      label={`Tandai ${l.name} hilang`}
                      tone="danger"
                      onClick={() => {
                        setNextStage('');
                        setStageTarget(l);
                      }}
                    />
                  </>
                );
              }
              return (
                <RowAction
                  icon="arrow-right"
                  label={`Tahap berikutnya untuk ${l.name}`}
                  onClick={() => {
                    const idx = LEAD_FLOW.indexOf(l.status);
                    setNextStage(LEAD_FLOW[Math.min(idx + 1, LEAD_FLOW.length - 1)] ?? 'contacted');
                    setStageTarget(l);
                  }}
                />
              );
            }}
          />

          <DataTable
            rows={oppRows}
            columns={oppColumns}
            rowKey={(o) => o.id}
            loading={opportunities.loading}
            error={opportunities.error}
            onRetry={opportunities.reload}
            emptyIcon="target"
            emptyTitle="Belum ada deal"
            emptyBody="Tambahkan deal untuk melacak nilai dan peluang closing."
          />
        </div>
      )}

      {tab === 'quotation' && (
        <DataTable
          rows={quotationRows}
          columns={quotationColumns}
          rowKey={(q) => q.id}
          loading={quotations.loading}
          error={quotations.error}
          onRetry={quotations.reload}
          emptyIcon="document"
          emptyTitle="Belum ada penawaran"
          emptyBody="Buat penawaran untuk pelanggan, lalu ubah jadi pesanan saat disetujui."
          emptyAction={
            <Button variant="ghost" icon="plus" onClick={() => setDocModal('quotation')}>
              Penawaran Baru
            </Button>
          }
          onRowClick={(q) => setQuotationDetail(q)}
        />
      )}

      {tab === 'order' && (
        <DataTable
          rows={orderRows}
          columns={orderColumns}
          rowKey={(o) => o.id}
          loading={orders.loading}
          error={orders.error}
          onRetry={orders.reload}
          emptyIcon="receipt"
          emptyTitle="Belum ada pesanan"
          emptyBody="Pesanan terbit dari penawaran yang diterima, atau dibuat langsung."
          emptyAction={
            <Button variant="ghost" icon="plus" onClick={() => setDocModal('order')}>
              Pesanan Baru
            </Button>
          }
          onRowClick={(o) => setOrderDetail(o)}
        />
      )}

      {tab === 'komplain' && (
        <DataTable
          rows={complaintRows}
          columns={complaintColumns}
          rowKey={(c) => c.id}
          loading={complaints.loading}
          error={complaints.error}
          onRetry={complaints.reload}
          emptyIcon="chat"
          emptyTitle="Belum ada komplain"
          emptyBody="Komplain pelanggan akan muncul di sini beserta status penyelesaiannya."
          rowActions={(c) =>
            c.status === 'resolved' ? null : <RowAction icon="check" label={`Selesaikan komplain ${c.title}`} tone="primary" onClick={() => setResolveTarget(c)} />
          }
        />
      )}

      {tab === 'pelanggan' && (
        <DataTable
          rows={customerRows}
          columns={customerColumns}
          rowKey={(c) => c.id}
          loading={customers.loading}
          error={customers.error}
          onRetry={customers.reload}
          emptyIcon="users"
          emptyTitle="Belum ada pelanggan"
          emptyBody="Pelanggan terbentuk dari konversi prospek atau dari master pelanggan di Pengadaan."
          onRowClick={(c) => setHistoryId(c.id)}
          rowActions={(c) => <RowAction icon="clock" label={`Riwayat ${c.name}`} onClick={() => setHistoryId(c.id)} />}
        />
      )}

      <Modal open={leadModal} onClose={() => setLeadModal(false)} title="Tambah Prospek" maxWidth="md">
        <div className="space-y-4">
          <Field label="Nama Prospek">
            <Input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="PT Contoh Niaga" />
          </Field>
          <Field label="Nama Narahubung">
            <Input value={leadContact} onChange={(e) => setLeadContact(e.target.value)} placeholder="Budi Santoso" />
          </Field>
          <Field label="Email">
            <Input type="email" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} placeholder="budi@contoh.id" />
          </Field>
          <Field label="Telepon">
            <Input value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} placeholder="08123456789" />
          </Field>
          <Field label="Sumber" hint="Dari mana prospek ini berasal">
            <Input value={leadSource} onChange={(e) => setLeadSource(e.target.value)} placeholder="Iklan, referral, pameran" />
          </Field>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" full onClick={() => setLeadModal(false)}>
              Batal
            </Button>
            <Button variant="primary" full disabled={saving} onClick={createLead}>
              {saving ? 'Menyimpan…' : 'Simpan Prospek'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={stageTarget !== null}
        onClose={() => setStageTarget(null)}
        title="Pindahkan Tahap Prospek"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-body-sm text-fossil">
            Tahap saat ini <strong className="text-ink">{stageLabel[stageTarget?.status ?? ''] ?? '-'}</strong>.
            Lompatan tahap tidak diperbolehkan agar laporan pipeline tetap jujur.
          </p>
          <div className="flex gap-2">
            {nextStage && (
              <Button variant="primary" full onClick={() => stageTarget && moveLeadStage(stageTarget, nextStage)}>
                Ke {stageLabel[nextStage] ?? nextStage}
              </Button>
            )}
            <Button
              variant="ghost"
              full={!nextStage}
              onClick={() => stageTarget && moveLeadStage(stageTarget, 'lost')}
            >
              Tandai Hilang
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={quotationDetail !== null}
        onClose={() => setQuotationDetail(null)}
        title={quotationDetail ? `Penawaran ${quotationDetail.number}` : ''}
        maxWidth="lg"
      >
        {quotationDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-body-sm">
              <div>
                <p className="text-caption text-fossil">Pelanggan</p>
                <p className="text-ink">{quotationDetail.customer?.name ?? '-'}</p>
              </div>
              <div>
                <p className="text-caption text-fossil">Total</p>
                <p className="text-ink tnum">{formatIDR(Number(quotationDetail.total))}</p>
              </div>
            </div>

            <Card className="overflow-hidden">
              <ul className="divide-y divide-sand">
                {quotationDetail.lines.map((line) => (
                  <li key={line.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-ink break-words">{line.product.name}</p>
                      <p className="text-caption text-fossil tnum">{line.product.sku}</p>
                      <p className="text-caption text-fossil tnum mt-0.5">
                        {Number(line.qty)} × {formatIDR(Number(line.price))}
                      </p>
                    </div>
                    <p className="shrink-0 text-right tnum text-[15px] text-ink">
                      {formatIDR(Number(line.qty) * Number(line.price))}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="flex flex-wrap gap-2">
              {quotationDetail.status === 'draft' && (
                <Button variant="ghost" onClick={() => moveQuotationStatus(quotationDetail, 'sent')}>
                  Tandai Terkirim
                </Button>
              )}
              {quotationDetail.status === 'sent' && (
                <>
                  <Button variant="ghost" onClick={() => moveQuotationStatus(quotationDetail, 'rejected')}>
                    Tolak
                  </Button>
                  <Button variant="primary" onClick={() => moveQuotationStatus(quotationDetail, 'accepted')}>
                    Terima Penawaran
                  </Button>
                </>
              )}
              {quotationDetail.status === 'accepted' && (
                <Button variant="primary" icon="arrow-right" onClick={() => convertQuotation(quotationDetail)}>
                  Jadikan Pesanan
                </Button>
              )}
              {quotationDetail.salesOrder && (
                <Badge variant="ink">Sudah jadi {quotationDetail.salesOrder.number}</Badge>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={orderDetail !== null} onClose={() => setOrderDetail(null)} title={orderDetail ? `Pesanan ${orderDetail.number}` : ''} maxWidth="lg">
        {orderDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-body-sm">
              <div>
                <p className="text-caption text-fossil">Pelanggan</p>
                <p className="text-ink">{orderDetail.customer?.name ?? '-'}</p>
              </div>
              <div>
                <p className="text-caption text-fossil">Gudang</p>
                <p className="text-ink">{orderDetail.warehouse?.name ?? '-'}</p>
              </div>
            </div>

            <Card className="overflow-hidden">
              <ul className="divide-y divide-sand">
                {orderDetail.lines.map((line, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-ink break-words">{line.product.name}</p>
                      <p className="text-caption text-fossil tnum">{line.product.sku}</p>
                      <p className="text-caption text-fossil tnum mt-0.5">
                        {Number(line.qty)} × {formatIDR(Number(line.price))}
                      </p>
                    </div>
                    <p className="shrink-0 text-right tnum text-[15px] text-ink">
                      {formatIDR(Number(line.qty) * Number(line.price))}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="flex flex-wrap gap-2">
              {orderDetail.status === 'confirmed' && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      apiFetch(`/v1/crm/sales-orders/${orderDetail.id}/cancel`, {
                        method: 'POST',
                        body: JSON.stringify({}),
                      })
                        .then(() => {
                          toast({ title: 'Pesanan dibatalkan.', icon: 'check' });
                          setOrderDetail(null);
                          orders.reload();
                        })
                        .catch((e: Error) => toast({ title: e.message, icon: 'warning' }))
                    }
                  >
                    Batalkan
                  </Button>
                  <Button variant="primary" icon="inventory" onClick={() => fulfilOrder(orderDetail)}>
                    Penuhi dari Stok
                  </Button>
                </>
              )}
              {orderDetail.status === 'draft' && (
                <Button
                  variant="primary"
                  onClick={() =>
                    apiFetch(`/v1/crm/sales-orders/${orderDetail.id}/confirm`, {
                      method: 'POST',
                      body: JSON.stringify({}),
                    })
                      .then(() => {
                        toast({ title: 'Pesanan dikonfirmasi.', icon: 'check' });
                        setOrderDetail(null);
                        orders.reload();
                      })
                      .catch((e: Error) => toast({ title: e.message, icon: 'warning' }))
                  }
                >
                  Konfirmasi Pesanan
                </Button>
              )}
              {orderDetail.status === 'fulfilled' && (
                <p className="text-body-sm text-fossil">
                  Stok sudah berkurang dan jurnal penjualan telah dibuat.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConvertLeadModal
        lead={convertTarget}
        onClose={() => setConvertTarget(null)}
        onDone={() => {
          setConvertTarget(null);
          leads.reload();
          customers.reload();
        }}
      />
      <OpportunityModal
        open={oppModal}
        onClose={() => setOppModal(false)}
        onDone={() => {
          setOppModal(false);
          opportunities.reload();
          pipeline.reload();
        }}
      />
      <DocumentModal
        mode={docModal ?? 'quotation'}
        open={docModal !== null}
        onClose={() => setDocModal(null)}
        onDone={() => {
          const mode = docModal;
          setDocModal(null);
          if (mode === 'order') orders.reload();
          else quotations.reload();
        }}
      />
      <ComplaintModal
        open={complaintModal !== null}
        customerId={complaintModal?.customerId}
        onClose={() => setComplaintModal(null)}
        onDone={() => {
          setComplaintModal(null);
          complaints.reload();
        }}
      />
      <ResolveComplaintModal
        complaint={resolveTarget}
        onClose={() => setResolveTarget(null)}
        onDone={() => {
          setResolveTarget(null);
          complaints.reload();
        }}
      />
      <CustomerHistoryModal
        customerId={historyId}
        onClose={() => setHistoryId(null)}
        onAddComplaint={(customerId) => {
          setHistoryId(null);
          setComplaintModal({ customerId });
        }}
      />
    </div>
  );
}
