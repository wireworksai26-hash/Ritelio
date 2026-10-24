import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';
import type { ListSubscribersQueryDto, NewsletterStatus } from './dto/newsletter.dto';

/** Batas baris pada ekspor, supaya satu permintaan tidak membawa seluruh tabel tanpa batas. */
export const EXPORT_LIMIT = 10_000;

// Daftar pelanggan berisi alamat email orang luar: hanya superadmin platform yang boleh membaca dan mengubahnya.
function assertSuperadmin(actor: AuthUser): void {
  if (actor.role !== 'superadmin') {
    throw new ForbiddenException('Hanya superadmin platform yang dapat mengakses daftar pelanggan newsletter.');
  }
}

@Injectable()
export class NewsletterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catat satu alamat email dari formulir footer. Hasilnya sama untuk alamat baru maupun yang sudah ada, supaya
   * formulir tidak bisa dipakai untuk menebak siapa saja yang sudah terdaftar.
   *  - Baru: dicatat sebagai pending (belum dikonfirmasi lewat email).
   *  - Pernah berhenti: dicatat ulang sebagai pending dengan persetujuan baru.
   *  - Sudah pending/confirmed: dibiarkan apa adanya.
   * Kolom jebakan yang terisi berarti bot: tidak ada yang disimpan.
   */
  async subscribe(email: string, honeypot?: string): Promise<void> {
    if (honeypot && honeypot.trim().length > 0) return;
    const now = new Date();
    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email }, select: { id: true, status: true } });
    if (!existing) {
      try {
        await this.prisma.newsletterSubscriber.create({ data: { email, consentAt: now } });
      } catch (err) {
        // Dua permintaan bersamaan untuk alamat yang sama: yang kedua sudah tercatat oleh yang pertama.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
      return;
    }
    if (existing.status === 'unsubscribed') {
      await this.prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { status: 'pending', consentAt: now, confirmedAt: null, unsubscribedAt: null },
      });
    }
  }

  async list(actor: AuthUser, query: ListSubscribersQueryDto) {
    assertSuperadmin(actor);
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const q = query.q?.trim();
    const where: Prisma.NewsletterSubscriberWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { email: { contains: q, mode: 'insensitive' } } : {}),
    };
    const [data, total, grouped] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, email: true, status: true, source: true, consentAt: true, confirmedAt: true, unsubscribedAt: true, createdAt: true },
      }),
      this.prisma.newsletterSubscriber.count({ where }),
      this.prisma.newsletterSubscriber.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts: Record<NewsletterStatus, number> = { pending: 0, confirmed: 0, unsubscribed: 0 };
    for (const row of grouped) if (row.status in counts) counts[row.status as NewsletterStatus] = row._count._all;
    return { data, meta: { page, limit, total, counts: { ...counts, all: counts.pending + counts.confirmed + counts.unsubscribed } } };
  }

  /** Semua baris (maks. EXPORT_LIMIT) untuk diekspor ke CSV oleh klien. */
  async exportAll(actor: AuthUser) {
    assertSuperadmin(actor);
    const data = await this.prisma.newsletterSubscriber.findMany({
      orderBy: { createdAt: 'asc' },
      take: EXPORT_LIMIT,
      select: { email: true, status: true, source: true, consentAt: true, confirmedAt: true, unsubscribedAt: true, createdAt: true },
    });
    return { data };
  }

  /**
   * Tandai berhenti atas permintaan pemilik alamat (mis. lewat email ke tim). Hanya "berhenti" yang bisa diatur
   * dari panel: konfirmasi harus datang dari pemilik alamat sendiri, bukan diisikan oleh tim. Hanya id yang
   * dikembalikan supaya alamat email tidak ikut masuk ke jejak audit.
   */
  async unsubscribe(actor: AuthUser, id: string): Promise<{ id: string }> {
    assertSuperadmin(actor);
    const found = await this.prisma.newsletterSubscriber.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Pelanggan tidak ditemukan.');
    await this.prisma.newsletterSubscriber.update({ where: { id }, data: { status: 'unsubscribed', unsubscribedAt: new Date() } });
    return { id };
  }

  /** Hapus permanen satu alamat (permintaan penghapusan data pribadi). */
  async remove(actor: AuthUser, id: string): Promise<{ id: string }> {
    assertSuperadmin(actor);
    const found = await this.prisma.newsletterSubscriber.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Pelanggan tidak ditemukan.');
    await this.prisma.newsletterSubscriber.delete({ where: { id } });
    return { id };
  }
}
