# Product Requirements Document (PRD)
# Retalio — Smart Business System (SBS)

| | |
|---|---|
| **Nama Produk** | Retalio |
| **Codename Sistem** | Smart Business System (SBS) |
| **Versi Dokumen** | 1.0 |
| **Tanggal** | 6 September 2026 |
| **Status** | Draft untuk Review |
| **Tipe Platform** | Progressive Web App (PWA) |
| **Pemilik Produk** | Product Team Retalio |

---

## 1. Ringkasan Eksekutif

**Retalio** adalah platform manajemen bisnis (Smart Business System / SBS) yang intuitif, modular, dan mudah diadaptasi, dirancang untuk mempercepat transformasi digital bagi Usaha Kecil dan Menengah (UKM/SMB).

ERP enterprise yang ada saat ini seringkali terlalu mahal, kompleks, dan kaku untuk bisnis yang sedang bertumbuh. Retalio menjawab masalah ini dengan menyediakan framework yang sangat dapat disesuaikan (customizable), berfungsi sebagai tulang punggung digital perusahaan — dilengkapi dengan **kecerdasan buatan (AI)** yang membantu pemilik bisnis mengambil keputusan lebih cepat dan lebih akurat, tanpa perlu tim data scientist.

Retalio dibangun sebagai **Progressive Web App (PWA)** agar dapat diakses lintas perangkat (desktop, tablet, mobile) tanpa instalasi rumit, tetap ringan, dapat digunakan offline sebagian, dan mudah di-*install* langsung dari browser layaknya aplikasi native.

---

## 2. Latar Belakang & Masalah (Problem Statement)

| Masalah pada ERP Konvensional | Dampak ke SMB |
|---|---|
| Biaya lisensi & implementasi mahal | SMB tidak mampu adopsi teknologi digital |
| Sistem kaku, sulit disesuaikan dengan alur kerja unik bisnis | Bisnis harus mengubah proses kerja mereka agar cocok dengan software |
| Kompleksitas tinggi, butuh training lama | Karyawan non-teknis kesulitan mengoperasikan |
| Data tersebar di banyak spreadsheet / tools terpisah | Keputusan bisnis lambat & rawan human error |
| Minim insight otomatis (semua analisis manual) | Pemilik bisnis tidak bisa antisipasi masalah (stok habis, cashflow seret, dll) |

**Kesimpulan:** SMB membutuhkan sistem yang **terjangkau, fleksibel, mudah dipakai, dan cerdas** — bukan replika ERP korporasi yang disederhanakan setengah-setengah.

---

## 3. Visi & Tujuan Produk

### 3.1 Visi
Menjadi *digital backbone* pilihan utama bagi SMB di Indonesia (dan berkembang ke Asia Tenggara), memberikan kapabilitas operasional setara korporasi besar dengan kemudahan pakai level konsumen.

### 3.2 Tujuan Bisnis (Goals)
1. Menyediakan platform manajemen bisnis modular yang dapat digunakan lintas industri (Retail, Manufaktur, Jasa) tanpa kustomisasi kode yang berat (low-code).
2. Menggantikan ketergantungan SMB pada spreadsheet manual dengan sistem yang terpusat, real-time, dan otomatis.
3. Menyematkan kecerdasan buatan (AI) di setiap modul inti untuk memberikan insight proaktif, bukan sekadar pencatatan data pasif.
4. Meluncurkan sebagai PWA agar mudah diakses, ringan, murah dari sisi infrastruktur, dan tetap fungsional meski koneksi internet tidak stabil.

### 3.3 Tujuan Produk (Objectives — Terukur)
- Waktu onboarding pengguna baru (non-teknis) < 30 menit hingga bisa transaksi pertama di POS.
- Modul dapat diaktifkan/dinonaktifkan (toggle) tanpa downtime atau bantuan developer.
- AI Assistant mampu menjawab minimal 80% pertanyaan operasional umum tanpa eskalasi ke manusia.
- PWA dapat di-install dan digunakan minimal untuk fungsi kritis (lihat stok, catat transaksi) dalam kondisi offline.

---

## 4. Target Pengguna & Persona

