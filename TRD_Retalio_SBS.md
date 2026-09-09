# Technical Requirements Document (TRD)
# Retalio — Smart Business System (SBS)

| | |
|---|---|
| **Nama Produk** | Retalio |
| **Codename Sistem** | Smart Business System (SBS) |
| **Versi Dokumen** | 1.0 |
| **Tanggal** | 6 September 2026 |
| **Status** | Draft untuk Review Teknis |
| **Dokumen Terkait** | PRD_Retalio_SBS.md v1.0 |
| **Tipe Platform** | Progressive Web App (PWA), Multi-tenant SaaS |

---

## 1. Tujuan Dokumen

TRD ini menerjemahkan kebutuhan produk di PRD Retalio menjadi spesifikasi teknis yang dapat langsung dieksekusi oleh tim engineering: arsitektur sistem, stack teknologi, desain data, kontrak API, spesifikasi PWA, integrasi AI, keamanan, dan strategi deployment.

---

## 2. Prinsip Arsitektur

1. **Modular by design** — setiap domain bisnis (Inventory, POS, Finance, dst.) adalah *service* yang berdiri sendiri, berkomunikasi lewat API/event, agar modul bisa di-toggle tanpa mempengaruhi modul lain.
2. **Multi-tenant dari awal** — satu deployment melayani banyak bisnis (tenant), dengan isolasi data logis per tenant.
3. **Offline-first di sisi client** — PWA harus tetap fungsional untuk operasi kritis (POS, cek stok) tanpa koneksi internet.
4. **API-first** — semua fungsi backend terekspos lewat API terdokumentasi, agar mudah diperluas (integrasi marketplace, mobile app native di masa depan, dsb).
5. **AI sebagai layer terpisah** — model/inference AI tidak menyatu erat (tightly coupled) dengan business logic inti, agar model bisa diganti/ditingkatkan tanpa mengubah core system.
6. **Low-code extensibility** — struktur data dan UI mendukung custom field/workflow tanpa perlu deploy ulang kode.

---

## 3. Arsitektur Sistem (High-Level)

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (PWA)                          │
│  React/Vue SPA + Service Worker + IndexedDB (offline store)  │
└───────────────────────────┬───────────────────────────────────┘
                             │ HTTPS / REST-GraphQL / WebSocket
┌───────────────────────────▼───────────────────────────────────┐
│                     API GATEWAY / BFF                         │
│   (Auth, Rate Limiting, Routing, Request Aggregation)          │
└───┬─────────┬─────────┬─────────┬─────────┬─────────┬────────┘
    │         │         │         │         │         │
┌───▼───┐ ┌───▼────┐ ┌──▼─────┐ ┌─▼──────┐ ┌▼───────┐ ┌▼────────┐
│ Auth/ │ │Inventory│ │  POS   │ │Finance │ │ Module │ │   AI    │
│ Tenant│ │ Service │ │Service │ │Service │ │Config  │ │ Service │
│Service│ │         │ │        │ │        │ │Service │ │(Gateway)│
└───┬───┘ └───┬────┘ └──┬─────┘ └─┬──────┘ └┬───────┘ └┬────────┘
    │         │         │         │         │           │
    └─────────┴─────────┴────┬────┴─────────┴───────────┘
                              │
                    ┌─────────▼──────────┐
                    │   Event Bus (MQ)   │
                    │ (sinkronisasi antar│
                    │   modul, async job)│
                    └─────────┬──────────┘
                              │
              ┌───────────────┼────────────────┐
        ┌─────▼─────┐   ┌─────▼─────┐   ┌──────▼──────┐
        │ PostgreSQL │   │  Object   │   │   LLM/ML    │
        │ (per-tenant│   │  Storage  │   │   Provider  │
        │  schema)   │   │(nota,file)│   │ (Anthropic  │
        │            │   │           │   │  API, dsb.) │
        └────────────┘   └───────────┘   └─────────────┘
