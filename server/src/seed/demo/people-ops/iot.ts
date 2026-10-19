import { IotService } from '../../../modules/iot/iot.service';
import type { DemoContext } from '../context';
import { generateReadings, readingSlots, spanMs } from './sensor-series';
import type { SensorSeed } from './types';

/** Lama riwayat pembacaan yang diisi. */
export const HISTORY_DAYS = 10;

/**
 * Jam pembacaan terakhir. Pada jalankan pertama: semenit sebelum sekarang, supaya sensor tampak "mengirim".
 * Pada jalankan ulang: dipulihkan dari pembacaan tertua yang sudah tersimpan, sehingga semua jam pembacaan sama
 * persis dengan yang pertama dan ingest menolak duplikatnya (jumlah baris tidak bertambah).
 */
function endFor(earliest: Date | null): Date {
  if (earliest) return new Date(earliest.getTime() + spanMs(HISTORY_DAYS));
  return new Date(Math.floor((Date.now() - 60_000) / 60_000) * 60_000);
}

async function seedSensor(ctx: DemoContext, s: SensorSeed): Promise<number> {
  const iot = ctx.get(IotService);
  const { prisma, tenantId, companyId } = ctx;

  let device = await prisma.sensorDevice.findFirst({ where: { tenantId, code: s.code } });
  let apiKey: string | null = null;
  if (!device) {
    const warehouseId = s.warehouseOutletIndex !== undefined ? ctx.warehouseIds[s.warehouseOutletIndex] : undefined;
    const workCenter = s.workCenterCode ? await prisma.workCenter.findFirst({ where: { tenantId, companyId, code: s.workCenterCode }, select: { id: true } }) : null;
    if (s.workCenterCode && !workCenter) throw new Error(`Work center ${s.workCenterCode} tidak ada untuk sensor ${s.code}.`);
    const registered = await iot.register(tenantId, { code: s.code, name: s.name, type: s.type, unit: s.unit, warehouseId, workCenterId: workCenter?.id });
    apiKey = registered.apiKey;
    device = await prisma.sensorDevice.findFirstOrThrow({ where: { id: registered.id } });
  }

  const earliest = await prisma.sensorReading.aggregate({ where: { tenantId, deviceId: device.id }, _min: { recordedAt: true }, _count: true });
  const slots = readingSlots(endFor(earliest._min.recordedAt), HISTORY_DAYS);
  if (earliest._count >= slots.length) return 0;

  // Kunci API asli hanya tampil sekali saat daftar; untuk melengkapi sensor yang sudah ada, kunci diputar.
  if (!apiKey) apiKey = (await iot.rotateKey(tenantId, s.code)).apiKey;

  let added = 0;
  for (const r of generateReadings({ ...s.series, code: s.code }, slots)) {
    const res = await iot.ingest(tenantId, { deviceCode: s.code, apiKey, value: r.value, recordedAt: r.recordedAt.toISOString() });
    if (!res.duplicate) added++;
  }
  return added;
}

export async function seedIot(ctx: DemoContext, sensors: SensorSeed[]): Promise<void> {
  let added = 0;
  for (const s of sensors) added += await seedSensor(ctx, s);
  const [devices, readings] = await Promise.all([
    ctx.prisma.sensorDevice.count({ where: { tenantId: ctx.tenantId } }),
    ctx.prisma.sensorReading.count({ where: { tenantId: ctx.tenantId } }),
  ]);
  ctx.log(`IoT: ${devices} sensor, ${readings} pembacaan (${added} baru)`);
}
