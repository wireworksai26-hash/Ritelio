import { INDUSTRY_TEMPLATES } from '../config/industryTemplates';
import type { LegalContact } from '../config/legal';
import { MODULES } from '../components/landing/ModuleGrid';
import { NAMES as BUSINESS_TYPES } from '../components/landing/LogoWall';
import { VALUES } from '../components/landing/CoreValues';
import { TRUST_ITEMS } from '../components/landing/TrustSecurity';
import type { LegalSection, SectionLink } from './legal';

// Isi halaman informasi di menu footer: Tentang, Panduan, Template, dan Bantuan.
// Sebisa mungkin teks diambil dari data yang sama dengan halaman depan dan pendaftaran (modul, nilai, keamanan,
// jenis usaha, template), supaya tidak ada dua versi yang bisa berbeda. Hanya hal yang benar-benar ada di
// aplikasi yang ditulis di sini.

export interface InfoDocument {
  title: string;
  summary: string;
  sections: LegalSection[];
}

/** Saluran kontak yang tersedia; yang belum diatur di konfigurasi tidak disertakan. */
export interface ContactChannels {
  email: string;
  whatsappUrl: string | null;
  whatsappLabel: string;
  formUrl: string | null;
}

export function buildAbout(contact: LegalContact): InfoDocument {
  const sections: LegalSection[] = [
    {
      id: 'apa-itu',
      heading: '1. Apa itu Retalio',
      paragraphs: [
        'Retalio adalah aplikasi kasir dan ERP berbasis web untuk usaha kecil dan menengah di Indonesia. Kasir, stok, pembelian, keuangan, sampai SDM dan produksi ada dalam satu tempat, sehingga angka penjualan, stok, dan pembukuan berasal dari data yang sama.',
        ...(contact.companyName ? [`Layanan ini diselenggarakan oleh ${contact.companyName}${contact.companyAddress ? `, ${contact.companyAddress}` : ''}.`] : []),
      ],
    },
    {
      id: 'untuk-siapa',
      heading: '2. Dirancang untuk siapa',
      paragraphs: ['Jenis usaha yang kami rancang untuk didukung (ini bukan daftar pelanggan):'],
      bullets: BUSINESS_TYPES,
      links: [{ label: 'Lihat template usaha', to: '/template' }],
    },
    {
      id: 'modul',
      heading: '3. Apa saja yang ada',
      paragraphs: ['Hanya fitur yang sudah ada di aplikasi yang kami tampilkan. Ringkasan per modul:'],
      bullets: MODULES.map((m) => `${m.title}: ${m.summary}`),
      links: [{ label: 'Lihat semua modul dan harga', to: '/#modul' }],
    },
    {
      id: 'cara-kerja',
      heading: '4. Cara kami merancangnya',
      bullets: VALUES.map((v) => `${v.heading} ${v.body}`),
    },
    {
      id: 'keamanan',
      heading: '5. Keamanan',
      paragraphs: ['Setiap klaim keamanan di bawah ini bisa ditelusuri ke cara kerja aplikasi:'],
      bullets: TRUST_ITEMS.map((t) => `${t.eyebrow.charAt(0)}${t.eyebrow.slice(1).toLowerCase()}: ${t.body}`),
      links: [
        { label: 'Kebijakan Privasi', to: '/privasi' },
        { label: 'Syarat & Ketentuan', to: '/syarat-ketentuan' },
      ],
    },
    {
      id: 'mulai',
      heading: '6. Mulai dari mana',
      paragraphs: ['Coba sendiri lewat pendaftaran, atau ceritakan kebutuhan usahamu dan tim kami membantu memilih paket yang cocok.'],
      links: [
        { label: 'Daftar dan coba', to: '/onboarding' },
        { label: 'Baca panduan memulai', to: '/panduan' },
        { label: 'Hubungi tim sales', to: '/#kontak' },
      ],
    },
  ];
  return {
    title: 'Tentang Retalio',
    summary: 'Apa itu Retalio, untuk siapa, apa saja isinya, dan bagaimana kami menjaga keamanannya.',
    sections,
  };
}

