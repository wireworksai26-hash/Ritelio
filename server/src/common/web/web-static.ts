import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Env = Record<string, string | undefined>;

/**
 * Folder build frontend yang ikut dilayani backend (deploy satu service). Urutan: WEB_DIST, lalu
 * `<server>/public`. Null bila tidak ada index.html di sana atau SERVE_WEB=false, sehingga
 * backend tetap murni API (frontend di domain terpisah).
 */
export function findWebRoot(env: Env, baseDir: string): string | null {
  if (env.SERVE_WEB === 'false') return null;
  const root = env.WEB_DIST ? resolve(env.WEB_DIST) : join(baseDir, '..', 'public');
  return existsSync(join(root, 'index.html')) ? root : null;
}

/**
 * Apakah request ini navigasi halaman SPA yang harus dijawab index.html? Hanya GET/HEAD, bukan API (/v1),
 * dan bukan permintaan file (ada ekstensi). File yang tidak ada harus 404, bukan index.html: kalau tidak,
 * browser menerima HTML untuk skrip/gambar yang hilang dan galatnya menyesatkan.
 */
export function isSpaRoute(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (path === '/v1' || path.startsWith('/v1/')) return false;
  const lastSegment = path.split('/').pop() ?? '';
  return !/\.[A-Za-z0-9]+$/.test(lastSegment);
}

/**
 * Cache-Control per berkas. Berkas ber-hash di /assets aman di-cache selamanya. Berkas yang menentukan
 * versi aplikasi (index.html, service worker, manifest) wajib selalu divalidasi, jika tidak pengguna PWA
 * tertahan di versi lama setelah deploy.
 */
export function cacheControlFor(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/');
  if (/\/assets\/[^/]+$/.test(normalized)) return 'public, max-age=31536000, immutable';
  if (/(^|\/)(index\.html|sw\.js|registerSW\.js|manifest\.webmanifest|workbox-[^/]+\.js)$/.test(normalized)) {
    return 'no-cache';
  }
  return 'public, max-age=3600';
}

/**
 * CSP untuk aplikasi yang dilayani backend. Gambar boleh dari https mana pun (foto produk bisa berupa URL
 * eksternal), sedangkan skrip hanya dari asal sendiri. upgrade-insecure-requests hanya di produksi karena
 * di http://localhost ia memaksa subresource ke https yang tidak ada.
 */
export function webCspDirectives(isProduction: boolean): Record<string, string[] | null> {
  return {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'media-src': ["'self'", 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
    'upgrade-insecure-requests': isProduction ? [] : null,
  };
}
