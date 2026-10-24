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

  it('produksi tanpa VITE_API_URL memakai asal yang sama (path relatif), bukan localhost pengunjung', async () => {
    const api = await loadApi({ dev: false });
    expect(api.apiBaseUrl()).toBe('');
    expect(api.getCleanApiUrl('/v1/inventory/products')).toBe('/v1/inventory/products');
    expect(api.getCleanApiUrl('/v1/inventory/products')).not.toMatch(/localhost/);
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

  it('200 + HTML (frontend dilayani tanpa backend / VITE_API_URL ke situs frontend) ditolak dengan pesan jelas', async () => {
    stubFetch(new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const api = await loadApi({ dev: false, apiUrl: 'https://app.contoh.app' });
    await expect(api.apiFetch('/v1/crm/leads')).rejects.toThrow(/Alamat API salah.*VITE_API_URL/);
  });

  it('asal yang sama: request ke path relatif, dan HTML dari host statis tetap terdeteksi', async () => {
    const fetchMock = vi.fn(async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal('window', { location: { href: 'https://app.contoh.app/' }, dispatchEvent: () => true });
    const api = await loadApi({ dev: false });
    await expect(api.apiFetch('/v1/crm/leads')).rejects.toThrow(/Alamat API salah/);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/v1/crm/leads');
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

  it('403 dengan kode akun: galat membawa status dan kode, dan memicu event akses terbatas', async () => {
    const dispatch = vi.fn(() => true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'Akun hanya bisa dibaca.', code: 'SUBSCRIPTION_READ_ONLY' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal('window', { location: { href: 'https://app.contoh.app/' }, dispatchEvent: dispatch });
    const api = await loadApi({ dev: false, apiUrl: 'https://api.contoh.app' });
    const err: any = await api.apiFetch('/v1/sales/transactions', { method: 'POST' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(api.ApiRequestError);
    expect(err).toMatchObject({ status: 403, code: 'SUBSCRIPTION_READ_ONLY', message: 'Akun hanya bisa dibaca.' });
    expect(api.isAccessRestricted(err)).toBe(true);
    const event = (dispatch.mock.calls as unknown as Array<[CustomEvent]>)[0][0];
    expect(event.type).toBe(api.ACCESS_RESTRICTED_EVENT);
    expect(event.detail).toEqual({ code: 'SUBSCRIPTION_READ_ONLY', message: 'Akun hanya bisa dibaca.' });
  });

  it('403 biasa (tanpa kode akun) tidak memicu event dan bukan penolakan akun', async () => {
    const dispatch = vi.fn(() => true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Akses ditolak.' }), { status: 403, headers: { 'content-type': 'application/json' } })),
    );
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal('window', { location: { href: 'https://app.contoh.app/' }, dispatchEvent: dispatch });
    const api = await loadApi({ dev: false, apiUrl: 'https://api.contoh.app' });
    const err: any = await api.apiFetch('/v1/finance/entries').catch((e) => e);
    expect(err.status).toBe(403);
    expect(api.isAccessRestricted(err)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
