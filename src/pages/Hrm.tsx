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
import { formatDate, formatIDR, formatNumber } from '../lib/format';
import { listOf, useResource } from '../lib/useResource';
import { toast } from '../stores/toastStore';
import {
  ActualModal,
  ApplicantModal,
  EmployeeModal,
  HireModal,
  KpiModal,
  LeaveRequestModal,
  PayrollDetailModal,
  PayrollRunModal,
  PositionModal,
  ReviewModal,
  TargetsModal,
  TerminateModal,
} from '../components/hrm/HrmModals';

type TabKey = 'karyawan' | 'kehadiran' | 'cuti' | 'gaji' | 'rekrutmen' | 'kinerja';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'karyawan', label: 'Karyawan' },
  { value: 'kehadiran', label: 'Kehadiran' },
  { value: 'cuti', label: 'Cuti' },
  { value: 'gaji', label: 'Payroll' },
  { value: 'rekrutmen', label: 'Rekrutmen' },
  { value: 'kinerja', label: 'Kinerja & KPI' },
];

interface Employee {
  id: string;
  employeeNo: string;
  fullName: string;
  email: string;
  phone: string;
  hireDate: string;
  baseSalary: number | string;
  status: string;
  isActive: boolean;
  department: { id: string; name: string } | null;
  position: { id: string; name: string } | null;
}

interface Department {
  id: string;
  code: string;
  name: string;
  _count: { employees: number };
}

interface AttendanceSummaryRow {
  employeeId: string;
  employeeNo: string;
  fullName: string;
  present: number;
  absent: number;
  leave: number;
  overtime: number;
}

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  reason: string;
  employee: { employeeNo: string; fullName: string };
}

interface PayrollRun {
  id: string;
  period: string;
  status: string;
  totalGross: number | string;
  totalDeduction: number | string;
  totalNet: number | string;
  totalEmployerCost: number | string;
  _count: { items: number };
}

interface JobPosting {
  id: string;
  title: string;
  status: string;
  openings: number;
  openedAt: string;
  department: { name: string } | null;
  position: { name: string } | null;
  _count: { applicants: number };
}

interface Applicant {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  stage: string;
  rejectReason: string;
  appliedAt: string;
  employeeId: string | null;
  onboardingDone: boolean;
  jobPosting: { title: string };
}

interface PipelineData {
  stages: Array<{ stage: string; count: number }>;
  totalApplicants: number;
  hired: number;
  rejected: number;
  hireRatePct: number;
}

interface KpiDefinition {
  id: string;
  code: string;
  name: string;
  unit: string;
  higherIsBetter: boolean;
  isActive: boolean;
  _count: { targets: number };
}

interface KpiTarget {
  id: string;
  period: string;
  target: number | string;
  actual: number | string | null;
  weight: number | string;
  dueDate: string | null;
  employee: { employeeNo: string; fullName: string };
  kpi: { code: string; name: string; unit: string; higherIsBetter: boolean };
}

interface PerformanceReview {
  id: string;
  period: string;
  score: number | string;
  grade: string;
  status: string;
  strengths: string;
  improvements: string;
  employee: { employeeNo: string; fullName: string };
}

const applicantStageLabel: Record<string, string> = {
  applied: 'Dilamar',
  screening: 'Screening',
  interview: 'Wawancara',
  offer: 'Tawaran',
  hired: 'Diterima',
  rejected: 'Ditolak',
};