export function buildGuide(): InfoDocument {
  return {
    title: 'Panduan memulai',
    summary: 'Dari daftar sampai transaksi pertama, lalu apa yang terjadi setelah berlangganan.',
    sections: [
      {
        id: 'siapkan',
        heading: '1. Siapkan dulu',
        bullets: [
          'Nama usaha dan nama pemilik akun.',
          'Jenis usaha: Retail, Manufaktur, atau Jasa (lihat halaman Template).',
          'Nama dan alamat outlet pertama.',
          'Minimal satu produk beserta harga jualnya. Produk lain bisa ditambah atau diimpor dari Excel nanti.',
        ],
        links: [{ label: 'Lihat template usaha', to: '/template' }],
      },
      {
        id: 'daftar',
        heading: '2. Daftar dan atur usaha',
        paragraphs: ['Pendaftaran berjalan dalam beberapa langkah singkat:'],
        bullets: [
          'Tentang bisnismu: nama usaha, pemilik, email, dan kata sandi.',
          'Template industri: menentukan modul yang aktif. Bisa diubah kapan saja tanpa menghapus data.',
          'Outlet pertama: lokasi fisik tempat kamu berjualan. Outlet lain bisa ditambah nanti dari Pengaturan.',
          'Produk pertama: satu produk cukup untuk mulai berjualan.',
          'Pilih paket langganan.',
          'Install aplikasi: Retalio adalah PWA, jadi bisa dipasang langsung dari peramban tanpa toko aplikasi.',
        ],
        links: [{ label: 'Mulai daftar', to: '/onboarding' }],
      },
      {
        id: 'kasir',
        heading: '3. Mulai berjualan',
        bullets: [
          'Buka menu Kasir, pilih produk, lalu bayar. Struk bisa dicetak.',
          'Kalau internet putus, kasir tetap jalan: transaksi disimpan di perangkat dan dikirim otomatis saat kembali online. Jangan menghapus data peramban sebelum transaksi terkirim.',
          'Modul lain seperti akuntansi dan pengadaan butuh koneksi internet.',
        ],
      },
      {
        id: 'tim',
        heading: '4. Tambahkan tim',
        paragraphs: [
          'Pemilik akun mengatur pengguna lain dan hak aksesnya per peran. Kasir hanya melihat kasir, staf gudang melihat stok, dan seterusnya. Aturan ini ditegakkan di server.',
          'Login dua langkah (2FA) tersedia untuk akunmu dan kami anjurkan diaktifkan.',
        ],
      },
      {
        id: 'ai',
        heading: '5. Asisten AI',
        paragraphs: [
          'Tanyakan data usahamu dengan bahasa sehari-hari. Pertanyaan umum dijawab langsung dari datamu beserta sumbernya. Pertanyaan lain dijawab dengan bantuan model AI sesuai kuota paketmu. Jawaban AI adalah bantuan, jadi periksa sebelum mengambil keputusan.',
        ],
      },
      {
        id: 'berlangganan',
        heading: '6. Setelah berlangganan',
        bullets: [
          'Tim sales mengirim tautan formulir data awal (produk, stok, karyawan, pemasok, saldo awal, pajak, dan metode pembayaran). Isi yang kamu punya; sisanya bisa menyusul.',
          'Tim kami menyiapkan data itu di akunmu. Kamu memeriksanya sebelum dipakai.',
          'Kalau ada yang perlu direvisi, sampaikan lewat chat dengan tim sales. Cakupan revisi mengikuti penawaranmu.',
        ],
      },
      {
        id: 'berakhir',
        heading: '7. Kalau masa percobaan atau langganan berakhir',
        paragraphs: [
          'Akunmu tidak dihapus. Kamu tetap bisa masuk, melihat, dan mengekspor data, tetapi belum bisa mencatat transaksi baru sampai langganan aktif lagi. Transaksi kasir yang sudah tersimpan di perangkat tidak dibuang; ia terkirim setelah akun aktif kembali.',
        ],
        links: [
          { label: 'Pertanyaan umum', to: '/bantuan' },
          { label: 'Syarat & Ketentuan', to: '/syarat-ketentuan' },
        ],
      },
    ],
  };
}

export function buildTemplates(): InfoDocument {
  return {
    title: 'Template usaha',
    summary: 'Template menentukan modul yang aktif sejak awal. Kamu bisa mengubahnya kapan saja tanpa menghapus data.',
    sections: [
      ...INDUSTRY_TEMPLATES.map((t, i) => ({
        id: t.key,
        heading: `${i + 1}. ${t.title}`,
        paragraphs: [`Modul aktif: ${t.desc}. Asisten AI Retalio Intelligence juga tersedia di semua template.`],
        bullets: t.examples.map((e) => `Cocok untuk: ${e}`),
      })),
      {
        id: 'ganti',
        heading: `${INDUSTRY_TEMPLATES.length + 1}. Mengganti atau menambah modul`,
        paragraphs: [
          'Template hanyalah titik awal. Modul bisa dinyalakan atau dimatikan dari Pengaturan tanpa menghapus data yang sudah ada.',
        ],
        links: [
          { label: 'Daftar dan pilih template', to: '/onboarding' },
          { label: 'Baca panduan memulai', to: '/panduan' },
        ],
      },
    ],
  };
}

