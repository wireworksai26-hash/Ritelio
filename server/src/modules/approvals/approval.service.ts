import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

export interface ApprovalStepInput {
  approverRoleId?: string;
  requiredPermission?: string;
}

export interface SubmitApprovalInput {
  tenantId: string;
  companyId: string;
  documentType: string;
  documentId: string;
  submittedById: string;
  note?: string;
  steps: ApprovalStepInput[];
}

@Injectable()
export class ApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Internal entry point for domain modules to submit an approval workflow. */
  async submit(input: SubmitApprovalInput) {
    if (!input.documentType.trim() || !input.documentId.trim()) {
      throw new BadRequestException('Jenis dan ID dokumen wajib diisi.');
    }
    if (input.steps.length < 1 || input.steps.length > 10) {
      throw new BadRequestException('Alur approval harus memiliki 1 sampai 10 tahap.');
    }

    return this.prisma.$transaction(async (tx) => {
      const [company, submitter, duplicate] = await Promise.all([
        tx.company.findFirst({ where: { id: input.companyId, tenantId: input.tenantId }, select: { id: true } }),
        tx.user.findFirst({ where: { id: input.submittedById, tenantId: input.tenantId, isActive: true }, select: { id: true } }),
        tx.approvalRequest.findFirst({
          where: {
            tenantId: input.tenantId,
            companyId: input.companyId,
            documentType: input.documentType,
            documentId: input.documentId,
            status: 'pending',
          },
          select: { id: true },
        }),
      ]);
      if (!company) throw new NotFoundException('Perusahaan tidak ditemukan pada tenant ini.');
      if (!submitter) throw new NotFoundException('Pengaju approval tidak ditemukan atau nonaktif.');
      if (duplicate) throw new ConflictException('Dokumen ini sudah memiliki approval yang menunggu keputusan.');

      const permissionKeys = [...new Set(input.steps.flatMap((step) => step.requiredPermission ? [step.requiredPermission] : []))];
      const roleIds = [...new Set(input.steps.flatMap((step) => step.approverRoleId ? [step.approverRoleId] : []))];
      const [permissions, roles] = await Promise.all([
        permissionKeys.length ? tx.permission.count({ where: { key: { in: permissionKeys } } }) : 0,
        roleIds.length ? tx.accessRole.count({ where: { tenantId: input.tenantId, id: { in: roleIds } } }) : 0,
      ]);
      if (permissions !== permissionKeys.length) throw new BadRequestException('Ada permission approval yang tidak dikenal.');
      if (roles !== roleIds.length) throw new BadRequestException('Ada role approver yang tidak berasal dari tenant ini.');
      if (input.steps.some((step) => !step.approverRoleId && !step.requiredPermission)) {
        throw new BadRequestException('Setiap tahap harus menentukan role approver atau permission yang dibutuhkan.');
      }

      const request = await tx.approvalRequest.create({
        data: {
          tenantId: input.tenantId,
          companyId: input.companyId,
          documentType: input.documentType,
          documentId: input.documentId,
          submittedById: input.submittedById,
          note: input.note ?? '',
        },
      });
      await tx.approvalStep.createMany({
        data: input.steps.map((step, index) => ({
          tenantId: input.tenantId,
          companyId: input.companyId,
          requestId: request.id,
          stepOrder: index + 1,
          approverRoleId: step.approverRoleId,
          requiredPermission: step.requiredPermission,
        })),
      });
      return tx.approvalRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });
  }

  async decide(
    tenantId: string,
    companyId: string,
    requestId: string,
    actorId: string,
    decision: 'approved' | 'rejected',
    note = '',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findFirst({
        where: { id: requestId, tenantId, companyId, status: 'pending' },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
      if (!request) throw new NotFoundException('Approval tidak ditemukan atau sudah diselesaikan.');

      const step = request.steps.find((candidate) => candidate.stepOrder === request.currentStep);
      if (!step || step.status !== 'pending') throw new ConflictException('Tahap approval tidak lagi menunggu keputusan.');

      const actor = await tx.user.findFirst({
        where: { id: actorId, tenantId, isActive: true },
        select: {
          id: true,
          roleId: true,
          permissions: true,
          databaseRole: { select: { permissions: { select: { permissionKey: true, effect: true } } } },
        },
      });
      if (!actor) throw new NotFoundException('Approver tidak ditemukan atau nonaktif.');
      if (step.approverRoleId && actor.roleId !== step.approverRoleId) {
        throw new ConflictException('Role Anda tidak ditugaskan pada tahap approval ini.');
      }
      if (step.requiredPermission) {
        const overrides = (actor.permissions ?? {}) as Record<string, boolean>;
        const override = overrides[step.requiredPermission];
        const roleEffect = actor.databaseRole.permissions.find(
          (permission) => permission.permissionKey === step.requiredPermission,
        )?.effect;
        const allowed = override === false ? false : override === true || roleEffect === 'allow';
        if (!allowed) throw new ConflictException('Anda tidak memiliki permission untuk tahap approval ini.');
      }

      const actedAt = new Date();
      const changedStep = await tx.approvalStep.updateMany({
        where: { id: step.id, requestId, status: 'pending' },
        data: { status: decision, actedById: actorId, actedAt, note },
      });
      if (changedStep.count !== 1) throw new ConflictException('Approval sudah diproses oleh request lain.');

      const isFinalStep = step.stepOrder === request.steps.length;
      const nextRequestStatus = decision === 'rejected' ? 'rejected' : isFinalStep ? 'approved' : 'pending';
      const updated = await tx.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: nextRequestStatus,
          currentStep: decision === 'approved' && !isFinalStep ? request.currentStep + 1 : request.currentStep,
          ...(nextRequestStatus !== 'pending' ? { resolvedById: actorId, resolvedAt: actedAt } : {}),
        },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorId,
          action: `approval_${decision}`,
          entity: request.documentType,
          entityId: request.documentId,
          before: { approvalStatus: 'pending', currentStep: request.currentStep },
          after: { approvalStatus: nextRequestStatus, decision, note },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
