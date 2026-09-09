// Knowledge base how-to lokal — dijawab via fast path (nol token LLM).
export interface KbEntry {
  keys: string[];
  answer: string;
}

export const KNOWLEDGE_BASE: KbEntry[] = [
  {
    keys: ['tambah produk', 'buat produk', 'produk baru'],
    answer:
      'Cara menambah produk:\n1. Buka menu Inventori → tombol "Tambah Produk".\n2. Isi nama, SKU (opsional, auto-generate), kategori, harga jual & modal, stok awal, satuan.\n3. Field kustom dari Form Builder otomatis muncul di form ini.\n4. Simpan — produk langsung tampil di POS.',
  },
  {
    keys: ['scan', 'barcode', 'qr'],
    answer:
      'Cara scan barcode: buka Inventori → tombol "Scan" (atau dari Dashboard). Arahkan kamera ke barcode/QR produk. Jika kamera tidak tersedia, ketik SKU atau barcode manual lalu "Cari Produk".',
  },
  {
    keys: ['terima barang', 'penerimaan', 'purchase order', 'po'],
    answer:
      'Cara menerima barang dari PO:\n1. Inventori → tab "Purchase Order".\n2. Pada PO berstatus "Dipesan", klik "Terima Barang".\n3. Stok gudang tujuan otomatis bertambah, pergerakan stok dan jurnal (Persediaan/Hutang) tercatat.',
  },
  {
    keys: ['offline', 'tanpa internet', 'koneksi'],
    answer:
      'Mode offline POS: saat koneksi putus, transaksi tetap bisa dilakukan — tersimpan lokal di perangkat dengan status "pending" dan struk tetap bisa dicetak. Begitu online, antrean tersinkron otomatis. Jika ada konflik stok, transaksi ditandai "needs_review" untuk ditinjau owner/admin — tidak pernah ditolak diam-diam.',
  },
  {
    keys: ['konflik', 'needs review', 'sinkron'],
    answer:
      'Konflik sinkron terjadi saat transaksi offline melebihi stok server. Cara meninjau: buka Notifikasi → item "perlu ditinjau", atau filter transaksi berstatus needs_review di riwayat penjualan. Tindakan Anda (setujui/sesuaikan) akan tercatat di audit log.',
  },
  {
    keys: ['modul', 'nonaktifkan', 'aktifkan'],
    answer:
      'Mengatur modul: Pengaturan → Manajemen Modul → geser toggle. Menonaktifkan modul hanya menyembunyikan navigasi — data tidak pernah dihapus dan bisa diaktifkan lagi kapan saja.',
  },
  {
    keys: ['custom field', 'form builder', 'field kustom', 'kolom'],
    answer:
      'Form Builder: Pengaturan → Form Builder → pilih modul, tulis nama field, pilih tipe (teks/angka/tanggal/dropdown) → Tambah. Field langsung muncul di form modul terkait (mis. form Tambah Produk).',
  },
  {
    keys: ['template', 'industri'],
    answer:
      'Ganti template industri: Pengaturan → Template Industri → pilih Retail/Manufaktur/Jasa → konfirmasi. Navigasi menyesuaikan; data produk, stok, dan transaksi tidak berubah.',
  },
  {
    keys: ['export', 'pdf', 'excel', 'laporan pajak', 'e-faktur'],
    answer:
      'Export laporan: buka Keuangan → tombol PDF/Excel di kanan atas. Data yang diexport mengikuti periode yang sedang dipilih (7/30/90 hari) dan siap dipakai untuk kebutuhan pajak (e-Faktur).',
  },
  {
    keys: ['loyalitas', 'poin', 'member', 'pelanggan'],
    answer:
      'Mini-CRM: saat transaksi di POS, pilih pelanggan pada dropdown "Pelanggan" — riwayat belanja dan poin loyalitas tercatat otomatis (1 poin per kelipatan Rp 10.000).',
  },
  {
    keys: ['undang', 'staff', 'karyawan', 'pengguna', 'user'],
    answer:
      'Menambah pengguna: minta owner/admin buka Pengaturan → kelola pengguna. Setiap peran punya batas akses jelas: kasir hanya POS, manager bisa inventori & laporan, admin tanpa finansial sensitif, owner akses penuh.',
  },
  {
    keys: ['2fa', 'otp', 'authenticator', 'keamanan akun'],
    answer:
      'Mengaktifkan 2FA: owner/admin dapat mengaktifkan verifikasi OTP (TOTP) via aplikasi authenticator. Setelah aktif, setiap login wajib memasukkan kode 6 digit.',
  },
  {
    keys: ['install', 'pwa', 'home screen', 'aplikasi'],
    answer:
      'Install Retalio sebagai aplikasi: di Chrome/Edge Android atau desktop, ketuk banner "Install Retalio" atau ikon install di address bar. Setelah terinstall, fungsi kritis tetap jalan offline dan notifikasi stok muncul sebagai push notification (di iOS tampil sebagai badge in-app).',
  },
];

export const KB_FALLBACK =
  'Saya bisa membantu panduan operasional seperti: tambah produk, scan barcode, terima barang (PO), mode offline & konflik sinkron, kelola modul, form builder, template industri, export laporan, loyalitas pelanggan, undang staff, 2FA, dan install aplikasi. Topik mana yang mau kamu pelajari?';
