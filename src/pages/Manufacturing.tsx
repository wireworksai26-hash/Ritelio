import { useMemo, useState } from 'react';
import { Reveal } from '../components/Reveal';
import { Icon } from '../components/icons/Icon';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field, Input, Select } from '../components/ui/controls';
import { DataTable, RowAction, StatRow, type Column } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { apiFetch } from '../lib/api';
import { formatDate, formatIDR, formatNumber } from '../lib/format';
import { listOf, useMutation, useResource } from '../lib/useResource';
import { toast } from '../stores/toastStore';
import { BomDetailModal, BomFormModal } from '../components/manufacturing/BomModals';
import { MrpResult, type MrpData } from '../components/manufacturing/MrpResult';
import { QcProgressList, QcStagesModal } from '../components/manufacturing/QcModals';

type TabKey = 'bom' | 'mrp' | 'produksi' | 'mesin' | 'qc';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'bom', label: 'Bill of Materials' },
  { value: 'mrp', label: 'MRP' },
  { value: 'produksi', label: 'Produksi' },
  { value: 'mesin', label: 'Mesin & Jadwal' },
  { value: 'qc', label: 'Mutu' },
];

interface Bom {
  id: string;
  name?: string;
  version: number;
  outputQty: number | string;
  isActive: boolean;
  product: { sku: string; name: string; unit: string };
  lines: Array<{ id: string; qtyRequired: number | string; scrapPercent: number | string; product: { sku: string; name: string; unit: string } }>;
}

interface ProductionOrder {
  id: string;
  number: string;
  status: string;
  qtyPlanned: number | string;
  qtyProduced: number | string;
  materialCost: number | string;
  priority: number;
  scheduledDate: string | null;
  product: { sku: string; name: string; unit: string };
  subOrders?: Array<{ number: string; product: { name: string } }>;
}

interface WorkCenter {
  id: string;
  code: string;
  name: string;
  kind: string;
  capacityMinutes: number;
  hourlyRate: number | string;
  isActive: boolean;
  _count: { schedules: number };
}

interface Schedule {
  id: string;
  scheduledDate: string;
  startMinutes: number;
  durationMinutes: number;
  status: string;
  productionOrder: { number: string };
}

interface CapacityPlan {
  workCenter: { id: string; code: string; name: string; kind: string };
  availableMinutes: number;
  bookedMinutes: number;
  utilizationPct: number;
  estimatedLaborCost: number;
  schedule: Schedule[];
}

