/**
 * Mengisi Google Form 2 (data awal klien, diisi SETELAH klien berlangganan) dengan pertanyaan Retalio.
 *
 * Pakai: buat Google Form kosong baru (terpisah dari form konsultasi) -> menu ⋮ -> Apps Script -> tempel file ini
 * -> jalankan buildOnboardingForm() SEKALI. Menjalankan ulang MENGHAPUS semua pertanyaan di form itu lalu membuatnya lagi.
 *
 * Daftar panjang (produk, supplier, dsb.) ditulis klien satu baris per data dengan tanda | sebagai pemisah, supaya
 * mudah ditempel dari Excel/catatan dan mudah dibaca tim saat memasukkannya ke akun.
 *
 * Judul pertanyaan identitas (Nama Lengkap, Nomor WhatsApp Aktif, Email Akun Retalio) dibaca Retalio untuk mengisi
 * daftar dan mencocokkan akun klien. Jangan ubah kata kuncinya, dan jangan menaruh kata "email", "whatsapp", atau
 * "telepon" di judul pertanyaan lain (petunjuk isian ditulis di teks bantuan, bukan di judul).
 */
function buildOnboardingForm() {
  const form = FormApp.getActiveForm();
  form.getItems().forEach(function (item) { form.deleteItem(item); });

  form.setTitle('Data Awal Akun Retalio');
  form.setDescription(
    'Formulir ini diisi setelah Anda berlangganan Retalio. Tim kami memakai jawaban Anda untuk menyiapkan akun: ' +
    'produk, stok, karyawan, supplier, saldo, pajak, dan metode pembayaran.\n\n' +
    'Tidak harus lengkap sekaligus. Isi yang Anda punya, sisanya bisa ditambahkan nanti lewat chat dengan tim kami. ' +
    'Untuk daftar panjang, tulis satu data per baris dan pisahkan kolomnya dengan tanda | (contoh ada di bawah tiap pertanyaan). ' +
    'Anda juga boleh menempel dari Excel.'
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setConfirmationMessage('Terima kasih! Data Anda sudah kami terima. Tim Retalio akan menyiapkan akun Anda dan meminta persetujuan Anda sebelum dipakai.');

  function text(title, help, required) {
    const q = form.addTextItem().setTitle(title).setRequired(required);
    if (help) q.setHelpText(help);
    return q;
  }
  function paragraph(title, help) {
    const q = form.addParagraphTextItem().setTitle(title).setRequired(false);
    if (help) q.setHelpText(help);
    return q;
  }
  function choice(title, options, required, help) {
    const q = form.addMultipleChoiceItem().setTitle(title).setChoiceValues(options).setRequired(required);
    if (help) q.setHelpText(help);
    return q;
  }
  function checks(title, options, help) {
    const q = form.addCheckboxItem().setTitle(title).setChoiceValues(options).setRequired(false);
    if (help) q.setHelpText(help);
    return q;
  }
  function section(title, help) {
    const s = form.addPageBreakItem().setTitle(title);
    if (help) s.setHelpText(help);
    return s;
  }

  // --- 1. Identitas akun
  text('Nama Lengkap', 'Nama pemilik atau penanggung jawab akun.', true);
  text('Nomor WhatsApp Aktif', 'Nomor yang bisa kami hubungi. Contoh: 0812-3456-7890', true);
  text('Email Akun Retalio', 'Email yang Anda pakai untuk masuk ke Retalio. Dipakai untuk mencocokkan data ini dengan akun Anda.', true);
  text('Nama Usaha', 'Nama usaha seperti yang ingin tampil di struk dan laporan.', true);

  // --- 2. Outlet
  section('Outlet / Cabang', 'Lokasi usaha yang akan dicatat di Retalio.');
  paragraph('Daftar Outlet', 'Satu outlet per baris: Nama outlet | Alamat | Jam buka.\nContoh: Toko Pusat | Jl. Merdeka 1, Bandung | 08.00-21.00');

  // --- 3. Produk dan stok
  section('Produk, Harga, dan Stok Awal', 'Barang atau jasa yang Anda jual.');
  paragraph('Daftar Produk dan Harga',
    'Satu produk per baris: Nama produk | Kategori | Satuan | Harga jual | Harga beli/modal | SKU (boleh kosong).\n' +
    'Contoh: Kopi Susu | Minuman | gelas | 18000 | 7000 | KS-01');
  paragraph('Stok Awal',
    'Satu baris per produk per outlet: Nama produk | Jumlah | Nama outlet.\nContoh: Kopi Susu | 120 | Toko Pusat');

  // --- 4. Karyawan
  section('Karyawan dan Akses', 'Orang yang akan memakai Retalio. Data ini sensitif; isi hanya yang diperlukan untuk membuat akun dan hak akses.');
  paragraph('Daftar Karyawan',
    'Satu orang per baris: Nama | Jabatan | Outlet | Hak akses yang dibutuhkan (kasir, gudang, keuangan, dsb.).\n' +
    'Contoh: Sari | Kasir | Toko Pusat | kasir');

  // --- 5. Supplier dan pelanggan
  section('Supplier dan Pelanggan', 'Boleh dikosongkan bila belum ada.');
  paragraph('Daftar Supplier',
    'Satu supplier per baris: Nama | Nomor kontak | Barang yang dipasok | Termin bayar (mis. 14 hari).\n' +
    'Contoh: CV Kopi Nusantara | 0813-0000-0000 | Biji kopi | 14 hari');
  paragraph('Daftar Pelanggan Langganan',
    'Hanya pelanggan tetap atau pelanggan korporat yang perlu dicatat. Satu per baris: Nama | Nomor kontak | Catatan.\n' +
    'Pelanggan umum tidak perlu didaftarkan.');

  // --- 6. Saldo awal
  section('Saldo Awal Keuangan', 'Posisi keuangan pada hari pertama Anda memakai Retalio.');
  form.addDateItem().setTitle('Tanggal Mulai Pencatatan di Retalio').setHelpText('Saldo di bawah ini adalah saldo pada tanggal tersebut.').setRequired(false);
  paragraph('Saldo Kas dan Rekening Bank',
    'Satu baris per kas atau rekening: Nama | Saldo.\nContoh: Kas Toko | 2500000\nContoh: Bank BCA | 15000000');
  paragraph('Utang ke Supplier (Saat Ini)', 'Satu baris per tagihan: Nama supplier | Jumlah | Jatuh tempo.');
  paragraph('Piutang dari Pelanggan (Saat Ini)', 'Satu baris per tagihan: Nama pelanggan | Jumlah | Jatuh tempo.');

  // --- 7. Pajak
  section('Pajak', 'Dipakai untuk mengatur pencatatan pajak di akun Anda.');
  choice('Status Pengusaha Kena Pajak (PKP)', ['Ya, sudah PKP', 'Belum PKP', 'Saya tidak tahu'], false);
  choice('Tarif PPN yang Dipakai', ['11%', '12%', 'Tidak memungut PPN', 'Saya tidak tahu'], false);
  checks('Pajak Lain yang Perlu Dicatat',
    ['PPh final UMKM 0,5%', 'PB1 (pajak restoran/hiburan)', 'PPh 21 (karyawan)', 'PPh 23', 'Belum ada / tidak tahu']);
  text('NPWP Usaha', 'Opsional. Tulis bila ingin tampil di faktur atau laporan.', false);

  // --- 8. Pembayaran
  section('Metode Pembayaran', 'Cara pelanggan membayar di kasir Anda.');
  checks('Metode Pembayaran yang Diterima',
    ['Tunai', 'QRIS', 'Transfer bank', 'Kartu debit/kredit', 'E-wallet', 'Lainnya']);
  paragraph('Rekening Penerima Pembayaran',
    'Satu rekening per baris: Bank | Nomor rekening | Atas nama. Dipakai untuk instruksi transfer di faktur.');

  // --- 9. Penutup
  section('Catatan dan Persetujuan');
  paragraph('Catatan Tambahan', 'Hal lain yang perlu kami ketahui. Jangan menulis kata sandi atau nomor kartu.');
  form.addCheckboxItem()
    .setTitle('Persetujuan Data')
    .setChoiceValues(['Saya setuju data ini dipakai tim Retalio untuk menyiapkan akun saya, dan saya akan memeriksanya sebelum dipakai.'])
    .setRequired(true);

  Logger.log('Selesai. Item: ' + form.getItems().length + '. Tautan isi: ' + form.getPublishedUrl());
}
