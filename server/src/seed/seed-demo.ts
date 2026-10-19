import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../modules/audit/audit.service';
import { BUSINESSES } from './businesses.data';
import { buildContext, decideRun, isDomainDone, markDomainDone, type DemoContext } from './demo/context';
import { DEMO_DOMAINS } from './demo/index';

/**
 * Data transaksi contoh untuk tiga usaha dari seed:businesses (penjualan, CRM, pembelian, produksi, bank,
 * aset, SDM, proyek, logistik, IoT, ...). Hanya menyentuh tiga usaha itu, tidak menghapus apa pun,
 * dan aman diulang (tiap domain punya penanda selesai dan kunci alami).
 *
 *   SEED_DEMO_ONLY=supply,commercial   hanya domain tertentu
 *   SEED_DEMO_BUSINESSES=kopisenja     hanya usaha tertentu
 *   SEED_DEMO_FORCE=yes                abaikan penanda selesai (kunci alami tetap mencegah duplikasi)
 *   ALLOW_DEMO_DATA=yes                wajib di produksi
 */

const SUMMARY_MODELS = [
  'salesTransaction', 'purchaseRequisition', 'purchaseOrder', 'stockTransfer', 'stockOp', 'vendorBill', 'vendorPayment',
  'vendorPerformance', 'customerInvoice', 'customerReceipt', 'journalHeader', 'bankAccount', 'bankStatement',
  'fixedAsset', 'depreciationSchedule', 'lead', 'opportunity', 'quotation', 'salesOrder', 'customerInteraction',
  'customerComplaint', 'productionOrder', 'qualityCheck', 'productionSchedule', 'attendance', 'leaveRequest',
  'payrollRun', 'jobPosting', 'applicant', 'kpiDefinition', 'kpiTarget', 'performanceReview', 'project',
  'projectMilestone', 'timesheet', 'resourceAllocation', 'vehicle', 'fuelLog', 'maintenancePlan', 'workOrder',
  'shipment', 'sensorDevice', 'sensorReading', 'approvalRequest', 'notification', 'taxRule',
] as const;

const log = (msg: string) => console.log(msg);
const csv = (v: string | undefined) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

export interface SeedDemoOptions {
  only?: string[];
  onlyBusinesses?: string[];
  force?: boolean;
  /** true bila pemanggil sudah menyatakan persetujuan eksplisit (mis. SEED_DEMO_ON_BOOT) di produksi. */
  allowProduction?: boolean;
}

async function summary(ctx: DemoContext): Promise<string> {
  const parts: string[] = [];
  for (const model of SUMMARY_MODELS) {
    const delegate = (ctx.prisma as unknown as Record<string, { count?: (a: unknown) => Promise<number> } | undefined>)[model];
    if (!delegate?.count) continue;
    try {
      parts.push(`${model}=${await delegate.count({ where: { tenantId: ctx.tenantId } })}`);
    } catch {
      /* model tanpa kolom tenantId: lewati */
    }
  }
  return parts.join(' ');
}

/** Mengembalikan jumlah langkah yang gagal; melempar hanya untuk kesalahan konfigurasi. */
export async function seedDemo(opts: SeedDemoOptions = {}): Promise<number> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_DATA !== 'yes' && !opts.allowProduction) {
    throw new Error('Data contoh ditolak di produksi. Jalankan ulang dengan ALLOW_DEMO_DATA=yes bila memang disengaja.');
  }
  const only = opts.only ?? csv(process.env.SEED_DEMO_ONLY);
  const onlyBiz = opts.onlyBusinesses ?? csv(process.env.SEED_DEMO_BUSINESSES);
  const force = opts.force ?? process.env.SEED_DEMO_FORCE === 'yes';
  const unknown = only.filter((k) => !DEMO_DOMAINS.some((d) => d.key === k));
  if (unknown.length) throw new Error(`Domain tidak dikenal: ${unknown.join(', ')}. Pilihan: ${DEMO_DOMAINS.map((d) => d.key).join(', ')}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  let failures = 0;
  try {
    const audit = app.get(AuditService);
    app.get(PrismaService);

    for (const [index, biz] of BUSINESSES.entries()) {
      if (onlyBiz.length && !onlyBiz.includes(biz.key)) continue;
      const ctx = await buildContext(app, biz, index, log);
      if (!ctx) {
        log(`\n== ${biz.businessName}: usaha belum ada. Jalankan npm run seed:businesses lebih dulu.`);
        failures++;
        continue;
      }
      log(`\n== ${biz.businessName}`);

      for (const domain of DEMO_DOMAINS) {
        const decision = decideRun(domain, { only, force, done: await isDomainDone(ctx, domain.key) });
        if (decision === 'skip-filtered') continue;
        if (decision === 'skip-not-implemented') {
          log(`  [${biz.key}] ${domain.key}: belum diimplementasi, dilewati`);
          continue;
        }
        if (decision === 'skip-done') {
          log(`  [${biz.key}] ${domain.key}: sudah dijalankan, dilewati`);
          continue;
        }
        const started = Date.now();
        try {
          log(`  [${biz.key}] ${domain.key}: ${domain.title}`);
          await domain.run(ctx);
          await markDomainDone(ctx, domain.key);
          await audit.record({
            tenantId: ctx.tenantId,
            userId: ctx.users.owner.id,
            action: 'create',
            entity: 'demo_seed',
            entityId: domain.key,
            after: { domain: domain.key, title: domain.title, sumber: 'npm run seed:demo' },
          });
          log(`  [${biz.key}] ${domain.key}: selesai (${((Date.now() - started) / 1000).toFixed(1)} dtk)`);
        } catch (err) {
          failures++;
          console.error(`  [${biz.key}] ${domain.key}: GAGAL: ${err instanceof Error ? err.stack ?? err.message : err}`);
        }
      }
      log(`  ringkasan ${biz.key}: ${await summary(ctx)}`);
    }
  } finally {
    await app.close();
  }
  return failures;
}

if (require.main === module) {
  seedDemo()
    .then((failures) => {
      if (failures > 0) {
        console.error(`\n${failures} langkah gagal. Perbaiki penyebabnya lalu jalankan ulang: yang sudah selesai dilewati.`);
        process.exit(1);
      }
      log('\nData contoh selesai.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nSeed data contoh gagal:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