interface QcProgress {
  steps: Array<{ stage: string; result: string }>;
  pending: number;
  failed: number;
  readyToComplete: boolean;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  unit: string;
  sellPrice: number | string;
  costPrice: number | string;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

const statusBadge: Record<string, { variant: 'accent' | 'neutral' | 'outline' | 'ink'; label: string }> = {
  planned: { variant: 'outline', label: 'Direncanakan' },
  released: { variant: 'neutral', label: 'Dilepas' },
  in_progress: { variant: 'neutral', label: 'Berjalan' },
  completed: { variant: 'accent', label: 'Selesai' },
  cancelled: { variant: 'outline', label: 'Dibatalkan' },
};

const qcStageLabel: Record<string, string> = {
  incoming: 'Bahan Masuk',
  in_process: 'Proses',
  final: 'Akhir',
};

export default function Manufacturing() {
  const [tab, setTab] = useState<TabKey>('bom');

  const products = useResource<Product[]>('/v1/inventory/products?isActive=true&limit=100');
  const boms = useResource<Bom[]>('/v1/manufacturing/boms');
  const orders = useResource<ProductionOrder[]>('/v1/manufacturing/orders');
  const workCenters = useResource<WorkCenter[]>('/v1/manufacturing/work-centers');

  const today = new Date().toISOString().slice(0, 10);
  const capacity = useResource<CapacityPlan[]>(`/v1/manufacturing/capacity-plan?from=${today}&to=${today}`);
  const proposal = useResource<{ proposals: Array<{ orderNumber: string; product: string; workCenterCode: string; date: string }>; unplaceable: string[] }>(
    `/v1/manufacturing/schedule/proposal?from=${today}&days=7`,
  );

  const [orderModal, setOrderModal] = useState(false);
  const [orderProduct, setOrderProduct] = useState('');
  const [orderWarehouse, setOrderWarehouse] = useState('');
  const [orderQty, setOrderQty] = useState('10');
  const [orderPriority, setOrderPriority] = useState('5');

  const [wcModal, setWcModal] = useState(false);
  const [wcCode, setWcCode] = useState('');
  const [wcName, setWcName] = useState('');
  const [wcMinutes, setWcMinutes] = useState('480');
  const [wcRate, setWcRate] = useState('150000');

  const [scheduleModal, setScheduleModal] = useState<ProductionOrder | null>(null);
  const [scheduleCenter, setScheduleCenter] = useState('');
  const [scheduleDuration, setScheduleDuration] = useState('120');

  const [qcModal, setQcModal] = useState<ProductionOrder | null>(null);
  const [qcStage, setQcStage] = useState<'incoming' | 'in_process' | 'final'>('in_process');
  const [qcChecked, setQcChecked] = useState('10');
  const [qcDefect, setQcDefect] = useState('0');

  const [mrpProduct, setMrpProduct] = useState('');
  const [mrpQty, setMrpQty] = useState('100');
  const mrp = useResource<MrpData>(mrpProduct ? `/v1/manufacturing/mrp?productId=${mrpProduct}&qty=${mrpQty}` : null);

  const [bomModal, setBomModal] = useState(false);
  const [bomDetail, setBomDetail] = useState<Bom | null>(null);
  const [qcCfgModal, setQcCfgModal] = useState(false);
  const [qcProgress, setQcProgress] = useState<QcProgress | null>(null);
  const [completeTarget, setCompleteTarget] = useState<ProductionOrder | null>(null);
  const [completeQty, setCompleteQty] = useState('');
  const [cancelTarget, setCancelTarget] = useState<ProductionOrder | null>(null);
  const [scheduleOrderId, setScheduleOrderId] = useState('');

  const mutation = useMutation();

  const productRows = listOf<Product>(products.data);
  const bomRows = listOf<Bom>(boms.data);
  const orderRows = listOf<ProductionOrder>(orders.data);
  const wcRows = listOf<WorkCenter>(workCenters.data);

  const warehouses = useResource<Warehouse[]>('/v1/inventory/warehouses');
  const warehouseRows = listOf<Warehouse>(warehouses.data);

  const totalPlanned = orderRows
    .filter((o) => o.status === 'planned' || o.status === 'released')
    .reduce((s, o) => s + Number(o.qtyPlanned), 0);

  async function createOrder() {
    if (!orderProduct || !orderWarehouse) {
      toast({ title: 'Produk dan gudang wajib dipilih.', icon: 'warning' });
      return;
    }
    const result = await mutation.run(() =>
      apiFetch<ProductionOrder>('/v1/manufacturing/orders', {
        method: 'POST',
        body: JSON.stringify({
          productId: orderProduct,
          warehouseId: orderWarehouse,
          qtyPlanned: Number(orderQty) || 1,
          priority: Number(orderPriority) || 5,
        }),
      }),
    );
    if (result) {
      toast({ title: `Order ${result.number} dibuat.`, icon: 'check' });
      setOrderModal(false);
      setOrderQty('10');
      orders.reload();
    }
  }

  async function createWorkCenter() {
    if (wcCode.trim().length < 2 || wcName.trim().length < 2) {
      toast({ title: 'Kode dan nama mesin wajib diisi.', icon: 'warning' });
      return;
    }
    const result = await mutation.run(() =>
      apiFetch('/v1/manufacturing/work-centers', {
        method: 'POST',
        body: JSON.stringify({
          code: wcCode.trim(),
          name: wcName.trim(),
          capacityMinutes: Number(wcMinutes) || 480,
          hourlyRate: Number(wcRate) || 0,
        }),
      }),
    );
    if (result) {
      toast({ title: 'Work center ditambahkan.', icon: 'check' });
      setWcModal(false);
      setWcCode('');
      setWcName('');
      workCenters.reload();
      capacity.reload();
    }
  }

  async function releaseOrder(order: ProductionOrder, multiLevel = false) {
    const path = multiLevel
      ? `/v1/manufacturing/orders/${order.id}/release-multi-level`
      : `/v1/manufacturing/orders/${order.id}/release`;
    const result = await mutation.run(() => apiFetch(path, { method: 'POST', body: JSON.stringify({}) }));
    if (result) {
      const subs = (result as { subOrderIds?: string[] }).subOrderIds;
      toast({
        title: `Order ${order.number} dilepas.`,
        description: subs?.length ? `${subs.length} sub-order diproduksi lebih dulu.` : undefined,
        icon: 'check',
      });
      orders.reload();
    }
  }

  function askComplete(order: ProductionOrder) {
    setCompleteTarget(order);
    setCompleteQty(String(Number(order.qtyPlanned)));
  }

  async function completeOrder() {
    if (!completeTarget) return;
    const qty = Number(completeQty.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: 'Jumlah hasil harus lebih dari 0.', icon: 'warning' });
      return;
    }
    const result = await mutation.run(() =>
      apiFetch(`/v1/manufacturing/orders/${completeTarget.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ qtyProduced: Math.round(qty * 100) / 100 }),
      }),
    );
    if (result) {
      toast({ title: `Order ${completeTarget.number} selesai.`, icon: 'check' });
      setCompleteTarget(null);
      setQcModal(null);
      orders.reload();
    }
  }

  async function cancelOrder() {
    if (!cancelTarget) return;
    const result = await mutation.run(() =>
      apiFetch(`/v1/manufacturing/orders/${cancelTarget.id}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
    );
    if (result) {
      toast({ title: `Order ${cancelTarget.number} dibatalkan.`, icon: 'check' });
      setCancelTarget(null);
      orders.reload();
    }
  }

