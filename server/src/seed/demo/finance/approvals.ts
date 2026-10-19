import { ApprovalService } from '../../../modules/approvals/approval.service';
import { addDays, daysAgoOf } from './calendar';
import type { DemoRole } from '../context';
import { findBillByKey } from './execute';
import type { FinanceEnv } from './env';

export interface ApprovalCounts {
  pending: number;
  approved: number;
  rejected: number;
}

interface Case {
  documentType: string;
  documentId: string;
  note: string;
  submitter: DemoRole;
  outcome: 'approved' | 'rejected' | 'pending';
  twoStep: boolean;
  submittedDaysAgo: number;
  rejectNote?: string;
}

const PERMISSION = 'approvals:decide';

/**
 * Dokumen persetujuan: tagihan pemasok nyata, pengajuan pengeluaran, dan (bila domain pasok sudah jalan)
 * pesanan pembelian. Pengaju tidak boleh memutuskan dokumennya sendiri, jadi pengaju admin/manager dan
 * pemutus manager/owner. Satu dokumen per (jenis, id): dijalankan ulang tidak menggandakan.
 */
export async function seedApprovals(env: FinanceEnv): Promise<ApprovalCounts> {
  const { ctx, profile } = env;
  const cases: Case[] = [];

  for (const e of env.plan.expenses.filter((x) => x.approval)) {
    const bill = await findBillByKey(env, e.key);
    if (!bill) continue;
    cases.push({
      documentType: 'vendor_bill',
      documentId: bill.id,
      note: `${e.memo} (${bill.number})`,
      submitter: 'admin',
      outcome: e.approval === 'approved' ? 'approved' : 'pending',
      twoStep: e.approval === 'two-step-pending',
      submittedDaysAgo: Math.max(1, daysAgoOf(env.today, e.date)),
    });
  }
  for (const r of profile.expenseRequests) {
    cases.push({
      documentType: 'expense',
      documentId: r.id,
      note: r.note,
      submitter: 'admin',
      outcome: r.outcome,
      twoStep: Boolean(r.twoStep),
      submittedDaysAgo: r.submittedDaysAgo,
      rejectNote: r.rejectNote,
    });
  }
  const orders = await ctx.prisma.purchaseOrder.findMany({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId },
    orderBy: { createdAt: 'asc' },
    take: 2,
    select: { id: true, code: true },
  });
  orders.forEach((po, i) =>
    cases.push({
      documentType: 'purchase_order',
      documentId: po.id,
      note: `Persetujuan pesanan pembelian ${po.code}`,
      submitter: 'manager',
      outcome: i === 0 ? 'pending' : 'approved',
      twoStep: false,
      submittedDaysAgo: 2 + i * 6,
    }),
  );

  const svc = ctx.get(ApprovalService);
  const counts: ApprovalCounts = { pending: 0, approved: 0, rejected: 0 };

  for (const c of cases) {
    const exists = await ctx.prisma.approvalRequest.findFirst({
      where: { tenantId: ctx.tenantId, companyId: ctx.companyId, documentType: c.documentType, documentId: c.documentId },
      select: { id: true },
    });
    if (exists) continue;

    const submittedAt = env.at(addDays(env.today, -c.submittedDaysAgo), 10);
    const request = await svc.submit({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      documentType: c.documentType,
      documentId: c.documentId,
      submittedById: ctx.users[c.submitter].id,
      note: c.note,
      steps: c.twoStep ? [{ requiredPermission: PERMISSION }, { requiredPermission: PERMISSION }] : [{ requiredPermission: PERMISSION }],
    });

    // Dua tahap: manager memutuskan tahap pertama; tahap kedua oleh owner (atau dibiarkan menunggu).
    const stepActors: DemoRole[] = c.twoStep ? ['manager', 'owner'] : ['owner'];
    if (c.outcome !== 'pending' || c.twoStep) {
      for (const [i, actor] of stepActors.entries()) {
        const isLast = i === stepActors.length - 1;
        if (c.outcome === 'pending' && isLast) break; // tahap terakhir tetap menunggu owner
        const decision = c.outcome === 'rejected' && isLast ? 'rejected' : 'approved';
        await svc.decide(
          ctx.tenantId,
          ctx.companyId,
          request.id,
          ctx.users[actor].id,
          decision,
          decision === 'rejected' ? c.rejectNote ?? 'Ditolak.' : 'Disetujui sesuai anggaran.',
        );
      }
    }

    // Cap waktu kosmetik: layanan mengisi "sekarang", padahal pengajuan contoh ini dibuat beberapa hari lalu.
    const resolvedAt = new Date(submittedAt.getTime() + 20 * 3_600_000);
    await ctx.prisma.approvalRequest.update({
      where: { id: request.id },
      data: {
        submittedAt,
        createdAt: submittedAt,
        ...(c.outcome === 'pending' ? {} : { resolvedAt }),
      },
    });
    const steps = await ctx.prisma.approvalStep.findMany({ where: { requestId: request.id, status: { not: 'pending' } }, orderBy: { stepOrder: 'asc' }, select: { id: true } });
    for (const [i, s] of steps.entries()) {
      await ctx.prisma.approvalStep.update({ where: { id: s.id }, data: { actedAt: new Date(submittedAt.getTime() + (4 + i * 16) * 3_600_000) } });
    }
    const logs = await ctx.prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId, entity: c.documentType, entityId: c.documentId, action: { startsWith: 'approval_' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    for (const [i, l] of logs.entries()) {
      await ctx.prisma.auditLog.update({ where: { id: l.id }, data: { createdAt: new Date(submittedAt.getTime() + (4 + i * 16) * 3_600_000) } });
    }

    counts[c.outcome]++;
  }
  return counts;
}
