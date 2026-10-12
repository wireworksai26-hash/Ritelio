import { getCleanApiUrl } from './api';

export const OFFLINE_WRITE_MESSAGE =
  'Perubahan ini butuh koneksi internet. Anda sedang offline, jadi data tidak disimpan. Sambungkan internet lalu coba lagi.';
export const NETWORK_ERROR_MESSAGE = 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.';

/** Galat jaringan (tidak sampai ke server) — berbeda dari penolakan server (HTTP 4xx/5xx). Aman untuk dicoba ulang. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof NetworkError || (err instanceof DOMException && err.name === 'AbortError');
}

/** Metode yang hanya membaca; sisanya mengubah data dan tidak boleh "pura-pura berhasil" saat offline. */
export function isReadMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

function apiOrigin(): string | null {
  try {
    return new URL(getCleanApiUrl('/v1/'), window.location.href).origin;
  } catch {
    return null;
  }
}

function isApiRequest(rawUrl: string, origin: string | null): boolean {
  try {
    const u = new URL(rawUrl, window.location.href);
    return u.origin === origin && /\/v1\//.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Modul ERP hanya bisa dibaca saat offline (data terakhir yang tersimpan di cache),
 * sedangkan tulis/ubah selalu butuh koneksi. Pembungkus fetch ini menjadi satu titik
 * pusat: aksi tulis saat offline gagal cepat dengan pesan jelas, dan galat jaringan
 * mentah ("Failed to fetch") diganti pesan yang bisa dipahami pengguna.
 * AbortError (timeout apiFetch) sengaja tidak diubah: pemanggil mengenalinya lewat nama galat.
 */
export function installNetworkGuard(): void {
  if (typeof window === 'undefined' || (window.fetch as { __retalioGuard?: boolean }).__retalioGuard) return;
  const original = window.fetch.bind(window);
  const origin = apiOrigin();

  const guarded: typeof window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isApiRequest(url, origin)) return original(input, init);

    const method = init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET');
    if (navigator.onLine === false && !isReadMethod(method)) {
      throw new NetworkError(OFFLINE_WRITE_MESSAGE);
    }
    try {
      return await original(input, init);
    } catch (err) {
      if (err instanceof TypeError) {
        throw new NetworkError(
          navigator.onLine === false
            ? 'Anda sedang offline. Menampilkan data terakhir bila tersedia; perubahan butuh koneksi.'
            : NETWORK_ERROR_MESSAGE,
        );
      }
      throw err;
    }
  };
  (guarded as { __retalioGuard?: boolean }).__retalioGuard = true;
  window.fetch = guarded;
}
