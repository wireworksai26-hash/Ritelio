// Klien API Retalio — terhubung langsung ke Backend NestJS API & PostgreSQL
import { selectedCompanyId } from '../stores/companyStore';

const RAW_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:4000/v1';

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

export async function apiFetch<T>(path: string, options: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = getCleanApiUrl(path);
    const token = getToken();
    const companyId = selectedCompanyId();
    const res = await fetch(url, {
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
    const body = (await res.json().catch(() => ({}))) as ApiError & T;
    if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

