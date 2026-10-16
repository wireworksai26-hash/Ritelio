import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** P2034 = transaksi Serializable/deadlock dibatalkan Postgres karena bentrok dengan transaksi lain. */
export function isTxConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Jalankan blok transaksi dan ulangi bila Postgres membatalkannya karena
 * bentrok (P2034). Pengulangan sengaja membuka transaksi baru: klaim status
 * bersyarat di dalamnya kini melihat hasil pemenang, sehingga yang kalah
 * mendapat 409 yang jelas — bukan 500 mentah.
 *
 * `fn` HARUS hanya membungkus `prisma.$transaction(...)`, tanpa efek samping
 * di luar transaksi, supaya aman diulang.
 */
export async function retryOnConflict<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isTxConflict(error)) throw error;
      if (attempt >= attempts) {
        throw new ConflictException('Terjadi benturan dengan proses lain. Muat ulang lalu coba lagi.');
      }
      await sleep(10 * attempt + Math.random() * 30);
    }
  }
}

/** Kode unik (P2002) -> true, dipakai untuk memetakan tabrakan ke 409 alih-alih 500. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Kunci advisory per-transaksi: serialisasi proses "cek lalu buat" yang tidak punya unique constraint. */
export async function advisoryLock(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  key: string,
): Promise<void> {
  // void-returning function: $queryRaw gagal mendeserialisasi kolom void, jadi pakai $executeRaw.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Pelanggaran FK (P2003): data masih dipakai dokumen lain. */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
