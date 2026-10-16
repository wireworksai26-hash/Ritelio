import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Strategi caching mengikuti TRD:
// - App shell            -> precache (Cache First)
// - Data produk/stok     -> Stale-While-Revalidate
// - Transaksi POS (POST) -> Network Only + Background Sync queue
// - Laporan keuangan     -> Network First + fallback cache
// - Endpoint AI          -> Network Only (butuh koneksi)
// Plugin real-time sync lokal: memungkinkan sync instan lintas profil, incognito, dan multi-device
function localSyncPlugin() {
  let clients: any[] = [];
  let sharedState: any = null;

  return {
    name: 'local-realtime-sync',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || '';
        if (url === '/api-sync/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });
          res.write('data: {"type":"connected"}\n\n');
          clients.push(res);
          req.on('close', () => {
            clients = clients.filter((c) => c !== res);
          });
          return;
        }

        if (url === '/api-sync/update' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => (body += chunk));
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const statePayload = data.payload || data;
              sharedState = { ...sharedState, ...statePayload };
              const payloadStr = JSON.stringify({ action: data.action || "DATA_SYNC", payload: statePayload });
              for (const client of clients) {
                try {
                  client.write(`data: ${payloadStr}\n\n`);
                } catch {
                  // Client disconnected
                }
              }
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.writeHead(400);
              res.end();
            }
          });
          return;
        }

        if (url === '/api-sync/state' && req.method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(sharedState || {}));
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  optimizeDeps: {
    entries: ["index.html"],
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  // `vite preview` dipakai melayani build di Railway: harus mendengarkan semua interface dan menerima host publik.
  preview: {
    host: true,
    allowedHosts: true,
  },
  plugins: [
    localSyncPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'Retalio ERP',
        short_name: 'Retalio',
        description:
          'ERP untuk UKM: kasir, inventori, akuntansi, pengadaan, manufaktur, SDM, dan asisten AI dalam satu PWA.',
        lang: 'id',
        theme_color: '#f5f4f0',
        background_color: '#f5f4f0',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Katalog produk & stok: Stale-While-Revalidate
            urlPattern: /^https:\/\/api\.retalio\.io\/v1\/(products|inventory|stock|categories)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'retalio-catalog',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Transaksi POS (write): Network Only + Background Sync queue
            urlPattern: /^https:\/\/api\.retalio\.io\/v1\/sales\/transactions/,
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'retalio-pos-queue',
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            // Laporan keuangan: Network First + fallback cache
            urlPattern: /^https:\/\/api\.retalio\.io\/v1\/(finance|reports)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'retalio-reports',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            // Endpoint AI: Network Only — UI menampilkan pesan "butuh koneksi" saat offline
            urlPattern: /^https:\/\/api\.retalio\.io\/v1\/ai/,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
