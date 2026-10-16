import { afterEach, describe, expect, it, vi } from 'vitest';

// api.ts membaca import.meta.env saat modul dimuat, jadi tiap skenario memuat ulang modulnya.
async function loadApi(env: { dev: boolean; apiUrl?: string }) {
  vi.resetModules();
  vi.stubEnv('DEV', env.dev);
  vi.stubEnv('VITE_API_URL', env.apiUrl ?? '');
  return import('./api');
}

afterEach(() => vi.unstubAllEnvs());

describe('alamat API', () => {
  it('dev tanpa VITE_API_URL memakai backend lokal', async () => {
    const api = await loadApi({ dev: true });
    expect(api.apiConfigured()).toBe(true);
    expect(api.getCleanApiUrl('/v1/auth/login')).toBe('http://localhost:4000/v1/auth/login');
  });

  it('produksi tanpa VITE_API_URL dianggap belum dikonfigurasi (bukan menunjuk ke localhost pengunjung)', async () => {
    const api = await loadApi({ dev: false });
    expect(api.apiConfigured()).toBe(false);
    expect(api.apiBaseUrl()).toBe('');
    await expect(api.apiFetch('/v1/inventory/products')).rejects.toThrow(/VITE_API_URL/);
  });

  it('produksi dengan VITE_API_URL tanpa /v1 menambahkan prefix sekali', async () => {
    const api = await loadApi({ dev: false, apiUrl: 'https://api.contoh.up.railway.app' });
    expect(api.apiConfigured()).toBe(true);
    expect(api.getCleanApiUrl('/v1/crm/leads')).toBe('https://api.contoh.up.railway.app/v1/crm/leads');
  });

  it('VITE_API_URL berakhiran /v1 atau / tidak menggandakan /v1', async () => {
    for (const url of ['https://api.contoh.app/v1', 'https://api.contoh.app/v1/', 'https://api.contoh.app/']) {
      const api = await loadApi({ dev: false, apiUrl: url });
      expect(api.getCleanApiUrl('/v1/crm/leads')).toMatch(/^https:\/\/api\.contoh\.app\/v1\/crm\/leads$/);
    }
  });

  it('spasi di sekitar VITE_API_URL diabaikan', async () => {
    const api = await loadApi({ dev: false, apiUrl: '  https://api.contoh.app  ' });
    expect(api.getCleanApiUrl('/v1/x')).toBe('https://api.contoh.app/v1/x');
  });
});

describe('respons yang bukan dari API', () => {
  function stubFetch(res: Response) {
    vi.stubGlobal('fetch', vi.fn(async () => res));
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal('window', { location: { href: 'https://app.contoh.app/' }, dispatchEvent: () => true });
  }

  afterEach(() => vi.unstubAllGlobals());

  it('200 + HTML (VITE_API_URL menunjuk ke situs frontend) ditolak dengan pesan yang jelas', async () => {
    stubFetch(new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const api = await loadApi({ dev: false, apiUrl: 'https://app.contoh.app' });
    await expect(api.apiFetch('/v1/crm/leads')).rejects.toThrow(/Alamat API salah.*VITE_API_URL/);
  });

  it('200 + JSON tetap diteruskan', async () => {
    stubFetch(new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const api = await loadApi({ dev: false, apiUrl: 'https://api.contoh.app' });
    await expect(api.apiFetch('/v1/crm/leads')).resolves.toEqual({ ok: 1 });
  });

  it('error server membawa pesan dari API', async () => {
    stubFetch(new Response(JSON.stringify({ message: 'Terlalu banyak permintaan' }), { status: 429, headers: { 'content-type': 'application/json' } }));
    const api = await loadApi({ dev: false, apiUrl: 'https://api.contoh.app' });
    await expect(api.apiFetch('/v1/crm/leads')).rejects.toThrow('Terlalu banyak permintaan');
  });
});
