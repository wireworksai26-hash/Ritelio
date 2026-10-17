// Klien API Retalio — terhubung langsung ke Backend NestJS API & PostgreSQL
import { selectedCompanyId } from '../stores/companyStore';

// Alamat API:
// - VITE_API_URL diisi (saat build): dipakai apa adanya. Untuk frontend dan backend di domain terpisah.
// - Kosong di dev: backend lokal.
// - Kosong di produksi: asal yang sama (path relatif "/v1/..."). Untuk deploy satu service, ketika backend
//   melayani file frontend. Bila frontend ternyata dilayani tanpa API di belakangnya, apiFetch mendeteksi
//   jawaban berupa halaman HTML dan menjelaskan penyebabnya (lihat di bawah).
const ENV_API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim().replace(/\/$/, '');
const RAW_BASE = ENV_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/v1' : '');

/** Alamat server API yang dituju. Kosong = asal yang sama dengan halaman. */
export function apiBaseUrl(): string {
  return RAW_BASE;
}

export function getCleanApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = RAW_BASE.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (base.endsWith('/v1') && cleanPath.startsWith('/v1/')) {
    return `${base}${cleanPath.slice(3)}`;
  }
  return `${base}${cleanPath}`;
}

export function apiConfigured(): boolean {
  return true;
}

export function getToken(): string | null {
  return localStorage.getItem('retalio-access-token');
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('retalio-access-token', accessToken);
  localStorage.setItem('retalio-refresh-token', refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem('retalio-access-token');
  localStorage.removeItem('retalio-refresh-token');
}

interface ApiError {
  message?: string;
}

/** Dikirim saat refresh token ditolak (kedaluwarsa/dicabut). authStore mendengarkan dan mengosongkan sesi. */
export const SESSION_EXPIRED_EVENT = 'retalio:session-expired';

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
const isAuthPath = (path: string): boolean => AUTH_PATHS.some((p) => path.includes(p));

// Satu refresh pada satu waktu: request yang kena 401 bersamaan menunggu promise yang sama
// (antrean). Refresh token dirotasi per pemakaian, jadi dua refresh paralel dengan token
// yang sama akan dianggap pemakaian ulang oleh server dan mencabut seluruh sesi.
let refreshInFlight: Promise<boolean> | null = null;

async function postRefresh(refreshToken: string): Promise<Response> {
  return fetch(getCleanApiUrl('/v1/auth/refresh'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
}

async function performRefresh(): Promise<boolean> {
  const sent = localStorage.getItem('retalio-refresh-token');
  if (!sent) return false;
  try {
    let res = await postRefresh(sent);
    if (res.status === 401) {
      // Tab lain mungkin sudah merotasi token ini: pakai token terbaru di localStorage sekali saja.
      const latest = localStorage.getItem('retalio-refresh-token');
      if (latest && latest !== sent) res = await postRefresh(latest);
    }
    if (res.ok) {
      const body = (await res.json()) as { accessToken?: string; refreshToken?: string };
      if (body.accessToken && body.refreshToken) {
        setTokens(body.accessToken, body.refreshToken);
        return true;
      }
      return false;
    }
    if (res.status === 401 || res.status === 403) {
      clearTokens();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    return false;
  } catch {
    // Jaringan putus: jangan hapus token, biarkan mode offline / percobaan berikutnya.
    return false;
  }
}

/** Perbarui access token memakai refresh token. Aman dipanggil paralel. */
export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Cabut sesi di server (best effort; tidak pernah melempar, aman saat offline). */
export async function revokeSession(): Promise<void> {
  const refreshToken = localStorage.getItem('retalio-refresh-token');
  if (!refreshToken) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(getCleanApiUrl('/v1/auth/logout'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
  } catch {
    // offline / server mati: sesi lokal tetap dihapus oleh pemanggil
  } finally {
    clearTimeout(timer);
  }
}

function apiHost(): string {
  try {
    return new URL(RAW_BASE || '/', window.location.href).host;
  } catch {
    return RAW_BASE || 'asal yang sama';
  }
}

async function request(path: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const token = getToken();
    const companyId = selectedCompanyId();
    return await fetch(getCleanApiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        // Perusahaan aktif; tanpa header backend memakai perusahaan utama
        ...(companyId ? { 'x-company-id': companyId } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (err) {
    // Timeout kita sendiri: tetap bernama AbortError (dikenali pemanggil), tetapi pesannya menyebut server mana.
    if (timedOut && err instanceof DOMException && err.name === 'AbortError') {
      throw new DOMException(
        `Server (${apiHost()}) tidak merespons dalam ${Math.round(timeoutMs / 1000)} detik. Coba lagi sebentar lagi.`,
        'AbortError',
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  let res = await request(path, options, timeoutMs);

  // 401 pada endpoint non-auth saat kita punya refresh token: refresh sekali lalu ulangi.
  if (res.status === 401 && !isAuthPath(path) && localStorage.getItem('retalio-refresh-token')) {
    if (await refreshAccessToken()) res = await request(path, options, timeoutMs);
  }

  // SPA fallback: VITE_API_URL yang menunjuk ke situs frontend (bukan API) dijawab 200 + halaman HTML.
  // Tanpa pemeriksaan ini hasilnya {} diam-diam dan layar hanya menampilkan "gagal memuat data".
  if (res.ok && (res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error(
      `Alamat API salah: ${apiHost()} mengembalikan halaman web, bukan data. Frontend ini dilayani tanpa backend di belakangnya. Isi VITE_API_URL dengan alamat service backend lalu build ulang, atau deploy backend dan frontend sebagai satu service.`,
    );
  }

  const body = (await res.json().catch(() => ({}))) as ApiError & T;
  if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
  return body;
}
