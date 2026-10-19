import { Prisma } from '@prisma/client';
import { CarrierService } from '../../../modules/operations/carrier.service';
import { computeWebhookSignature } from '../../../modules/operations/carrier-webhook';
import { OperationsService } from '../../../modules/operations/operations.service';
import type { DemoContext } from '../context';
import { addDays, dayIso, employeeIdOf, redateJournal } from './helpers';
import type { FleetSeed, ShipmentSeed, WorkOrderSeed } from './types';

const WO_ORDER = ['open', 'in_progress', 'completed', 'closed'] as const;

async function vehicleIdOf(ctx: DemoContext, plate: string): Promise<string> {
  const row = await ctx.prisma.vehicle.findFirst({ where: { tenantId: ctx.tenantId, companyId: ctx.companyId, plateNumber: plate }, select: { id: true } });
  if (!row) throw new Error(`Kendaraan ${plate} tidak ditemukan.`);
  return row.id;
}

// ───────── Kendaraan, BBM, rencana perawatan ─────────

async function seedVehicles(ctx: DemoContext, fleet: FleetSeed): Promise<void> {
  const ops = ctx.get(OperationsService);
  const { prisma, tenantId, companyId } = ctx;
  for (const v of fleet.vehicles) {
    let vehicle = await prisma.vehicle.findFirst({ where: { tenantId, companyId, plateNumber: v.plateNumber } });
    if (!vehicle) {
      vehicle = await ops.createVehicle(tenantId, { plateNumber: v.plateNumber, name: v.name, type: v.type, capacityKg: v.capacityKg, odometerKm: v.odometerKm });
    }
    for (const f of v.fuel) {
      const date = new Date(`${dayIso(ctx, f.ago)}T00:00:00Z`);
      if (await prisma.fuelLog.findFirst({ where: { tenantId, vehicleId: vehicle.id, date, liters: new Prisma.Decimal(f.liters) }, select: { id: true } })) continue;
      // BBM hanya mencatat biaya kendaraan; service tidak membuat jurnal untuknya.
      await ops.recordFuel(tenantId, vehicle.id, { date: dayIso(ctx, f.ago), liters: f.liters, pricePerLiter: f.pricePerLiter, odometerKm: f.odometerKm, station: f.station });
    }
  }
}

async function seedPlans(ctx: DemoContext, fleet: FleetSeed): Promise<void> {
  const ops = ctx.get(OperationsService);
  const { prisma, tenantId, companyId } = ctx;
  for (const p of fleet.plans) {
    if (await prisma.maintenancePlan.findFirst({ where: { tenantId, companyId, assetRef: p.asset, description: p.description }, select: { id: true } })) continue;
    const plan = await ops.createMaintenancePlan(tenantId, {
      assetRef: p.asset,
      description: p.description,
      intervalDays: p.intervalDays,
      vehicleRefId: p.isVehicle ? await vehicleIdOf(ctx, p.asset) : undefined,
      firstDueAt: dayIso(ctx, p.dueAgo),
    });
    // Kosmetik: rencana yang sudah lewat jatuh tempo berarti siklus sebelumnya selesai satu interval sebelumnya.
    if (plan.nextDueAt) {
      await prisma.maintenancePlan.update({
        where: { id: plan.id },
        data: { lastDoneAt: addDays(plan.nextDueAt, -p.intervalDays), createdAt: addDays(plan.nextDueAt, -p.intervalDays) },
      });
    }
  }
}

// ───────── Work order ─────────

