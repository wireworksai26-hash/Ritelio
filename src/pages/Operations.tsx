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

type TabKey = 'proyek' | 'gantt' | 'timesheet' | 'sumber-daya' | 'pengiriman' | 'armada' | 'perawatan';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'proyek', label: 'Proyek' },
  { value: 'gantt', label: 'Milestone & Gantt' },
  { value: 'timesheet', label: 'Timesheet' },
  { value: 'sumber-daya', label: 'Alokasi Tim' },
  { value: 'pengiriman', label: 'Pengiriman' },
  { value: 'armada', label: 'Armada' },
  { value: 'perawatan', label: 'Perawatan' },
];

interface Project {
  id: string;
  code: string;
  name: string;
  status: string;
  budget: number | string;
  startDate: string | null;
  endDate: string | null;
  customer: { code: string; name: string } | null;
  manager: { employeeNo: string; fullName: string } | null;
  milestones: Milestone[];
}

interface Milestone {
  id: string;
  name: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  progress: number;
  overdue?: boolean;
  daysLate?: number;
  dependsOn?: Array<{ dependsOn: { id: string; name: string; completedAt: string | null } }>;
}

interface GanttData {
  project: { code: string; name: string; status: string };
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
    progressPct: number;
  };
  milestones: Milestone[];
}

interface Timesheet {
  id: string;
  workDate: string;
  hours: number | string;
  hourlyRate: number | string;
  amount: number;
  billable: boolean;
  status: string;
  billed: boolean;
  employee: { employeeNo: string; fullName: string };
  project: { code: string; name: string };
}

interface TimesheetList {
  data: Timesheet[];
  totals: {
    hours: number;
    billableHours: number;
    billableAmount: number;
    unbilledAmount: number;
    sheets: number;
    pending: number;
    billed: number;
  };
}

interface Allocation {
  id: string;
  allocationPct: number;
  hoursPerWeek: number | string;
  startDate: string;
  endDate: string | null;
  role: string;
  isActive: boolean;
  employee: { employeeNo: string; fullName: string };
  project: { code: string; name: string; status: string };
}

interface Workload {
  employeeId: string;
  employeeNo: string;
  fullName: string;
  allocationPct: number;
  approvedHours30d: number;
  weeklyHours: number;
  overloaded: boolean;
  projects: Array<{ code: string; name: string; pct: number; role: string }>;
}

interface Forecast {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  averageMonthly: number;
  weightedMonthly: number;
  trendPct: number;
  reorderPoint: number;
  suggestsReorder: boolean;
  forecast: Array<{ monthOffset: number; qty: number }>;
}

interface Shipment {
  id: string;
  number: string;
  status: string;
  origin: string;
  destination: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  receiverName: string;
  carrierName: string | null;
  carrierTrackingNumber: string | null;
  outlet: { name: string } | null;
  vehicle: { plateNumber: string; name: string } | null;
  items: Array<{ qty: number | string; product: { sku: string; name: string } }>;
}

interface ShipmentEvent {
  id: string;
  status: string;
  description: string;
  location: string;
  occurredAt: string;
  source: string;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  name: string;
  type: string;
  capacityKg: number | string;
  odometerKm: number | string;
  isActive?: boolean;
}

interface MaintenancePlan {
  id: string;
  assetRef: string;
  description: string;
  intervalDays: number;
  lastDoneAt: string | null;
  nextDueAt: string;
}

interface DueMaintenance {
  id: string;
  assetRef: string;
  description: string;
  intervalDays: number;
  nextDueAt: string;
  daysOverdue: number;
  openWorkOrders: number;
}

interface MaintenancePlanRow {
  id: string;
  assetRef: string;
  description: string;
  intervalDays: number;
  lastDoneAt: string | null;
  nextDueAt: string | null;
  isActive: boolean;
  daysOverdue: number;
  workOrders: number;
  vehicle: { plateNumber: string; name: string } | null;
}

interface WorkOrder {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: string;
  assetRef: string;
  laborCost: number | string;
  partsCost: number | string;
  startedAt: string | null;
  completedAt: string | null;
  assignee: { employeeNo: string; fullName: string } | null;
}

interface Sensor {
  id: string;
  code: string;
  name: string;
  type: string;
  unit: string;
  isActive: boolean;
  lastSeenAt: string | null;
  _count: { readings: number };
}

const projectBadge: Record<string, { variant: 'accent' | 'neutral' | 'outline' | 'ink'; label: string }> = {
  planning: { variant: 'outline', label: 'Perencanaan' },
  active: { variant: 'accent', label: 'Berjalan' },
  on_hold: { variant: 'neutral', label: 'Ditunda' },
  completed: { variant: 'ink', label: 'Selesai' },
  cancelled: { variant: 'outline', label: 'Dibatalkan' },
};

const shipmentBadge: Record<string, { variant: 'accent' | 'neutral' | 'outline' | 'ink'; label: string }> = {
  pending: { variant: 'outline', label: 'Disiapkan' },
  in_transit: { variant: 'neutral', label: 'Dalam Perjalanan' },
  delivered: { variant: 'accent', label: 'Sampai' },
  cancelled: { variant: 'outline', label: 'Batal' },
};