| Persona | Deskripsi | Kebutuhan Utama |
|---|---|---|
| **Pemilik UKM (Owner)** | Menjalankan 1–5 outlet/toko, non-teknis, fokus pada pertumbuhan | Laporan keuangan real-time, insight cepat, tidak mau ribet setup |
| **Kasir / Staf Operasional** | Menggunakan sistem POS harian | UI simpel, cepat, minim training |
| **Manajer Inventori/Produksi** | Mengelola stok, purchase order, produksi | Notifikasi stok menipis, prediksi kebutuhan restock |
| **Admin/Finance Staff** | Menyusun laporan, rekonsiliasi | Otomasi laporan, deteksi anomali transaksi |
| **Manajemen Multi-cabang** | Memantau performa lintas cabang | Dashboard konsolidasi, perbandingan performa cabang |

### 4.1 Segmen Industri Awal
- **Retail** (toko fisik & sedikit online)
- **Manufaktur skala kecil** (produksi dengan bahan baku & BOM sederhana)
- **Jasa** (servis, klinik kecil, salon, bengkel, dsb.)

---

## 5. Lingkup Produk (Scope)

### 5.1 In-Scope (Fase 1 — MVP)
- Modular Framework (toggle & template modul)
- Smart Inventory Control + AI low-stock prediction
- Sales & POS (offline-capable)
- Real-Time Financial Reporting
- AI Business Assistant (chat-based insight & Q&A)
- PWA (installable, offline-first untuk fungsi kritis, push notification)
- Manajemen multi-user & role-based access

### 5.2 Out-of-Scope (Fase 1)
- Integrasi marketplace pihak ketiga (Shopee, Tokopedia) — direncanakan Fase 2
- Payroll & HRIS penuh — direncanakan Fase 2/3
- Modul Manufaktur lanjutan (MRP kompleks, multi-level BOM) — Fase 3
- Aplikasi native iOS/Android terpisah (cukup PWA di Fase 1)

---

## 6. Arsitektur & Prinsip Desain Produk

### 6.1 Modular Customization
- Sistem berbasis **modul plug-and-play**: Inventory, POS, Finance, HR, CRM, Purchasing, dll.
- Setiap modul dapat: **Toggle ON/OFF**, dipilih dari **Template Industri** (Retail/Manufaktur/Jasa), atau **dikustomisasi** (field custom, alur kerja custom) melalui pendekatan **low-code** (form builder, workflow builder visual).
- Struktur data menggunakan pendekatan *schema-flexible* agar field kustom per bisnis tidak memerlukan migrasi database manual.

### 6.2 Unified Operations (Single Source of Truth)
- Semua modul terhubung ke satu basis data terpusat — transaksi POS otomatis memperbarui stok inventori dan langsung tercermin di laporan keuangan tanpa entri ganda.

### 6.3 SMB-Centric Design
- UI/UX sederhana, task-oriented (bukan menu-heavy seperti ERP lama).
- Automasi menggantikan proses manual: rekonsiliasi otomatis, jurnal otomatis dari transaksi, alert otomatis.

---

## 7. Fitur Inti (Core Modules)

### 7.1 Modular Customization Framework
| Fitur | Deskripsi |
|---|---|
| Module Marketplace/Toggle | Owner dapat mengaktifkan modul sesuai kebutuhan dari dashboard admin |
| Template Industri | Preset konfigurasi awal (field, alur kerja, laporan) untuk Retail/Manufaktur/Jasa |
| Custom Field & Form Builder | Low-code builder untuk menambah field/alur tanpa coding |
| Role & Permission Management | Kontrol akses granular per modul dan per pengguna |

### 7.2 Smart Inventory Control
| Fitur | Deskripsi |
|---|---|
| Real-time Stock Tracking | Update stok otomatis dari setiap transaksi (jual/beli/produksi) |
| Low-Stock Alert | Notifikasi push/email saat stok mendekati batas minimum |
| **AI Demand Forecasting** | Prediksi kebutuhan restock berdasarkan tren penjualan historis & musiman |
| Multi-lokasi/Gudang | Kelola stok di banyak cabang/gudang dalam satu tampilan |
| Barcode/QR Scanning | Scan via kamera device (mobile-friendly, sesuai PWA) |

### 7.3 Streamlined Sales & POS
| Fitur | Deskripsi |
|---|---|
| POS Interface | Transaksi cepat, dukungan multi-metode pembayaran |
| Offline Mode | Transaksi tetap bisa dicatat saat internet terputus, sinkron otomatis saat online (fitur andalan PWA) |
| Diskon & Promo Engine | Aturan diskon fleksibel (persentase, bundling, member) |
| Manajemen Pelanggan Ringan (Mini-CRM) | Riwayat pembelian, program loyalitas dasar |
| **AI Smart Pricing/Bundling Suggestion** | Rekomendasi bundling produk atau penyesuaian harga berbasis pola pembelian |