async function advancePlans(ctx: DemoContext, wo: { id: string; maintenancePlanId: string | null; assetRef: string; vehicleRef: string | null }, doneAt: Date) {
  // Service memajukan jadwal ke "sekarang" saat work order ditutup; dikembalikan ke tanggal selesai sebenarnya.
  const or = [
    ...(wo.maintenancePlanId ? [{ id: wo.maintenancePlanId }] : []),
    ...(wo.assetRef ? [{ assetRef: wo.assetRef }] : []),
    ...(wo.vehicleRef ? [{ vehicleRefId: wo.vehicleRef }] : []),
  ];
  if (or.length === 0) return;
  const plans = await ctx.prisma.maintenancePlan.findMany({ where: { tenantId: ctx.tenantId, companyId: ctx.companyId, isActive: true, OR: or } });
  for (const plan of plans) {
    await ctx.prisma.maintenancePlan.update({ where: { id: plan.id }, data: { lastDoneAt: doneAt, nextDueAt: addDays(doneAt, plan.intervalDays) } });
  }
}

async function seedWorkOrders(ctx: DemoContext, fleet: FleetSeed): Promise<void> {
  const ops = ctx.get(OperationsService);
  const { prisma, tenantId, companyId } = ctx;
  const estimate = (w: WorkOrderSeed) => ({ laborCost: w.laborCost, partsCost: w.partsCost, resolution: w.resolution });

  for (const w of fleet.workOrders) {
    let wo = await prisma.workOrder.findFirst({ where: { tenantId, companyId, title: w.title } });
    if (!wo) {
      const plan = w.plan ? await prisma.maintenancePlan.findFirst({ where: { tenantId, companyId, description: w.plan }, select: { id: true } }) : null;
      if (w.plan && !plan) throw new Error(`Rencana perawatan "${w.plan}" tidak ada untuk work order "${w.title}".`);
      wo = await ops.createWorkOrder(tenantId, {
        title: w.title,
        description: `[demo] ${w.description}`,
        assetRef: w.assetRef ?? (w.vehicle ?? undefined),
        vehicleRef: w.vehicle ? await vehicleIdOf(ctx, w.vehicle) : undefined,
        maintenancePlanId: plan?.id,
        assigneeId: await employeeIdOf(ctx, w.assignee),
        priority: w.priority,
        scheduledFor: ctx.at(w.scheduledAgo, 9).toISOString(),
      });
      // Kosmetik: dokumen dibuat sebelum jadwal pengerjaannya.
      await prisma.workOrder.update({ where: { id: wo.id }, data: { createdAt: ctx.at(Math.max(w.scheduledAgo + 3, 1), 9) } });
    }

    const have = WO_ORDER.indexOf(wo.status as (typeof WO_ORDER)[number]);
    const want = WO_ORDER.indexOf(w.state);
    if (have >= want) continue;

    if (have < 1 && want >= 1) wo = await ops.updateWorkOrder(tenantId, wo.id, { status: 'in_progress', ...(want === 1 ? estimate(w) : {}) });
    if (have < 2 && want >= 2) wo = await ops.updateWorkOrder(tenantId, wo.id, { status: 'completed', ...estimate(w) });
    if (want === 3) wo = await ops.updateWorkOrder(tenantId, wo.id, { status: 'closed', ...estimate(w) });

    // Kosmetik: service mengisi waktu mulai/selesai dengan "sekarang".
    const startedAt = w.startedAgo !== undefined ? ctx.at(w.startedAgo, 8) : null;
    const doneAt = w.doneAgo !== undefined ? ctx.at(w.doneAgo, 16) : null;
    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { ...(startedAt ? { startedAt } : {}), ...(want >= 2 && doneAt ? { completedAt: doneAt } : {}) },
    });
    if (want === 3 && doneAt) {
      const journal = await prisma.journalHeader.findFirst({ where: { tenantId, companyId, sourceModule: 'eam', sourceRefId: wo.id }, select: { id: true } });
      if (journal) await redateJournal(ctx, journal.id, doneAt);
      await advancePlans(ctx, wo, doneAt);
    }
  }
}

// ───────── Pengiriman ─────────

function at(ctx: DemoContext, e: { ago: number; hour: number; minute: number }): Date {
  return ctx.at(e.ago, e.hour, e.minute);
}

