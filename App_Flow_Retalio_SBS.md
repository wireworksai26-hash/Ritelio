# App Flow Document
# Retalio — Smart Business System (SBS)

| | |
|---|---|
| **Nama Produk** | Retalio |
| **Versi Dokumen** | 1.0 |
| **Tanggal** | 6 September 2026 |
| **Platform** | Progressive Web App (PWA) |
| **Dokumen Terkait** | PRD_Retalio_SBS.md, TRD_Retalio_SBS.md, Database_Schema_Retalio_SBS.md |

---

## 1. Ringkasan

Dokumen ini menjabarkan **alur penggunaan (user flow)** aplikasi Retalio dari sisi pengguna — mulai dari onboarding awal, navigasi utama, hingga alur kerja detail di setiap modul (Inventory, POS, Finance, AI Assistant), termasuk perilaku khusus PWA seperti install & mode offline.

---

## 2. Peta Alur Level Tinggi (High-Level App Map)

```mermaid
flowchart TD
    A[Landing Page / Login] --> B{Sudah punya akun?}
    B -->|Belum| C[Sign Up / Registrasi Tenant]
    B -->|Sudah| D[Login]
    C --> E[Onboarding Wizard]
    E --> F[Dashboard Utama]
    D --> F

    F --> G[Modul Inventory]
    F --> H[Modul Sales / POS]
    F --> I[Modul Finance]
    F --> J[AI Assistant]
    F --> K[Pengaturan & Modul Config]
    F --> L[Notifikasi]

    G --> F
    H --> F
    I --> F
    J --> F
    K --> F
```

---

## 3. Alur Onboarding (First-Time User)

```mermaid
flowchart TD
    A[Buka Retalio via Browser] --> B[Klik "Daftar Bisnis Baru"]
    B --> C[Isi Data Bisnis: Nama, Industri]
    C --> D{Pilih Template Industri}
    D -->|Retail| E1[Preset modul: Inventory, POS, Finance]
    D -->|Manufaktur| E2[Preset modul: Inventory, Produksi, Finance]
    D -->|Jasa| E3[Preset modul: Booking, POS, Finance]
    E1 --> F[Setup Outlet Pertama]
    E2 --> F
    E3 --> F
    F --> G[Undang/Buat Akun Staff opsional]
    G --> H[Tambah Produk/Jasa Pertama]
    H --> I[Prompt: Install Retalio sebagai App? Add to Home Screen]
    I --> J[Tour Singkat Fitur Utama - termasuk AI Assistant]
    J --> K[Dashboard Utama Siap Dipakai]
```

**Catatan UX:**
- Setiap langkah bisa di-skip dan dilanjutkan nanti (kecuali nama bisnis & pemilihan template industri).
- Target: pengguna bisa mencapai transaksi POS pertama dalam < 30 menit.
- Prompt install PWA ditampilkan secara halus (non-intrusive banner), tidak memblokir alur.

---

## 4. Alur Login & Autentikasi

```mermaid
flowchart TD
    A[Buka App] --> B{Session token valid di device?}
    B -->|Ya| C[Langsung ke Dashboard]
    B -->|Tidak| D[Halaman Login]
    D --> E[Input Email/No. HP + Password]
    E --> F{Role = Owner/Admin?}
    F -->|Ya & 2FA aktif| G[Verifikasi OTP]
    F -->|Tidak| H[Masuk ke Dashboard sesuai Role]
    G --> H
    D --> I[Lupa Password?]
    I --> J[Reset via Email/SMS]
    J --> D
```

Tampilan dashboard menyesuaikan **role** pengguna:
- **Owner/Admin** → Dashboard lengkap (semua modul + insight AI + laporan keuangan).
- **Manager** → Dashboard operasional (inventory, sales report per outlet).
- **Kasir/Staff** → Langsung ke antarmuka POS, tanpa akses laporan keuangan.

---

## 5. Alur Modul: Smart Inventory Control

```mermaid
flowchart TD
    A[Buka Modul Inventory] --> B[Daftar Produk & Stok]
    B --> C{Aksi apa?}
    C -->|Tambah Produk Baru| D[Form Produk + Custom Field]
    C -->|Cek Stok| E[Lihat Detail Stok per Gudang]
    C -->|Terima Barang| F[Buat/Update Purchase Order]
    C -->|Scan Barcode| G[Kamera Device Scan Barcode/QR]
    D --> B
    F --> H[Stok Otomatis Ter-update]
    G --> E
    H --> B

    E --> I{Stok di bawah ambang batas?}
    I -->|Ya| J[Notifikasi Low-Stock Alert]
    J --> K[AI: Prediksi Kapan Perlu Restock]
    K --> L[Saran: Buat Purchase Order?]
    L -->|Terima Saran| F
    L -->|Abaikan| B
```

