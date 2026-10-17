import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { join } from 'node:path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { resolveCorsOrigins } from './common/config/env.validation';
import { RejectNulPipe } from './common/pipes/reject-nul.pipe';
import { cacheControlFor, findWebRoot, isSpaRoute, webCspDirectives } from './common/web/web-static';

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
  // Railway selalu menaruh proxy di depan aplikasi. Tanpa trust proxy, semua pengunjung terlihat sebagai
  // satu IP (milik proxy) dan berbagi satu kuota throttle/kunci login, sehingga halaman mulai gagal
  // dimuat (429) begitu beberapa orang memakai aplikasi. Terdeteksi otomatis; TRUST_PROXY tetap menang.
  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  const trustProxy = process.env.TRUST_PROXY ?? (onRailway ? '1' : undefined);
  if (trustProxy) {
    const hops = Number(trustProxy);
    app.set('trust proxy', Number.isInteger(hops) ? hops : trustProxy);
  }

  // Frontend (hasil build) ikut dilayani backend bila ada di <server>/public atau WEB_DIST: satu service,
  // satu domain, tanpa VITE_API_URL dan tanpa CORS. Tanpa folder itu, backend murni API.
  const webRoot = findWebRoot(process.env, __dirname);
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(
    helmet(
      webRoot
        ? { contentSecurityPolicy: { useDefaults: false, directives: webCspDirectives(isProduction) } }
        : undefined,
    ),
  );

  // Parser body: rute OCR lebih longgar, selebihnya ketat. Parser kedua melewati
  // request yang body-nya sudah diparse oleh yang pertama.
  for (const path of OCR_PATHS) app.use(path, json({ limit: OCR_JSON_LIMIT }));
  app.use(json({ limit: JSON_LIMIT }));
  app.use(urlencoded({ extended: false, limit: JSON_LIMIT }));

  // Origin sudah divalidasi saat boot (env.validation): tanpa wildcard, dan wajib
  // eksplisit di produksi. Default dev hanya Vite lokal.
  const origins = resolveCorsOrigins(process.env);
  // Default dev: Vite dev (5173) dan `vite preview` (4173), lewat localhost maupun 127.0.0.1.
  const DEV_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];
  const allowedOrigins = origins.length > 0 ? origins : DEV_ORIGINS;
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.setGlobalPrefix('v1');

  if (webRoot) {
    // Registrasi sebelum router Nest, jadi dijalankan lebih dulu: berkas statis, lalu navigasi SPA.
    // Request /v1/* diteruskan ke API (isSpaRoute false), file yang tidak ada tetap 404.
    app.useStaticAssets(webRoot, {
      index: false,
      setHeaders: (res, filePath) => res.setHeader('Cache-Control', cacheControlFor(filePath)),
    });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (!isSpaRoute(req.method, req.path)) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webRoot, 'index.html'));
    });
  }
  app.useGlobalPipes(
    new RejectNulPipe(),
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
  // Ringkasan konfigurasi untuk diagnosis di log deploy. Tidak berisi rahasia.
  console.log(
    `[config] NODE_ENV=${process.env.NODE_ENV ?? '(kosong)'} | trust proxy=${trustProxy ?? 'mati'} | CORS origin=${allowedOrigins.join(', ')} | web=${webRoot ?? 'tidak dilayani (API murni)'}`,
  );
}

bootstrap();
