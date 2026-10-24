import type { LegalContact } from '../config/legal';

// Isi halaman Syarat & Ketentuan dan Kebijakan Privasi. Teks ini mengikuti cara kerja aplikasi saat ini
// (akses baca saja setelah langganan berakhir, penyiapan data awal lewat formulir, asisten AI lewat penyedia model,
// dan seterusnya). Bila perilaku aplikasi berubah, ubah teksnya bersama perubahan itu.
// Naskah ini draf kerja dan sebaiknya ditinjau oleh penasihat hukum sebelum dianggap final.

/** Tanggal berlaku naskah. Ubah setiap isi naskah berubah. */
export const LEGAL_EFFECTIVE_DATE = '25 Oktober 2026';

/** Tautan pada akhir bagian: `to` untuk halaman di dalam aplikasi, `href` untuk alamat luar atau anchor. */
export interface SectionLink {
  label: string;
  to?: string;
  href?: string;
}

export interface LegalSection {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  links?: SectionLink[];
}

export interface LegalDocument {
  title: string;
  summary: string;
  sections: LegalSection[];
}

function providerLine(contact: LegalContact): string {
  return contact.companyName
    ? `Layanan Retalio diselenggarakan oleh ${contact.companyName}${contact.companyAddress ? `, beralamat di ${contact.companyAddress}` : ''} (selanjutnya "Retalio" atau "kami").`
    : 'Layanan Retalio diselenggarakan oleh tim Retalio (selanjutnya "Retalio" atau "kami").';
}

function contactParagraph(contact: LegalContact): string {
  return `Pertanyaan, keluhan, atau permintaan terkait dokumen ini dapat dikirim ke ${contact.email}.`;
}

