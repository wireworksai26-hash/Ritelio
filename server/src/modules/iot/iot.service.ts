import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { advisoryLock, isUniqueViolation } from '../inventory/tx-retry';
import { detectAnomaly, generateApiKey, hashApiKey, summarizeValues, validateReading, verifyApiKey } from './sensor-logic';

export interface SensorReadingInput {
  deviceCode: string;
  apiKey: string;
  value: number;
  recordedAt?: string;
}

/**
 * Sensor IoT. Sensor hanya melaporkan angka — ia tidak pernah mengubah stok.
 *
 * Penyesuaian stok tetap lewat StockOp supaya ada jejak audit dan operator
 * tetap memegang kendali. Sensor yang boleh mengubah inventory sendiri adalah
 * jalur yang paling sering berakhir jadi selisih gudang.
 */
@Injectable()
export class IotService {
  constructor(private readonly prisma: PrismaService) {}

  async register(tenantId: string, dto: {
    code: string;
    name: string;
    type: 'temperature' | 'humidity' | 'counter' | 'weight' | 'vibration' | 'power';
    unit?: string;
    warehouseId?: string;
    workCenterId?: string;
  }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const existing = await this.prisma.sensorDevice.findFirst({ where: { tenantId, code: dto.code } });
    if (existing) throw new BadRequestException(`Kode sensor "${dto.code}" sudah dipakai.`);
    // Gudang/work center harus milik tenant ini; id asing tidak boleh tertaut.
    if (dto.warehouseId) {
      const wh = await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, tenantId, companyId }, select: { id: true } });
      if (!wh) throw new NotFoundException('Gudang tidak ditemukan.');
    }
    if (dto.workCenterId) {
      const wc = await this.prisma.workCenter.findFirst({ where: { id: dto.workCenterId, tenantId, companyId }, select: { id: true } });
      if (!wc) throw new NotFoundException('Work center tidak ditemukan.');
    }

    const apiKey = generateApiKey();
    let created;
    try {
    created = await this.prisma.sensorDevice.create({
      data: {
        tenantId,
        companyId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        unit: dto.unit ?? '',
        warehouseId: dto.warehouseId ?? null,
        workCenterId: dto.workCenterId ?? null,
        apiKey: hashApiKey(apiKey),
      },
      select: { id: true, code: true, name: true, type: true },
    });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`Kode sensor "${dto.code}" sudah dipakai.`);
      throw error;
    }
    // Hanya hash yang tersimpan; key asli ditampilkan sekali ini saja.
    return { ...created, apiKey };
  }

  async list(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.sensorDevice.findMany({
      where: { tenantId, companyId },
      select: {
        id: true, code: true, name: true, type: true, unit: true,
        warehouseId: true, workCenterId: true, isActive: true, lastSeenAt: true,
        _count: { select: { readings: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Ingesti pembacaan. Endpoint ini tidak butuh JWT — auth-nya API key sensor — jadi
   * tenant TIDAK tersedia dari token (`tenantId` undefined pada rute @Public). Perangkat
   * dikenali dari (kode + API key): kode boleh sama di tenant berbeda dan key yang
   * menentukan perangkat mana. Tanpa ini query tak terfilter tenant dan penyimpanan
   * pembacaan gagal 500 karena tenantId kosong.
   */
  async ingest(tenantId: string | undefined, input: SensorReadingInput) {
    const candidates = await this.prisma.sensorDevice.findMany({
      where: { code: input.deviceCode, ...(tenantId ? { tenantId } : {}) },
    });
    // Sensor tak dikenal dan key salah memberi jawaban yang sama: endpoint publik
    // tidak boleh membocorkan kode sensor mana yang ada.
    let device = candidates[0];
    let auth = { ok: false, legacy: false };
    for (const candidate of candidates) {
      const check = verifyApiKey(candidate.apiKey, input.apiKey);
      if (check.ok) {
        device = candidate;
        auth = check;
        break;
      }
    }
    if (!device || !auth.ok) throw new ForbiddenException('Sensor atau API key tidak valid.');
    tenantId = device.tenantId;
    if (!device.isActive) throw new ForbiddenException('Sensor dinonaktifkan.');

    const at = validateReading(device.type, input.value, new Date(), input.recordedAt);

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Pengiriman ulang (retry sensor) untuk waktu yang sama tidak boleh menggandakan baris.
      // Kunci per (perangkat, waktu): tanpa ini dua retry bersamaan sama-sama lolos cek lalu sama-sama menyimpan.
      await advisoryLock(tx, `iot-reading:${device.id}:${at.getTime()}`);
      const existing = await tx.sensorReading.findFirst({
        where: { tenantId, deviceId: device.id, recordedAt: at },
        select: { value: true, recordedAt: true },
      });
      if (existing) return { duplicate: true, reading: existing };

      const created = await tx.sensorReading.create({
        data: {
          tenantId,
          companyId: device.companyId,
          deviceId: device.id,
          value: new Prisma.Decimal(input.value),
          recordedAt: at,
        },
      });
      // lastSeenAt tidak boleh mundur karena pembacaan lama yang dikirim terlambat.
      const seen = !device.lastSeenAt || device.lastSeenAt < at ? at : device.lastSeenAt;
      await tx.sensorDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: seen, ...(auth.legacy ? { apiKey: hashApiKey(input.apiKey) } : {}) },
      });
      return { duplicate: false, reading: created };
    });

    return {
      accepted: true,
      duplicate: outcome.duplicate,
      deviceCode: device.code,
      value: Number(outcome.reading.value),
      recordedAt: outcome.reading.recordedAt,
    };
  }

  /** RingkasanSeries untuk grafik + ambang peringatan sederhana. */
  async history(tenantId: string, deviceCode: string, hours = 24) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const device = await this.prisma.sensorDevice.findFirst({
      where: { tenantId, companyId, code: deviceCode },
    });
    if (!device) throw new NotFoundException('Sensor tidak ditemukan.');

    const window = Math.min(Math.max(Math.floor(Number(hours)) || 24, 1), 720);
    const since = new Date(Date.now() - window * 3_600_000);
    const readings = await this.prisma.sensorReading.findMany({
      where: { tenantId, deviceId: device.id, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      select: { value: true, recordedAt: true },
    });

    const summary = summarizeValues(readings.map((r) => Number(r.value)));
    return {
      device: { code: device.code, name: device.name, type: device.type, unit: device.unit },
      ...summary,
      // Stok tidak pernah diubah otomatis; kondisi di luar rentang hanya
      // dilaporkan supaya operator memutuskan sendiri lewat StockOp.
      anomaly: detectAnomaly(device.type, summary.last, device.unit),
      series: readings.map((r) => ({ at: r.recordedAt, value: Number(r.value) })),
    };
  }

  /** Putar API key: key lama langsung tidak berlaku; key baru hanya tampil sekali. */
  async rotateKey(tenantId: string, deviceCode: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const device = await this.prisma.sensorDevice.findFirst({ where: { tenantId, companyId, code: deviceCode } });
    if (!device) throw new NotFoundException('Sensor tidak ditemukan.');
    const apiKey = generateApiKey();
    await this.prisma.sensorDevice.update({
      where: { id: device.id },
      data: { apiKey: hashApiKey(apiKey) },
    });
    return { code: device.code, apiKey };
  }
}