### 7.4 Real-Time Financial Reporting
| Fitur | Deskripsi |
|---|---|
| Dashboard Keuangan Real-time | Laba rugi, arus kas, neraca sederhana yang update otomatis |
| Otomasi Jurnal | Transaksi operasional otomatis tercatat sebagai entri akuntansi |
| **AI Anomaly Detection** | Deteksi transaksi janggal (potensi kecurangan/human error) |
| **AI Cashflow Forecasting** | Proyeksi arus kas 30/60/90 hari ke depan |
| Export & Compliance Report | Ekspor laporan pajak/akuntansi standar (PDF/Excel) |

---

## 8. Fitur AI — "Retalio Intelligence" (Diferensiasi Utama)

AI bukan fitur tambahan, melainkan **lapisan cerdas yang terintegrasi di seluruh sistem SBS**.

| Fitur AI | Modul Terkait | Deskripsi |
|---|---|---|
| **AI Business Assistant (Chat)** | Semua modul | Asisten percakapan (in-app chatbot) yang bisa dipakai bertanya, mis. "Produk apa yang paling laku minggu ini?" atau "Kapan saya harus restock Produk A?" |
| **Smart Low-Stock Prediction** | Inventory | Prediksi kapan stok akan habis berdasarkan kecepatan penjualan, bukan hanya ambang batas statis |
| **Sales Forecasting** | Sales/POS | Prediksi tren penjualan mingguan/bulanan untuk bantu perencanaan stok & staf |
| **Anomaly & Fraud Detection** | Finance | Menandai transaksi/pola yang tidak wajar (misal diskon berlebihan berulang oleh kasir tertentu) |
| **Automated Insight Digest** | Dashboard Utama | Ringkasan otomatis harian/mingguan berbentuk bahasa natural (bukan hanya grafik), mis. "Penjualan naik 12% minggu ini, didorong oleh produk X" |
| **Smart Receipt/Invoice OCR** | Purchasing/Finance | Scan foto nota/faktur, AI otomatis ekstrak data ke sistem (mengurangi input manual) |
| **Natural Language Query** | Reporting | Pengguna bisa ketik pertanyaan bebas ("total omzet Juli cabang Bandung?") dan sistem menghasilkan laporan/grafik otomatis |
| **Workflow Automation Suggestion** | Modular Framework | AI menyarankan otomasi berdasarkan pola kerja berulang yang terdeteksi |

> **Prinsip Desain AI:** Semua fitur AI harus *explainable* (menunjukkan dasar rekomendasi) dan *non-blocking* — AI memberi saran, keputusan akhir tetap di tangan pengguna.

---

## 9. Persyaratan Teknis — Progressive Web App (PWA)

### 9.1 Kenapa PWA
- Tidak perlu proses instalasi via App Store/Play Store yang lama & birokratis.
- Satu codebase untuk desktop & mobile, mengurangi biaya development jangka panjang.
- Ukuran ringan, cocok untuk device SMB yang bervariasi spesifikasinya (termasuk device lawas).

### 9.2 Kebutuhan Teknis Utama
| Kebutuhan | Detail |
|---|---|
| **Installable** | Menggunakan Web App Manifest, dapat di-"Add to Home Screen" di Android/iOS/Desktop |
| **Offline-First** | Service Worker untuk caching aset & data kritis (produk, stok, transaksi terakhir); antrian sinkronisasi (background sync) saat kembali online |
| **Push Notification** | Untuk alert stok menipis, insight AI harian, approval transaksi |
| **Responsive Design** | Adaptif untuk layar POS tablet, HP kasir, dan dashboard desktop owner |
| **Performance** | Skor Lighthouse PWA minimal 90; waktu load awal < 3 detik pada koneksi 4G |
| **Keamanan** | HTTPS wajib (syarat PWA), autentikasi berbasis token (JWT/OAuth2), enkripsi data sensitif |
| **Cross-browser Support** | Chrome, Edge, Safari (iOS Safari punya keterbatasan PWA — perlu fallback testing) |
| **Sinkronisasi Data** | Konflik data saat offline-online sync ditangani dengan strategi *last-write-wins* + log audit, dengan opsi override manual jika diperlukan |

