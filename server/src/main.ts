import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './common/config/env.validation';

/** Batas body JSON umum. Cukup untuk dokumen ERP terbesar (jurnal/PO ratusan baris). */
const JSON_LIMIT = process.env.BODY_LIMIT ?? '512kb';
/**
 * Hanya unggahan OCR yang membawa gambar base64 (klien membatasi 8 MB biner ≈ 10,7 MB
 * base64; DTO membatasi 11 juta karakter). Batas ini sedikit di atasnya.
 */
const OCR_JSON_LIMIT = process.env.OCR_BODY_LIMIT ?? '12mb';
const OCR_PATHS = ['/v1/ocr/scan'];

async function bootstrap() {
  // bodyParser dimatikan agar batas ukuran bisa dibedakan per rute (lihat di bawah).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Di belakang reverse proxy/load balancer: set TRUST_PROXY=1 (jumlah hop) agar req.ip
  // dan throttle memakai IP klien sebenarnya, bukan IP proxy. Header X-Forwarded-For
  // TIDAK dipercaya tanpa ini sehingga tidak bisa dipalsukan untuk menghindari throttle.
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
  }

  app.use(helmet());

  // Parser body: rute OCR lebih longgar, selebihnya ketat. Parser kedua melewati
  // request yang body-nya sudah diparse oleh yang pertama.
  for (const path of OCR_PATHS) app.use(path, json({ limit: OCR_JSON_LIMIT }));
  app.use(json({ limit: JSON_LIMIT }));
  app.use(urlencoded({ extended: false, limit: JSON_LIMIT }));

  // Origin sudah divalidasi saat boot (env.validation): tanpa wildcard, dan wajib
  // eksplisit di produksi. Default dev hanya Vite lokal.
  const origins = parseCorsOrigins(process.env.CORS_ORIGIN);
  app.enableCors({
    origin: origins.length > 0 ? origins : ['http://localhost:5173'],
    credentials: true,
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist membuang property tak dikenal agar tidak bisa sampai ke service
      // lewat body. forbidNonWhitelisted sengaja TIDAK diaktifkan: client POS
      // mengirim field turunan seperti cashierId/total yang dihitung ulang server,
      // dan menolak request yang sah lebih merusak daripada menerima field yang
      // lalu dibuang.
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`Retalio API berjalan di http://localhost:${port}/v1`);
}

bootstrap();
