# Formulir konsultasi calon klien (Google Form → Retalio)

Alur: calon klien mengisi Google Form → Apps Script mengirim jawabannya ke Retalio (bertanda tangan) →
Retalio menyimpan dan meminta AI membuat analisis awal → tim sales melihatnya di
**Panel Superadmin → Pengajuan Calon Klien**, lalu menghubungi calon klien.

AI hanya membuat **ringkasan dan saran** (kecocokan, paket yang mungkin cocok, modul, hal yang perlu ditanyakan).
Keputusan dan harga tetap di tangan sales. Nama, alamat, WhatsApp, dan email **tidak dikirim ke model AI**;
nomor/email yang terselip di teks bebas disamarkan lebih dulu.

## Pasang (sekali)

1. **Server Retalio** (Railway → service → Variables): isi `INTAKE_WEBHOOK_SECRET` dengan teks acak panjang
   (minimal 32 karakter). Selama kosong, penerima mengembalikan 503 dan tidak menerima apa pun.
   Analisis AI memakai `NIM_API_KEY` yang sudah ada; bila kosong, pengajuan tetap tersimpan dengan status analisis "dilewati".
2. **Google Form** → ⋮ → **Editor skrip** (Apps Script) → tempel isi `apps-script.gs`.
3. Di Apps Script: **Project Settings → Script Properties**, tambah:
   - `RETALIO_INTAKE_URL` = `https://<alamat-retalio>/v1/intake/google-form`
   - `RETALIO_INTAKE_SECRET` = nilai yang sama dengan `INTAKE_WEBHOOK_SECRET`
4. Jalankan fungsi `setupTrigger` sekali (izinkan akses yang diminta), lalu `testSend`.
   Di panel superadmin akan muncul pengajuan "Uji Koneksi" — boleh ditandai Ditutup.
5. **Halaman depan**: isi variabel Railway `VITE_INTAKE_FORM_URL` (alamat `viewform` dari tombol Kirim → tautan).
   Bersama `VITE_SALES_WHATSAPP` dan `VITE_SALES_EMAIL`, nilai ini ditanam saat *build*, jadi perlu deploy ulang.
   Bila `VITE_INTAKE_FORM_URL` kosong, pilihan formulir otomatis disembunyikan.

## Pertanyaan yang disarankan (khusus Retalio)

Judul pertanyaan dibaca otomatis untuk mengisi kolom daftar, jadi pertahankan kata kuncinya. Tidak perlu membuatnya satu per satu: tempel `build-form.gs` di Editor skrip form yang masih kosong dan jalankan `buildForm` sekali (menjalankan ulang menghapus dan membuat ulang pertanyaan).

"Nama Usaha" sengaja tidak ditanyakan karena judulnya tidak dikenali sebagai data identitas, sehingga isinya ikut dikirim ke model AI. Sales menanyakannya saat konsultasi.

| Judul pertanyaan | Jenis | Dipakai untuk |
|---|---|---|
| Nama Lengkap | Jawaban singkat | nama kontak |
| Nomor WhatsApp Aktif | Jawaban singkat | tombol WhatsApp |
| Alamat Email Aktif | Jawaban singkat | tombol email |
| Jenis Usaha / Industri | Pilihan | jenis usaha |
| Jumlah Karyawan | Pilihan | skala usaha |
| Jumlah Outlet/Cabang | Pilihan | analisis |
| Kebutuhan Utama (kasir, stok, laporan, dsb.) | Kotak centang | modul yang cocok |
| Sistem yang dipakai sekarang | Jawaban singkat | analisis |
| Perlu fitur AI? (chatbot, prediksi, OCR) | Kotak centang | usulan paket |
| Preferensi jadwal konsultasi | Tanggal/Jawaban singkat | tindak lanjut |

## Persetujuan data pribadi (UU PDP)

Tambahkan di awal formulir kalimat persetujuan, misalnya: "Data Anda dipakai hanya untuk menghubungi dan menyiapkan
penawaran Retalio." dan satu pertanyaan kotak centang wajib "Saya setuju". Halaman Kebijakan Privasi (`/privasi`) dan
Syarat & Ketentuan (`/syarat-ketentuan`) sudah ada; tambahkan alamat lengkapnya (alamat situs + path itu) di deskripsi form.

## Keamanan penerima

- Tanda tangan `HMAC-SHA256(secret, "<detik>.<isi JSON>")` di header `x-retalio-signature` dan `x-retalio-timestamp`;
  kiriman lebih dari 5 menit ditolak.
- Kiriman ulang dengan `responseId` yang sama tidak membuat baris baru.
- Batas ukuran dan jumlah jawaban; maksimal 30 permintaan per menit per alamat.
- Hanya superadmin yang dapat melihat dan mengubah pengajuan.

---

# Formulir 2: data awal klien (setelah berlangganan)

Alur: klien membayar → menerima tautan Google Form 2 → mengisi data usahanya (outlet, produk dan harga, stok awal,
karyawan, supplier dan pelanggan, saldo awal, pajak, metode pembayaran) → Apps Script mengirim ke Retalio →
tim melihatnya di **Panel Superadmin → Data Awal Klien**.

**Tahap ini hanya menerima dan menampilkan.** Tidak ada AI dan tidak ada data yang otomatis masuk ke akun klien.
Tim memasukkannya secara manual setelah meninjau; memasukkan otomatis (dengan persetujuan klien) adalah tahap berikutnya.
Email yang diisi klien dicocokkan dengan akun Retalio sebagai **petunjuk** untuk tim (bukan dasar akses apa pun).

## Pasang (sekali)

1. Buat Google Form kosong **baru** (terpisah dari form konsultasi) → ⋮ → **Apps Script**.
2. Buat dua file di proyek itu: tempel `build-form-2.gs` lalu jalankan `buildOnboardingForm` sekali untuk mengisi pertanyaan;
   tempel `apps-script.gs` untuk pengiriman jawaban.
3. **Project Settings → Script Properties**:
   - `RETALIO_INTAKE_URL` = `https://<alamat-retalio>/v1/intake/onboarding-form` (perhatikan ujungnya `onboarding-form`,
     bukan `google-form`)
   - `RETALIO_INTAKE_SECRET` = nilai `INTAKE_WEBHOOK_SECRET` (sama dengan form konsultasi)
4. Jalankan `setupTrigger` sekali, lalu `testSend` (muncul sebagai "Uji Koneksi" di tab Data Awal Klien; tandai Selesai).
5. Kirim tautan form ini ke klien setelah pembayaran terkonfirmasi.

Ketentuan: judul "Nama Lengkap", "Nomor WhatsApp Aktif", dan "Email Akun Retalio" dibaca otomatis; jangan diubah.
Satu jawaban dapat berisi hingga 30.000 karakter dan satu kiriman hingga 80 pertanyaan.
Data karyawan dan pelanggan adalah data pribadi: sampaikan di S&K/Privasi bahwa data itu dipakai hanya untuk menyiapkan akun.