```

### 3.1 Komponen Utama
| Komponen | Fungsi |
|---|---|
| **PWA Client** | UI utama, offline cache, sinkronisasi background |
| **API Gateway / BFF** | Titik masuk tunggal, autentikasi, agregasi request antar service |
| **Auth/Tenant Service** | Login, manajemen tenant, role & permission |
| **Inventory Service** | Stok, gudang, purchase order, AI forecasting hook |
| **POS Service** | Transaksi penjualan, offline queue, sinkronisasi |
| **Finance Service** | Jurnal otomatis, laporan keuangan, anomaly detection hook |
| **Module Config Service** | Menyimpan konfigurasi modul aktif, custom field, template industri per tenant |
| **AI Service (Gateway)** | Abstraksi ke provider AI/LLM, menangani prompt, caching, rate limit biaya |
| **Event Bus** | Mekanisme async antar-modul (mis. transaksi POS → update stok → update jurnal) |

---

## 4. Tech Stack Usulan

| Layer | Teknologi | Alasan |
|---|---|---|
| **Frontend (PWA)** | React 18+ (atau Vue 3) + Vite, TypeScript | Ekosistem matang, dukungan PWA plugin (vite-plugin-pwa) |
| **State & Offline Storage** | IndexedDB (via Dexie.js/idb) + Zustand/Redux | Penyimpanan lokal terstruktur untuk offline mode |
| **Service Worker** | Workbox | Standar industri untuk caching strategi & background sync |
| **Styling/UI Kit** | Tailwind CSS + komponen custom | Konsisten, ringan, mudah di-theming per tenant |
| **Backend Services** | Node.js (NestJS) atau Go, arsitektur modular monolith → microservices siap pisah | NestJS cocok untuk struktur modular yang rapi di tahap awal |
| **API** | REST (utama) + GraphQL opsional untuk dashboard/reporting kompleks | REST lebih sederhana untuk sinkronisasi offline; GraphQL efisien untuk query laporan fleksibel |
| **Database Utama** | PostgreSQL (multi-tenant: schema-per-tenant atau row-level security) | Transaksi ACID untuk data keuangan & inventori |
| **Data Fleksibel/Custom Field** | JSONB column di PostgreSQL, atau koleksi terpisah di MongoDB untuk metadata modul kustom | Mendukung low-code custom field tanpa migrasi skema berulang |
| **Cache** | Redis | Session, rate limiting, cache hasil AI, antrian sinkronisasi |
| **Message Queue/Event Bus** | RabbitMQ atau Kafka (skala besar) | Komunikasi async antar service, event sourcing untuk audit |
| **Object Storage** | S3-compatible (AWS S3/MinIO) | Simpan file nota, invoice, foto produk |
| **AI/LLM Layer** | Anthropic Claude API (model sesuai kebutuhan tugas) + orkestrasi custom | Chat assistant, OCR (vision), NLQ, ringkasan otomatis |
| **Forecasting/Anomaly Model** | Model statistik (Prophet/ARIMA) untuk forecasting, atau layanan ML terkelola | Prediksi stok & cashflow tidak selalu perlu LLM besar — lebih murah pakai model time-series khusus |
| **Auth** | OAuth2 / JWT, opsi SSO (Google) | Standar, mudah diintegrasikan ke PWA |
| **Deployment** | Docker + Kubernetes (atau managed container service) | Skalabilitas horizontal per service |
| **CI/CD** | GitHub Actions | Otomasi build, test, deploy |
| **Monitoring & Logging** | Prometheus + Grafana, Sentry (error tracking) | Observability lintas microservice |

> **Catatan:** Kombinasi model AI sebaiknya *tiered* — gunakan model ringan/murah untuk tugas rutin (kategorisasi, ekstraksi OCR sederhana) dan model lebih besar untuk tugas kompleks (business assistant, NLQ). Ini menjaga biaya operasional tetap sesuai profil SMB.

---

## 5. Model Data (Skema Inti — Ringkas)

### 5.1 Multi-Tenancy
- Strategi: **Shared database, separate schema per tenant** (baik untuk isolasi + biaya efisien di skala SMB).
- Tabel global: `tenants`, `subscriptions`, `modules_catalog`.

### 5.2 Entitas Inti (per-tenant schema)

```
tenants
 ├─ id, name, industry_template, subscription_plan, created_at

