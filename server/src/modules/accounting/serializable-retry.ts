import { Prisma } from '@prisma/client';

/**
 * Jalankan transaksi Serializable dengan pengulangan bila Postgres menolaknya
 * karena konflik serialisasi/deadlock (Prisma P2034, SQLSTATE 40001/40P01).
 * Tanpa ini, dua request yang berebut data yang sama memberi 500 padahal
 * hasil yang benar (mis. 409 duplikat) baru terlihat pada percobaan ulang.
 */
export async function withSerializableRetry<T>(run: () => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!retryable || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * attempt + Math.random() * 20));
    }
  }
}
