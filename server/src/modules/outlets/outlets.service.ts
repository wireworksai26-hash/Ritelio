import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { CreateOutletDto, UpdateOutletDto } from './dto/outlet.dto';

@Injectable()
export class OutletsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pastikan outlet ada dan milik tenant ini. */
  private async findOwned(tenantId: string, id: string) {
    const outlet = await this.prisma.outlet.findFirst({ where: { id, tenantId } });
    if (!outlet) throw new NotFoundException('Outlet tidak ditemukan.');
    return outlet;
  }

  async list(tenantId: string) {
    const outlets = await this.prisma.outlet.findMany({
      where: { tenantId },
      include: {
        warehouses: true,
        _count: { select: { transactions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    // Ratakan _count menjadi field transactionCount yang mudah dipakai UI
    return outlets.map(({ _count, ...outlet }) => ({
      ...outlet,
      transactionCount: _count.transactions,
    }));
  }

  async create(tenantId: string, dto: CreateOutletDto) {
    // Outlet baru otomatis dapat gudang bawaan "Gudang {name}" (atomic)
    return this.prisma.$transaction(async (trx) => {
      const outlet = await trx.outlet.create({
        data: { tenantId, name: dto.name, address: dto.address ?? '' },
      });
      await trx.warehouse.create({
        data: { tenantId, outletId: outlet.id, name: `Gudang ${dto.name}` },
      });
      return outlet;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateOutletDto) {
    await this.findOwned(tenantId, id);

    const data: Prisma.OutletUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.address !== undefined) data.address = dto.address;

    return this.prisma.outlet.update({
      where: { id },
      data,
      include: { warehouses: true },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOwned(tenantId, id);

    // Riwayat transaksi tidak boleh hilang — tolak hapus jika sudah ada transaksi
    const txCount = await this.prisma.salesTransaction.count({
      where: { tenantId, outletId: id },
    });
    if (txCount > 0) {
      throw new ConflictException('Outlet punya riwayat transaksi — tidak bisa dihapus.');
    }

    // Hapus gudang terkait dulu, baru outlet-nya (atomic)
    await this.prisma.$transaction([
      this.prisma.warehouse.deleteMany({ where: { tenantId, outletId: id } }),
      this.prisma.outlet.delete({ where: { id } }),
    ]);
    return { id, deleted: true };
  }
}
