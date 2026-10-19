import type { DemoRole } from '../context';
import type { ScriptedDay } from './attendance-plan';
import type { SeriesSpec } from './sensor-series';

/**
 * Bentuk data seed people-ops per usaha. Semua offset waktu bermakna "hari lalu" (negatif = ke depan) dan
 * dipetakan lewat ctx.daysAgo/ctx.at. Karyawan dirujuk lewat nomor karyawan (mis. "KS-0002").
 */

// ───────── SDM ─────────

export interface LeaveSeed {
  employee: string;
  /** Kunci alami: disimpan sebagai alasan cuti dengan awalan "[demo] ". */
  reason: string;
  startAgo: number;
  /** rentang kalender (hari) */
  spanDays: number;
  decision: 'pending' | 'approved' | 'rejected';
  decidedBy?: DemoRole;
}

export type ApplicantPath = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';

export interface ApplicantSeed {
  name: string;
  email: string;
  phone: string;
  coverNote: string;
  appliedAgo: number;
  rating?: number;
  path: ApplicantPath;
  /** untuk path 'rejected': tahap terakhir sebelum ditolak */
  rejectedAfter?: 'applied' | 'screening' | 'interview' | 'offer';
  rejectReason?: string;
  /** untuk path 'hired' */
  hire?: { salary: number; hireAgo: number };
}

export interface PostingSeed {
  title: string;
  departmentCode: string;
  positionCode: string;
  description: string;
  employmentType: 'full_time' | 'part_time' | 'contract';
  salaryMin: number;
  salaryMax: number;
  openings: number;
  openedAgo: number;
  /** ditutup manual setelah semua pelamar diproses */
  closeManually?: boolean;
  applicants: ApplicantSeed[];
}

export interface KpiSeed {
  code: string;
  name: string;
  description: string;
  unit: string;
  higherIsBetter: boolean;
}

export interface KpiTargetSeed {
  employee: string;
  kpi: string;
  target: number;
  weight: number;
  /** aktual = target * rasio (bulan lalu dan bulan berjalan) */
  ratioPrev: number;
  ratioCur: number;
}

export interface ReviewSeed {
  employee: string;
  strengths: string;
  improvements: string;
  /** penilaian periode berjalan dikirim (submitted) atau tetap draf */
  submitCurrent: boolean;
}

export interface PayrollAdjustSeed {
  employee: string;
  /** 0 = bulan berjalan, 1 = bulan lalu, dst. */
  monthsBack: number;
  bonus?: number;
  otherEarning?: number;
  otherDeduction?: number;
}

export interface HrSeed {
  attendanceScript: Array<{ employee: string } & ScriptedDay>;
  leaves: LeaveSeed[];
  postings: PostingSeed[];
  kpis: KpiSeed[];
  kpiTargets: KpiTargetSeed[];
  reviews: ReviewSeed[];
  /** bonus kinerja, kasbon, dst. */
  payrollAdjust: PayrollAdjustSeed[];
}

// ───────── Proyek ─────────

export interface MilestoneSeed {
  name: string;
  startAgo: number;
  dueAgo: number;
  /** nama milestone yang harus selesai lebih dulu */
  dependsOn?: string[];
  state: 'done' | 'progress' | 'todo';
  progress?: number;
  /** untuk state 'done': kapan selesai (hari lalu) */
  doneAgo?: number;
}

export interface AllocationSeed {
  employee: string;
  pct: number;
  hoursPerWeek: number;
  role: string;
  startAgo: number;
  endAgo?: number;
}

/** Deret timesheet harian satu karyawan; hanya hari kerja yang cocok dengan `weekdays` (1=Senin ... 5=Jumat). */
export interface TimesheetPlan {
  employee: string;
  /** rentang inklusif, fromAgo >= toAgo */
  fromAgo: number;
  toAgo: number;
  weekdays: number[];
  hours: number;
  rate: number;
  note: string;
  billable: boolean;
}

export interface ProjectSeed {
  code: string;
  name: string;
  customer?: string;
  manager: string;
  budget: number;
  startAgo: number;
  endAgo: number;
  description: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed';
  milestones: MilestoneSeed[];
  allocations: AllocationSeed[];
  timesheets: TimesheetPlan[];
  /** baris dengan ago >= nilai ini disetujui SEBELUM penagihan */
  approveBeforeBillAgo: number;
  /** baris lain dengan ago >= nilai ini disetujui SESUDAH penagihan (belum ditagih); sisanya menunggu persetujuan */
  approveAfterBillAgo: number;
  /** terbitkan faktur piutang dari timesheet billable yang sudah disetujui */
  bill: boolean;
}

// ───────── Armada, perawatan, pengiriman ─────────

export interface FuelSeed {
  ago: number;
  liters: number;
  pricePerLiter: number;
  odometerKm: number;
  station: string;
}

export interface VehicleSeed {
  plateNumber: string;
  name: string;
  type: string;
  capacityKg: number;
  odometerKm: number;
  fuel: FuelSeed[];
}

export interface MaintenancePlanSeed {
  /** plat nomor kendaraan, atau nama aset non-kendaraan */
  asset: string;
  isVehicle: boolean;
  description: string;
  intervalDays: number;
  /** jatuh tempo pertama: positif = sudah lewat (hari lalu), negatif = belum */
  dueAgo: number;
}

export interface WorkOrderSeed {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  /** plat kendaraan bila terkait kendaraan */
  vehicle?: string;
  /** nama aset non-kendaraan */
  assetRef?: string;
  /** deskripsi rencana perawatan yang ditautkan */
  plan?: string;
  assignee: string;
  scheduledAgo: number;
  state: 'open' | 'in_progress' | 'completed' | 'closed';
  /** kapan mulai dikerjakan / selesai (hari lalu) */
  startedAgo?: number;
  doneAgo?: number;
  laborCost?: number;
  partsCost?: number;
  resolution?: string;
}

export interface TrackingEventSeed {
  ago: number;
  hour: number;
  minute: number;
  status: 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered';
  description: string;
  location: string;
}

export interface ShipmentSeed {
  /** kunci alami; disimpan sebagai awalan catatan "[demo:KEY] ..." */
  key: string;
  note: string;
  origin: string;
  destination: string;
  outletIndex: number;
  vehicle?: string;
  items: Array<{ sku: string; qty: number }>;
  /** diisi = jalur kurir pihak ketiga (webhook bertanda tangan); kosong = armada sendiri (catatan manual) */
  carrier?: string;
  /** hari lalu pengiriman dibuat */
  createdAgo: number;
  /** urutan kejadian; kosong = masih disiapkan (pending) */
  events: TrackingEventSeed[];
  /** pengiriman dibatalkan setelah dibuat (hanya bila tanpa event) */
  cancel?: boolean;
  receiver?: string;
}

export interface FleetSeed {
  vehicles: VehicleSeed[];
  plans: MaintenancePlanSeed[];
  workOrders: WorkOrderSeed[];
  shipments: ShipmentSeed[];
}

// ───────── IoT ─────────

export interface SensorSeed {
  code: string;
  name: string;
  type: 'temperature' | 'humidity' | 'counter' | 'power' | 'vibration' | 'weight';
  unit: string;
  /** gudang outlet ke-n (urutan biz.outlets) */
  warehouseOutletIndex?: number;
  workCenterCode?: string;
  series: Omit<SeriesSpec, 'code'>;
}

export interface PeopleOpsSeed {
  hr: HrSeed;
  projects: ProjectSeed[];
  fleet: FleetSeed;
  sensors: SensorSeed[];
}
