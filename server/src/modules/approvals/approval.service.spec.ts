import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalService } from './approval.service';

function make(submittedById: string) {
  const tx = {
    approvalRequest: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'r1',
        currentStep: 1,
        submittedById,
        documentType: 'purchase_order',
        documentId: 'po1',
        steps: [{ id: 's1', stepOrder: 1, status: 'pending', approverRoleId: null, requiredPermission: 'approvals:decide' }],
      }),
      update: vi.fn().mockResolvedValue({ id: 'r1', status: 'approved' }),
    },
    approvalStep: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'u-manager',
        roleId: 'role-m',
        permissions: {},
        databaseRole: { permissions: [{ permissionKey: 'approvals:decide', effect: 'allow' }] },
      }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)) };
  return { tx, service: new ApprovalService(prisma as never) };
}

describe('ApprovalService.decide segregasi tugas', () => {
  it('pemohon tidak boleh menyetujui dokumennya sendiri', async () => {
    const { tx, service } = make('u-manager');
    await expect(service.decide('t1', 'c1', 'r1', 'u-manager', 'approved')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.approvalStep.updateMany).not.toHaveBeenCalled();
  });

  it('pemohon juga tidak boleh menolak dokumennya sendiri', async () => {
    const { service } = make('u-manager');
    await expect(service.decide('t1', 'c1', 'r1', 'u-manager', 'rejected')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('orang lain dengan izin boleh memutuskan', async () => {
    const { tx, service } = make('u-cashier');
    await service.decide('t1', 'c1', 'r1', 'u-manager', 'approved');
    expect(tx.approvalStep.updateMany).toHaveBeenCalled();
  });
});