**Poin Penting:**
- Notifikasi low-stock dikirim via push notification (atau in-app badge di iOS).
- Rekomendasi AI selalu punya tombol **"Buat PO Otomatis"** dan **"Abaikan"** — tidak pernah mengeksekusi pembelian tanpa konfirmasi.

---

## 6. Alur Modul: Sales & POS (termasuk Mode Offline)

```mermaid
flowchart TD
    A[Buka POS] --> B[Pilih/Scan Produk]
    B --> C[Tambah ke Keranjang]
    C --> D{Tambah produk lagi?}
    D -->|Ya| B
    D -->|Tidak| E[Pilih Metode Pembayaran]
    E --> F[Konfirmasi Transaksi]
    F --> G{Koneksi Internet Tersedia?}
    G -->|Ya| H[Kirim ke Server → Update Stok + Jurnal]
    G -->|Tidak| I[Simpan di IndexedDB Lokal - status: pending]
    I --> J[Cetak/Kirim Struk Lokal]
    H --> J
    J --> K[Transaksi Selesai]

    I --> L[Background Sync saat Online Kembali]
    L --> M{Ada Konflik Stok?}
    M -->|Tidak| H
    M -->|Ya| N[Tandai needs_review + Notifikasi ke Admin]
    N --> O[Admin Review & Konfirmasi Manual]
```

**Poin Penting (khusus PWA):**
- Transaksi offline tetap bisa dicetak/ditampilkan struknya secara lokal.
- Sinkronisasi berjalan otomatis di background begitu koneksi kembali — kasir tidak perlu melakukan apa pun secara manual.
- Jika terjadi konflik (misal produk yang sama terjual di 2 device saat offline), transaksi **tidak dibatalkan otomatis**, tapi ditandai untuk direview admin.

---

## 7. Alur Modul: Real-Time Financial Reporting

```mermaid
flowchart TD
    A[Buka Modul Finance] --> B[Dashboard Keuangan]
    B --> C{Pilih Laporan}
    C -->|Laba Rugi| D[Tampilkan P&L Real-time]
    C -->|Arus Kas| E[Tampilkan Cashflow Aktual]
    C -->|Prediksi Arus Kas AI| F[AI Cashflow Forecast 30/60/90 hari]
    C -->|Cek Anomali| G[Daftar Transaksi Ditandai Anomali]

    G --> H[Lihat Detail + Alasan AI Menandai]
    H --> I{Valid sebagai kesalahan/fraud?}
    I -->|Ya| J[Eskalasi ke Owner/Investigasi]
    I -->|Tidak, false positive| K[Tandai "Bukan Anomali" - feedback ke AI]

    B --> L[Export Laporan PDF/Excel]
```

**Poin Penting:**
- Semua laporan berbasis data real-time dari `financial_entries` (jurnal otomatis).
- Feedback pengguna terhadap flag anomali (§7) tersimpan untuk evaluasi & penyempurnaan model deteksi ke depannya.

---

## 8. Alur AI Business Assistant

```mermaid
flowchart TD
    A[Klik Ikon AI Assistant] --> B[Jendela Chat Terbuka]
    B --> C[Pengguna Ketik Pertanyaan Bebas]
    C --> D{Jenis Pertanyaan}
    D -->|Pertanyaan Data - NLQ| E[AI Terjemahkan ke Query Internal]
    D -->|Pertanyaan Umum/How-to| F[AI Jawab dari Knowledge Base Produk]
    D -->|Minta Insight| G[AI Ambil Insight dari ai_insights_log]

    E --> H[Jalankan Query ke Database]
    H --> I[Ambil Hasil Aktual]
    I --> J[AI Susun Jawaban Bahasa Natural + Referensi Data]
    F --> J
    G --> J

    J --> K[Tampilkan Jawaban + Sumber Data]
    K --> L{Pengguna Puas?}
    L -->|Ya| M[Beri Feedback Positif opsional]
    L -->|Tidak| N[Beri Feedback / Tanya Ulang dengan Detail Lain]
    N --> C
```

**Poin Penting:**
- Jawaban numerik AI **selalu diambil dari query database aktual**, bukan dikira-kira oleh model — mencegah halusinasi angka.
- Setiap jawaban menyertakan referensi sumber data agar pengguna bisa verifikasi.
- Jika tidak ada koneksi internet, Assistant menampilkan pesan bahwa fitur ini butuh koneksi (bukan silent fail).