export default function Hrm() {
  const [tab, setTab] = useState<TabKey>('karyawan');
  const [query, setQuery] = useState('');

  const employees = useResource<Employee[]>('/v1/hrm/employees');
  const departments = useResource<Department[]>('/v1/hrm/departments');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const attendance = useResource<{ period: string; data: AttendanceSummaryRow[] }>(
    `/v1/hrm/attendance/summary?month=${month}`,
  );
  const leaves = useResource<LeaveRequest[]>('/v1/hrm/leaves');
  const payroll = useResource<PayrollRun[]>('/v1/hrm/payroll/runs');
  const postings = useResource<JobPosting[]>('/v1/recruitment/postings');
  const applicants = useResource<Applicant[]>('/v1/recruitment/applicants');
  const pipeline = useResource<PipelineData>('/v1/recruitment/pipeline');
  const kpis = useResource<KpiDefinition[]>('/v1/performance/kpis');
  const kpiTargets = useResource<KpiTarget[]>('/v1/performance/targets');
  const reviews = useResource<PerformanceReview[]>('/v1/performance/reviews');

  const [deptModal, setDeptModal] = useState(false);
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptParent, setDeptParent] = useState('');

  const [clockModal, setClockModal] = useState(false);
  const [clockEmployee, setClockEmployee] = useState('');
  const [clockAction, setClockAction] = useState<'clock-in' | 'clock-out'>('clock-in');

  const [postingModal, setPostingModal] = useState(false);
  const [postingTitle, setPostingTitle] = useState('');
  const [postingDept, setPostingDept] = useState('');
  const [postingPosition, setPostingPosition] = useState('');
  const [postingOpenings, setPostingOpenings] = useState('1');

  const [applicantStage, setApplicantStage] = useState<{ applicant: Applicant; next: string } | null>(null);

  const [saving, setSaving] = useState(false);

  const [employeeModal, setEmployeeModal] = useState(false);
  const [positionModal, setPositionModal] = useState(false);
  const [terminateTarget, setTerminateTarget] = useState<Employee | null>(null);
  const [leaveModal, setLeaveModal] = useState(false);
  const [payrollModal, setPayrollModal] = useState(false);
  const [payrollDetailId, setPayrollDetailId] = useState<string | null>(null);
  const [applicantModal, setApplicantModal] = useState(false);
  const [hireTarget, setHireTarget] = useState<Applicant | null>(null);
  const [kpiModal, setKpiModal] = useState(false);
  const [targetsModal, setTargetsModal] = useState(false);
  const [actualTarget, setActualTarget] = useState<KpiTarget | null>(null);
  const [reviewModal, setReviewModal] = useState(false);

  const employeeRows = useMemo(
    () =>
      listOf<Employee>(employees.data).filter((e) =>
        `${e.fullName} ${e.employeeNo} ${e.email}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [employees.data, query],
  );
  const deptRows = listOf<Department>(departments.data);
  const attendanceRows = useMemo(() => {
    const rows = listOf<AttendanceSummaryRow>(attendance.data);
    return rows.filter((a) => `${a.fullName} ${a.employeeNo}`.toLowerCase().includes(query.toLowerCase()));
  }, [attendance.data, query]);
  const employeeOptions = useMemo(
    () => listOf<Employee>(employees.data).filter((e) => e.isActive).map((e) => ({ id: e.id, employeeNo: e.employeeNo, fullName: e.fullName })),
    [employees.data],
  );
  const leaveRows = useMemo(
    () =>
      listOf<LeaveRequest>(leaves.data).filter((l) =>
        l.employee?.fullName?.toLowerCase().includes(query.toLowerCase()),
      ),
    [leaves.data, query],
  );
  const payrollRows = listOf<PayrollRun>(payroll.data);
  const postingRows = listOf<JobPosting>(postings.data);
  const applicantRows = listOf<Applicant>(applicants.data);
  const kpiRows = listOf<KpiDefinition>(kpis.data);
  const targetRows = listOf<KpiTarget>(kpiTargets.data);
  const reviewRows = listOf<PerformanceReview>(reviews.data);

  async function createDepartment() {
    if (deptCode.trim().length < 1 || deptName.trim().length < 2) {
      toast({ title: 'Kode dan nama departemen wajib diisi.', icon: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/v1/hrm/departments', {
        method: 'POST',
        body: JSON.stringify({
          code: deptCode.trim(),
          name: deptName.trim(),
          parentId: deptParent || undefined,
        }),
      });
      toast({ title: 'Departemen dibuat.', icon: 'check' });
      setDeptModal(false);
      setDeptCode('');
      setDeptName('');
      setDeptParent('');
      departments.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function submitClock() {
    if (!clockEmployee) {
      toast({ title: 'Pilih karyawan lebih dulu.', icon: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<Record<string, number | string>>(
        `/v1/hrm/attendance/${clockEmployee}/${clockAction}`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      const detail =
        clockAction === 'clock-in'
          ? result.lateMinutes
            ? `Terlambat ${result.lateMinutes} menit.`
            : 'Tepat waktu.'
          : `Kerja ${result.workedHours} jam, lembur ${result.overtimeHours} jam.`;
      toast({ title: 'Kehadiran tercatat.', description: detail, icon: 'check' });
      setClockModal(false);
      attendance.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mencatat.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function decideLeave(id: string, approve: boolean) {
    try {
      await apiFetch(`/v1/hrm/leaves/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ approve }),
      });
      toast({ title: approve ? 'Cuti disetujui.' : 'Cuti ditolak.', icon: 'check' });
      leaves.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal memproses.', icon: 'warning' });
    }
  }

  async function createPosting() {
    if (postingTitle.trim().length < 2) {
      toast({ title: 'Judul lowongan wajib diisi.', icon: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/v1/recruitment/postings', {
        method: 'POST',
        body: JSON.stringify({
          title: postingTitle.trim(),
          departmentId: postingDept || undefined,
          positionId: postingPosition || undefined,
          openings: Number(postingOpenings) || 1,
        }),
      });
      toast({ title: 'Lowongan dibuka.', icon: 'check' });
      setPostingModal(false);
      setPostingTitle('');
      postings.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal membuka lowongan.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function moveApplicantStage(applicant: Applicant, stage: string) {
    try {
      await apiFetch(`/v1/recruitment/applicants/${applicant.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage, note: stage === 'rejected' ? 'Tidak memenuhi kebutuhan' : undefined }),
      });
      toast({ title: `Pelamar dipindahkan ke ${applicantStageLabel[stage] ?? stage}.`, icon: 'check' });
      setApplicantStage(null);
      applicants.reload();
      pipeline.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal memindahkan tahap.', icon: 'warning' });
    }
  }

  async function completeOnboarding(applicant: Applicant) {
    try {
      await apiFetch(`/v1/recruitment/applicants/${applicant.id}/onboarding-complete`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast({ title: `Onboarding ${applicant.fullName} selesai.`, icon: 'check' });
      applicants.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyelesaikan onboarding.', icon: 'warning' });
    }
  }

  const employeeColumns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Karyawan',
      render: (e) => (
        <>
          <p className="text-[15px] text-ink font-medium">{e.fullName}</p>
          <p className="text-caption text-fossil tnum">{e.employeeNo}</p>
        </>
      ),
    },
    {
      key: 'org',
      header: 'Unit',
      render: (e) => (
        <span className="text-body-sm text-fossil">
          {e.department?.name ?? '-'}
          {e.position?.name ? ` · ${e.position.name}` : ''}
        </span>
      ),
    },
    {
      key: 'hire',
      header: 'Masuk',
      render: (e) => <span className="text-caption text-fossil">{formatDate(e.hireDate)}</span>,
    },
    {
      key: 'salary',
      header: 'Gaji Pokok',
      align: 'right',
      render: (e) => <span className="tnum text-[15px] text-ink">{formatIDR(Number(e.baseSalary))}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => (
        <Badge variant={e.isActive ? 'accent' : 'outline'}>{e.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
      ),
    },
  ];

  const attendanceColumns: Column<AttendanceSummaryRow>[] = [
    {
      key: 'employee',
      header: 'Karyawan',
      render: (a) => (
        <>
          <p className="text-[15px] text-ink">{a.fullName}</p>
          <p className="text-caption text-fossil tnum">{a.employeeNo}</p>
        </>
      ),
    },
    {
      key: 'present',
      header: 'Hadir',
      align: 'right',
      render: (a) => <span className="tnum text-[15px] text-ink">{a.present} hari</span>,
    },
    {
      key: 'absent',
      header: 'Alpa',
      align: 'right',
      render: (a) => <span className={`tnum text-body-sm ${a.absent > 0 ? 'text-rose-700' : 'text-fossil'}`}>{a.absent} hari</span>,
    },
    {
      key: 'leave',
      header: 'Cuti',
      align: 'right',
      render: (a) => <span className="tnum text-body-sm text-fossil">{a.leave} hari</span>,
    },
    {
      key: 'overtime',
      header: 'Lembur',
      align: 'right',
      render: (a) => <span className="tnum text-body-sm text-fossil">{formatNumber(a.overtime)} jam</span>,
    },
  ];

  const leaveColumns: Column<LeaveRequest>[] = [
    {
      key: 'employee',
      header: 'Karyawan',
      render: (l) => (
        <>
          <p className="text-[15px] text-ink">{l.employee?.fullName ?? '-'}</p>
          <p className="text-caption text-fossil tnum">{l.employee?.employeeNo}</p>
        </>
      ),
    },
    {
      key: 'days',
      header: 'Lama',
      align: 'right',
      render: (l) => <span className="tnum text-body-sm text-ink">{l.days} hari</span>,
    },
    {
      key: 'range',
      header: 'Periode',
      render: (l) => (
        <span className="text-body-sm text-fossil tnum">
          {formatDate(l.startDate)} - {formatDate(l.endDate)}
        </span>
      ),
    },
    { key: 'reason', header: 'Alasan', hideOnMobile: true, render: (l) => <span className="text-body-sm text-fossil">{l.reason || '-'}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (l) => (
        <Badge variant={l.status === 'approved' ? 'accent' : l.status === 'rejected' ? 'outline' : 'neutral'}>
          {l.status === 'approved' ? 'Disetujui' : l.status === 'rejected' ? 'Ditolak' : 'Menunggu'}
        </Badge>
      ),
    },
  ];

  const payrollColumns: Column<PayrollRun>[] = [
    { key: 'period', header: 'Periode', render: (p) => <span className="tnum text-[15px] text-ink font-medium">{p.period}</span> },
    {
      key: 'employee',
      header: 'Karyawan',
      align: 'right',
      render: (p) => <span className="tnum text-body-sm text-fossil">{p._count.items}</span>,
    },
    {
      key: 'gross',
      header: 'Kotor',
      align: 'right',
      render: (p) => <span className="tnum text-body-sm text-ink">{formatIDR(Number(p.totalGross))}</span>,
    },
    {
      key: 'deduction',
      header: 'Potongan',
      align: 'right',
      hideOnMobile: true,
      render: (p) => <span className="tnum text-body-sm text-fossil">{formatIDR(Number(p.totalDeduction))}</span>,
    },
    {
      key: 'net',
      header: 'Dibayarkan',
      align: 'right',
      render: (p) => <span className="tnum text-[15px] text-ink">{formatIDR(Number(p.totalNet))}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge variant={p.status === 'posted' ? 'ink' : 'neutral'}>
          {p.status === 'posted' ? 'Diposting' : 'Draf'}
        </Badge>
      ),
    },
  ];

  const postingColumns: Column<JobPosting>[] = [
    {
      key: 'title',
      header: 'Posisi',
      render: (j) => (
        <>
          <p className="text-[15px] text-ink font-medium">{j.title}</p>
          <p className="text-caption text-fossil">
            {j.department?.name ?? '-'}
            {j.position?.name ? ` · ${j.position.name}` : ''}
          </p>
        </>
      ),
    },
    {
      key: 'openings',
      header: 'Kuota',
      align: 'right',
      render: (j) => (
        <span className="tnum text-body-sm text-ink">
          {j._count.applicants}/{j.openings}
        </span>
      ),
    },
    {
      key: 'opened',
      header: 'Dibuka',
      render: (j) => <span className="text-caption text-fossil">{formatDate(j.openedAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (j) => (
        <Badge variant={j.status === 'open' ? 'accent' : 'outline'}>
          {j.status === 'open' ? 'Dibuka' : 'Ditutup'}
        </Badge>
      ),
    },
  ];

  const applicantColumns: Column<Applicant>[] = [
    {
      key: 'name',
      header: 'Pelamar',
      render: (a) => (
        <>
          <p className="text-[15px] text-ink font-medium">{a.fullName}</p>
          <p className="text-caption text-fossil">{a.jobPosting?.title ?? '-'}</p>
        </>
      ),
    },
    {
      key: 'contact',
      header: 'Kontak',
      render: (a) => (
        <>
          <p className="text-body-sm text-ink truncate">{a.email}</p>
          {a.phone && <p className="text-caption text-fossil tnum">{a.phone}</p>}
        </>
      ),
    },
    {
      key: 'stage',
      header: 'Tahap',
      render: (a) => <Badge variant={a.stage === 'hired' ? 'ink' : 'neutral'}>{applicantStageLabel[a.stage] ?? a.stage}</Badge>,
    },
    {
      key: 'applied',
      header: 'Dilamar',
      align: 'right',
      render: (a) => <span className="text-caption text-fossil">{formatDate(a.appliedAt)}</span>,
    },
  ];

  const kpiColumns: Column<KpiDefinition>[] = [
    {
      key: 'name',
      header: 'Indikator',
      render: (k) => (
        <>
          <p className="text-[15px] text-ink font-medium">{k.name}</p>
          <p className="text-caption text-fossil tnum">{k.code}</p>
        </>
      ),
    },
    { key: 'unit', header: 'Satuan', render: (k) => <span className="text-body-sm text-fossil">{k.unit}</span> },
    {
      key: 'direction',
      header: 'Arah',
      render: (k) => (
        <Badge variant="neutral">{k.higherIsBetter ? 'Makin tinggi' : 'Makin rendah'}</Badge>
      ),
    },
    {
      key: 'targets',
      header: 'Target',
      align: 'right',
      render: (k) => <span className="tnum text-body-sm text-ink">{k._count.targets}</span>,
    },
  ];

  const targetColumns: Column<KpiTarget>[] = [
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
      key: 'kpi',
      header: 'KPI',
      render: (t) => (
        <>
          <p className="text-body-sm text-ink">{t.kpi?.name ?? '-'}</p>
          <p className="text-caption text-fossil tnum">{t.kpi?.code}</p>
        </>
      ),
    },
    {
      key: 'target',
      header: 'Target / Aktual',
      align: 'right',
      render: (t) => (
        <>
          <span className="tnum text-[15px] text-ink">{formatNumber(Number(t.target))}</span>
          <span className="block text-caption text-fossil tnum">
            {t.actual === null ? 'belum diisi' : formatNumber(Number(t.actual))}
          </span>
        </>
      ),
    },
    { key: 'period', header: 'Periode', render: (t) => <span className="text-body-sm text-fossil tnum">{t.period}</span> },
  ];

  const reviewColumns: Column<PerformanceReview>[] = [
    {
      key: 'employee',
      header: 'Karyawan',
      render: (r) => (
        <>
          <p className="text-[15px] text-ink">{r.employee?.fullName ?? '-'}</p>
          <p className="text-caption text-fossil tnum">{r.employee?.employeeNo}</p>
        </>
      ),
    },
    { key: 'period', header: 'Periode', render: (r) => <span className="text-body-sm text-fossil tnum">{r.period}</span> },
    {
      key: 'score',
      header: 'Skor',
      align: 'right',
      render: (r) => <span className="tnum text-[15px] text-ink">{formatNumber(Number(r.score))}</span>,
    },
    {
      key: 'grade',
      header: 'Predikat',
      align: 'center',
      render: (r) => <Badge variant={r.grade.startsWith('A') ? 'accent' : 'neutral'}>{r.grade}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant={r.status === 'submitted' ? 'ink' : 'outline'}>
          {r.status === 'submitted' ? 'Diajukan' : 'Draf'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sumber Daya Manusia"
        subtitle="Karyawan, kehadiran, payroll, rekrutmen, dan kinerja"
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {tab === 'karyawan' && (
              <>
                <Button variant="ghost" icon="building" className="flex-1 sm:flex-initial" onClick={() => setDeptModal(true)}>
                  Departemen
                </Button>
                <Button variant="ghost" icon="tag" className="flex-1 sm:flex-initial" onClick={() => setPositionModal(true)}>
                  Jabatan
                </Button>
                <Button variant="primary" icon="plus" className="flex-1 sm:flex-initial" onClick={() => setEmployeeModal(true)}>
                  Karyawan
                </Button>
              </>
            )}
            {tab === 'kehadiran' && (
              <Button variant="primary" icon="clock" className="flex-1 sm:flex-initial" onClick={() => setClockModal(true)}>
                Absen
              </Button>
            )}
            {tab === 'cuti' && (
              <Button variant="primary" icon="plus" className="flex-1 sm:flex-initial" onClick={() => setLeaveModal(true)}>
                Ajukan Cuti
              </Button>
            )}
            {tab === 'gaji' && (
              <Button variant="primary" icon="wallet" className="flex-1 sm:flex-initial" onClick={() => setPayrollModal(true)}>
                Hitung Payroll
              </Button>
            )}
            {tab === 'rekrutmen' && (
              <>
                <Button variant="ghost" icon="megaphone" className="flex-1 sm:flex-initial" onClick={() => setPostingModal(true)}>
                  Lowongan
                </Button>
                <Button variant="primary" icon="plus" className="flex-1 sm:flex-initial" onClick={() => setApplicantModal(true)}>
                  Pelamar
                </Button>
              </>
            )}
            {tab === 'kinerja' && (
              <>
                <Button variant="ghost" icon="target" className="flex-1 sm:flex-initial" onClick={() => setKpiModal(true)}>
                  KPI
                </Button>
                <Button variant="ghost" icon="gauge" className="flex-1 sm:flex-initial" onClick={() => setTargetsModal(true)}>
                  Target
                </Button>
                <Button variant="primary" icon="star" className="flex-1 sm:flex-initial" onClick={() => setReviewModal(true)}>
                  Penilaian
                </Button>
              </>
            )}
          </div>
        }
      />

      <StatRow
        items={[
          { label: 'Karyawan aktif', value: employeeRows.filter((e) => e.isActive).length },
          { label: 'Departemen', value: deptRows.length },
          { label: 'Cuti menunggu', value: leaveRows.filter((l) => l.status === 'pending').length },
          { label: 'Tingkat rekrutmen', value: `${pipeline.data?.hireRatePct ?? 0}%`, tone: 'accent' },
        ]}
      />

      <Tabs options={tabOptions} value={tab} onChange={setTab} />

      {tab !== 'rekrutmen' && (
        <Reveal>
          <div className="relative">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pebble" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama atau nomor karyawan…"
              className="w-full bg-paper border border-pebble/70 rounded-lg pl-9 pr-3 py-2.5 text-[15px] placeholder:text-pebble focus:border-ink focus:outline-none transition-colors"
            />
          </div>
        </Reveal>
      )}

      {tab === 'karyawan' && (
        <DataTable
          rows={employeeRows}
          columns={employeeColumns}
          rowKey={(e) => e.id}
          loading={employees.loading}
          error={employees.error}
          onRetry={employees.reload}
          emptyIcon="users"
          emptyTitle="Belum ada karyawan"
          emptyBody="Tambahkan karyawan pertama untuk mulai mencatat absensi dan payroll."
          emptyAction={
            <Button variant="ghost" icon="plus" onClick={() => setEmployeeModal(true)}>
              Karyawan Baru
            </Button>
          }
          rowActions={(e) =>
            e.isActive ? <RowAction icon="logout" label={`Akhiri masa kerja ${e.fullName}`} tone="danger" onClick={() => setTerminateTarget(e)} /> : null
          }
        />
      )}

      {tab === 'kehadiran' && (
        <div className="space-y-4">
          <div className="max-w-[220px]">
            <Input label="Bulan" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </div>
        <DataTable
          rows={attendanceRows}
          columns={attendanceColumns}
          rowKey={(a) => a.employeeId}
          loading={attendance.loading}
          error={attendance.error}
          onRetry={attendance.reload}
          emptyIcon="clock"
          emptyTitle="Belum ada karyawan aktif"
          emptyBody="Ringkasan kehadiran muncul setelah ada karyawan. Gunakan tombol Absen untuk mencatat masuk dan pulang."
          emptyAction={
            <Button variant="ghost" icon="clock" onClick={() => setClockModal(true)}>
              Catat Absen
            </Button>
          }
        />
        </div>
      )}

      {tab === 'cuti' && (
        <DataTable
          rows={leaveRows}
          columns={leaveColumns}
          rowKey={(l) => l.id}
          loading={leaves.loading}
          error={leaves.error}
          onRetry={leaves.reload}
          emptyIcon="calendar"
          emptyTitle="Belum ada pengajuan cuti"
          emptyAction={
            <Button variant="ghost" icon="plus" onClick={() => setLeaveModal(true)}>
              Ajukan Cuti
            </Button>
          }
          rowActions={(l) =>
            l.status === 'pending' ? (
              <>
                <RowAction icon="check" label={`Setujui cuti ${l.employee?.fullName}`} onClick={() => decideLeave(l.id, true)} />
                <RowAction icon="close" label={`Tolak cuti ${l.employee?.fullName}`} tone="danger" onClick={() => decideLeave(l.id, false)} />
              </>
            ) : null
          }
        />
      )}

      {tab === 'gaji' && (
        <DataTable
          rows={payrollRows}
          columns={payrollColumns}
          rowKey={(p) => p.id}
          loading={payroll.loading}
          error={payroll.error}
          onRetry={payroll.reload}
          emptyIcon="wallet"
          emptyTitle="Belum ada payroll"
          emptyBody="Hitung payroll bulanan: gaji pokok, lembur dari absensi, bonus, potongan, dan PPh 21."
          emptyAction={
            <Button variant="ghost" icon="plus" onClick={() => setPayrollModal(true)}>
              Hitung Payroll
            </Button>
          }
          onRowClick={(p) => setPayrollDetailId(p.id)}
        />
      )}

      {tab === 'rekrutmen' && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {(pipeline.data?.stages ?? []).map((s) => (
              <Card key={s.stage} className="px-4 py-3 min-w-[120px]">
                <p className="text-caption text-fossil">{applicantStageLabel[s.stage] ?? s.stage}</p>
                <p className="text-heading-sm tnum text-ink mt-0.5">{s.count}</p>
              </Card>
            ))}
          </div>

          <DataTable
            rows={postingRows}
            columns={postingColumns}
            rowKey={(j) => j.id}
            loading={postings.loading}
            error={postings.error}
            onRetry={postings.reload}
            emptyIcon="megaphone"
            emptyTitle="Belum ada lowongan"
            emptyBody="Buka lowongan untuk mulai menerima pelamar."
            emptyAction={
              <Button variant="ghost" icon="plus" onClick={() => setPostingModal(true)}>
                Buka Lowongan
              </Button>
            }
            rowActions={(j) =>
              j.status === 'open' ? (
                <RowAction
                  icon="close"
                  label={`Tutup lowongan ${j.title}`}
                  tone="danger"
                  onClick={() =>
                    apiFetch(`/v1/recruitment/postings/${j.id}/close`, { method: 'POST', body: JSON.stringify({}) })
                      .then(() => {
                        toast({ title: 'Lowongan ditutup.', icon: 'check' });
                        postings.reload();
                      })
                      .catch((e: Error) => toast({ title: e.message, icon: 'warning' }))
                  }
                />
              ) : null
            }
          />

          <DataTable
            rows={applicantRows}
            columns={applicantColumns}
            rowKey={(a) => a.id}
            loading={applicants.loading}
            error={applicants.error}
            onRetry={applicants.reload}
            emptyIcon="users"
            emptyTitle="Belum ada pelamar"
            emptyBody="Pelamar yang masuk ke lowongan akan tampil di sini."
            rowActions={(a) =>
              a.stage === 'hired' ? (
                a.employeeId && !a.onboardingDone ? (
                  <RowAction icon="clipboard" label={`Selesaikan onboarding ${a.fullName}`} onClick={() => completeOnboarding(a)} />
                ) : null
              ) : a.stage === 'rejected' ? null : a.stage === 'offer' ? (
                <RowAction icon="check" label={`Rekrut ${a.fullName}`} tone="primary" onClick={() => setHireTarget(a)} />
              ) : (
                <RowAction
                  icon="arrow-right"
                  label={`Tahap berikutnya untuk ${a.fullName}`}
                  onClick={() => {
                    const flow = ['applied', 'screening', 'interview', 'offer', 'hired'];
                    const idx = flow.indexOf(a.stage);
                    setApplicantStage({ applicant: a, next: flow[Math.min(idx + 1, flow.length - 1)] ?? 'screening' });
                  }}
                />
              )
            }
          />
        </div>
      )}

      {tab === 'kinerja' && (
        <div className="space-y-5">
          <DataTable
            rows={kpiRows}
            columns={kpiColumns}
            rowKey={(k) => k.id}
            loading={kpis.loading}
            error={kpis.error}
            onRetry={kpis.reload}
            emptyIcon="target"
            emptyTitle="Belum ada definisi KPI"
            emptyBody="Buat definisi KPI, lalu tetapkan target per karyawan per periode."
            emptyAction={
              <Button variant="ghost" icon="plus" onClick={() => setKpiModal(true)}>
                KPI Baru
              </Button>
            }
          />

          <DataTable
            rows={targetRows}
            columns={targetColumns}
            rowKey={(t) => t.id}
            loading={kpiTargets.loading}
            error={kpiTargets.error}
            onRetry={kpiTargets.reload}
            emptyIcon="gauge"
            emptyTitle="Belum ada target KPI"
            emptyBody="Target diisi per periode, jadi nilai historis tidak berubah saat target baru dibuat."
            rowActions={(t) => (
              <RowAction icon="edit" label={`Isi pencapaian ${t.kpi?.name ?? ''} ${t.employee?.fullName ?? ''}`} onClick={() => setActualTarget(t)} />
            )}
          />

          <DataTable
            rows={reviewRows}
            columns={reviewColumns}
            rowKey={(r) => r.id}
            loading={reviews.loading}
            error={reviews.error}
            onRetry={reviews.reload}
            emptyIcon="star"
            emptyTitle="Belum ada penilaian"
            emptyBody="Penilaian dihitung dari pencapaian KPI lalu disimpan sebagai snapshot."
          />
        </div>
      )}

      <Modal open={deptModal} onClose={() => setDeptModal(false)} title="Buat Departemen" maxWidth="md">
        <div className="space-y-4">
          <Field label="Kode" hint="Kode unik, mis. OPS">
            <Input value={deptCode} onChange={(e) => setDeptCode(e.target.value)} placeholder="OPS" />
          </Field>
          <Field label="Nama Departemen">
            <Input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Operasional" />
          </Field>
          {deptRows.length > 0 && (
            <Field label="Induk Departemen" hint="Kosongkan untuk departemen tingkat atas">
              <Select value={deptParent} onChange={(e) => setDeptParent(e.target.value)}>
                <option value="">Tanpa induk</option>
                {deptRows.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" full onClick={() => setDeptModal(false)}>
              Batal
            </Button>
            <Button variant="primary" full disabled={saving} onClick={createDepartment}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={clockModal} onClose={() => setClockModal(false)} title="Catat Kehadiran" maxWidth="md">
        <div className="space-y-4">
          <Field label="Karyawan">
            <Select value={clockEmployee} onChange={(e) => setClockEmployee(e.target.value)}>
              <option value="">Pilih karyawan</option>
              {employeeRows
                .filter((e) => e.isActive)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeNo})
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Aksi" hint="Absen keluar menghitung jam kerja dan lembur otomatis">
            <div className="flex gap-2">
              <Button
                variant={clockAction === 'clock-in' ? 'primary' : 'ghost'}
                full
                onClick={() => setClockAction('clock-in')}
              >
                Masuk
              </Button>
              <Button
                variant={clockAction === 'clock-out' ? 'primary' : 'ghost'}
                full
                onClick={() => setClockAction('clock-out')}
              >
                Pulang
              </Button>
            </div>
          </Field>
          <Button variant="primary" full disabled={saving || !clockEmployee} onClick={submitClock}>
            {saving ? 'Mencatat…' : clockAction === 'clock-in' ? 'Catat Absen Masuk' : 'Catat Absen Pulang'}
          </Button>
        </div>
      </Modal>

      <Modal open={postingModal} onClose={() => setPostingModal(false)} title="Buka Lowongan" maxWidth="md">
        <div className="space-y-4">
          <Field label="Judul Posisi">
            <Input value={postingTitle} onChange={(e) => setPostingTitle(e.target.value)} placeholder="Barista" />
          </Field>
          {deptRows.length > 0 && (
            <Field label="Departemen">
              <Select value={postingDept} onChange={(e) => setPostingDept(e.target.value)}>
                <option value="">Tanpa departemen</option>
                {deptRows.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Kuota" hint="Jumlah orang yang akan merekrut">
            <Input
              type="number"
              min={1}
              value={postingOpenings}
              onChange={(e) => setPostingOpenings(e.target.value)}
            />
          </Field>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" full onClick={() => setPostingModal(false)}>
              Batal
            </Button>
            <Button variant="primary" full disabled={saving} onClick={createPosting}>
              {saving ? 'Menyimpan…' : 'Buka Lowongan'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={applicantStage !== null}
        onClose={() => setApplicantStage(null)}
        title="Pindahkan Tahap Pelamar"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-body-sm text-fossil">
            Pelamar saat ini di tahap{' '}
            <strong className="text-ink">
              {applicantStageLabel[applicantStage?.applicant.stage ?? ''] ?? '-'}
            </strong>
            . Tahap harus berurutan.
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              full
              onClick={() =>
                applicantStage && moveApplicantStage(applicantStage.applicant, applicantStage.next)
              }
            >
              Ke {applicantStageLabel[applicantStage?.next ?? ''] ?? applicantStage?.next}
            </Button>
            <Button
              variant="ghost"
              onClick={() => applicantStage && moveApplicantStage(applicantStage.applicant, 'rejected')}
            >
              Tolak
            </Button>
          </div>
        </div>
      </Modal>

      <EmployeeModal
        open={employeeModal}
        onClose={() => setEmployeeModal(false)}
        onAddPosition={() => setPositionModal(true)}
        onDone={() => {
          setEmployeeModal(false);
          employees.reload();
          attendance.reload();
        }}
      />
      <PositionModal open={positionModal} onClose={() => setPositionModal(false)} onDone={() => setPositionModal(false)} />
      <TerminateModal
        employee={terminateTarget}
        onClose={() => setTerminateTarget(null)}
        onDone={() => {
          setTerminateTarget(null);
          employees.reload();
          attendance.reload();
        }}
      />
      <LeaveRequestModal
        open={leaveModal}
        employees={employeeOptions}
        onClose={() => setLeaveModal(false)}
        onDone={() => {
          setLeaveModal(false);
          leaves.reload();
        }}
      />
      <PayrollRunModal
        open={payrollModal}
        employees={employeeOptions}
        onClose={() => setPayrollModal(false)}
        onDone={() => {
          setPayrollModal(false);
          payroll.reload();
        }}
      />
      <PayrollDetailModal runId={payrollDetailId} onClose={() => setPayrollDetailId(null)} onChanged={payroll.reload} />
      <ApplicantModal
        open={applicantModal}
        postings={postingRows}
        onClose={() => setApplicantModal(false)}
        onDone={() => {
          setApplicantModal(false);
          applicants.reload();
          postings.reload();
          pipeline.reload();
        }}
      />
      <HireModal
        applicant={hireTarget}
        onClose={() => setHireTarget(null)}
        onDone={() => {
          setHireTarget(null);
          applicants.reload();
          employees.reload();
          pipeline.reload();
        }}
      />
      <KpiModal
        open={kpiModal}
        onClose={() => setKpiModal(false)}
        onDone={() => {
          setKpiModal(false);
          kpis.reload();
        }}
      />
      <TargetsModal
        open={targetsModal}
        employees={employeeOptions}
        kpis={kpiRows.filter((k) => k.isActive)}
        onClose={() => setTargetsModal(false)}
        onDone={() => {
          setTargetsModal(false);
          kpiTargets.reload();
          kpis.reload();
        }}
      />
      <ActualModal
        target={
          actualTarget
            ? {
                id: actualTarget.id,
                employeeName: actualTarget.employee?.fullName ?? '-',
                kpiName: actualTarget.kpi?.name ?? '-',
                unit: actualTarget.kpi?.unit ?? '',
                targetValue: Number(actualTarget.target),
              }
            : null
        }
        onClose={() => setActualTarget(null)}
        onDone={() => {
          setActualTarget(null);
          kpiTargets.reload();
        }}
      />
      <ReviewModal
        open={reviewModal}
        employees={employeeOptions}
        onClose={() => setReviewModal(false)}
        onDone={() => {
          setReviewModal(false);
          reviews.reload();
        }}
      />
    </div>
  );
}