users
 ├─ id, tenant_id, name, email, role, permissions[]

modules_config
 ├─ id, tenant_id, module_key, is_active, custom_fields (JSONB), workflow_config (JSONB)

products
 ├─ id, tenant_id, sku, name, category, unit, custom_fields (JSONB)

inventory_stock
 ├─ id, product_id, warehouse_id, quantity, min_threshold, last_updated

warehouses
 ├─ id, tenant_id, name, location

purchase_orders
 ├─ id, tenant_id, supplier_id, status, items[], created_at

sales_transactions
 ├─ id, tenant_id, outlet_id, cashier_id, items[], total, payment_method,
 │   sync_status (synced/pending), created_at (client_timestamp), server_timestamp

customers
 ├─ id, tenant_id, name, contact, loyalty_points, purchase_history_ref

financial_entries (jurnal otomatis)
 ├─ id, tenant_id, source_module, source_ref_id, debit_account, credit_account,
 │   amount, entry_date, is_anomaly_flagged (bool)

ai_insights_log
 ├─ id, tenant_id, module, insight_type, content, generated_at, feedback_score

audit_logs
 ├─ id, tenant_id, user_id, action, entity, before/after (JSONB), timestamp
```

### 5.3 Pertimbangan Kunci
- `sales_transactions` wajib punya `client_timestamp` **dan** `server_timestamp` + `sync_status` untuk mendukung mode offline POS.
- `custom_fields` berbentuk JSONB agar tenant bisa menambah field tanpa migrasi database per tenant.
- `ai_insights_log` menyimpan histori rekomendasi AI + feedback pengguna (untuk evaluasi & fine-tuning prompt ke depan).

---

## 6. Spesifikasi PWA (Detail Teknis)

### 6.1 Web App Manifest (`manifest.json`)
Wajib memuat:
- `name`, `short_name`, `icons` (min. 192x192 & 512x512, termasuk *maskable icon*)
- `start_url`, `display: "standalone"`, `theme_color`, `background_color`
- `orientation` menyesuaikan use-case (POS bisa dikunci portrait di mobile)

### 6.2 Service Worker — Strategi Caching (Workbox)
| Jenis Aset/Data | Strategi | Alasan |
|---|---|---|
| App shell (JS/CSS statis) | Cache First | Load cepat, jarang berubah |
| Data produk & stok | Stale-While-Revalidate | Tampilkan cache dulu, update di background |
| Transaksi POS (write) | Background Sync (queue) | Simpan lokal saat offline, kirim otomatis saat online |
| Laporan keuangan/dashboard | Network First (fallback cache) | Data harus akurat, tapi tetap ada fallback saat offline |
| AI Insight/Chat | Network Only (dengan pesan "butuh koneksi") | AI insight real-time tidak realistis untuk di-cache |

### 6.3 Background Sync & Konflik Data
- Transaksi POS offline disimpan di IndexedDB dengan status `pending`.
- Saat online kembali, `Background Sync API` memicu proses pengiriman batch ke server.
- Resolusi konflik: **server sebagai source of truth untuk stok**; jika terjadi race condition (dua device mengurangi stok yang sama saat offline), sistem menandai transaksi sebagai `needs_review` dan memunculkan notifikasi ke admin — bukan auto-reject, agar tidak kehilangan data penjualan.

### 6.4 Push Notification
- Menggunakan **Web Push API** + service terkelola (Firebase Cloud Messaging bisa dipakai lintas platform termasuk web).
- Jenis notifikasi: low-stock alert, ringkasan insight AI harian, approval request (mis. diskon besar butuh approval manager).

### 6.5 Batasan & Fallback iOS Safari
- iOS Safari punya dukungan terbatas untuk Background Sync & Push Notification (tergantung versi iOS/Safari).
- **Fallback:** untuk iOS, gunakan polling ringan saat app dibuka + in-app notification badge, jangan bergantung penuh pada push OS-level.
- Wajib dilakukan pengujian manual di iOS Safari sebagai bagian dari Definition of Done setiap fitur offline/notifikasi.

### 6.6 Target Performa
- Lighthouse PWA score ≥ 90.
- First Contentful Paint < 1.8s pada koneksi 4G.
- Time to Interactive < 3s.
- Ukuran initial bundle (gzip) < 300KB untuk app shell.

---

## 7. Spesifikasi Integrasi AI ("Retalio Intelligence")

### 7.1 Arsitektur AI Service (Gateway Pattern)
Semua modul memanggil **satu AI Service internal**, bukan langsung ke provider eksternal. AI Service bertanggung jawab untuk:
1. Memilih model yang tepat per jenis tugas (routing).
2. Membentuk prompt terstandarisasi + menyisipkan konteks tenant (data terbatas & relevan saja).
3. Caching hasil untuk mengurangi biaya panggilan berulang.
4. Mencatat log insight & feedback (`ai_insights_log`) untuk evaluasi kualitas.
5. Menyaring/redaksi data sensitif sebelum dikirim ke provider eksternal (mis. mask nomor kartu, data pribadi pelanggan).

### 7.2 Pemetaan Fitur AI ke Implementasi Teknis
| Fitur AI | Pendekatan Teknis |
|---|---|
| AI Business Assistant (Chat) | LLM (Claude API) dengan *retrieval* data ringkasan tenant (bukan raw dump) sebagai konteks; guardrail agar tidak halusinasi angka — jawaban numerik harus diambil dari query database aktual, LLM hanya membungkus dalam bahasa natural |
| Smart Low-Stock Prediction | Model time-series (mis. moving average weighted / Prophet) dijalankan berkala (batch job harian), bukan real-time LLM call |
| Sales Forecasting | Model statistik time-series per SKU/kategori, retrain berkala |
| Anomaly & Fraud Detection | Rule-based checks (threshold, pola) dikombinasikan dengan model deteksi outlier sederhana (mis. Isolation Forest) — dijalankan sebagai async job setelah transaksi masuk |
| Automated Insight Digest | Job terjadwal (cron) yang mengambil hasil forecasting/anomaly + agregasi metrik, lalu diringkas jadi bahasa natural via LLM |
| Smart Receipt/Invoice OCR | Vision-capable LLM API atau OCR engine khusus (mis. Tesseract untuk kasus sederhana, fallback ke LLM vision untuk kasus kompleks/handwriting) |
| Natural Language Query (NLQ) | LLM menerjemahkan pertanyaan pengguna → query terstruktur (mis. ke query builder internal) → hasil query dikembalikan sebagai data, LLM hanya memformat presentasi jawaban |
| Workflow Automation Suggestion | Analisis pola log aktivitas pengguna (audit_logs) secara periodik, threshold-based trigger untuk menyarankan otomasi |

### 7.3 Prinsip "Explainable & Non-blocking"
- Setiap insight AI menyimpan referensi data sumber (mis. `based_on: [transaction_ids]`) agar pengguna bisa lihat dasar rekomendasi.
- UI wajib menampilkan insight AI sebagai **saran** (dengan tombol "Terapkan" / "Abaikan"), tidak pernah mengeksekusi aksi bisnis otomatis tanpa konfirmasi pengguna (kecuali notifikasi pasif seperti alert).

### 7.4 Manajemen Biaya AI
- Rate limiting per tenant sesuai tier langganan (jumlah query AI Assistant/bulan).
- Caching agresif untuk insight yang tidak time-sensitive (mis. ringkasan mingguan di-cache, tidak dihitung ulang setiap dibuka).
- Model routing: gunakan model lebih kecil/cepat untuk tugas klasifikasi/ekstraksi sederhana, model lebih besar hanya untuk percakapan/analitik kompleks.

---

## 8. API Design (Contoh Kontrak — Ringkas)

### 8.1 Konvensi Umum
- Base URL: `https://api.retalio.io/v1/`
- Autentikasi: `Authorization: Bearer <JWT>`
- Header wajib: `X-Tenant-ID` (atau di-embed dalam JWT claim)
- Format: JSON, versioning via path (`/v1/`)

