// Teks bantuan asisten: apa yang pasti bisa dijawab dan batasnya.
// Daftar "bisa dijawab" mengikuti jalur cepat di server (server/src/modules/ai/ai-router.service.ts);
// perbarui keduanya bersamaan bila intent jalur cepat bertambah.
export const assistantCanAnswer = [
  'Penjualan hari ini atau per periode',
  'Produk terlaris',
  'Stok yang menipis',
  'Laba rugi dan proyeksi arus kas',
  'Perbandingan antar outlet',
  'Ringkasan harian dan status sinkron',
  'Cara memakai aplikasi, mis. "cara tambah produk"',
];

export const assistantLimits = [
  'Pertanyaan di luar daftar dijawab model AI hanya dari ringkasan singkat data tokomu, bukan seluruh data. Hasilnya bisa umum atau kurang tepat.',
  'Tiap pertanyaan berdiri sendiri. AI tidak mengingat pertanyaan sebelumnya, jadi tulis pertanyaan selengkapnya.',
  'AI hanya memberi saran. Ia tidak mengubah data dan tidak membuat pesanan.',
  'Butuh internet. Pemakaian model AI dibatasi kuota bulanan sesuai paket.',
];
