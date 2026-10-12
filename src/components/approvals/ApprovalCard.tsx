import { formatDate, formatDateTime, formatIDR, formatNumber, timeAgo } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export interface ApprovalStep {
  id: string;
  stepOrder: number;
  approverRoleId: string | null;
  requiredPermission: string | null;
  status: string;
  actedById: string | null;
  actedAt: string | null;
  note: string;
}

export interface ApprovalRequest {
  id: string;
  documentType: string;
  documentId: string;
  status: string;
  currentStep: number;
  submittedById: string;
  submittedAt: string;
  resolvedAt: string | null;
  note: string;
  steps: ApprovalStep[];
}

export interface TimesheetContext {
  id: string;
  workDate: string;
  hours: number | string;
  hourlyRate: number | string;
  amount?: number;
  billable: boolean;
  employee: { employeeNo: string; fullName: string };
  project: { code: string; name: string };
}

const typeLabel: Record<string, string> = {
  timesheet: 'Timesheet proyek',
  purchase_requisition: 'Permintaan pembelian',
  purchase_order: 'Pesanan pembelian',
  expense: 'Pengeluaran',
  discount: 'Diskon',
  customer_invoice: 'Faktur penjualan',
  vendor_bill: 'Tagihan pemasok',
};

export function documentTypeLabel(type: string): string {
  if (typeLabel[type]) return typeLabel[type];
  const text = type.replace(/[_-]+/g, ' ').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : 'Dokumen';
}

const permissionLabel: Record<string, string> = {
  'finance:write': 'izin keuangan (tulis)',
  'finance:read': 'izin keuangan (baca)',
  'purchasing:write': 'izin pembelian (tulis)',
  'inventory:write': 'izin inventori (tulis)',
  'settings:write': 'izin pengaturan',
};

/** Siapa yang boleh memutuskan tahap ini, dalam bahasa manusia. */
export function approverLabel(step: ApprovalStep): string {
  if (step.requiredPermission) return `Pemegang ${permissionLabel[step.requiredPermission] ?? step.requiredPermission}`;
  if (step.approverRoleId) return 'Role approver yang ditunjuk';
  return 'Approver';
}

export const statusBadge: Record<string, { variant: 'outline' | 'neutral' | 'ink' | 'accent'; label: string }> = {
  pending: { variant: 'accent', label: 'Menunggu' },
  approved: { variant: 'ink', label: 'Disetujui' },
  rejected: { variant: 'outline', label: 'Ditolak' },
  cancelled: { variant: 'outline', label: 'Dibatalkan' },
};

/** Konteks dokumen: apa yang diminta, berapa nilainya, siapa pemohonnya. */
export function TimesheetSummary({ sheet }: { sheet: TimesheetContext }) {
  const hours = Number(sheet.hours);
  const value = sheet.amount ?? hours * Number(sheet.hourlyRate);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      <div className="min-w-0">
        <dt className="text-caption text-fossil">Karyawan</dt>
        <dd className="text-[14px] text-ink break-words">{sheet.employee.fullName}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-caption text-fossil">Proyek</dt>
        <dd className="text-[14px] text-ink break-words">{sheet.project.name}</dd>
      </div>
      <div>
        <dt className="text-caption text-fossil">Jam kerja</dt>
        <dd className="text-[14px] text-ink tnum">
          {formatNumber(hours)} jam · {formatDate(sheet.workDate)}
        </dd>
      </div>
      <div>
        <dt className="text-caption text-fossil">Nilai tagihan</dt>
        <dd className="text-[14px] text-ink tnum">{sheet.billable ? formatIDR(value) : 'Tidak ditagihkan'}</dd>
      </div>
    </dl>
  );
}

interface ApprovalCardProps {
  request: ApprovalRequest;
  timesheet?: TimesheetContext;
  busy?: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalCard({ request, timesheet, busy, onOpen, onApprove, onReject }: ApprovalCardProps) {
  const badge = statusBadge[request.status] ?? { variant: 'neutral' as const, label: request.status };
  const pending = request.status === 'pending';
  const current = request.steps.find((s) => s.stepOrder === request.currentStep);

  return (
    <Card className="overflow-hidden min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left px-4 pt-4 pb-3 active:bg-sand/40 hover:bg-sand/20 transition-colors"
        aria-label={`Lihat rincian ${documentTypeLabel(request.documentType)}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[17px] text-ink leading-snug break-words">{documentTypeLabel(request.documentType)}</p>
            <p className="text-caption text-fossil tnum">
              #{request.documentId.slice(0, 8)} · {timeAgo(request.submittedAt)}
            </p>
          </div>
          <Badge variant={badge.variant} className="shrink-0">
            {badge.label}
          </Badge>
        </div>

        {timesheet && (
          <div className="mt-3">
            <TimesheetSummary sheet={timesheet} />
          </div>
        )}

        {request.note && <p className="mt-3 text-body-sm text-smoke break-words">{request.note}</p>}

        {request.steps.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1" aria-hidden="true">
              {request.steps.map((s) => (
                <span
                  key={s.id}
                  className={`h-1.5 w-6 rounded-full ${
                    s.status === 'approved' ? 'bg-ink' : s.status === 'rejected' ? 'bg-rose-700' : s.stepOrder === request.currentStep && pending ? 'bg-chartreuse border border-olive/40' : 'bg-sand'
                  }`}
                />
              ))}
            </div>
            <p className="text-caption text-fossil min-w-0 truncate">
              {pending && current
                ? `Tahap ${current.stepOrder} dari ${request.steps.length} · ${approverLabel(current)}`
                : `${request.steps.length} tahap`}
            </p>
          </div>
        )}
      </button>

      {pending && (
        <div className="grid grid-cols-2 gap-2 px-4 pb-4 pt-1">
          <Button variant="ghost" size="lg" disabled={busy} onClick={onReject} className="min-h-[48px]">
            Tolak
          </Button>
          <Button variant="primary" size="lg" icon="check" disabled={busy} onClick={onApprove} className="min-h-[48px]">
            Setujui
          </Button>
        </div>
      )}
      {!pending && request.resolvedAt && (
        <p className="px-4 pb-3.5 text-caption text-fossil">Selesai {formatDateTime(request.resolvedAt)}</p>
      )}
    </Card>
  );
}