### 8.2 Contoh Endpoint

```
POST   /v1/auth/login
POST   /v1/auth/refresh

GET    /v1/modules                     # daftar modul & status aktif
PATCH  /v1/modules/{module_key}        # toggle on/off modul

GET    /v1/inventory/products
POST   /v1/inventory/products
GET    /v1/inventory/stock?warehouse_id=
POST   /v1/inventory/stock/adjust

POST   /v1/pos/transactions            # single & batch (untuk sync offline)
GET    /v1/pos/transactions/pending    # cek antrian sync

GET    /v1/finance/reports/profit-loss?range=
GET    /v1/finance/reports/cashflow-forecast

POST   /v1/ai/assistant/chat
POST   /v1/ai/ocr/receipt
GET    /v1/ai/insights?module=inventory&period=weekly
POST   /v1/ai/nlq                      # natural language query
```

### 8.3 Contoh Payload — Sinkronisasi Transaksi Offline

```json
POST /v1/pos/transactions/batch
{
  "transactions": [
    {
      "client_id": "uuid-generated-offline",
      "outlet_id": "outlet_001",
      "items": [
        { "product_id": "prod_123", "qty": 2, "price": 15000 }
      ],
      "payment_method": "cash",
      "total": 30000,
      "client_timestamp": "2026-09-06T10:15:00+07:00"
    }
  ]
}
```

