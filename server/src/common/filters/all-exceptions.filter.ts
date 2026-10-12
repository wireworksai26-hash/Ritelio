import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface ErrorPayload {
  status: number;
  body: { statusCode: number; message: string | string[]; error?: string; retryAfter?: number };
  /** true bila kegagalan berasal dari server (bukan kesalahan klien) dan harus dicatat lengkap. */
  logAsError: boolean;
}

const GENERIC_500 = 'Terjadi kesalahan pada server. Coba lagi nanti.';

/**
 * Terjemahkan exception apa pun menjadi respons yang aman bagi klien:
 *  - HttpException Nest diteruskan apa adanya;
 *  - galat Prisma yang dipicu input klien dipetakan ke 4xx tanpa pesan/stack Prisma;
 *  - kesalahan parser body (413/400) diberi pesan generik;
 *  - sisanya menjadi 500 generik. Detail hanya masuk log server.
 */
export function toErrorPayload(exception: unknown): ErrorPayload {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const res = exception.getResponse();
    const body =
      typeof res === 'string'
        ? { statusCode: status, message: res }
        : { statusCode: status, ...(res as Record<string, unknown>) };
    // 5xx yang dilempar sengaja (mis. ServiceUnavailable) tetap dikirim; pesan buatan developer.
    return { status, body: body as ErrorPayload['body'], logAsError: status >= 500 };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return client(HttpStatus.CONFLICT, 'Data sudah ada (duplikat).', 'Conflict');
      case 'P2003':
        return client(
          HttpStatus.CONFLICT,
          'Operasi melanggar relasi data: referensi tidak valid atau masih dipakai data lain.',
          'Conflict',
        );
      case 'P2025':
        return client(HttpStatus.NOT_FOUND, 'Data tidak ditemukan.', 'Not Found');
      case 'P2034':
        return client(HttpStatus.CONFLICT, 'Terjadi konflik transaksi. Coba ulangi.', 'Conflict');
      case 'P2000':
        return client(HttpStatus.BAD_REQUEST, 'Salah satu nilai terlalu panjang.', 'Bad Request');
      default:
        return server();
    }
  }

  if (exception instanceof Prisma.PrismaClientValidationError) {
    // Biasanya nilai enum/tipe dari query string yang tidak lolos DTO.
    return { ...client(HttpStatus.BAD_REQUEST, 'Parameter permintaan tidak valid.', 'Bad Request'), logAsError: true };
  }

  // Galat http-errors milik body-parser (payload terlalu besar / JSON rusak).
  const e = exception as { status?: unknown; statusCode?: unknown; type?: unknown } | null;
  const code = typeof e?.statusCode === 'number' ? e.statusCode : typeof e?.status === 'number' ? e.status : 0;
  if (code >= 400 && code < 500) {
    if (e?.type === 'entity.too.large' || code === 413) {
      return client(HttpStatus.PAYLOAD_TOO_LARGE, 'Ukuran permintaan terlalu besar.', 'Payload Too Large');
    }
    return client(code, 'Permintaan tidak valid.', 'Bad Request');
  }

  return server();
}

function client(status: number, message: string, error: string): ErrorPayload {
  return { status, body: { statusCode: status, message, error }, logAsError: false };
}

function server(): ErrorPayload {
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { statusCode: 500, message: GENERIC_500, error: 'Internal Server Error' },
    logAsError: true,
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest<{ method?: string; originalUrl?: string; url?: string }>();
    const payload = toErrorPayload(exception);

    if (payload.logAsError) {
      const where = `${req.method ?? '?'} ${req.originalUrl ?? req.url ?? '?'}`;
      this.logger.error(
        `${where} -> ${payload.status}: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (payload.status === 429 && typeof payload.body.retryAfter === 'number') {
      res.setHeader?.('Retry-After', String(payload.body.retryAfter));
    }
    res.status(payload.status).json(payload.body);
  }
}