export default function Operations() {
  const [tab, setTab] = useState<TabKey>('proyek');
  const mutation = useMutation();

  const projects = useResource<Project[]>('/v1/operations/projects');
  const timesheets = useResource<TimesheetList>('/v1/operations/timesheets?take=200');
  const allocations = useResource<Allocation[]>('/v1/resources/workload');
  const forecast = useResource<{ products: Forecast[] }>('/v1/forecasting/demand?months=6&horizon=3');
  const shipments = useResource<Shipment[]>('/v1/operations/shipments');
  const vehicles = useResource<Vehicle[]>('/v1/operations/vehicles');
  const maintenance = useResource<{ milestones: unknown[] } | DueMaintenance[]>('/v1/operations/maintenance/due');
  const maintenancePlans = useResource<MaintenancePlanRow[]>('/v1/operations/maintenance-plans');
  const workOrders = useResource<WorkOrder[]>('/v1/operations/work-orders');
  const sensors = useResource<Sensor[]>('/v1/iot/sensors');

  const [ganttProject, setGanttProject] = useState('');
  const gantt = useResource<GanttData>(ganttProject ? `/v1/operations/projects/${ganttProject}/milestones` : null);

  const [projectModal, setProjectModal] = useState(false);
  const [projCode, setProjCode] = useState('');
  const [projName, setProjName] = useState('');
  const [projBudget, setProjBudget] = useState('10000000');

  const [milestoneModal, setMilestoneModal] = useState(false);
  const [msName, setMsName] = useState('');
  const [msStart, setMsStart] = useState('');
  const [msDue, setMsDue] = useState('');

  const [billModal, setBillModal] = useState<Project | null>(null);

  const [allocModal, setAllocModal] = useState<Project | null>(null);
  const [allocEmployee, setAllocEmployee] = useState('');
  const [allocPct, setAllocPct] = useState('50');
  const [allocRole, setAllocRole] = useState('');

  const [woModal, setWoModal] = useState(false);
  const [woTitle, setWoTitle] = useState('');
  const [woAsset, setWoAsset] = useState('');
  const [woPriority, setWoPriority] = useState('medium');

  const [woClose, setWoClose] = useState<WorkOrder | null>(null);
  const [woLabor, setWoLabor] = useState('0');
  const [woParts, setWoParts] = useState('0');

  const [fuelModal, setFuelModal] = useState<Vehicle | null>(null);
  const [fuelLiters, setFuelLiters] = useState('40');
  const [fuelPrice, setFuelPrice] = useState('13500');
  const [fuelOdo, setFuelOdo] = useState('0');

  const [planModal, setPlanModal] = useState(false);
  const [planAsset, setPlanAsset] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [planInterval, setPlanInterval] = useState('30');
  const [planFirstDue, setPlanFirstDue] = useState('');
  const [planVehicle, setPlanVehicle] = useState('');

  const [shipmentAction, setShipmentAction] = useState<{ shipment: Shipment; to: 'in_transit' | 'delivered' | 'cancelled' } | null>(null);
  const [receiver, setReceiver] = useState('');

  const [timelineModal, setTimelineModal] = useState<Shipment | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<ShipmentEvent[]>([]);

  const projectRows = listOf<Project>(projects.data);
  const shipmentRows = listOf<Shipment>(shipments.data);
  const vehicleRows = listOf<Vehicle>(vehicles.data);
  const woRows = listOf<WorkOrder>(workOrders.data);
  const sensorRows = listOf<Sensor>(sensors.data);

  const workloadRows = useMemo(() => {
    return listOf<Workload>(allocations.data);
  }, [allocations.data]);

  const dueRows = useMemo(() => {
    const res = maintenance.data;
    const rows = Array.isArray(res) ? res : ((res as { data?: DueMaintenance[] })?.data ?? []);
    return rows as DueMaintenance[];
  }, [maintenance.data]);

  const forecastRows = forecast.data?.products ?? [];

  async function createProject() {
    if (projCode.trim().length < 2 || projName.trim().length < 2) {
      toast({ title: 'Kode dan nama proyek wajib diisi.', icon: 'warning' });
      return;
    }
    const result = await mutation.run(() =>
      apiFetch('/v1/operations/projects', {
        method: 'POST',
        body: JSON.stringify({
          code: projCode.trim(),
          name: projName.trim(),
          budget: Number(projBudget) || 0,
        }),
      }),
    );
    if (result) {
      toast({ title: 'Proyek dibuat.', icon: 'check' });
      setProjectModal(false);
      setProjCode('');
      setProjName('');
      projects.reload();
    }
  }

  async function addMilestone() {
    if (!ganttProject || msName.trim().length < 2) {
      toast({ title: 'Nama milestone wajib diisi.', icon: 'warning' });
      return;
    }
    const result = await mutation.run(() =>
      apiFetch(`/v1/operations/projects/${ganttProject}/milestones`, {
        method: 'POST',
        body: JSON.stringify({
          name: msName.trim(),
          startDate: msStart || undefined,
          dueDate: msDue || undefined,
        }),
      }),
    );
    if (result) {
      toast({ title: 'Milestone ditambahkan.', icon: 'check' });
      setMilestoneModal(false);
      setMsName('');
      gantt.reload();
      projects.reload();
    }
  }

  async function completeMilestone(id: string) {
    const result = await mutation.run(() =>
      apiFetch(`/v1/operations/milestones/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ progress: 100 }),
      }),
    );
    if (result) {
      toast({ title: 'Milestone diselesaikan.', icon: 'check' });
      gantt.reload();
      projects.reload();
    }
  }

  async function billProject(project: Project) {
    const result = await mutation.run(() =>
      apiFetch<{ amount: number; billedSheets: number }>(`/v1/operations/projects/${project.id}/bill`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    if (result) {
      toast({
        title: `Tagihan ${formatIDR(result.amount)} terbit.`,
        description: `${result.billedSheets} timesheet ikut ditagihkan.`,
        icon: 'check',
      });
      setBillModal(null);
      timesheets.reload();
    }
  }

  async function allocate() {
    if (!allocModal || !allocEmployee) {
      toast({ title: 'Pilih karyawan terlebih dulu.', icon: 'warning' });
      return;
    }
    const result = await mutation.run(() =>
      apiFetch(`/v1/projects/${allocModal.id}/allocations`, {
        method: 'POST',
        body: JSON.stringify({
          employeeId: allocEmployee,
          allocationPct: Number(allocPct) || 50,
          startDate: new Date().toISOString().slice(0, 10),
          role: allocRole || undefined,
        }),
      }),
    );
    if (result) {
      toast({ title: 'Alokasi dicatat.', icon: 'check' });
      setAllocModal(null);
      allocations.reload();
    }
  }

  async function createWorkOrder() {
    if (woTitle.trim().length < 2) {
      toast({ title: 'Judul pekerjaan wajib diisi.', icon: 'warning' });
      return;
    }
    const result = await mutation.run(() =>
      apiFetch('/v1/operations/work-orders', {
        method: 'POST',
        body: JSON.stringify({
          title: woTitle.trim(),
          assetRef: woAsset.trim(),
          priority: woPriority,
        }),
      }),
    );
    if (result) {
      toast({ title: 'Work order dibuat.', icon: 'check' });
      setWoModal(false);
      setWoTitle('');
      setWoAsset('');
      workOrders.reload();
    }
  }

  async function closeWorkOrder() {
    if (!woClose) return;
    const result = await mutation.run(() =>
      apiFetch(`/v1/operations/work-orders/${woClose.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'closed',
          laborCost: Number(woLabor) || 0,
          partsCost: Number(woParts) || 0,
        }),
      }),
    );
    if (result) {
      toast({
        title: 'Work order ditutup.',
        description: 'Biaya tercatat di beban pemeliharaan.',
        icon: 'check',
      });
      setWoClose(null);
      workOrders.reload();
      maintenance.reload();
    }
  }

  async function recordFuel() {
    if (!fuelModal) return;
    const result = await mutation.run(() =>
      apiFetch(`/v1/operations/vehicles/${fuelModal.id}/fuel`, {
        method: 'POST',
        body: JSON.stringify({
          liters: Number(fuelLiters) || 0,
          pricePerLiter: Number(fuelPrice) || 0,
          odometerKm: Number(fuelOdo) || undefined,
        }),
      }),
    );
    if (result) {
      toast({ title: 'Konsumsi bahan bakar tercatat.', icon: 'check' });
      setFuelModal(null);
      vehicles.reload();
    }
  }

  async function createPlan() {
    const interval = Number(planInterval);
    if (planAsset.trim().length < 1 || planDesc.trim().length < 2) {
      toast({ title: 'Aset dan deskripsi perawatan wajib diisi.', icon: 'warning' });
      return;
    }
    if (!Number.isInteger(interval) || interval < 1 || interval > 3650) {
      toast({ title: 'Interval harus 1 sampai 3650 hari.', icon: 'warning' });
      return;
    }
    const result = await mutation.run(() =>
      apiFetch('/v1/operations/maintenance-plans', {
        method: 'POST',
        body: JSON.stringify({
          assetRef: planAsset.trim(),
          description: planDesc.trim(),
          intervalDays: interval,
          ...(planFirstDue ? { firstDueAt: planFirstDue } : {}),
          ...(planVehicle ? { vehicleRefId: planVehicle } : {}),
        }),
      }),
    );
    if (result) {
      toast({ title: 'Rencana perawatan dibuat.', icon: 'check' });
      setPlanModal(false);
      setPlanAsset('');
      setPlanDesc('');
      setPlanInterval('30');
      setPlanFirstDue('');
      setPlanVehicle('');
      maintenancePlans.reload();
      maintenance.reload();
    }
  }

  async function changeShipmentStatus() {
    if (!shipmentAction) return;
    const { shipment, to } = shipmentAction;
    const result = await mutation.run(() =>
      apiFetch(`/v1/operations/shipments/${shipment.id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: to,
          ...(to === 'delivered' && receiver.trim() ? { receiverName: receiver.trim() } : {}),
        }),
      }),
    );
    if (result) {
      toast({ title: `Pengiriman ${shipment.number} diperbarui.`, icon: 'check' });
      setShipmentAction(null);
      setReceiver('');
    }
    // Muat ulang juga saat gagal: konflik berarti status di server sudah berubah.
    shipments.reload();
  }

  async function openTimeline(shipment: Shipment) {
    setTimelineModal(shipment);
    setTimelineEvents([]);
    try {
      const res = await apiFetch<{ events: ShipmentEvent[] }>(`/v1/shipments/${shipment.id}/timeline`);
      setTimelineEvents(res.events ?? []);
    } catch {
      setTimelineEvents([]);
    }
  }

  const projectColumns: Column<Project>[] = [
    {
      key: 'name',
      header: 'Proyek',
      render: (p) => (
        <>
          <p className="text-[15px] text-ink font-medium">{p.name}</p>
          <p className="text-caption text-fossil tnum">
            {p.code}
            {p.customer ? ` · ${p.customer.name}` : ''}
          </p>
        </>
      ),
    },
    {
      key: 'manager',
      header: 'Pengelola',
      render: (p) => <span className="text-body-sm text-fossil">{p.manager?.fullName ?? 'Belum ditentukan'}</span>,
    },
    {
      key: 'milestones',
      header: 'Milestone',
      align: 'right',
      render: (p) => (
        <span className="tnum text-body-sm text-fossil">
          {p.milestones.filter((m) => m.completedAt).length}/{p.milestones.length}
        </span>
      ),
    },
    {
      key: 'budget',
      header: 'Anggaran',
      align: 'right',
      render: (p) => <span className="tnum text-[15px] text-ink">{formatIDR(Number(p.budget))}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => {
        const badge = projectBadge[p.status] ?? { variant: 'outline' as const, label: p.status };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
  ];

  const shipmentColumns: Column<Shipment>[] = [
    {
      key: 'number',
      header: 'Pengiriman',
      render: (s) => (
        <>
          <p className="text-[15px] text-ink font-medium tnum">{s.number}</p>
          <p className="text-caption text-fossil">
            {s.origin || '-'} ke {s.destination}
          </p>
        </>
      ),
    },
    {
      key: 'vehicle',
      header: 'Armada',
      render: (s) => (
        <span className="text-body-sm text-fossil">
          {s.vehicle?.plateNumber ?? '-'}
          {s.carrierTrackingNumber ? ` · ${s.carrierTrackingNumber}` : ''}
        </span>
      ),
    },
    {
      key: 'delivered',
      header: 'Diterima',
      render: (s) => (
        <span className="text-body-sm text-ink">
          {s.receiverName || (s.deliveredAt ? formatDate(s.deliveredAt) : '-')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => {
        const badge = shipmentBadge[s.status] ?? { variant: 'outline' as const, label: s.status };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
  ];

  const vehicleColumns: Column<Vehicle>[] = [
    {
      key: 'plate',
      header: 'Kendaraan',
      render: (v) => (
        <>
          <p className="text-[15px] text-ink font-medium tnum">{v.plateNumber}</p>
          <p className="text-caption text-fossil">{v.name}</p>
        </>
      ),
    },
    { key: 'type', header: 'Jenis', render: (v) => <Badge variant="neutral">{v.type}</Badge> },
    {
      key: 'capacity',
      header: 'Kapasitas',
      align: 'right',
      render: (v) => <span className="tnum text-body-sm text-ink">{formatNumber(Number(v.capacityKg))} kg</span>,
    },
    {
      key: 'odometer',
      header: 'Odometer',
      align: 'right',
      render: (v) => <span className="tnum text-body-sm text-fossil">{formatNumber(Number(v.odometerKm))} km</span>,
    },
  ];

  const workOrderColumns: Column<WorkOrder>[] = [
    {
      key: 'title',
      header: 'Pekerjaan',
      render: (w) => (
        <>
          <p className="text-[15px] text-ink font-medium">{w.title}</p>
          <p className="text-caption text-fossil tnum">
            {w.number}
            {w.assetRef ? ` · ${w.assetRef}` : ''}
          </p>
        </>
      ),
    },
    {
      key: 'assignee',
      header: 'Ditugaskan',
      render: (w) => <span className="text-body-sm text-fossil">{w.assignee?.fullName ?? 'Belum ditugaskan'}</span>,
    },
    {
      key: 'priority',
      header: 'Prioritas',
      render: (w) => (
        <Badge variant={w.priority === 'urgent' ? 'ink' : w.priority === 'high' ? 'neutral' : 'outline'}>
          {w.priority}
        </Badge>
      ),
    },
    {
      key: 'cost',
      header: 'Biaya',
      align: 'right',
      render: (w) => (
        <span className="tnum text-body-sm text-ink">
          {formatIDR(Number(w.laborCost) + Number(w.partsCost))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (w) => (
        <Badge variant={w.status === 'closed' ? 'ink' : w.status === 'completed' ? 'accent' : 'outline'}>
          {w.status}
        </Badge>
      ),
    },
  ];

  const timesheetColumns: Column<Timesheet>[] = [
    {
      key: 'employee',
      header: 'Karyawan',
      render: (t) => (
        <>
          <p className="text-[15px] text-ink">{t.employee?.fullName ?? '-'}</p>
          <p className="text-caption text-fossil tnum">{t.employee?.employeeNo}</p>
        </>
      ),
    },
    {
      key: 'project',
      header: 'Proyek',
      render: (t) => (
        <>
          <p className="text-body-sm text-ink">{t.project?.name ?? '-'}</p>
          <p className="text-caption text-fossil tnum">{t.project?.code}</p>
        </>
      ),
    },
    { key: 'date', header: 'Tanggal', render: (t) => <span className="text-caption text-fossil">{formatDate(t.workDate)}</span> },
    {
      key: 'hours',
      header: 'Jam',
      align: 'right',
      render: (t) => <span className="tnum text-[15px] text-ink">{formatNumber(Number(t.hours))}</span>,
    },
    {
      key: 'amount',
      header: 'Nilai',
      align: 'right',
      render: (t) => <span className="tnum text-body-sm text-fossil">{formatIDR(t.amount)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {t.billed ? (
            <Badge variant="ink">Ditagih</Badge>
          ) : t.status === 'approved' ? (
            <Badge variant="accent">Siap Tagih</Badge>
          ) : (
            <Badge variant="outline">{t.status}</Badge>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operasional"
        subtitle="Proyek, timesheet, alokasi tim, pengiriman, dan aset"
        actions={
          tab === 'perawatan' ? (
            <Button variant="primary" icon="plus" full onClick={() => setPlanModal(true)}>
              Rencana Perawatan
            </Button>
          ) : (
            <Button variant="primary" icon="plus" full onClick={() => setProjectModal(true)}>
              Proyek Baru
            </Button>
          )
        }
      />

      <StatRow
        items={[
          { label: 'Proyek berjalan', value: projectRows.filter((p) => p.status === 'active').length },
          { label: 'Jam belum ditagih', value: formatNumber(timesheets.data?.totals.unbilledAmount ? timesheets.data.totals.hours : 0) },
          { label: 'Sisa tagihan', value: formatIDR(timesheets.data?.totals.unbilledAmount ?? 0) },
          { label: 'Perawatan jatuh tempo', value: dueRows.length, tone: 'accent' },
        ]}
      />

      <Tabs options={tabOptions} value={tab} onChange={setTab} />

      {tab === 'proyek' && (
        <DataTable
          rows={projectRows}
          columns={projectColumns}
          rowKey={(p) => p.id}
          loading={projects.loading}
          error={projects.error}
          onRetry={projects.reload}
          emptyIcon="flow"
          emptyTitle="Belum ada proyek"
          emptyBody="Buat proyek untuk mulai mencatat jam kerja tim."
          rowActions={(p) => (
            <>
              <RowAction
                icon="calendar"
                label={`Gantt ${p.name}`}
                onClick={() => {
                  setGanttProject(p.id);
                  setTab('gantt');
                }}
              />
              <RowAction icon="wallet" label={`Tagih ${p.name}`} tone="primary" onClick={() => setBillModal(p)} />
            </>
          )}
        />
      )}

      {tab === 'gantt' && (
        <div className="space-y-4">
          <Card className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3 items-stretch">
            <Field label="Proyek" className="flex-1">
              <Select
                value={ganttProject}
                onChange={(e) => setGanttProject(e.target.value)}
              >
                <option value="">Pilih proyek</option>
                {projectRows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button
                variant="primary"
                icon="plus"
                full
                disabled={!ganttProject}
                onClick={() => setMilestoneModal(true)}
              >
                Tambah Milestone
              </Button>
            </div>
          </Card>

          {!ganttProject ? (
            <Card className="p-6">
              <EmptyState
                icon="flow"
                title="Pilih proyek"
                body="Gantt menampilkan milestone beserta urutan dan ketergantungannya."
              />
            </Card>
          ) : (
            <>
              {gantt.data && (
                <StatRow
                  items={[
                    { label: 'Progres', value: `${gantt.data.summary.progressPct}%` },
                    { label: 'Selesai', value: gantt.data.summary.completed },
                    { label: 'Berjalan', value: gantt.data.summary.inProgress },
                    { label: 'Terlambat', value: gantt.data.summary.overdue, tone: 'accent' },
                  ]}
                />
              )}

              {gantt.loading && (
                <Card className="p-6">
                  <EmptyState icon="info" title="Memuat…" body="Mengambil milestone proyek." />
                </Card>
              )}

              {gantt.error && (
                <Card className="p-6">
                  <EmptyState
                    icon="warning"
                    title="Gagal memuat Gantt"
                    body={gantt.error}
                    action={
                      <Button variant="ghost" icon="sync" onClick={gantt.reload}>
                        Coba lagi
                      </Button>
                    }
                  />
                </Card>
              )}

              {gantt.data && gantt.data.milestones.length === 0 && (
                <Card className="p-6">
                  <EmptyState
                    icon="calendar"
                    title="Belum ada milestone"
                    body="Tambahkan tahapan proyek untuk melihat garis waktu."
                    action={
                      <Button variant="ghost" icon="plus" onClick={() => setMilestoneModal(true)}>
                        Tambah Milestone
                      </Button>
                    }
                  />
                </Card>
              )}

              {gantt.data?.milestones.map((m) => (
                <Card key={m.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] text-ink font-medium">{m.name}</p>
                      <p className="text-caption text-fossil tnum mt-0.5">
                        {m.startDate ? formatDate(m.startDate) : 'belum mulai'}
                        {' - '}
                        {m.dueDate ? formatDate(m.dueDate) : 'tanpa tenggat'}
                      </p>
                    </div>
                    {m.completedAt ? (
                      <Badge variant="accent" icon="check">
                        Selesai
                      </Badge>
                    ) : m.overdue ? (
                      <Badge variant="outline">{m.daysLate} hari telat</Badge>
                    ) : (
                      <Badge variant="neutral">{m.progress}%</Badge>
                    )}
                  </div>

                  <div className="mt-3 h-1.5 rounded-full bg-sand overflow-hidden">
                    <div
                      className={`h-full rounded-full ${m.overdue ? 'bg-rose-700' : 'bg-olive'}`}
                      style={{ width: `${m.completedAt ? 100 : m.progress}%` }}
                    />
                  </div>

                  {m.dependsOn && m.dependsOn.length > 0 && (
                    <p className="text-caption text-fossil mt-2.5">
                      Bergantung pada:{' '}
                      {m.dependsOn.map((d) => d.dependsOn.name).join(', ')}
                    </p>
                  )}

                  {!m.completedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      onClick={() => completeMilestone(m.id)}
                    >
                      Tandai Selesai
                    </Button>
                  )}
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'timesheet' && (
        <div className="space-y-4">
          {timesheets.data?.totals && (
            <StatRow
              items={[
                { label: 'Total jam', value: formatNumber(timesheets.data.totals.hours) },
                { label: 'Jam billable', value: formatNumber(timesheets.data.totals.billableHours) },
                { label: 'Belum ditagih', value: formatIDR(timesheets.data.totals.unbilledAmount) },
                { label: 'Sudah ditagih', value: timesheets.data.totals.billed },
              ]}
            />
          )}
          <DataTable
            rows={timesheets.data?.data ?? []}
            columns={timesheetColumns}
            rowKey={(t) => t.id}
            loading={timesheets.loading}
            error={timesheets.error}
            onRetry={timesheets.reload}
            emptyIcon="clock"
            emptyTitle="Belum ada timesheet"
            emptyBody="Catat jam kerja tim dari halaman proyek atau lewat API."
          />
        </div>
      )}

      {tab === 'sumber-daya' && (
        <div className="space-y-5">
          <DataTable
            rows={workloadRows}
            columns={[
              {
                key: 'employee',
                header: 'Karyawan',
                render: (w) => (
                  <>
                    <p className="text-[15px] text-ink">{w.fullName}</p>
                    <p className="text-caption text-fossil tnum">{w.employeeNo}</p>
                  </>
                ),
              },
              {
                key: 'projects',
                header: 'Proyek',
                render: (w) => (
                  <div className="space-y-0.5">
                    {w.projects.length === 0 ? (
                      <span className="text-pebble">-</span>
                    ) : (
                      w.projects.map((p, i) => (
                        <p key={i} className="text-caption text-fossil tnum">
                          {p.code} · {p.pct}%
                        </p>
                      ))
                    )}
                  </div>
                ),
              },
              {
                key: 'allocation',
                header: 'Total Alokasi',
                align: 'right',
                render: (w) => (
                  <Badge variant={w.allocationPct > 100 ? 'outline' : w.allocationPct >= 100 ? 'neutral' : 'accent'}>
                    {w.allocationPct}%
                  </Badge>
                ),
              },
              {
                key: 'load',
                header: 'Beban 30 Hari',
                align: 'right',
                render: (w) => (
                  <>
                    <span className="tnum text-body-sm text-ink">{formatNumber(w.weeklyHours)} jam/mgg</span>
                    {w.overloaded && <span className="block text-caption text-rose-700">berlebihan</span>}
                  </>
                ),
              },
            ]}
            rowKey={(w) => w.employeeId}
            loading={allocations.loading}
            error={allocations.error}
            onRetry={allocations.reload}
            emptyIcon="users"
            emptyTitle="Belum ada alokasi tim"
            emptyBody="Alokasi menjaga satu orang tidak dipakai lebih dari 100% waktu."
            rowActions={(w) => {
              const target = projectRows.find((p) => w.projects.some((x) => x.code === p.code));
              return target ? (
                <RowAction
                  icon="plus"
                  label={`Tambah alokasi ${w.fullName}`}
                  onClick={() => {
                    setAllocModal(target);
                    setAllocEmployee(w.employeeId);
                  }}
                />
              ) : null;
            }}
          />

          <DataTable
            rows={forecastRows}
            columns={[
              {
                key: 'product',
                header: 'Produk',
                render: (f) => (
                  <>
                    <p className="text-[15px] text-ink">{f.name}</p>
                    <p className="text-caption text-fossil tnum">{f.sku}</p>
                  </>
                ),
              },
              {
                key: 'avg',
                header: 'Rata-rata/Bulan',
                align: 'right',
                render: (f) => (
                  <span className="tnum text-body-sm text-ink">
                    {formatNumber(f.weightedMonthly)} {f.unit}
                  </span>
                ),
              },
              {
                key: 'trend',
                header: 'Tren',
                align: 'right',
                render: (f) => (
                  <span className={`tnum text-body-sm ${f.trendPct >= 0 ? 'text-ink' : 'text-rose-700'}`}>
                    {f.trendPct >= 0 ? '+' : ''}
                    {f.trendPct}%
                  </span>
                ),
              },
              {
                key: 'forecast',
                header: 'Prakiraan',
                align: 'right',
                render: (f) => (
                  <span className="tnum text-caption text-fossil">
                    {f.forecast.map((x) => formatNumber(x.qty)).join(' / ')}
                  </span>
                ),
              },
              {
                key: 'reorder',
                header: 'Sinyal',
                render: (f) =>
                  f.suggestsReorder ? <Badge variant="neutral">Perlu restock</Badge> : <span className="text-pebble">-</span>,
              },
            ]}
            rowKey={(f) => f.productId}
            loading={forecast.loading}
            error={forecast.error}
            onRetry={forecast.reload}
            emptyIcon="chart"
            emptyTitle="Belum ada prakiraan"
            emptyBody="Prakiraan butuh riwayat penjualan beberapa bulan."
          />
        </div>
      )}

      {tab === 'pengiriman' && (
        <div className="space-y-3">
          <p className="text-body-sm text-fossil">
            Mengubah status pengiriman tidak mengubah stok. Stok keluar dan HPP dicatat saat pesanan penjualan
            di-fulfil; pindah gudang memakai Transfer di menu Pengadaan.
          </p>
          <DataTable
            rows={shipmentRows}
            columns={shipmentColumns}
            rowKey={(s) => s.id}
            loading={shipments.loading}
            error={shipments.error}
            onRetry={shipments.reload}
            emptyIcon="truck"
            emptyTitle="Belum ada pengiriman"
            emptyBody="Status pengiriman dari ekspedisi masuk lewat webhook."
            onRowClick={openTimeline}
            rowActions={(s) => (
              <>
                {s.status === 'pending' && (
                  <RowAction
                    icon="truck"
                    label={`Berangkatkan ${s.number}`}
                    tone="primary"
                    onClick={() => setShipmentAction({ shipment: s, to: 'in_transit' })}
                  />
                )}
                {(s.status === 'pending' || s.status === 'in_transit') && (
                  <RowAction
                    icon="check"
                    label={`Tandai terkirim ${s.number}`}
                    tone="primary"
                    onClick={() => setShipmentAction({ shipment: s, to: 'delivered' })}
                  />
                )}
                {(s.status === 'pending' || s.status === 'in_transit') && (
                  <RowAction
                    icon="close"
                    label={`Batalkan ${s.number}`}
                    tone="danger"
                    onClick={() => setShipmentAction({ shipment: s, to: 'cancelled' })}
                  />
                )}
                <RowAction icon="route" label={`Riwayat ${s.number}`} onClick={() => openTimeline(s)} />
              </>
            )}
          />
        </div>
      )}

      {tab === 'armada' && (
        <div className="space-y-5">
          <DataTable
            rows={vehicleRows}
            columns={vehicleColumns}
            rowKey={(v) => v.id}
            loading={vehicles.loading}
            error={vehicles.error}
            onRetry={vehicles.reload}
            emptyIcon="truck"
            emptyTitle="Belum ada kendaraan"
            emptyBody="Daftarkan armada untuk mencatat konsumsi bahan bakar dan perawatan."
            rowActions={(v) => (
              <RowAction
                icon="wallet"
                label={`Catat bahan bakar ${v.plateNumber}`}
                onClick={() => {
                  setFuelModal(v);
                  setFuelOdo(String(Number(v.odometerKm)));
                }}
              />
            )}
          />

          {sensorRows.length > 0 && (
            <DataTable
              rows={sensorRows}
              columns={[
                {
                  key: 'name',
                  header: 'Sensor',
                  render: (s) => (
                    <>
                      <p className="text-[15px] text-ink">{s.name}</p>
                      <p className="text-caption text-fossil tnum">{s.code}</p>
                    </>
                  ),
                },
                { key: 'type', header: 'Jenis', render: (s) => <Badge variant="neutral">{s.type}</Badge> },
                {
                  key: 'readings',
                  header: 'Pembacaan',
                  align: 'right',
                  render: (s) => <span className="tnum text-body-sm text-fossil">{s._count.readings}</span>,
                },
                {
                  key: 'seen',
                  header: 'Terakhir Melapor',
                  align: 'right',
                  render: (s) => (
                    <span className="text-caption text-fossil">{s.lastSeenAt ? formatDate(s.lastSeenAt) : 'belum pernah'}</span>
                  ),
                },
              ]}
              rowKey={(s) => s.id}
              loading={sensors.loading}
              error={sensors.error}
              onRetry={sensors.reload}
              emptyIcon="sensor"
              emptyTitle="Belum ada sensor"
              emptyBody="Sensor hanya melaporkan angka; penyesuaian stok tetap lewat stock opname."
            />
          )}
        </div>
      )}

      {tab === 'perawatan' && (
        <div className="space-y-5">
          <DataTable
            rows={dueRows}
            columns={[
              {
                key: 'asset',
                header: 'Aset',
                render: (m) => (
                  <>
                    <p className="text-[15px] text-ink tnum">{m.assetRef}</p>
                    <p className="text-caption text-fossil">{m.description}</p>
                  </>
                ),
              },
              {
                key: 'interval',
                header: 'Interval',
                align: 'right',
                render: (m) => <span className="tnum text-body-sm text-fossil">{m.intervalDays} hari</span>,
              },
              {
                key: 'due',
                header: 'Jatuh Tempo',
                render: (m) => <span className="text-caption text-fossil">{formatDate(m.nextDueAt)}</span>,
              },
              {
                key: 'overdue',
                header: 'Terlambat',
                align: 'right',
                render: (m) => (
                  <Badge variant={m.daysOverdue > 0 ? 'outline' : 'accent'}>
                    {m.daysOverdue > 0 ? `${m.daysOverdue} hari` : 'tepat waktu'}
                  </Badge>
                ),
              },
            ]}
            rowKey={(m) => m.id}
            loading={maintenance.loading}
            error={maintenance.error}
            onRetry={maintenance.reload}
            emptyIcon="calendar"
            emptyTitle="Tidak ada perawatan jatuh tempo"
            emptyBody="Jadwal membuat ulang rencana secara otomatis setelah work order ditutup."
          />

          <DataTable
            rows={listOf<MaintenancePlanRow>(maintenancePlans.data)}
            columns={[
              {
                key: 'asset',
                header: 'Rencana',
                render: (m: MaintenancePlanRow) => (
                  <>
                    <p className="text-[15px] text-ink tnum">{m.assetRef}</p>
                    <p className="text-caption text-fossil">
                      {m.description}
                      {m.vehicle ? ` · ${m.vehicle.plateNumber}` : ''}
                    </p>
                  </>
                ),
              },
              {
                key: 'interval',
                header: 'Interval',
                align: 'right' as const,
                render: (m: MaintenancePlanRow) => <span className="tnum text-body-sm text-fossil">{m.intervalDays} hari</span>,
              },
              {
                key: 'last',
                header: 'Terakhir',
                hideOnMobile: true,
                render: (m: MaintenancePlanRow) => (
                  <span className="text-caption text-fossil">{m.lastDoneAt ? formatDate(m.lastDoneAt) : 'Belum pernah'}</span>
                ),
              },
              {
                key: 'next',
                header: 'Berikutnya',
                render: (m: MaintenancePlanRow) => (
                  <span className="text-caption text-fossil">{m.nextDueAt ? formatDate(m.nextDueAt) : '-'}</span>
                ),
              },
              {
                key: 'state',
                header: 'Status',
                render: (m: MaintenancePlanRow) =>
                  !m.isActive ? (
                    <Badge variant="outline">Nonaktif</Badge>
                  ) : m.daysOverdue > 0 ? (
                    <Badge variant="ink">Terlambat {m.daysOverdue} hari</Badge>
                  ) : (
                    <Badge variant="accent">Terjadwal</Badge>
                  ),
              },
            ]}
            rowKey={(m) => m.id}
            loading={maintenancePlans.loading}
            error={maintenancePlans.error}
            onRetry={maintenancePlans.reload}
            emptyIcon="calendar"
            emptyTitle="Belum ada rencana perawatan"
            emptyBody="Buat rencana berkala untuk mesin, kendaraan, atau perangkat sebelum rusak berat."
            emptyAction={
              <Button variant="primary" icon="plus" onClick={() => setPlanModal(true)}>
                Rencana Perawatan
              </Button>
            }
          />

          <DataTable
            rows={woRows}
            columns={workOrderColumns}
            rowKey={(w) => w.id}
            loading={workOrders.loading}
            error={workOrders.error}
            onRetry={workOrders.reload}
            emptyIcon="wrench"
            emptyTitle="Belum ada work order"
            emptyBody="Work order ditutup akan membukukan biaya pemeliharaan ke akun beban."
            emptyAction={
              <Button variant="ghost" icon="plus" onClick={() => setWoModal(true)}>
                Buat Work Order
              </Button>
            }
            rowActions={(w) =>
              w.status !== 'closed' ? (
                <RowAction
                  icon="check"
                  label={`Tutup ${w.number}`}
                  tone="primary"
                  onClick={() => {
                    setWoClose(w);
                    setWoLabor(String(Number(w.laborCost) || 0));
                    setWoParts(String(Number(w.partsCost) || 0));
                  }}
                />
              ) : null
            }
          />
        </div>
      )}

      <Modal open={projectModal} onClose={() => setProjectModal(false)} title="Proyek Baru" maxWidth="md">
        <div className="space-y-4">
          <Field label="Kode Proyek">
            <Input value={projCode} onChange={(e) => setProjCode(e.target.value)} placeholder="PRJ-001" />
          </Field>
          <Field label="Nama Proyek">
            <Input value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="Renovasi Toko" />
          </Field>
          <Field label="Anggaran">
            <Input type="number" min={0} value={projBudget} onChange={(e) => setProjBudget(e.target.value)} />
          </Field>
          <Button variant="primary" full disabled={mutation.busy} onClick={createProject}>
            {mutation.busy ? 'Menyimpan…' : 'Buat Proyek'}
          </Button>
        </div>
      </Modal>

      <Modal open={milestoneModal} onClose={() => setMilestoneModal(false)} title="Tambah Milestone" maxWidth="md">
        <div className="space-y-4">
          <Field label="Nama Tahap">
            <Input value={msName} onChange={(e) => setMsName(e.target.value)} placeholder="Konstruksi" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mulai" hint="Dipakai untuk menggambar batang Gantt">
              <Input type="date" value={msStart} onChange={(e) => setMsStart(e.target.value)} />
            </Field>
            <Field label="Tenggat">
              <Input type="date" value={msDue} onChange={(e) => setMsDue(e.target.value)} />
            </Field>
          </div>
          <Button variant="primary" full disabled={mutation.busy} onClick={addMilestone}>
            {mutation.busy ? 'Menyimpan…' : 'Tambah Milestone'}
          </Button>
        </div>
      </Modal>

      <Modal open={billModal !== null} onClose={() => setBillModal(null)} title={billModal ? `Tagih ${billModal.name}` : ''} maxWidth="sm">
        <div className="space-y-4">
          <p className="text-body-sm text-fossil">
            Hanya timesheet yang sudah disetujui dan belum pernah ditagihkan yang ikut billed. Timesheet yang
            sudah ditagih tidak akan dihitung dua kali.
          </p>
          <Button variant="primary" full disabled={mutation.busy} onClick={() => billModal && billProject(billModal)}>
            {mutation.busy ? 'Menerbitkan…' : 'Terbitkan Tagihan'}
          </Button>
        </div>
      </Modal>

      <Modal open={allocModal !== null} onClose={() => setAllocModal(null)} title="Alokasi Tim" maxWidth="md">
        <div className="space-y-4">
          <Field label="Proyek">
            <Input value={allocModal?.name ?? ''} readOnly />
          </Field>
          <Field label="Karyawan">
            <Select value={allocEmployee} onChange={(e) => setAllocEmployee(e.target.value)}>
              <option value="">Pilih karyawan</option>
              {workloadRows.map((w) => (
                <option key={w.employeeId} value={w.employeeId}>
                  {w.fullName} (sisa {(100 - w.allocationPct).toFixed(0)}%)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Porsi Waktu" hint="Total seluruh proyek tidak boleh melebihi 100%">
            <Input type="number" min={1} max={100} value={allocPct} onChange={(e) => setAllocPct(e.target.value)} />
          </Field>
          <Field label="Peran">
            <Input value={allocRole} onChange={(e) => setAllocRole(e.target.value)} placeholder="Surveyor" />
          </Field>
          <Button variant="primary" full disabled={mutation.busy} onClick={allocate}>
            {mutation.busy ? 'Menyimpan…' : 'Simpan Alokasi'}
          </Button>
        </div>
      </Modal>

      <Modal open={woModal} onClose={() => setWoModal(false)} title="Work Order Baru" maxWidth="md">
        <div className="space-y-4">
          <Field label="Judul Pekerjaan">
            <Input value={woTitle} onChange={(e) => setWoTitle(e.target.value)} placeholder="Ganti oli rutin" />
          </Field>
          <Field label="Aset / Referensi">
            <Input value={woAsset} onChange={(e) => setWoAsset(e.target.value)} placeholder="TRUCK-01" />
          </Field>
          <Field label="Prioritas">
            <Select value={woPriority} onChange={(e) => setWoPriority(e.target.value)}>
              <option value="low">Rendah</option>
              <option value="medium">Sedang</option>
              <option value="high">Tinggi</option>
              <option value="urgent">Mendesak</option>
            </Select>
          </Field>
          <Button variant="primary" full disabled={mutation.busy} onClick={createWorkOrder}>
            {mutation.busy ? 'Menyimpan…' : 'Buat Work Order'}
          </Button>
        </div>
      </Modal>

      <Modal open={woClose !== null} onClose={() => setWoClose(null)} title={woClose ? `Tutup ${woClose.number}` : ''} maxWidth="md">
        <div className="space-y-4">
          <p className="text-body-sm text-fossil">
            Biaya akan dibukukan ke akun beban pemeliharaan terhadap kas, dan jadwal perawatan untuk aset ini
            dimajukan ke periode berikutnya.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Biaya Tenaga">
              <Input type="number" min={0} value={woLabor} onChange={(e) => setWoLabor(e.target.value)} />
            </Field>
            <Field label="Biaya Suku Cadang">
              <Input type="number" min={0} value={woParts} onChange={(e) => setWoParts(e.target.value)} />
            </Field>
          </div>
          <Button variant="primary" full disabled={mutation.busy} onClick={closeWorkOrder}>
            {mutation.busy ? 'Menutup…' : 'Tutup Work Order'}
          </Button>
        </div>
      </Modal>

      <Modal open={fuelModal !== null} onClose={() => setFuelModal(null)} title={fuelModal ? `Bahan Bakar ${fuelModal.plateNumber}` : ''} maxWidth="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Liter">
              <Input type="number" min={0.01} value={fuelLiters} onChange={(e) => setFuelLiters(e.target.value)} />
            </Field>
            <Field label="Harga per Liter">
              <Input type="number" min={0.01} value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value)} />
            </Field>
          </div>
          <Field label="Odometer" hint="Odometer kendaraan akan diperbarui otomatis">
            <Input type="number" min={0} value={fuelOdo} onChange={(e) => setFuelOdo(e.target.value)} />
          </Field>
          <p className="text-caption text-fossil">
            Total {formatIDR((Number(fuelLiters) || 0) * (Number(fuelPrice) || 0))}
          </p>
          <Button variant="primary" full disabled={mutation.busy} onClick={recordFuel}>
            {mutation.busy ? 'Mencatat…' : 'Catat Konsumsi'}
          </Button>
        </div>
      </Modal>

      <Modal open={planModal} onClose={() => setPlanModal(false)} title="Rencana Perawatan" maxWidth="md">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Aset / Mesin">
              <Input value={planAsset} onChange={(e) => setPlanAsset(e.target.value)} placeholder="GENSET-01" />
            </Field>
            <Field label="Kendaraan (opsional)">
              <Select value={planVehicle} onChange={(e) => setPlanVehicle(e.target.value)}>
                <option value="">Bukan kendaraan</option>
                {vehicleRows.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber} · {v.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Pekerjaan perawatan">
            <Input value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} placeholder="Ganti oli dan filter" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Interval (hari)" hint="Dihitung ulang setelah work order ditutup">
              <Input type="number" inputMode="numeric" min={1} max={3650} value={planInterval} onChange={(e) => setPlanInterval(e.target.value)} />
            </Field>
            <Field label="Jatuh tempo pertama" hint="Kosongkan = hari ini + interval">
              <Input type="date" value={planFirstDue} onChange={(e) => setPlanFirstDue(e.target.value)} />
            </Field>
          </div>
          <Button variant="primary" full disabled={mutation.busy} onClick={createPlan}>
            {mutation.busy ? 'Menyimpan…' : 'Simpan Rencana'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={shipmentAction !== null}
        onClose={() => setShipmentAction(null)}
        title={
          shipmentAction
            ? `${shipmentAction.to === 'in_transit' ? 'Berangkatkan' : shipmentAction.to === 'delivered' ? 'Tandai terkirim' : 'Batalkan'} ${shipmentAction.shipment.number}`
            : ''
        }
        maxWidth="sm"
      >
        {shipmentAction && (
          <div className="space-y-4">
            <p className="text-body-sm text-fossil">
              {shipmentAction.to === 'cancelled'
                ? 'Pengiriman yang dibatalkan tidak bisa dibuka lagi. Stok tidak berubah.'
                : shipmentAction.to === 'delivered'
                  ? 'Status terkirim bersifat final dan tidak bisa dikembalikan. Stok tidak berubah.'
                  : 'Pengiriman akan ditandai dalam perjalanan. Stok tidak berubah.'}
            </p>
            {shipmentAction.to === 'delivered' && (
              <Field label="Nama penerima (opsional)">
                <Input value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Nama penerima" />
              </Field>
            )}
            <Button variant="primary" full disabled={mutation.busy} onClick={changeShipmentStatus}>
              {mutation.busy ? 'Memproses…' : 'Konfirmasi'}
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={timelineModal !== null} onClose={() => setTimelineModal(null)} title={timelineModal ? `Riwayat ${timelineModal.number}` : ''} maxWidth="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-body-sm">
            <div>
              <p className="text-caption text-fossil">Tujuan</p>
              <p className="text-ink">{timelineModal?.destination}</p>
            </div>
            <div>
              <p className="text-caption text-fossil">Ekspedisi</p>
              <p className="text-ink">{timelineModal?.carrierName ?? 'Belum ditugaskan'}</p>
            </div>
          </div>

          {timelineEvents.length === 0 ? (
            <p className="text-body-sm text-fossil">
              Belum ada riwayat. Perubahan status manual dan webhook ekspedisi tercatat di sini.
            </p>
          ) : (
            <div className="space-y-3">
              {timelineEvents.map((e) => (
                <div key={e.id} className="flex gap-3">
                  <div className="flex flex-col items-center pt-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-olive" />
                    <span className="flex-1 w-px bg-ash mt-1" />
                  </div>
                  <div className="pb-2 min-w-0">
                    <p className="text-body-sm text-ink">{e.description || e.status}</p>
                    <p className="text-caption text-fossil">
                      {formatDate(e.occurredAt)}
                      {e.location ? ` · ${e.location}` : ''}
                      {e.source === 'carrier' ? ' · dari ekspedisi' : ' · manual'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