export function buildTerms(contact: LegalContact): LegalDocument {
  return {
    title: 'Syarat & Ketentuan',
    summary:
      'Aturan pemakaian Retalio: akun, paket dan langganan, data Anda, fitur AI, dan apa yang terjadi saat langganan berakhir.',
    sections: [
      {
        id: 'penerimaan',
        heading: '1. Penerimaan',
        paragraphs: [
          providerLine(contact),
          'Retalio adalah aplikasi kasir dan ERP berbasis web untuk pelaku usaha. Dengan membuat akun, memakai layanan, atau mengirim formulir data awal, Anda menyatakan telah membaca dan menyetujui Syarat & Ketentuan ini dan Kebijakan Privasi kami. Jika Anda mendaftar atas nama usaha, Anda menyatakan berwenang mewakili usaha tersebut.',
        ],
      },
      {
        id: 'akun',
        heading: '2. Akun dan keamanan',
        bullets: [
          'Anda bertanggung jawab atas kerahasiaan kata sandi dan atas semua kegiatan yang dilakukan lewat akun Anda.',
          'Pemilik akun (owner) mengatur pengguna lain dan hak aksesnya. Beri akses sesuai kebutuhan dan cabut akses yang tidak diperlukan.',
          'Login dua langkah (2FA) tersedia dan kami anjurkan diaktifkan.',
          'Segera hubungi kami bila Anda menduga ada akses tanpa izin ke akun Anda.',
        ],
      },
      {
        id: 'paket',
        heading: '3. Paket, masa percobaan, dan langganan',
        paragraphs: [
          'Retalio tersedia dalam beberapa paket (saat ini Basic, +AI, dan Custom) dengan fitur dan batas yang berbeda, sebagaimana dijelaskan di halaman harga atau dalam penawaran tertulis.',
          'Pendaftar baru dapat memperoleh masa percobaan. Lama dan isinya sesuai yang tertera saat pendaftaran, dan dapat berubah untuk pendaftar baru.',
        ],
        bullets: [
          'Harga, periode (bulanan atau tahunan), cara pembayaran, perpanjangan, dan pengembalian dana mengikuti penawaran atau konfirmasi berlangganan yang disepakati dengan tim sales kami.',
          'Perubahan paket, status akun, dan kuota dilakukan oleh tim Retalio, bukan oleh pengguna sendiri.',
          'Fitur yang tertera pada paket lain atau pada rencana pengembangan belum tentu tersedia; yang berlaku adalah fitur yang benar-benar ada di akun Anda.',
        ],
      },
      {
        id: 'berakhir',
        heading: '4. Setelah masa percobaan atau langganan berakhir',
        paragraphs: [
          'Saat masa percobaan atau langganan berakhir, akun Anda tidak dihapus. Akun beralih ke mode baca saja.',
        ],
        bullets: [
          'Anda tetap dapat masuk, melihat, dan mengekspor data Anda.',
          'Pencatatan baru, seperti transaksi kasir, tidak dapat dilakukan sampai langganan aktif kembali.',
          'Transaksi kasir yang sudah tersimpan di perangkat saat koneksi terputus tidak dibuang; transaksi itu tertahan dan terkirim setelah akun aktif kembali.',
          'Kami dapat menangguhkan akun yang melanggar ketentuan ini atau dengan alasan keamanan. Selama ditangguhkan, akun tidak dapat dipakai masuk. Kami akan memberi tahu alasannya bila memungkinkan.',
          'Permintaan penghapusan data diatur dalam Kebijakan Privasi.',
        ],
      },
      {
        id: 'data',
        heading: '5. Data Anda',
        paragraphs: [
          'Data usaha yang Anda masukkan atau kirimkan (produk, stok, transaksi, pelanggan, karyawan, pemasok, keuangan, dan sejenisnya) tetap milik Anda. Kami memprosesnya untuk menyediakan layanan, sesuai Kebijakan Privasi.',
          'Anda bertanggung jawab atas kebenaran data, atas hak Anda untuk memasukkannya, dan atas dasar hukum mengelola data pribadi pelanggan, karyawan, atau pihak lain yang Anda catat di Retalio.',
        ],
      },
      {
        id: 'data-awal',
        heading: '6. Penyiapan data awal dan revisi',
        paragraphs: [
          'Setelah berlangganan, Anda dapat mengirim data awal usaha melalui formulir yang kami sediakan. Tim kami menggunakan jawaban itu untuk menyiapkan akun Anda.',
        ],
        bullets: [
          'Anda wajib memeriksa data yang sudah disiapkan di akun Anda dan memastikan benar sebelum dipakai untuk operasional dan pembukuan.',
          'Permintaan revisi diajukan melalui chat dengan tim sales kami. Cakupan dan batas revisi mengikuti penawaran atau kesepakatan berlangganan Anda.',
          'Data awal yang tidak lengkap, tidak jelas, atau tidak sesuai format dapat memerlukan konfirmasi tambahan dari Anda sebelum dimasukkan.',
        ],
      },
      {
        id: 'ai',
        heading: '7. Fitur AI',
        bullets: [
          'Jawaban dan ringkasan AI adalah bantuan, bukan nasihat keuangan, pajak, hukum, atau profesional lainnya. Periksa sebelum Anda mengambil keputusan.',
          'Hasil pembacaan nota (OCR) dapat keliru; periksa angka sebelum disimpan.',
          'Penggunaan fitur AI dibatasi kuota bulanan sesuai paket Anda.',
          'Untuk menjawab, sebagian teks pertanyaan dan ringkasan data usaha Anda diproses oleh penyedia model AI pihak ketiga. Rinciannya ada di Kebijakan Privasi.',
        ],
      },
      {
        id: 'pajak',
        heading: '8. Pajak, penggajian, dan laporan',
        paragraphs: [
          'Perhitungan pajak, penggajian, dan laporan keuangan di Retalio adalah alat bantu. Sebagian perhitungan, termasuk PPh 21, bersifat estimasi. Anda atau konsultan pajak Anda bertanggung jawab memeriksa dan atas kebenaran pelaporan ke pihak berwenang.',
        ],
      },
      {
        id: 'larangan',
        heading: '9. Hal yang tidak boleh dilakukan',
        bullets: [
          'Memakai Retalio untuk kegiatan yang melanggar hukum.',
          'Mengakses data usaha lain atau mencoba melewati pembatasan akses, paket, atau kuota.',
          'Mengganggu, membebani secara berlebihan, memindai kerentanan tanpa izin tertulis, atau merekayasa balik layanan.',
          'Mengunggah kode berbahaya atau konten yang melanggar hak pihak lain.',
          'Membagikan akun kepada orang di luar usaha Anda atau menjual ulang layanan tanpa persetujuan tertulis kami.',
        ],
      },
      {
        id: 'ketersediaan',
        heading: '10. Ketersediaan dan dukungan',
        paragraphs: [
          'Kami berupaya menjaga layanan tetap tersedia, tetapi tidak menjamin layanan bebas gangguan. Pemeliharaan, gangguan jaringan, atau gangguan pihak ketiga dapat memengaruhi ketersediaan.',
          'Mode offline kasir menyimpan transaksi di perangkat Anda dan mengirimkannya saat koneksi pulih. Anda bertanggung jawab menjaga perangkat dan tidak menghapus data peramban sebelum transaksi terkirim.',
          'Dukungan diberikan melalui kontak tim yang tertera pada halaman Retalio atau penawaran Anda.',
        ],
      },
      {
        id: 'pihak-ketiga',
        heading: '11. Layanan pihak ketiga',
        paragraphs: [
          'Retalio memakai layanan pihak ketiga, misalnya infrastruktur cloud, penyedia model AI, notifikasi push, dan Google Form untuk formulir. Layanan itu memiliki ketentuannya sendiri, dan kami tidak bertanggung jawab atas layanan yang bukan milik kami.',
        ],
      },
      {
        id: 'kekayaan-intelektual',
        heading: '12. Hak kekayaan intelektual',
        paragraphs: [
          'Aplikasi Retalio, merek, tampilan, dan kodenya milik kami atau pemberi lisensi kami. Selama langganan aktif, Anda mendapat hak pakai yang terbatas, tidak eksklusif, dan tidak dapat dipindahtangankan untuk keperluan usaha Anda. Data Anda tetap milik Anda.',
        ],
      },
      {
        id: 'tanggung-jawab',
        heading: '13. Batas tanggung jawab',
        paragraphs: [
          'Sejauh diizinkan hukum, layanan diberikan sebagaimana adanya. Kami tidak bertanggung jawab atas kerugian tidak langsung, kehilangan keuntungan, atau kehilangan peluang usaha. Total tanggung jawab kami atas satu klaim dibatasi sebesar biaya langganan yang Anda bayar untuk periode berjalan, kecuali hukum menentukan lain.',
          'Ketentuan ini tidak membatasi hak Anda yang tidak dapat dikesampingkan menurut hukum, termasuk hak atas data pribadi Anda.',
        ],
      },
      {
        id: 'perubahan',
        heading: '14. Perubahan ketentuan',
        paragraphs: [
          `Kami dapat memperbarui Syarat & Ketentuan ini. Versi terbaru berlaku sejak tanggal yang tertera di halaman ini (saat ini ${LEGAL_EFFECTIVE_DATE}). Untuk perubahan yang berarti, kami akan memberi tahu lewat aplikasi atau email. Memakai layanan setelah perubahan berlaku berarti Anda menyetujuinya.`,
        ],
      },
      {
        id: 'hukum',
        heading: '15. Hukum yang berlaku dan penyelesaian sengketa',
        paragraphs: [
          'Ketentuan ini tunduk pada hukum Republik Indonesia. Perselisihan kami upayakan selesai secara musyawarah lebih dulu. Bila tidak tercapai, perselisihan diselesaikan melalui pengadilan yang berwenang di Indonesia.',
        ],
      },
      {
        id: 'kontak',
        heading: '16. Kontak',
        paragraphs: [contactParagraph(contact)],
      },
    ],
  };
}