Respons server mengembalikan mapping `client_id` → `server_id` + status (`confirmed` / `conflict` / `rejected`) agar client bisa update status lokal di IndexedDB.

---

## 9. Keamanan (Security Requirements)

| Area | Requirement |
|---|---|
| **Transport** | HTTPS wajib (TLS 1.2+) di semua endpoint — syarat mutlak PWA |
| **Autentikasi** | JWT dengan access token (short-lived) + refresh token; opsi 2FA untuk role admin/owner |
| **Otorisasi** | Role-Based Access Control (RBAC) granular per modul & aksi (create/read/update/delete) |
| **Enkripsi Data** | At-rest: AES-256 untuk data sensitif (kredensial, data pelanggan); In-transit: TLS |
| **Isolasi Tenant** | Validasi `tenant_id` di setiap query — hindari data leakage antar tenant (defense in depth: middleware wajib cek tenant scope) |
| **Audit Trail** | Semua perubahan data kritis (transaksi, konfigurasi modul, perubahan role) tercatat di `audit_logs` |
| **Data AI** | Redaksi/anonimisasi data pribadi sebelum dikirim ke provider AI eksternal; retensi log AI sesuai kebijakan privasi |
| **Rate Limiting** | Di API Gateway, per tenant & per endpoint (khususnya endpoint AI yang berbiaya) |
| **Backup & DR** | Backup database harian + Point-in-Time Recovery; RPO ≤ 24 jam, RTO ≤ 4 jam untuk Fase 1 |
| **Kepatuhan** | Kesesuaian struktur data untuk kebutuhan e-Faktur/pajak Indonesia; kebijakan privasi data pelanggan sesuai UU PDP |

---

## 10. Skalabilitas & Deployment

### 10.1 Strategi Deployment
- **Fase 1 (MVP):** Modular monolith di dalam container tunggal per service group (mempercepat development, tetap terpisah secara logis agar mudah dipecah nanti).
- **Fase 2+:** Pisahkan service dengan beban tinggi (Inventory, POS) menjadi microservice independen, di-deploy di Kubernetes dengan autoscaling horizontal.

