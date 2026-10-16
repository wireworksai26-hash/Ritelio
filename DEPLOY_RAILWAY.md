# Deploy Retalio ke Railway

Retalio terdiri dari **tiga komponen**, dan masing-masing harus ada di Railway:

| Komponen | Isi | Service Railway |
|---|---|---|
| Frontend (PWA) | React + Vite, folder root repo | service yang sudah ada (`ritelio-production.up.railway.app`) |
| Backend (API) | NestJS + Prisma, folder `server/` | **service baru** |
| Database | PostgreSQL | **plugin Postgres baru** |

Gejala "UI tampil tapi data gagal dimuat" hampir selalu berarti backend belum ada atau frontend belum
menunjuk ke backend. Domain frontend dan domain backend **berbeda**.

## 1. Database

Project Railway: **New** → **Database** → **PostgreSQL**.

## 2. Backend (service baru)

**New** → **GitHub Repo** (repo yang sama) → buka service → **Settings**:

- **Root Directory**: `server`
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm run start:prod` (menjalankan `prisma migrate deploy`, lalu server)
- **Healthcheck Path**: `/v1/health`
- **Networking** → **Generate Domain**. Catat alamatnya, mis. `https://retalio-api-production.up.railway.app`.
  Jangan set variabel `PORT` sendiri: Railway mengisinya dan domain mengikutinya.

**Variables** (tab Variables):

| Variabel | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referensi ke plugin Postgres) |
| `JWT_SECRET` | string acak ≥ 32 karakter |
| `JWT_REFRESH_SECRET` | string acak ≥ 32 karakter, **berbeda** dari `JWT_SECRET` |
| `CORS_ORIGIN` | alamat frontend persis, `https://ritelio-production.up.railway.app` (tanpa `/` di akhir, tanpa path) |
| `NIM_API_KEY` | opsional, hanya untuk fitur AI/OCR |

Membuat secret acak:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Jalankan dua kali (satu untuk tiap secret). `TRUST_PROXY` tidak perlu diisi: di Railway otomatis `1`.
Tanpa itu semua pengunjung terlihat sebagai satu IP dan berbagi satu kuota request.

## 3. Frontend (service yang sudah ada)

**Variables** → tambahkan:

| Variabel | Nilai |
|---|---|
| `VITE_API_URL` | alamat backend dari langkah 2, mis. `https://retalio-api-production.up.railway.app` |

`VITE_*` dibaca **saat build**, bukan saat jalan. Setelah menambah atau mengubahnya, pastikan service
**di-redeploy** (bukan sekadar restart) supaya ikut ter-build ulang. Tanpa variabel ini, build produksi
akan menampilkan pesan "Alamat server belum diatur" (dulu: diam-diam memanggil `localhost` milik pengunjung).

## 4. Periksa dari browser

1. Buka `https://<alamat-backend>/v1/health`. Harus tampil `{"status":"ok","database":"up"}`.
   - `database: down` / 503: `DATABASE_URL` salah atau Postgres belum siap.
   - Halaman web / 404 / 502: backend belum jalan; lihat **Deploy Logs** service backend.
2. Di log backend harus ada baris `[config] NODE_ENV=production | trust proxy=1 | CORS origin=https://ritelio-production...`.
   Bila `CORS origin` tidak sama persis dengan alamat frontend, perbaiki `CORS_ORIGIN`.
3. Buka frontend. Jika data gagal dimuat, tekan F12 → tab **Network**, klik permintaan yang merah:

| Yang terlihat | Penyebab | Perbaikan |
|---|---|---|
| Alamat yang dituju `localhost` atau domain frontend sendiri | `VITE_API_URL` salah / belum ada saat build | isi `VITE_API_URL`, redeploy frontend |
| `CORS error` / `blocked by CORS policy` | `CORS_ORIGIN` tidak sama dengan alamat frontend | samakan persis (skema `https://`, tanpa `/`), redeploy backend |
| Status `502` | backend tidak jalan / crash saat boot | baca Deploy Logs backend |
| Status `429` | kuota request habis | pastikan log menampilkan `trust proxy=1` |
| Status `500` + pesan umum | tabel belum ada (migrasi belum jalan) atau error aplikasi | pastikan Start Command `npm run start:prod`; baca log |
| Status `401` setelah login | token kedaluwarsa | login ulang |

## 5. Akun pertama

Database Railway kosong, dan **seed sengaja menolak jalan di production** karena ia menghapus data.

- **Akun usaha (disarankan):** buka frontend → **Coba Gratis / Daftar** (`/onboarding`). Ini membuat
  bisnis baru beserta akun owner dengan data Anda sendiri.
- **Data demo + superadmin (hanya untuk database kosong yang boleh dihapus):** jalankan seed sekali dari
  komputer Anda terhadap database Railway:

  ```
  cd server
  DATABASE_URL="<DATABASE_PUBLIC_URL dari plugin Postgres>" \
  NODE_ENV=production ALLOW_DESTRUCTIVE_SEED=yes \
  SEED_ADMIN_PASSWORD="<sandi kuat ≥ 12 karakter>" npm run seed
  ```

  Seed ini **menghapus seluruh data** di database itu. Jangan dijalankan setelah ada data asli.
  Password `admin123` / `ferry123` hanya berlaku di mode pengembangan lokal, tidak di production.

## Checklist ringkas

- [ ] Plugin Postgres ada
- [ ] Service backend: Root `server`, Start `npm run start:prod`, domain dibuat
- [ ] Backend: `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`
- [ ] `https://<backend>/v1/health` → `status: ok`
- [ ] Frontend: `VITE_API_URL` = alamat backend, lalu redeploy
- [ ] Daftar akun lewat `/onboarding`, lalu login
