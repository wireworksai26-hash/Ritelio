import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cacheControlFor, findWebRoot, isSpaRoute, webCspDirectives } from './web-static';

describe('isSpaRoute', () => {
  it('halaman aplikasi dijawab index.html', () => {
    for (const p of ['/', '/app', '/app/crm', '/login', '/onboarding', '/app/crm/']) {
      expect(isSpaRoute('GET', p)).toBe(true);
    }
  });

  it('API tidak pernah dijawab index.html, termasuk path yang tidak ada', () => {
    for (const p of ['/v1', '/v1/health', '/v1/crm/leads', '/v1/tidak-ada']) {
      expect(isSpaRoute('GET', p)).toBe(false);
    }
  });

  it('file yang tidak ada tetap 404, bukan index.html', () => {
    for (const p of ['/assets/index-abc.js', '/sw.js', '/favicon.svg', '/fonts/Newsreader-Light.woff2', '/x.map']) {
      expect(isSpaRoute('GET', p)).toBe(false);
    }
  });

  it('hanya GET dan HEAD; POST ke halaman tidak jadi HTML', () => {
    expect(isSpaRoute('HEAD', '/app')).toBe(true);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) expect(isSpaRoute(m, '/app')).toBe(false);
  });

  it('titik di tengah path (bukan ekstensi file) tidak dianggap file', () => {
    expect(isSpaRoute('GET', '/app/v1.2/ringkasan')).toBe(true);
  });
});

describe('cacheControlFor', () => {
  it('aset ber-hash immutable, berkas penentu versi selalu divalidasi', () => {
    expect(cacheControlFor('/srv/public/assets/index-AbC123.js')).toContain('immutable');
    expect(cacheControlFor(String.raw`C:\app\public\assets\index-AbC123.css`)).toContain('immutable');
    for (const f of ['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest', 'workbox-d2036780.js']) {
      expect(cacheControlFor(`/srv/public/${f}`)).toBe('no-cache');
    }
  });

  it('index.html di dalam folder assets palsu tidak ikut immutable', () => {
    expect(cacheControlFor('/srv/public/index.html')).toBe('no-cache');
  });
});

describe('findWebRoot', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  function webDir(withIndex: boolean) {
    const d = mkdtempSync(join(tmpdir(), 'web-'));
    dirs.push(d);
    if (withIndex) writeFileSync(join(d, 'index.html'), '<!doctype html>');
    return d;
  }

  it('memakai WEB_DIST bila ada index.html', () => {
    expect(findWebRoot({ WEB_DIST: webDir(true) }, '/tidak/dipakai/dist')).toBeTruthy();
  });

  it('null bila folder tidak punya index.html (backend murni API)', () => {
    expect(findWebRoot({ WEB_DIST: webDir(false) }, '/tidak/dipakai/dist')).toBeNull();
  });

  it('default ke <server>/public', () => {
    const server = mkdtempSync(join(tmpdir(), 'srv-'));
    dirs.push(server);
    mkdirSync(join(server, 'dist'));
    mkdirSync(join(server, 'public'));
    writeFileSync(join(server, 'public', 'index.html'), 'x');
    expect(findWebRoot({}, join(server, 'dist'))).toBe(join(server, 'public'));
  });

  it('SERVE_WEB=false mematikan penyajian walau folder ada', () => {
    expect(findWebRoot({ WEB_DIST: webDir(true), SERVE_WEB: 'false' }, '/x')).toBeNull();
  });
});

describe('webCspDirectives', () => {
  it('skrip hanya dari asal sendiri; tidak ada unsafe-inline di script', () => {
    const d = webCspDirectives(true);
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
  });

  it('upgrade-insecure-requests hanya di produksi', () => {
    expect(webCspDirectives(true)['upgrade-insecure-requests']).toEqual([]);
    expect(webCspDirectives(false)['upgrade-insecure-requests']).toBeNull();
  });
});