async function seedShipment(ctx: DemoContext, s: ShipmentSeed): Promise<boolean> {
  const ops = ctx.get(OperationsService);
  const carrier = ctx.get(CarrierService);
  const { prisma, tenantId, companyId } = ctx;
  const tag = `[demo:${s.key}]`;
  if (await prisma.shipment.findFirst({ where: { tenantId, companyId, note: { startsWith: tag } }, select: { id: true } })) return false;

  const shipment = await ops.createShipment(tenantId, {
    outletId: ctx.outletIds[s.outletIndex],
    vehicleId: s.vehicle ? await vehicleIdOf(ctx, s.vehicle) : undefined,
    origin: s.origin,
    destination: s.destination,
    note: `${tag} ${s.note}`,
    items: s.items.map((i) => ({ productId: ctx.product(i.sku).id, qty: i.qty })),
  });
  // Kosmetik: dokumen pengiriman dibuat pada harinya, bukan saat seed dijalankan.
  await prisma.shipment.update({ where: { id: shipment.id }, data: { createdAt: ctx.at(s.createdAgo, 8) } });

  if (s.carrier) {
    // Jalur kurir pihak ketiga: webhook bertanda tangan dengan waktu kejadian sungguhan di masa lalu.
    const secret = `demo-webhook-${s.key.toLowerCase()}-secret`;
    const reg = await carrier.registerWebhook(tenantId, shipment.id, s.carrier, secret);
    for (const e of s.events) {
      const body = { trackingNumber: reg.carrierTrackingNumber!, status: e.status, description: e.description, location: e.location, occurredAt: at(ctx, e).toISOString() };
      const timestamp = Math.floor(Date.now() / 1000);
      await carrier.handleWebhook(tenantId, body, computeWebhookSignature(secret, timestamp, body), timestamp);
    }
    return true;
  }

  // Jalur armada sendiri: catatan manual lewat service. Service memberi stempel "sekarang"; waktu dikembalikan di bawah.
  if (s.cancel) {
    await ops.updateShipmentStatus(tenantId, shipment.id, 'cancelled');
  } else {
    for (const e of s.events) {
      if (e.status === 'delivered') await ops.updateShipmentStatus(tenantId, shipment.id, 'delivered', s.receiver);
      else await carrier.recordManualTracking(tenantId, shipment.id, e.status, e.description);
    }
  }
  const stored = await prisma.shipmentEvent.findMany({ where: { tenantId, shipmentId: shipment.id }, orderBy: { createdAt: 'asc' } });
  for (const [i, row] of stored.entries()) {
    const e = s.events[i];
    const when = e ? at(ctx, e) : ctx.at(s.createdAgo, 15);
    await prisma.shipmentEvent.update({ where: { id: row.id }, data: { occurredAt: when, location: e?.location ?? '', createdAt: when } });
  }
  const first = s.events[0];
  const last = s.events[s.events.length - 1];
  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      ...(first ? { shippedAt: at(ctx, first) } : {}),
      ...(last && last.status === 'delivered' ? { deliveredAt: at(ctx, last) } : {}),
    },
  });
  return true;
}

export async function seedFleet(ctx: DemoContext, fleet: FleetSeed): Promise<void> {
  await seedVehicles(ctx, fleet);
  await seedPlans(ctx, fleet);
  await seedWorkOrders(ctx, fleet);
  let made = 0;
  for (const s of fleet.shipments) if (await seedShipment(ctx, s)) made++;

  const { prisma, tenantId } = ctx;
  const [v, f, pl, wo, sh] = await Promise.all([
    prisma.vehicle.count({ where: { tenantId } }),
    prisma.fuelLog.count({ where: { tenantId } }),
    prisma.maintenancePlan.count({ where: { tenantId } }),
    prisma.workOrder.count({ where: { tenantId } }),
    prisma.shipment.count({ where: { tenantId } }),
  ]);
  ctx.log(`armada: ${v} kendaraan, ${f} log BBM, ${pl} rencana perawatan, ${wo} work order, ${sh} pengiriman (${made} baru)`);
}