export function buildPrivacy(contact: LegalContact): LegalDocument {
  return {
    title: 'Kebijakan Privasi',
    summary:
      'Data apa yang kami kumpulkan, untuk apa, siapa yang menerimanya, berapa lama disimpan, dan hak Anda atas data pribadi.',
    sections: [
      {
        id: 'cakupan',
        heading: '1. Cakupan dan peran kami',
        paragraphs: [
          providerLine(contact),
          'Kebijakan ini mengikuti prinsip Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi. Untuk data akun dan calon klien, kami menentukan tujuan dan cara pemrosesannya. Untuk data usaha yang Anda masukkan ke Retalio (termasuk data pelanggan dan karyawan Anda), Anda yang menentukan tujuannya dan kami memprosesnya atas nama Anda untuk menyediakan layanan.',
        ],
      },
      {
        id: 'data-dikumpulkan',
        heading: '2. Data yang kami kumpulkan',
        bullets: [
          'Data pendaftaran: nama usaha, jenis usaha, nama pemilik, alamat email, dan kata sandi. Kata sandi disimpan dalam bentuk sandi satu arah yang tidak dapat dibaca kembali.',
          'Data usaha yang Anda masukkan: produk, stok, transaksi, pelanggan, karyawan, pemasok, keuangan, dan data lain yang Anda catat di Retalio.',
          'Data teknis: alamat IP, jenis perangkat dan peramban pada catatan masuk dan jejak audit, untuk keamanan dan penelusuran kejadian.',
          'Formulir konsultasi: nama, nomor WhatsApp, email, dan keterangan usaha yang Anda isi di Google Form kami.',
          'Formulir data awal setelah berlangganan: data usaha yang Anda kirim untuk menyiapkan akun, yang dapat memuat data karyawan, pemasok, dan pelanggan Anda.',
          'Pertanyaan yang Anda ajukan ke asisten AI, dan gambar nota yang Anda unggah untuk dibaca (OCR).',
          'Newsletter: alamat email yang Anda tulis di formulir langganan pada footer halaman depan, beserta waktu persetujuan Anda.',
        ],
      },
      {
        id: 'tujuan',
        heading: '3. Untuk apa data dipakai',
        bullets: [
          'Menyediakan, mengamankan, dan memelihara layanan.',
          'Menghubungi calon klien dan menyiapkan penawaran atau konsultasi.',
          'Menyiapkan akun dari data awal yang Anda kirim.',
          'Menjawab pertanyaan, mengirim pemberitahuan layanan, dan memberi dukungan.',
          'Mengirim insight bisnis dan kabar pembaruan Retalio kepada yang berlangganan newsletter, setelah alamatnya dikonfirmasi lewat email.',
          'Mencegah penyalahgunaan dan memenuhi kewajiban hukum.',
        ],
        paragraphs: ['Kami tidak menjual data Anda dan tidak memakai pelacak iklan.'],
      },
      {
        id: 'ai',
        heading: '4. Fitur AI dan penyedia model',
        paragraphs: [
          'Sebagian pertanyaan dijawab langsung dari database Anda tanpa model AI. Untuk pertanyaan lain, teks pertanyaan dan ringkasan data usaha yang diperlukan dikirim ke penyedia model AI pihak ketiga untuk diproses. Kami menyamarkan nomor telepon, alamat email, NPWP, dan nomor kartu yang terdeteksi pada teks yang dikirim, tetapi sebaiknya jangan menulis kata sandi atau nomor kartu di pertanyaan Anda.',
          'Untuk analisis pengajuan calon klien, nama dan kontak tidak dikirim ke model; hanya keterangan usaha yang relevan. Gambar nota yang diunggah untuk OCR dikirim ke penyedia model visi.',
        ],
      },
      {
        id: 'berbagi',
        heading: '5. Dengan siapa data dibagikan',
        bullets: [
          'Penyedia infrastruktur cloud dan database tempat Retalio berjalan.',
          'Penyedia model AI untuk fitur AI (bagian 4).',
          'Penyedia notifikasi push, hanya bila fitur notifikasi diaktifkan.',
          'Google, untuk formulir konsultasi dan formulir data awal yang Anda isi di Google Form.',
          'Pihak berwenang bila diwajibkan oleh hukum.',
        ],
        paragraphs: ['Pihak-pihak itu hanya menerima data yang diperlukan untuk fungsinya dan terikat ketentuannya masing-masing.'],
      },
      {
        id: 'perangkat',
        heading: '6. Data di perangkat Anda',
        paragraphs: [
          'Retalio menyimpan sesi masuk, preferensi tampilan, dan antrean transaksi offline di penyimpanan peramban Anda agar aplikasi tetap bisa dipakai saat koneksi terputus. Ini bukan cookie pelacak. Menghapus data peramban sebelum transaksi offline terkirim dapat menghilangkan transaksi itu.',
        ],
      },
      {
        id: 'keamanan',
        heading: '7. Keamanan',
        bullets: [
          'Koneksi terenkripsi (HTTPS), kata sandi disimpan dalam bentuk sandi satu arah, dan sesi memiliki masa berlaku.',
          'Login dua langkah (2FA) tersedia, dan hak akses diatur per peran.',
          'Data tiap usaha dipisahkan dari usaha lain, dan tindakan penting dicatat di jejak audit.',
        ],
        paragraphs: ['Tidak ada sistem yang sepenuhnya kebal. Bila terjadi insiden yang berdampak pada data pribadi, kami akan memberi tahu pihak terdampak sesuai ketentuan hukum.'],
      },
      {
        id: 'retensi',
        heading: '8. Berapa lama data disimpan',
        bullets: [
          'Data usaha disimpan selama akun ada. Setelah langganan berakhir, data tetap tersimpan dalam mode baca saja, supaya Anda dapat melihat dan mengekspornya.',
          'Data calon klien (formulir konsultasi) disimpan selama diperlukan untuk tindak lanjut penawaran.',
          'Alamat newsletter disimpan sampai Anda berhenti berlangganan atau meminta penghapusan. Alamat yang berhenti tetap dicatat sebagai berhenti supaya tidak ditambahkan lagi tanpa persetujuan baru, kecuali Anda meminta penghapusan.',
          'Catatan keamanan dan jejak audit disimpan selama diperlukan untuk keamanan dan kewajiban hukum.',
          'Anda dapat meminta penghapusan data. Kami akan memprosesnya sesuai hukum; sebagian data dapat kami simpan bila hukum mewajibkan.',
        ],
      },
      {
        id: 'hak',
        heading: '9. Hak Anda',
        paragraphs: [
          'Anda berhak meminta akses, perbaikan, atau penghapusan data pribadi Anda, menarik persetujuan, serta menyampaikan keberatan atas pemrosesan tertentu, sesuai hukum yang berlaku. Ajukan permintaan melalui email di bagian Kontak; kami mungkin perlu memverifikasi identitas Anda lebih dulu.',
          'Bila Anda adalah pelanggan atau karyawan dari usaha yang memakai Retalio, ajukan permintaan data Anda kepada usaha tersebut karena merekalah yang mengelola data Anda di sistem.',
        ],
      },
      {
        id: 'anak',
        heading: '10. Anak-anak',
        paragraphs: ['Retalio ditujukan untuk pelaku usaha dan tidak ditujukan untuk anak di bawah 18 tahun.'],
      },
      {
        id: 'perubahan',
        heading: '11. Perubahan kebijakan',
        paragraphs: [
          `Kebijakan ini dapat diperbarui. Versi terbaru berlaku sejak tanggal yang tertera di halaman ini (saat ini ${LEGAL_EFFECTIVE_DATE}), dan perubahan yang berarti akan kami sampaikan lewat aplikasi atau email.`,
        ],
      },
      {
        id: 'kontak',
        heading: '12. Kontak',
        paragraphs: [contactParagraph(contact)],
      },
    ],
  };
}