  async function toggleBom(bom: Bom) {
    const result = await mutation.run(() =>
      apiFetch(`/v1/manufacturing/boms/${bom.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !bom.isActive }) }),
    );
    if (result) {
      toast({ title: bom.isActive ? 'BOM dinonaktifkan.' : 'BOM diaktifkan.', icon: 'check' });
      boms.reload();
    }
  }

  async function removeSchedule(id: string) {
    const result = await mutation.run(() =>
      apiFetch(`/v1/manufacturing/schedules/${id}/remove`, { method: 'POST', body: JSON.stringify({}) }),
    );
    if (result) {
      toast({ title: 'Jadwal dilepas.', icon: 'check' });
      capacity.reload();
      workCenters.reload();
      orders.reload();
    }
  }

  async function createSchedule() {
    const orderId = scheduleOrderId || scheduleModal?.id;
    if (!orderId || !scheduleCenter) {
      toast({ title: 'Pilih order dan work center terlebih dulu.', icon: 'warning' });
      return;
    }
    const result = await mutation.run(() =>
      apiFetch('/v1/manufacturing/schedules', {
        method: 'POST',
        body: JSON.stringify({
          workCenterId: scheduleCenter,
          productionOrderId: orderId,
          scheduledDate: today,
          startMinutes: 0,
          durationMinutes: Number(scheduleDuration) || 60,
        }),
      }),
    );
    if (result) {
      toast({ title: 'Order dijadwalkan.', icon: 'check' });
      setScheduleModal(null);
      capacity.reload();
      workCenters.reload();
    }
  }

  async function recordQc() {
    if (!qcModal) return;
    const result = await mutation.run(() =>
      apiFetch(`/v1/manufacturing/orders/${qcModal.id}/qc`, {
        method: 'POST',
        body: JSON.stringify({
          stage: qcStage,
          checkedQty: Number(qcChecked) || 0,
          defectQty: Number(qcDefect) || 0,
        }),
      }),
    );
    if (result) {
      toast({ title: `QC tahap ${qcStageLabel[qcStage]} tercatat.`, icon: 'check' });
      await loadQcProgress(qcModal.id);
      orders.reload();
    }
  }

  async function loadQcProgress(orderId: string) {
    try {
      const res = await apiFetch<QcProgress>(`/v1/manufacturing/orders/${orderId}/qc-progress`);
      setQcProgress(res);
      const nextPending = res.steps.find((st) => st.result === 'pending');
      if (nextPending) setQcStage(nextPending.stage as never);
    } catch {
      setQcProgress(null);
    }
  }

  async function openQc(order: ProductionOrder) {
    setQcModal(order);
    setQcProgress(null);
    await loadQcProgress(order.id);
  }

  const bomColumns: Column<Bom>[] = [
    {
      key: 'product',
      header: 'Produk',
      render: (b) => (
        <>
          <p className="text-[15px] text-ink font-medium">{b.product.name}</p>
          <p className="text-caption text-fossil tnum">{b.product.sku}</p>
        </>
      ),
    },
    {
      key: 'output',
      header: 'Output',
      align: 'right',
      render: (b) => (
        <span className="tnum text-body-sm text-ink">
          {formatNumber(Number(b.outputQty))} {b.product.unit}
        </span>
      ),
    },
    {
      key: 'lines',
      header: 'Komponen',
      align: 'right',
      render: (b) => <span className="tnum text-body-sm text-fossil">{b.lines.length}</span>,
    },
    { key: 'version', header: 'Versi', align: 'center', render: (b) => <Badge variant="neutral">v{b.version}</Badge> },
    {
      key: 'active',
      header: 'Status',
      render: (b) => <Badge variant={b.isActive ? 'accent' : 'outline'}>{b.isActive ? 'Aktif' : 'Nonaktif'}</Badge>,
    },
  ];

  const orderColumns: Column<ProductionOrder>[] = [
    {
      key: 'number',
      header: 'Order',
      render: (o) => (
        <>
          <p className="text-[15px] text-ink font-medium tnum">{o.number}</p>
          <p className="text-caption text-fossil">
            {o.product.name}
            {o.subOrders && o.subOrders.length > 0 ? ` · ${o.subOrders.length} sub-order` : ''}
          </p>
        </>
      ),
    },
    {
      key: 'qty',
      header: 'Rencana',
      align: 'right',
      render: (o) => (
        <>
          <span className="tnum text-[15px] text-ink">{formatNumber(Number(o.qtyPlanned))}</span>
          <span className="block text-caption text-fossil"> {o.product.unit}</span>
        </>
      ),
    },
    {
      key: 'cost',
      header: 'Biaya Bahan',
      align: 'right',
      render: (o) => <span className="tnum text-body-sm text-fossil">{formatIDR(Number(o.materialCost))}</span>,
    },
    {
      key: 'scheduled',
      header: 'Dijadwalkan',
      render: (o) => <span className="text-caption text-fossil">{o.scheduledDate ? formatDate(o.scheduledDate) : '-'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => {
        const badge = statusBadge[o.status] ?? { variant: 'outline' as const, label: o.status };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
  ];

  const wcColumns: Column<WorkCenter>[] = [
    {
      key: 'name',
      header: 'Work Center',
      render: (w) => (
        <>
          <p className="text-[15px] text-ink font-medium">{w.name}</p>
          <p className="text-caption text-fossil tnum">{w.code}</p>
        </>
      ),
    },
    { key: 'kind', header: 'Jenis', render: (w) => <Badge variant="neutral">{w.kind}</Badge> },
    {
      key: 'capacity',
      header: 'Kapasitas/Hari',
      align: 'right',
      render: (w) => <span className="tnum text-body-sm text-ink">{formatNumber(w.capacityMinutes)} mnt</span>,
    },
    {
      key: 'rate',
      header: 'Tarif/Jam',
      align: 'right',
      render: (w) => <span className="tnum text-body-sm text-fossil">{formatIDR(Number(w.hourlyRate))}</span>,
    },
    {
      key: 'schedules',
      header: 'Jadwal',
      align: 'right',
      render: (w) => <span className="tnum text-body-sm text-fossil">{w._count.schedules}</span>,
    },
  ];

  const scheduleRows = useMemo(
    () =>
      listOf<CapacityPlan>(capacity.data).flatMap((c) =>
        (c.schedule ?? []).map((sc) => ({
          id: sc.id,
          orderNumber: sc.productionOrder.number,
          workCenter: c.workCenter.name,
          startMinutes: sc.startMinutes,
          durationMinutes: sc.durationMinutes,
        })),
      ),
    [capacity.data],
  );

  const capacityRows = useMemo(() => {
    const rows = listOf<CapacityPlan>(capacity.data);
    return rows.filter((c) => c.bookedMinutes > 0 || c.availableMinutes > 0);
  }, [capacity.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manufaktur & Produksi"
        subtitle="BOM, kebutuhan bahan, jadwal mesin, dan kendali mutu"
        actions={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {tab === 'bom' && (
              <Button variant="ghost" icon="layers" className="flex-1 sm:flex-initial" onClick={() => setBomModal(true)}>
                BOM Baru
              </Button>
            )}
            <Button variant="ghost" icon="wrench" className="flex-1 sm:flex-initial" onClick={() => setWcModal(true)}>
              Work Center
            </Button>
            <Button variant="primary" icon="plus" className="flex-1 sm:flex-initial" onClick={() => setOrderModal(true)}>
              Order Produksi
            </Button>
          </div>
        }
      />

      <StatRow
        items={[
          { label: 'BOM aktif', value: bomRows.filter((b) => b.isActive).length },
          { label: 'Order berjalan', value: orderRows.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length },
          { label: 'Unit direncanakan', value: formatNumber(totalPlanned) },
          { label: 'Work center', value: wcRows.length },
        ]}
      />

      <Tabs options={tabOptions} value={tab} onChange={setTab} />

      {tab === 'bom' && (
        <DataTable
          rows={bomRows}
          columns={bomColumns}
          rowKey={(b) => b.id}
          loading={boms.loading}
          error={boms.error}
          onRetry={boms.reload}
          emptyIcon="layers"
          emptyTitle="Belum ada BOM"
          emptyBody="MRP dan order produksi bergantung pada BOM. Buat BOM pertama untuk produk jadi Anda."
          emptyAction={
            <Button variant="ghost" icon="plus" onClick={() => setBomModal(true)}>
              BOM Baru
            </Button>
          }
          onRowClick={(b) => setBomDetail(b)}
          rowActions={(b) => (
            <RowAction
              icon={b.isActive ? 'close' : 'check'}
              label={b.isActive ? `Nonaktifkan BOM ${b.product.name}` : `Aktifkan BOM ${b.product.name}`}
              tone={b.isActive ? 'danger' : 'primary'}
              disabled={mutation.busy}
              onClick={() => toggleBom(b)}
            />
          )}
        />
      )}

      {tab === 'mrp' && (
        <div className="space-y-4">
          <Card className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
              <Field label="Produk">
                <Select value={mrpProduct} onChange={(e) => setMrpProduct(e.target.value)}>
                  <option value="">Pilih produk</option>
                  {productRows.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kebutuhan">
                <Input type="number" min={1} value={mrpQty} onChange={(e) => setMrpQty(e.target.value)} />
              </Field>
            </div>
            <p className="text-caption text-fossil">
              Kebutuhan dihitung dengan meledakkan BOM multi-level, memperhitungkan waste, dan membandingkan
              dengan stok tersedia.
            </p>
          </Card>

          {!mrpProduct ? (
            <Card className="p-6">
              <EmptyState icon="funnel" title="Pilih produk" body="Kebutuhan bahan akan muncul di sini." />
            </Card>
          ) : mrp.loading ? (
            <Card className="p-6">
              <EmptyState icon="info" title="Menghitung…" body="Mesehunkan BOM multi-level." />
            </Card>
          ) : mrp.error ? (
            <Card className="p-6">
              <EmptyState
                icon="warning"
                title="MRP gagal"
                body={mrp.error}
                action={
                  <Button variant="ghost" icon="sync" onClick={mrp.reload}>
                    Coba lagi
                  </Button>
                }
              />
            </Card>
          ) : (
            mrp.data && <MrpResult data={mrp.data} />
          )}
        </div>
      )}

      {tab === 'produksi' && (
        <DataTable
          rows={orderRows}
          columns={orderColumns}
          rowKey={(o) => o.id}
          loading={orders.loading}
          error={orders.error}
          onRetry={orders.reload}
          emptyIcon="factory"
          emptyTitle="Belum ada order produksi"
          emptyBody="Buat order produksi dari tombol di atas."
          rowActions={(o) =>
            o.status === 'planned' ? (
              <>
                <RowAction icon="inventory" label={`Lepas ${o.number}`} tone="primary" onClick={() => releaseOrder(o)} />
                <RowAction
                  icon="close"
                  label={`Batalkan ${o.number}`}
                  tone="danger"
                  onClick={() => setCancelTarget(o)}
                />
                <RowAction
                  icon="layers"
                  label={`Lepas multi-level ${o.number}`}
                  onClick={() => releaseOrder(o, true)}
                />
              </>
            ) : o.status === 'released' || o.status === 'in_progress' ? (
              <>
                <RowAction icon="check" label={`Selesaikan ${o.number}`} tone="primary" onClick={() => askComplete(o)} />
                <RowAction icon="shield" label={`Catat mutu ${o.number}`} onClick={() => openQc(o)} />
              </>
            ) : null
          }
        />
      )}

      {tab === 'mesin' && (
        <div className="space-y-5">
          <DataTable
            rows={wcRows}
            columns={wcColumns}
            rowKey={(w) => w.id}
            loading={workCenters.loading}
            error={workCenters.error}
            onRetry={workCenters.reload}
            emptyIcon="wrench"
            emptyTitle="Belum ada work center"
            emptyBody="Tambahkan mesin atau fasilitas sebelum menjadwalkan produksi."
            emptyAction={
              <Button variant="ghost" icon="plus" onClick={() => setWcModal(true)}>
                Tambah Work Center
              </Button>
            }
            rowActions={(w) => (
              <RowAction
                icon="calendar"
                label={`Jadwalkan di ${w.name}`}
                onClick={() => {
                  const available = orderRows.find((o) => o.status === 'planned');
                  if (!available) {
                    toast({ title: 'Tidak ada order berstatus Direncanakan.', icon: 'warning' });
                    return;
                  }
                  setScheduleModal(available);
                  setScheduleOrderId(available.id);
                  setScheduleCenter(w.id);
                }}
              />
            )}
          />

          <DataTable
            rows={capacityRows}
            columns={[
              {
                key: 'wc',
                header: 'Work Center',
                render: (c) => (
                  <>
                    <p className="text-[15px] text-ink">{c.workCenter.name}</p>
                    <p className="text-caption text-fossil tnum">{c.workCenter.code}</p>
                  </>
                ),
              },
              {
                key: 'booked',
                header: 'Terpakai',
                align: 'right',
                render: (c) => (
                  <span className="tnum text-body-sm text-ink">
                    {formatNumber(c.bookedMinutes)} / {formatNumber(c.availableMinutes)} mnt
                  </span>
                ),
              },
              {
                key: 'util',
                header: 'Pemanfaatan',
                align: 'right',
                render: (c) => (
                  <Badge variant={c.utilizationPct > 100 ? 'outline' : c.utilizationPct > 80 ? 'neutral' : 'accent'}>
                    {c.utilizationPct}%
                  </Badge>
                ),
              },
              {
                key: 'cost',
                header: 'Estimasi Biaya',
                align: 'right',
                render: (c) => <span className="tnum text-body-sm text-fossil">{formatIDR(c.estimatedLaborCost)}</span>,
              },
            ]}
            rowKey={(c) => c.workCenter.id}
            loading={capacity.loading}
            error={capacity.error}
            onRetry={capacity.reload}
            emptyIcon="gauge"
            emptyTitle="Belum ada data kapasitas"
            emptyBody="Tambahkan work center untuk melihat pemanfaatan kapasitas harian."
          />

          {scheduleRows.length > 0 && (
            <Card className="p-4 sm:p-5">
              <p className="text-[15px] text-ink font-medium mb-3">Jadwal hari ini</p>
              <ul className="divide-y divide-sand">
                {scheduleRows.map((sc) => (
                  <li key={sc.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[15px] text-ink tnum">{sc.orderNumber}</p>
                      <p className="text-caption text-fossil truncate">
                        {sc.workCenter} · mulai menit {formatNumber(sc.startMinutes)} · {formatNumber(sc.durationMinutes)} mnt
                      </p>
                    </div>
                    <RowAction icon="trash" label={`Lepas jadwal ${sc.orderNumber}`} tone="danger" disabled={mutation.busy} onClick={() => removeSchedule(sc.id)} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {proposal.data && (
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[15px] text-ink font-medium">Usulan jadwal 7 hari</p>
                  <p className="text-caption text-fossil">
                    {proposal.data.proposals.length} order, {proposal.data.unplaceable.length} tidak muat kapasitas
                  </p>
                </div>
                <Icon name="route" size={18} className="text-pebble" />
              </div>
              {proposal.data.proposals.length === 0 ? (
                <p className="text-body-sm text-fossil">Tidak ada order menunggu penjadwalan.</p>
              ) : (
                <div className="space-y-1.5">
                  {proposal.data.proposals.slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-body-sm gap-3">
                      <span className="text-ink truncate">{p.orderNumber}</span>
                      <span className="text-fossil truncate">{p.product}</span>
                      <span className={`tnum shrink-0 ${p.workCenterCode === '-' ? 'text-rose-700' : 'text-fossil'}`}>
                        {p.workCenterCode} {p.date}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === 'qc' && (
        <div className="space-y-4">
          <Card className="p-4 sm:p-5 flex items-start gap-3">
            <Icon name="shield" size={18} className="text-ink shrink-0 mt-0.5" />
            <div>
              <p className="text-[15px] text-ink font-medium">Pemeriksaan bertahap</p>
              <p className="text-body-sm text-fossil mt-0.5">
                Tahap wajib diurutkan dan tidak bisa dilewati. Selama masih ada tahap pending atau tahap gagal,
                order belum boleh diselesaikan — meski bahan sudah habis.
              </p>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button variant="ghost" icon="shield" onClick={() => setQcCfgModal(true)}>
              Atur Tahap QC
            </Button>
          </div>

          <DataTable
            rows={orderRows.filter((o) => o.status === 'released' || o.status === 'in_progress')}
            columns={orderColumns}
            rowKey={(o) => o.id}
            loading={orders.loading}
            error={orders.error}
            onRetry={orders.reload}
            emptyIcon="shield"
            emptyTitle="Tidak ada order yang perlu diperiksa"
            emptyBody="Order yang sudah dilepas akan muncul di sini untuk pemeriksaan mutu."
            emptyAction={
              <Button variant="ghost" icon="shield" onClick={() => setQcCfgModal(true)}>
                Atur Tahap QC
              </Button>
            }
            rowActions={(o) => (
              <RowAction icon="clipboard" label={`Catat mutu ${o.number}`} onClick={() => openQc(o)} />
            )}
          />
        </div>
      )}

      <Modal open={orderModal} onClose={() => setOrderModal(false)} title="Order Produksi Baru" maxWidth="md">
        <div className="space-y-4">
          <Field label="Produk">
            <Select value={orderProduct} onChange={(e) => setOrderProduct(e.target.value)}>
              <option value="">Pilih produk</option>
              {productRows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Gudang Tujuan">
            <Select value={orderWarehouse} onChange={(e) => setOrderWarehouse(e.target.value)}>
              <option value="">Pilih gudang</option>
              {warehouseRows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jumlah Direncanakan">
            <Input type="number" min={0.01} value={orderQty} onChange={(e) => setOrderQty(e.target.value)} />
          </Field>
          <Field label="Prioritas" hint="1 paling tinggi untuk urutan Capacity Planning">
            <Input type="number" min={1} max={9} value={orderPriority} onChange={(e) => setOrderPriority(e.target.value)} />
          </Field>
          <Button variant="primary" full disabled={mutation.busy} onClick={createOrder}>
            {mutation.busy ? 'Menyimpan…' : 'Buat Order'}
          </Button>
        </div>
      </Modal>

      <Modal open={wcModal} onClose={() => setWcModal(false)} title="Tambah Work Center" maxWidth="md">
        <div className="space-y-4">
          <Field label="Kode" hint="Kode unik, mis. OVEN-A">
            <Input value={wcCode} onChange={(e) => setWcCode(e.target.value)} placeholder="OVEN-A" />
          </Field>
          <Field label="Nama">
            <Input value={wcName} onChange={(e) => setWcName(e.target.value)} placeholder="Oven A" />
          </Field>
          <Field label="Kapasitas per Hari" hint="Dalam menit, mis. 480 untuk 8 jam">
            <Input type="number" min={1} value={wcMinutes} onChange={(e) => setWcMinutes(e.target.value)} />
          </Field>
          <Field label="Tarif per Jam">
            <Input type="number" min={0} value={wcRate} onChange={(e) => setWcRate(e.target.value)} />
          </Field>
          <Button variant="primary" full disabled={mutation.busy} onClick={createWorkCenter}>
            {mutation.busy ? 'Menyimpan…' : 'Simpan Work Center'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={scheduleModal !== null}
        onClose={() => setScheduleModal(null)}
        title={scheduleModal ? `Jadwalkan ${scheduleModal.number}` : ''}
        maxWidth="md"
      >
        <div className="space-y-4">
          <Field label="Order Produksi">
            <Select value={scheduleOrderId} onChange={(e) => setScheduleOrderId(e.target.value)}>
              {orderRows
                .filter((o) => o.status === 'planned')
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} · {o.product.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Work Center">
            <Select value={scheduleCenter} onChange={(e) => setScheduleCenter(e.target.value)}>
              <option value="">Pilih work center</option>
              {wcRows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Durasi" hint="Menit. Total terpakai tidak boleh melebihi kapasitas harian.">
            <Input type="number" min={1} value={scheduleDuration} onChange={(e) => setScheduleDuration(e.target.value)} />
          </Field>
          <Button variant="primary" full disabled={mutation.busy} onClick={createSchedule}>
            {mutation.busy ? 'Menyimpan…' : 'Simpan Jadwal'}
          </Button>
        </div>
      </Modal>

      <Modal open={qcModal !== null} onClose={() => setQcModal(null)} title={qcModal ? `Mutu ${qcModal.number}` : ''} maxWidth="md">
        <div className="space-y-4">
          <QcProgressList progress={qcProgress} />
          <Field label="Tahap" hint="Tahap wajib berurutan, tahap sebelumnya harus lulus">
            <Select value={qcStage} onChange={(e) => setQcStage(e.target.value as never)}>
              <option value="incoming">Bahan Masuk</option>
              <option value="in_process">Proses</option>
              <option value="final">Akhir</option>
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Jumlah Diperiksa">
              <Input type="number" min={1} value={qcChecked} onChange={(e) => setQcChecked(e.target.value)} />
            </Field>
            <Field label="Jumlah Cacat">
              <Input type="number" min={0} value={qcDefect} onChange={(e) => setQcDefect(e.target.value)} />
            </Field>
          </div>
          <p className="text-caption text-fossil">
            Cacat lebih dari 0 berarti tahap gagal dan produksi tidak boleh dilanjutkan.
          </p>
          <Button variant="primary" full disabled={mutation.busy} onClick={recordQc}>
            {mutation.busy ? 'Mencatat…' : 'Catat Hasil QC'}
          </Button>
        </div>
      </Modal>

      <BomFormModal
        open={bomModal}
        onClose={() => setBomModal(false)}
        onDone={() => {
          setBomModal(false);
          boms.reload();
        }}
      />
      <BomDetailModal bom={bomDetail} onClose={() => setBomDetail(null)} />
      <QcStagesModal open={qcCfgModal} onClose={() => setQcCfgModal(false)} onDone={() => setQcCfgModal(false)} />

      <Modal open={completeTarget !== null} onClose={() => setCompleteTarget(null)} title={completeTarget ? `Selesaikan ${completeTarget.number}` : ''} maxWidth="sm">
        <div className="space-y-4">
          <p className="text-body-sm text-fossil">
            Bahan terpakai dicatat dan hasil jadi masuk ke stok gudang. Isi jumlah yang benar-benar dihasilkan, bukan hanya rencana.
          </p>
          <Field label={`Jumlah hasil${completeTarget ? ` (${completeTarget.product.unit})` : ''}`} hint={completeTarget ? `Rencana ${formatNumber(Number(completeTarget.qtyPlanned))}` : undefined}>
            <Input value={completeQty} onChange={(e) => setCompleteQty(e.target.value)} inputMode="decimal" />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" full onClick={() => setCompleteTarget(null)}>
              Batal
            </Button>
            <Button variant="primary" full disabled={mutation.busy} onClick={completeOrder}>
              {mutation.busy ? 'Menyimpan…' : 'Selesaikan'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)} title={cancelTarget ? `Batalkan ${cancelTarget.number}?` : ''} maxWidth="sm">
        <div className="space-y-4">
          <p className="text-body-sm text-fossil">Order yang belum dilepas dibatalkan tanpa memengaruhi stok. Tindakan ini tidak bisa dibuka kembali.</p>
          <div className="flex gap-2">
            <Button variant="ghost" full onClick={() => setCancelTarget(null)}>
              Tidak
            </Button>
            <Button variant="primary" full disabled={mutation.busy} onClick={cancelOrder}>
              {mutation.busy ? 'Membatalkan…' : 'Batalkan Order'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
