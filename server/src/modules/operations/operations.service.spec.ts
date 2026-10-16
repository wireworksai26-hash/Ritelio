import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OperationsService } from './operations.service';

type Row = Record<string, unknown>;

function mockPrisma(overrides: Row = {}) {
  const state = {
    companyId: 'company-1',
    project: null as Row | null,
    timesheet: null as Row | null,
    existingTimesheet: null as Row | null,
    employee: null as Row | null,
    shipment: null as Row | null,
    workOrder: null as Row | null,
productCount: 1,
      updated: null as Row | null,
      employeeQuery: null as Row | null,
      ...overrides,
    };

    const prisma = {
      company: { findFirst: async () => ({ id: state.companyId }) },
      project: {
        findFirst: async () => state.project,
        update: async ({ data }: { data: Row }) => ({ ...state.project, ...data }),
      },
      timesheet: {
        findFirst: async () => state.timesheet,
        findUnique: async () => state.existingTimesheet,
        update: async ({ data }: { data: Row }) => ({ ...state.timesheet, ...data }),
        upsert: async ({ create }: { create: Row }) => ({ id: 'ts-1', status: 'submitted', billable: true, ...create }),
        findMany: async () => [],
      },
      employee: {
        findFirst: async (args: { where: Row }) => {
          state.employeeQuery = args.where;
          return state.employee;
        },
      },
    shipment: {
      findFirst: async () => state.shipment,
      findFirstOrThrow: async () => state.shipment,
      update: async ({ data }: { data: Row }) => ({ ...state.shipment, ...data }),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        if (!state.shipment || state.shipment.status !== where.status) return { count: 0 };
        state.shipment = { ...state.shipment, ...data };
        return { count: 1 };
      },
    },
    shipmentEvent: { create: async () => ({}) },
    workOrder: { findFirst: async () => state.workOrder, update: async ({ data }: { data: Row }) => ({ ...state.workOrder, ...data }) },
    product: { count: async () => state.productCount },
  };

  (prisma as Record<string, unknown>).$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);

  return { prisma, state };
}

function makeService(prisma: unknown) {
  return new OperationsService(prisma as never, {} as never, {} as never, { submit: async () => undefined } as never);
}

describe('OperationsService', () => {
  describe('recordTimesheet', () => {
    const base = {
      projectId: 'p-1',
      employeeId: 'e-1',
      workDate: '2026-01-05',
      hours: 8,
    };

    it('mencari employee memakai tenantId dan companyId milik proyek', async () => {
      const { prisma, state } = mockPrisma({
        project: { id: 'p-1', tenantId: 'tenant-1', companyId: 'company-9' },
        employee: { id: 'e-1' },
      });
      const service = makeService(prisma);
      await service.recordTimesheet('tenant-1', base);

      // companyId harus milik proyek; tenantId bukan kolom pengganti companyId.
      expect(state.employeeQuery).toEqual({
        id: 'e-1',
        tenantId: 'tenant-1',
        companyId: 'company-9',
        isActive: true,
      });
    });

    it.each([
      ['sudah disetujui', { id: 'ts-1', status: 'approved', billedAt: null, projectId: 'p-1' }],
      ['sudah ditagihkan', { id: 'ts-1', status: 'submitted', billedAt: new Date(), projectId: 'p-1' }],
    ])('menolak menimpa timesheet yang %s (jam sudah jadi faktur / persetujuan tak boleh tereset)', async (_label, existing) => {
      const { prisma } = mockPrisma({
        project: { id: 'p-1', tenantId: 'tenant-1', companyId: 'company-9' },
        employee: { id: 'e-1' },
        existingTimesheet: existing,
      });
      const service = makeService(prisma);
      await expect(service.recordTimesheet('tenant-1', base)).rejects.toBeInstanceOf(ConflictException);
    });

    it('menormalkan tanggal kerja ke awal hari UTC supaya kunci unik (karyawan, tanggal) cocok', async () => {
      let seenKey: Row | undefined;
      const { prisma } = mockPrisma({
        project: { id: 'p-1', tenantId: 'tenant-1', companyId: 'company-9' },
        employee: { id: 'e-1' },
      });
      (prisma.timesheet as Record<string, unknown>).findUnique = async (args: { where: Row }) => {
        seenKey = args.where;
        return null;
      };
      const service = makeService(prisma);
      await service.recordTimesheet('tenant-1', { ...base, workDate: '2026-01-05T15:30:00.000Z' });
      const key = seenKey?.employeeId_workDate as { workDate: Date };
      expect(key.workDate.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    });

    it('menolak employee yang tidak ada', async () => {
      const { prisma } = mockPrisma({
        project: { id: 'p-1', tenantId: 'tenant-1', companyId: 'company-9' },
        employee: null,
      });
      const service = makeService(prisma);
      await expect(service.recordTimesheet('tenant-1', base)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('approveTimesheet', () => {
    it('menolak approval kedua', async () => {
      const { prisma } = mockPrisma({
        timesheet: { id: 'ts-1', tenantId: 'tenant-1', companyId: 'company-1', status: 'approved' },
      });
      const service = makeService(prisma);
      await expect(service.approveTimesheet('tenant-1', 'ts-1', 'u-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('menolak timesheet milik tenant lain', async () => {
      const { prisma } = mockPrisma({ timesheet: null });
      const service = makeService(prisma);
      await expect(service.approveTimesheet('tenant-1', 'ts-1', 'u-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateShipmentStatus', () => {
    it('menolak shipment delivered yang dimundurkan', async () => {
      const { prisma } = mockPrisma({
        shipment: { id: 'sh-1', tenantId: 'tenant-1', companyId: 'company-1', status: 'delivered' },
      });
      const service = makeService(prisma);
      await expect(service.updateShipmentStatus('tenant-1', 'sh-1', 'in_transit')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('mencatat shippedAt saat in_transit', async () => {
      const { prisma } = mockPrisma({
        shipment: { id: 'sh-1', tenantId: 'tenant-1', companyId: 'company-1', status: 'pending', shippedAt: null },
      });
      const service = makeService(prisma);
      const result = await service.updateShipmentStatus('tenant-1', 'sh-1', 'in_transit');
      expect(result.shippedAt).toBeInstanceOf(Date);
    });
  });

  describe('updateWorkOrder', () => {
    it('menolak perubahan pada work order yang sudah ditutup', async () => {
      const { prisma } = mockPrisma({
        workOrder: { id: 'wo-1', tenantId: 'tenant-1', companyId: 'company-1', status: 'closed' },
      });
      const service = makeService(prisma);
      await expect(service.updateWorkOrder('tenant-1', 'wo-1', { status: 'in_progress' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('createShipment', () => {
    it('menolak shipment tanpa item walau dipanggil langsung', async () => {
      const { prisma } = mockPrisma();
      const service = makeService(prisma);
      await expect(service.createShipment('tenant-1', { destination: 'X', items: [] })).rejects.toThrow(
        'Shipment minimal satu item.',
      );
    });

    it('menolak item dengan produk yang tidak dikenal', async () => {
      const { prisma } = mockPrisma({ productCount: 0 });
      const service = makeService(prisma);
      await expect(
        service.createShipment('tenant-1', {
          destination: 'X',
          items: [{ productId: 'p-1', qty: 1 }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});