### 9.3 Arsitektur Teknis (High-Level)
- **Frontend:** PWA berbasis framework modern (React/Vue) + Service Worker + IndexedDB untuk penyimpanan lokal offline.
- **Backend:** REST/GraphQL API modular per domain modul (inventory-service, pos-service, finance-service).
- **AI Layer:** Terpisah sebagai layanan (AI/ML microservice atau integrasi LLM API) yang dipanggil oleh masing-masing modul untuk insight/prediksi, dengan caching hasil agar hemat biaya komputasi.
- **Database:** Kombinasi relational (transaksi keuangan/inventori yang butuh konsistensi tinggi) + fleksibel/NoSQL untuk custom field per tenant.
- **Multi-tenant:** Arsitektur SaaS multi-tenant agar biaya infrastruktur efisien untuk skala SMB.

---

## 10. Kebutuhan Non-Fungsional

| Kategori | Persyaratan |
|---|---|
| **Skalabilitas** | Mendukung pertumbuhan dari 1 outlet ke puluhan outlet tanpa migrasi arsitektur |
| **Keamanan Data** | Enkripsi at-rest & in-transit, role-based access control, audit log |
| **Ketersediaan** | Target uptime 99.5% untuk layanan cloud (fungsi kritis tetap jalan offline via PWA) |
| **Kepatuhan (Compliance)** | Kesesuaian dengan regulasi pajak lokal (mis. format faktur/e-Faktur Indonesia) |
| **Localisasi** | Bahasa Indonesia sebagai default, dukungan multi-bahasa untuk ekspansi regional |
| **Biaya Operasional** | Struktur harga berbasis langganan (subscription) yang terjangkau untuk SMB, model tier sesuai jumlah modul/user |

---

## 11. Metrik Keberhasilan (Success Metrics / KPI)

| Metrik | Target Fase 1 (6 bulan pasca-launch) |
|---|---|
| Jumlah SMB aktif (MAU) | 500+ bisnis |
| Retention bulanan | > 85% |
| Rata-rata modul aktif per akun | ≥ 3 modul |
| Tingkat penggunaan fitur AI Assistant | ≥ 40% pengguna aktif memakai minimal 1x/minggu |
| Pengurangan waktu pencatatan manual (vs spreadsheet) | ≥ 50% (berdasarkan survei pengguna) |
| Skor kepuasan pengguna (CSAT/NPS) | NPS ≥ 40 |
| PWA install rate | ≥ 60% dari total pengguna aktif |

---

## 12. Roadmap Produk (Ringkas)

| Fase | Fokus | Estimasi |
|---|---|---|
| **Fase 0 — Discovery & Design** | Riset pengguna, wireframe, arsitektur teknis | Bulan 1–2 |
| **Fase 1 — MVP Launch** | Modular framework, Inventory, POS, Finance dasar, AI Assistant, PWA offline-core | Bulan 3–6 |
| **Fase 2 — Ekspansi Fitur** | Integrasi marketplace, mini-CRM lanjutan, payroll ringan | Bulan 7–9 |
| **Fase 3 — Skalabilitas & Industri Lanjutan** | Modul manufaktur lanjutan, multi-currency, ekspansi regional | Bulan 10–12+ |

---

## 13. Risiko & Asumsi

| Risiko | Mitigasi |
|---|---|
| Keterbatasan PWA di iOS (notifikasi, penyimpanan) | Uji ekstensif di Safari iOS, sediakan fallback UX |
| Adopsi AI rendah karena kurang familiar SMB non-teknis | Onboarding & contoh use-case AI yang konkret, bahasa sederhana |
| Kompleksitas menjaga fleksibilitas modular tanpa membuat sistem "berat" | Batasi kustomisasi ke level low-code, hindari over-engineering di MVP |
| Biaya komputasi AI membengkak seiring skala pengguna | Caching, batching request AI, gunakan model sesuai kebutuhan (bukan selalu model terbesar) |
| Ketergantungan konektivitas untuk fitur AI real-time | AI insight non-kritis di-generate secara asinkron/berkala, bukan real-time penuh |

### Asumsi
- Target pasar awal adalah SMB di Indonesia dengan akses internet minimal 3G/4G.
- Pengguna memiliki device modern (browser Chromium/Safari versi wajar) untuk mendukung fitur PWA.

---

## 14. Lampiran

- Glosarium istilah (SBS, PWA, Low-code, BOM, dsb.) — *dapat ditambahkan sesuai kebutuhan tim*.
- Wireframe & mockup — *terpisah di file desain*.
- Spesifikasi API modul — *terpisah di dokumen teknis*.

---

*Dokumen ini adalah draft awal PRD Retalio (Smart Business System) dan akan diperbarui seiring hasil riset pengguna, validasi teknis, dan masukan stakeholder.*