export function buildHelp(channels: ContactChannels): InfoDocument {
  const contactLinks: SectionLink[] = [
    ...(channels.formUrl ? [{ label: 'Isi formulir konsultasi', href: channels.formUrl }] : []),
    ...(channels.whatsappUrl ? [{ label: `WhatsApp ${channels.whatsappLabel}`, href: channels.whatsappUrl }] : []),
    { label: channels.email, href: `mailto:${channels.email}` },
  ];
  return {
    title: 'Bantuan',
    summary: 'Jawaban untuk pertanyaan yang paling sering muncul, dan cara menghubungi tim kami.',
    sections: [
      {
        id: 'mulai',
        heading: '1. Bagaimana cara mulai?',
        paragraphs: ['Daftar lewat halaman pendaftaran dan ikuti langkahnya, atau lihat panduan memulai. Kalau ragu memilih paket, ceritakan usahamu kepada tim sales.'],
        links: [
          { label: 'Daftar', to: '/onboarding' },
          { label: 'Panduan memulai', to: '/panduan' },
        ],
      },
      {
        id: 'percobaan',
        heading: '2. Apakah ada masa percobaan?',
        paragraphs: ['Pendaftar baru dapat memperoleh masa percobaan. Lama dan isinya tertera saat pendaftaran.'],
      },
      {
        id: 'berakhir',
        heading: '3. Apa yang terjadi saat masa percobaan atau langganan berakhir?',
        paragraphs: ['Akun beralih ke mode baca saja: kamu masih bisa masuk, melihat, dan mengekspor data, tetapi belum bisa mencatat transaksi baru. Data tidak dihapus. Setelah langganan aktif lagi, akun kembali normal.'],
      },
      {
        id: 'offline',
        heading: '4. Bagaimana kalau internet putus saat berjualan?',
        paragraphs: ['Kasir tetap bisa dipakai. Transaksi disimpan di perangkat dan terkirim otomatis saat online. Jangan menghapus data peramban sebelum transaksi terkirim. Modul lain, seperti akuntansi dan pengadaan, membutuhkan koneksi internet.'],
      },
      {
        id: 'paket',
        heading: '5. Bagaimana mengganti paket?',
        paragraphs: ['Perubahan paket dilakukan oleh tim Retalio. Hubungi tim sales dan sebutkan paket yang kamu inginkan.'],
      },
      {
        id: 'ai',
        heading: '6. Bagaimana fitur AI bekerja?',
        paragraphs: ['Pertanyaan umum dijawab langsung dari data usahamu tanpa model AI. Pertanyaan lain memakai model AI dengan kuota bulanan sesuai paket. Jawaban AI adalah bantuan dan perlu kamu periksa sebelum dipakai mengambil keputusan.'],
      },
      {
        id: 'data-awal',
        heading: '7. Bagaimana menyiapkan data awal setelah berlangganan?',
        paragraphs: ['Tim sales mengirim tautan formulir data awal. Isi sebisanya, lalu tim kami menyiapkan datanya di akunmu dan kamu memeriksanya. Revisi disampaikan lewat chat dengan tim sales.'],
      },
      {
        id: 'akun',
        heading: '8. Ada masalah dengan akun atau kata sandi?',
        paragraphs: ['Hubungi tim kami lewat salah satu kontak di bawah, sebutkan email akunmu. Kami akan membantu secara langsung.'],
      },
      {
        id: 'privasi',
        heading: '9. Bagaimana data saya dilindungi?',
        paragraphs: ['Data tiap usaha dipisahkan, akses diatur per peran, dan tindakan penting tercatat. Rinciannya ada di Kebijakan Privasi.'],
        links: [
          { label: 'Kebijakan Privasi', to: '/privasi' },
          { label: 'Syarat & Ketentuan', to: '/syarat-ketentuan' },
        ],
      },
      {
        id: 'kontak',
        heading: '10. Masih butuh bantuan?',
        paragraphs: ['Hubungi tim kami lewat salah satu saluran berikut.'],
        links: contactLinks,
      },
    ],
  };
}