---

## 9. Alur: Modular Customization (Toggle & Custom Field)

```mermaid
flowchart TD
    A[Owner Buka Pengaturan] --> B[Manajemen Modul]
    B --> C[Lihat Daftar Modul: Aktif/Nonaktif]
    C --> D{Aksi}
    D -->|Toggle Modul| E[Aktifkan/Nonaktifkan Modul]
    E --> F[Sistem Update Navigasi & Akses Otomatis]
    D -->|Tambah Field Kustom| G[Form Builder: Pilih Modul → Tambah Field]
    G --> H[Tentukan Tipe Field: Teks/Angka/Tanggal/Dropdown]
    H --> I[Simpan → Field Muncul di Form Terkait]
    D -->|Ganti Template Industri| J[Pilih Ulang Template]
    J --> K[Konfirmasi - Field/Modul Existing Tidak Hilang]
```

**Poin Penting:**
- Toggle modul **tidak menghapus data** — hanya menyembunyikan akses/navigasi.
- Penambahan custom field tidak butuh developer/downtime (sesuai prinsip low-code).

---

## 10. Alur Notifikasi & Push (PWA)

```mermaid
flowchart TD
    A[Event Terjadi] --> B{Jenis Event}
    B -->|Stok Menipis| C[Trigger: Low Stock Alert]
    B -->|Insight AI Harian Siap| D[Trigger: Insight Digest]
    B -->|Butuh Approval| E[Trigger: Approval Request]
    B -->|Konflik Sync| F[Trigger: Sync Conflict]

    C --> G{Platform Mendukung Push OS?}
    D --> G
    E --> G
    F --> G

    G -->|Android/Desktop| H[Web Push Notification muncul di OS]
    G -->|iOS Safari terbatas| I[In-App Badge + Notifikasi saat App Dibuka]

    H --> J[Klik Notifikasi → Buka Halaman Terkait]
    I --> J
```

---

## 11. Alur Install PWA (Add to Home Screen)

```mermaid
flowchart TD
    A[Pengguna Menggunakan Retalio via Browser] --> B{Kriteria Installable Terpenuhi?}
    B -->|Ya| C[Browser Tampilkan Prompt Install / Banner Custom]
    C --> D{Pengguna Pilih Install?}
    D -->|Ya| E[App Ditambahkan ke Home Screen/Desktop]
    D -->|Nanti| F[Banner Disembunyikan, Muncul Lagi Setelah Beberapa Sesi]
    E --> G[Buka App Selanjutnya Langsung dari Ikon - Mode Standalone]
    G --> H[Service Worker Aktif → Siap Mode Offline]
```

---

## 12. Alur Multi-Outlet (Manajemen Lintas Cabang)

```mermaid
flowchart TD
    A[Owner Login] --> B[Dashboard Konsolidasi Semua Outlet]
    B --> C{Pilih Tampilan}
    C -->|Semua Outlet| D[Ringkasan Gabungan: Penjualan, Stok, Keuangan]
    C -->|Per Outlet| E[Pilih Outlet Spesifik]
    E --> F[Dashboard Detail Outlet Tersebut]
    D --> G[AI: Insight Perbandingan Performa Antar Outlet]
    G --> H["Outlet A tumbuh 15%, Outlet B stagnan - lihat detail?"]
```

---

## 13. Ringkasan Peran vs Akses Flow

| Role | Flow yang Diakses |
|---|---|
| **Owner** | Semua flow (§3–§12) termasuk konfigurasi modul & laporan keuangan |
| **Admin** | Semua flow operasional + konfigurasi modul (tanpa data finansial sensitif tertentu, sesuai kebijakan) |
| **Manager** | Inventory, Sales report, AI insight per outlet — tanpa akses toggle modul |
| **Kasir** | Hanya flow POS (§6) + notifikasi terbatas |
| **Staff** | Sesuai permission granular yang diberikan admin |

---

## 14. Referensi

- Kebutuhan produk & fitur: `PRD_Retalio_SBS.md`
- Spesifikasi teknis & arsitektur PWA/AI: `TRD_Retalio_SBS.md`
- Struktur data pendukung setiap flow: `Database_Schema_Retalio_SBS.md`

---

*Dokumen ini akan diperbarui seiring hasil usability testing dan penambahan modul baru (mis. flow Payroll/HR di Fase 2).*
