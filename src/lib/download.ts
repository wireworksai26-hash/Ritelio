import { getCleanApiUrl, getToken } from './api';
import { selectedCompanyId } from '../stores/companyStore';

/**
 * Unduh berkas (CSV dsb.) dari API. apiFetch selalu membaca JSON, jadi respons
 * berkas butuh jalur sendiri. Header otorisasi dan perusahaan aktif sama dengan apiFetch.
 */
export async function downloadApiFile(path: string, fallbackName: string, timeoutMs = 30_000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = getToken();
    const companyId = selectedCompanyId();
    const res = await fetch(getCleanApiUrl(path), {
      signal: controller.signal,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(companyId ? { 'x-company-id': companyId } : {}),
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `HTTP ${res.status}`);
    }
    const disposition = res.headers.get('content-disposition') ?? '';
    const name = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } finally {
    clearTimeout(timer);
  }
}
