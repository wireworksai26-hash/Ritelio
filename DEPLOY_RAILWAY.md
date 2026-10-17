# Deploy Retalio ke Railway

Ada dua cara. **Opsi A (satu service) disarankan**: frontend dan API ada di satu domain, jadi tidak ada
`VITE_API_URL` yang bisa terlupa, tidak ada CORS, dan hanya satu service yang dirawat.

| | Opsi A: satu service | Opsi B: dua service |
|---|---|---|
| Service | 1 (+ Postgres) | 2 (+ Postgres) |
| Domain | 1 | 2 |
| `VITE_API_URL` | tidak dipakai | wajib, saat build |
| `CORS_ORIGIN` | otomatis (domain service itu sendiri) | wajib |
| Cocok untuk | hampir semua kasus | bila frontend ingin di CDN/domain lain |

Gejala "UI tampil tapi data gagal dimuat" berarti frontend tidak punya API di belakangnya. Aplikasi akan
menampilkan: *"Alamat API salah: ... mengembalikan halaman web, bukan data"*.

---

## Opsi A: satu service

`Dockerfile` di root repo membangun frontend dan backend, lalu backend melayani keduanya. Railway memakai
Dockerfile itu otomatis.

### 1. Database
Project Railway: **New** → **Database** → **PostgreSQL**.

### 2. Service aplikasi
Pakai service yang sudah ada (`ritelio-production`), atau buat baru dari repo yang sama.

**Settings**
- **Root Directory**: kosong (root repo).
- **Builder**: *Dockerfile*. Bila service ini dulu memakai Nixpacks, ubah ke Dockerfile.
- **Custom Build Command** dan **Custom Start Command**: kosongkan. Perintah start sudah ada di Dockerfile
  (`npm run start:prod`: migrasi database, lalu server).
- **Healthcheck Path**: `/v1/health`

**Variables**

| Variabel | Nilai |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referensi ke plugin Postgres) |
| `JWT_SECRET` | string acak ≥ 32 karakter |
| `JWT_REFRESH_SECRET` | string acak ≥ 32 karakter, **berbeda** dari `JWT_SECRET` |
| `PORT` | `4000` bila domain Anda sudah dipetakan ke port 4000 (Settings → Networking). Kosongkan bila ingin Railway menentukan sendiri. |
| `NIM_API_KEY` | opsional, hanya untuk asisten AI dan OCR |

Hapus `VITE_API_URL` bila ada: pada opsi A alamat API otomatis sama dengan alamat halaman.
`NODE_ENV=production` sudah diset di image. `CORS_ORIGIN` boleh dikosongkan: di Railway otomatis memakai
domain service itu sendiri (`RAILWAY_PUBLIC_DOMAIN`).

Membuat secret acak (jalankan dua kali, satu per secret):

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Periksa
1. Tunggu deploy `Active`, lalu buka `https://<domain-anda>/v1/health`.
   Harus tampil `{"status":"ok","database":"up"}`.
2. Di **Deploy Logs** harus ada baris seperti
   `[config] NODE_ENV=production | trust proxy=1 | CORS origin=https://... | web=/app/public`.
   `web=tidak dilayani` berarti image dibangun tanpa frontend (cek Builder).
3. Buka `https://<domain-anda>/`: tampil landing page. Daftar lewat `/onboarding`, lalu login.

---

## Opsi B: dua service (frontend dan backend terpisah)

**Backend** (service baru): Root Directory `server`, Build `npm ci && npm run build`, Start
`npm run start:prod`, Healthcheck `/v1/health`, lalu **Generate Domain**.

| Variabel backend | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | dua secret acak ≥ 32 karakter, berbeda |
| `CORS_ORIGIN` | alamat frontend persis, mis. `https://app-anda.up.railway.app` (tanpa `/` di akhir) |

**Frontend** (service lain, root repo, tanpa Dockerfile; hapus Dockerfile dari build atau atur Builder ke
Nixpacks): tambah variabel

| Variabel frontend | Nilai |
|---|---|
| `VITE_API_URL` | alamat backend, mis. `https://api-anda.up.railway.app` |

`VITE_*` dibaca **saat build**. Setelah mengubahnya, **Redeploy** (bukan Restart). Bila builder Dockerfile,
variabel hanya terbaca bila ada `ARG VITE_API_URL` dan `ENV VITE_API_URL=$VITE_API_URL` sebelum
`npm run build`.

---

## Diagnosis: data gagal dimuat

Buka aplikasi, tekan **F12** → tab **Network**, muat ulang, klik permintaan yang merah.

| Yang terlihat | Penyebab | Perbaikan |
|---|---|---|
| Pesan "Alamat API salah ... halaman web" | tidak ada backend di belakang domain ini | Opsi A (Builder Dockerfile), atau Opsi B dengan `VITE_API_URL` |
| Permintaan ke `localhost` | build dev/`VITE_API_URL` salah | build produksi tanpa `VITE_API_URL` (opsi A) atau isi dengan benar (opsi B) |
| `CORS error` | opsi B: `CORS_ORIGIN` tidak sama dengan alamat frontend | samakan persis (`https://`, tanpa `/`), redeploy backend |
| `502` | aplikasi crash saat start | baca Deploy Logs: biasanya variabel wajib belum diisi |
| `503` di `/v1/health` | database tidak terjangkau | periksa `DATABASE_URL` dan status Postgres |
| `429` | kuota request habis | pastikan log menampilkan `trust proxy=1` |
| `500` pesan umum | migrasi belum jalan atau error aplikasi | Start Command harus `npm run start:prod`; baca log |

## Akun pertama

Database Railway kosong, dan **seed sengaja menolak jalan di production** karena ia menghapus data.

- **Akun usaha (disarankan):** buka aplikasi → **Coba Gratis** (`/onboarding`). Ini membuat bisnis baru
  beserta akun owner dengan data Anda sendiri.
- **Data demo + superadmin (hanya untuk database kosong yang boleh dihapus):** jalankan seed sekali dari
  komputer Anda terhadap database Railway:

  ```
  cd server
  DATABASE_URL="<DATABASE_PUBLIC_URL dari plugin Postgres>" \
  NODE_ENV=production ALLOW_DESTRUCTIVE_SEED=yes \
  SEED_ADMIN_PASSWORD="<sandi kuat ≥ 12 karakter>" npm run seed
  ```

  Seed ini **menghapus seluruh data** di database itu. Jangan dijalankan setelah ada data asli.
  Password `admin123` / `ferry123` hanya berlaku di mode pengembangan lokal.

## Checklist (opsi A)

- [ ] Plugin Postgres ada
- [ ] Builder = Dockerfile, tanpa custom build/start command
- [ ] `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` terisi (dan `PORT` sesuai domain)
- [ ] `VITE_API_URL` dihapus
- [ ] `/v1/health` → `status: ok`
- [ ] Log memuat `web=/app/public`
- [ ] Daftar lewat `/onboarding`, lalu login