### 10.2 Environment
| Environment | Tujuan |
|---|---|
| `dev` | Development harian |
| `staging` | UAT & testing performa sebelum rilis |
| `production` | Live untuk pelanggan, dengan blue-green deployment untuk zero-downtime release |

### 10.3 Observability
- **Metrics:** Prometheus + Grafana (latency, error rate, throughput per service).
- **Logging terpusat:** ELK Stack atau Loki.
- **Error tracking:** Sentry (frontend PWA & backend).
- **Alerting:** PagerDuty/Slack webhook untuk insiden kritis (mis. service down, sync backlog menumpuk).

---

## 11. Strategi Testing

| Jenis Test | Cakupan |
|---|---|
| **Unit Test** | Logic bisnis per service (target coverage ≥ 80% untuk core module) |
| **Integration Test** | Alur lintas modul (mis. transaksi POS → update stok → jurnal keuangan) |
| **E2E Test** | Skenario pengguna penuh di PWA (Cypress/Playwright), termasuk simulasi offline/online |
| **PWA-specific Test** | Lighthouse CI di setiap pipeline, uji manual install & offline mode di Android/iOS/Desktop |
| **Load Test** | Simulasi beban POS saat jam sibuk (k6/JMeter) |
| **AI Output Validation** | Uji sampling insight AI vs data aktual untuk cek akurasi & halusinasi; human review berkala |
| **Security Test** | Penetration testing sebelum GA release, dependency scanning otomatis (Dependabot/Snyk) |

---

## 12. Ketergantungan Eksternal (Third-Party)

| Dependensi | Kebutuhan |
|---|---|
| Provider AI/LLM (Claude API) | Untuk chat assistant, OCR, NLQ, insight digest |
| Payment Gateway | Untuk metode pembayaran non-tunai di POS (Fase 1: minimal 1-2 provider lokal) |
| Push Notification Service | Firebase Cloud Messaging atau setara |
| Object Storage | S3-compatible provider |
| SMS/Email Provider | Untuk notifikasi & OTP |

---

## 13. Risiko Teknis & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Konflik data saat sinkronisasi offline-to-online | Desain `sync_status` + flag `needs_review`, bukan auto-overwrite |
| Biaya AI membengkak seiring pertumbuhan tenant | Model routing tiered + caching + rate limit per plan |
| Kompleksitas menjaga isolasi tenant di shared database | Middleware wajib + automated test khusus untuk cross-tenant leakage |
| Keterbatasan fitur PWA di iOS Safari | Fallback UX + testing manual rutin per rilis iOS baru |
| Skema fleksibel (JSONB) menyulitkan query kompleks/reporting | Sediakan lapisan indexing (GIN index di PostgreSQL) & materialized view untuk laporan berat |

---

## 14. Definition of Done (Level Fitur)

Sebuah fitur dianggap selesai jika:
1. Lolos unit & integration test dengan coverage sesuai target.
2. Lolos uji manual offline/online di minimal 2 platform (Android Chrome + Desktop Chrome), plus catatan known-issue untuk iOS Safari bila ada.
3. Lolos Lighthouse PWA audit tanpa regresi skor.
4. Terdokumentasi di API docs (OpenAPI/Swagger).
5. Untuk fitur AI: insight tervalidasi minimal terhadap 1 batch data nyata/simulasi sebelum rilis ke production.
6. Tidak ada temuan kritikal dari security scan otomatis.

---

## 15. Lampiran

- Skema database lengkap (ERD) — *dokumen terpisah*.
- OpenAPI/Swagger spec lengkap — *dokumen terpisah, auto-generated dari backend*.
- Diagram sequence untuk alur sinkronisasi offline POS — *dapat ditambahkan sesuai kebutuhan tim*.

---

*Dokumen ini adalah TRD v1.0 untuk Retalio (Smart Business System), diturunkan dari PRD_Retalio_SBS.md v1.0. Akan direvisi seiring keputusan arsitektur final dan hasil technical spike.*
