/**
 * Mengisi Google Form kosong dengan pertanyaan konsultasi Retalio.
 *
 * Pakai: buka Google Form kosong -> menu ⋮ -> Editor skrip -> tempel file ini -> jalankan buildForm() SEKALI.
 * Menjalankan ulang MENGHAPUS semua pertanyaan lama di form itu lalu membuatnya lagi.
 *
 * Judul pertanyaan memuat kata kunci yang dibaca Retalio untuk mengisi kolom daftar (nama lengkap, whatsapp,
 * email, jenis usaha, karyawan). Jangan ubah kata kuncinya. Sengaja tidak ada "Nama Usaha": judulnya tidak
 * dikenali sebagai data identitas, jadi isinya ikut dikirim ke model AI; nama usaha ditanyakan sales saat konsultasi.
 */
function buildForm() {
  const form = FormApp.getActiveForm();
  form.getItems().forEach(function (item) { form.deleteItem(item); });

  form.setTitle('Konsultasi Retalio — Ceritakan Kebutuhan Usaha Anda');
  form.setDescription(
    'Isi singkat (sekitar 3 menit). Tim Retalio akan menghubungi Anda untuk konsultasi dan penawaran yang sesuai.\n' +
    'Data Anda hanya dipakai untuk menghubungi dan menyiapkan penawaran Retalio.'
  );
  form.setCollectEmail(false);
  form.setConfirmationMessage('Terima kasih! Tim Retalio akan menghubungi Anda melalui WhatsApp atau email.');
  form.setProgressBar(false);

  function text(title, help, required) {
    const q = form.addTextItem().setTitle(title).setRequired(required);
    if (help) q.setHelpText(help);
    return q;
  }
  function choice(title, options, required) {
    return form.addMultipleChoiceItem().setTitle(title).setChoiceValues(options).setRequired(required);
  }
  function checks(title, options, required) {
    return form.addCheckboxItem().setTitle(title).setChoiceValues(options).setRequired(required);
  }

  text('Nama Lengkap', '', true);
  text('Nomor WhatsApp Aktif', 'Contoh: 0812-3456-7890', true);
  text('Alamat Email Aktif', '', true);

  choice('Jenis Usaha / Industri',
    ['Retail / Toko', 'F&B / Kuliner', 'Distribusi / Grosir', 'Jasa', 'Manufaktur / Produksi', 'Klinik / Kesehatan', 'Lainnya'], true);
  choice('Jumlah Karyawan', ['1 - 5 orang', '6 - 10 orang', '11 - 50 orang', '51 - 200 orang', 'Lebih dari 200 orang'], true);
  choice('Jumlah Outlet / Cabang', ['1 (satu lokasi)', '2 - 3', '4 - 10', 'Lebih dari 10'], true);

  checks('Kebutuhan Utama',
    ['Kasir / Point of Sale', 'Stok & gudang', 'Pembelian & supplier', 'Laporan keuangan & akuntansi', 'Pajak',
     'Penggajian & absensi', 'Multi-cabang', 'Pelanggan & loyalti', 'Toko online / marketplace'], true);
  checks('Fitur AI yang Diminati',
    ['Asisten AI untuk bertanya soal data usaha', 'Baca nota/struk otomatis (OCR)', 'Prediksi penjualan', 'Belum tahu / belum perlu'], false);
  text('Sistem yang Dipakai Saat Ini', 'Misalnya Excel, buku catatan, aplikasi kasir lain. Boleh dikosongkan.', false);
  form.addParagraphTextItem().setTitle('Ceritakan Masalah atau Harapan Anda').setHelpText('Opsional. Jangan menulis data sensitif seperti kata sandi atau nomor kartu.').setRequired(false);

  form.addDateItem().setTitle('Preferensi Tanggal Konsultasi').setRequired(false);
  choice('Preferensi Waktu Konsultasi', ['Pagi (09.00 - 12.00)', 'Siang (13.00 - 16.00)', 'Sore (16.00 - 18.00)'], false);

  form.addCheckboxItem()
    .setTitle('Persetujuan Data')
    .setChoiceValues(['Saya setuju data saya dipakai untuk dihubungi dan disiapkan penawaran oleh Retalio.'])
    .setRequired(true);

  Logger.log('Selesai. Pertanyaan: ' + form.getItems().length + '. Tautan isi: ' + form.getPublishedUrl());
}
