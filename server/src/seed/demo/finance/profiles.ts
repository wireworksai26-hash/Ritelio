/**
 * Profil keuangan tiga usaha contoh. Murni data (tanpa akses database) supaya rencananya bisa diuji.
 * Semua nama pemasok, rekening, dan nomor adalah rekaan. Nominal aset adalah nilai dasar yang
 * diskalakan mengikuti besar pendapatan yang benar-benar ada di buku besar (lihat plan.ts).
 */

export type ExpenseCategory = 'sewa' | 'listrik' | 'internet' | 'honor' | 'pemasaran' | 'perawatan' | 'umum';
export type BankRole = 'main' | 'utilities' | 'payroll';
export type VendorKey = 'sewa' | 'internet' | 'pemasaran' | 'perawatan';

export interface BankSpec {
  code: string;
  name: string;
  bankName: string;
  accountNumber: string;
  role: BankRole;
  /** akun COA: 1000 untuk rekening utama (kas dan bank dibukukan bersama), sisanya akun bank sendiri */
  ledgerCode: string;
  ledgerName: string;
}

export interface AssetSpec {
  code: string;
  name: string;
  category: string;
  location: string;
  /** posisi perolehan pada jendela rencana: 0 = awal, 1 = hari ini */
  frac: number;
  cost: number;
  salvagePct: number;
  lifeMonths: number;
  method: 'straight_line' | 'declining_balance';
  /** tingkat tahunan untuk saldo menurun */
  rate?: number;
  /** aset ini dilepas pada posisi jendela tertentu (dijual sebesar nilai bukunya) */
  disposeAt?: number;
}

export interface VendorSpec {
  key: VendorKey;
  name: string;
  contact: string;
  city: string;
  address: string;
  termDays: number;
}

export interface ExpenseRequestSpec {
  /** nomor dokumen pengajuan (jadi documentId approval) */
  id: string;
  note: string;
  /** rejected / approved / pending; approved dua tahap bila twoStep */
  outcome: 'approved' | 'rejected' | 'pending';
  twoStep?: boolean;
  /** hari lalu pengajuan dibuat */
  submittedDaysAgo: number;
  rejectNote?: string;
}

export interface FinanceProfile {
  key: string;
  /** perkiraan pendapatan bulanan sebagai acuan skala aset */
  refMonthlyRevenue: number;
  /** margin bersih sasaran bila pendapatan sudah ada */
  targetNetMargin: number;
  /** total beban bulanan (di luar penyusutan) bila belum ada pendapatan sama sekali */
  fallbackMonthly: number;
  banks: BankSpec[];
  vendors: VendorSpec[];
  /** porsi anggaran beban per kategori; dinormalisasi saat dipakai */
  shares: Record<ExpenseCategory, number>;
  memos: Record<'honor' | 'pemasaran' | 'perawatan' | 'umum', string[]>;
  sewaLabel: string;
  assets: AssetSpec[];
  /** perusahaan tambahan (anak usaha) untuk halaman konsolidasi */
  subsidiary: { code: string; name: string; legalName: string; taxId: string; salesShare: number; salesLabel: string; costLabel: string };
  expenseRequests: ExpenseRequestSpec[];
  reversalMemo: string;
}

const MANDIRI = (n: string): BankSpec => ({
  code: 'MDR-OPS',
  name: 'Mandiri Operasional',
  bankName: 'Bank Mandiri',
  accountNumber: n,
  role: 'utilities',
  ledgerCode: '1010',
  ledgerName: 'Bank Mandiri',
});

const BCA = (n: string): BankSpec => ({
  code: 'BCA-UTAMA',
  name: 'BCA Rekening Utama',
  bankName: 'Bank Central Asia',
  accountNumber: n,
  role: 'main',
  ledgerCode: '1000',
  ledgerName: 'Kas',
});

const KOPI_SENJA: FinanceProfile = {
  key: 'kopisenja',
  refMonthlyRevenue: 120_000_000,
  targetNetMargin: 0.15,
  fallbackMonthly: 6_000_000,
  banks: [BCA('0731-558-210'), MANDIRI('133-00-4470215-9')],
  vendors: [
    { key: 'sewa', name: 'PT Properti Senopati Mandiri', contact: 'Hendri Gunawan', city: 'Jakarta', address: 'Jl. Senopati No. 8, Jakarta Selatan', termDays: 7 },
    { key: 'internet', name: 'PT Jaringan Nusantara Net', contact: 'Layanan Bisnis', city: 'Jakarta', address: 'Jl. Gatot Subroto Kav. 21, Jakarta Selatan', termDays: 14 },
    { key: 'pemasaran', name: 'Studio Kreatif Lintas Rasa', contact: 'Nadia Pramesti', city: 'Bandung', address: 'Jl. Braga No. 40, Bandung', termDays: 14 },
    { key: 'perawatan', name: 'CV Teknik Mesin Kopi Prima', contact: 'Ujang Sudrajat', city: 'Bandung', address: 'Jl. Soekarno-Hatta No. 330, Bandung', termDays: 7 },
  ],
  shares: { sewa: 0.34, listrik: 0.1, internet: 0.04, honor: 0.14, pemasaran: 0.16, perawatan: 0.1, umum: 0.08 },
  memos: {
    honor: ['Honor barista pengganti akhir pekan', 'Upah harian kru event kopi', 'Honor barista lepas, shift malam'],
    pemasaran: ['Iklan Instagram dan konten promo', 'Cetak banner dan brosur promo', 'Kolaborasi influencer lokal', 'Endorse komunitas pecinta kopi'],
    perawatan: ['Servis mesin espresso', 'Penggantian seal dan filter mesin', 'Perbaikan AC outlet', 'Servis grinder dan kalibrasi'],
    umum: ['Galon dan gas elpiji', 'Perlengkapan kebersihan outlet', 'Parkir dan bensin operasional', 'Fotokopi dan alat tulis', 'Konsumsi rapat mingguan', 'Lampu dan stopkontak outlet'],
  },
  sewaLabel: 'Sewa Outlet Senopati dan Dago',
  assets: [
    { code: 'DEMO-AST-001', name: 'Mesin Espresso 2 Group', category: 'Peralatan Dapur', location: 'Outlet Senopati', frac: 0.0, cost: 84_000_000, salvagePct: 0.1, lifeMonths: 96, method: 'straight_line' },
    { code: 'DEMO-AST-002', name: 'Grinder Komersial', category: 'Peralatan Dapur', location: 'Outlet Senopati', frac: 0.04, cost: 16_500_000, salvagePct: 0.08, lifeMonths: 60, method: 'straight_line' },
    { code: 'DEMO-AST-003', name: 'Showcase Pendingin', category: 'Peralatan Dapur', location: 'Outlet Dago', frac: 0.12, cost: 11_800_000, salvagePct: 0.05, lifeMonths: 60, method: 'straight_line' },
    { code: 'DEMO-AST-004', name: 'Furnitur dan Dekorasi Outlet Dago', category: 'Furnitur', location: 'Outlet Dago', frac: 0.2, cost: 23_000_000, salvagePct: 0, lifeMonths: 48, method: 'straight_line' },
    { code: 'DEMO-AST-005', name: 'Sepeda Motor Pengantar', category: 'Kendaraan', location: 'Outlet Senopati', frac: 0.34, cost: 24_500_000, salvagePct: 0.1, lifeMonths: 60, method: 'declining_balance', rate: 0.25 },
    { code: 'DEMO-AST-006', name: 'Tablet Kasir Lama', category: 'Peralatan Kantor', location: 'Outlet Senopati', frac: 0.02, cost: 6_500_000, salvagePct: 0.05, lifeMonths: 36, method: 'straight_line', disposeAt: 0.62 },
  ],
  subsidiary: { code: 'BDG', name: 'Kopi Senja Bandung', legalName: 'PT Kopi Senja Dago Mandiri', taxId: '91.234.567.8-423.000', salesShare: 0.28, salesLabel: 'Penjualan outlet Dago', costLabel: 'Bahan baku outlet Dago' },
  expenseRequests: [
    { id: 'EXP-0001', note: 'Sponsor festival kopi Bandung, Rp 12.500.000', outcome: 'rejected', submittedDaysAgo: 34, rejectNote: 'Di luar anggaran pemasaran kuartal ini.' },
    { id: 'EXP-0002', note: 'Pembelian mesin pembuat es kristal, Rp 18.900.000', outcome: 'approved', twoStep: true, submittedDaysAgo: 21 },
    { id: 'EXP-0003', note: 'Renovasi area duduk Outlet Senopati, Rp 27.000.000', outcome: 'pending', submittedDaysAgo: 3 },
  ],
  reversalMemo: 'Iklan media sosial salah akun',
};

const ROTI_NUSANTARA: FinanceProfile = {
  key: 'rotinusantara',
  refMonthlyRevenue: 180_000_000,
  targetNetMargin: 0.13,
  fallbackMonthly: 9_000_000,
  banks: [
    BCA('0654-221-908'),
    MANDIRI('155-00-2210874-3'),
    { code: 'BRI-HONOR', name: 'BRI Honor dan Upah', bankName: 'Bank Rakyat Indonesia', accountNumber: '0372-01-004455-50-1', role: 'payroll', ledgerCode: '1020', ledgerName: 'Bank BRI' },
  ],
  vendors: [
    { key: 'sewa', name: 'CV Griya Niaga Depok', contact: 'Bambang Heryanto', city: 'Depok', address: 'Jl. Margonda Raya No. 298, Depok', termDays: 7 },
    { key: 'internet', name: 'PT Jaringan Nusantara Net', contact: 'Layanan Bisnis', city: 'Jakarta', address: 'Jl. Gatot Subroto Kav. 21, Jakarta Selatan', termDays: 14 },
    { key: 'pemasaran', name: 'Biro Promosi Rasa Kita', contact: 'Fajar Ramadhan', city: 'Depok', address: 'Jl. Kukusan Raya No. 12, Depok', termDays: 14 },
    { key: 'perawatan', name: 'PT Servis Oven Industri Jaya', contact: 'Teknisi Lapangan', city: 'Bekasi', address: 'Jl. Raya Narogong Km 7, Bekasi', termDays: 7 },
  ],
  shares: { sewa: 0.26, listrik: 0.18, internet: 0.03, honor: 0.14, pemasaran: 0.12, perawatan: 0.17, umum: 0.1 },
  memos: {
    honor: ['Upah harian tenaga angkut bahan baku', 'Honor kru produksi tambahan (lembur panen pesanan)', 'Upah harian pengemas musiman'],
    pemasaran: ['Spanduk dan brosur toko', 'Katalog produk untuk pelanggan korporat', 'Iklan marketplace dan media sosial', 'Sampel produk untuk calon pelanggan hotel'],
    perawatan: ['Servis oven rotary dan burner', 'Penggantian belt mixer spiral', 'Perbaikan proofer dan termostat', 'Servis kompresor chiller bahan'],
    umum: ['Gas elpiji industri', 'Perlengkapan kebersihan dapur', 'Bensin dan tol pengiriman', 'Alat tulis dan fotokopi', 'Konsumsi tim produksi', 'Sarung tangan dan masker produksi'],
  },
  sewaLabel: 'Sewa Dapur Pusat dan Gerai Margonda',
  assets: [
    { code: 'DEMO-AST-001', name: 'Oven Rotary 16 Tray', category: 'Mesin Produksi', location: 'Toko & Dapur Pusat', frac: 0.0, cost: 145_000_000, salvagePct: 0.1, lifeMonths: 120, method: 'straight_line' },
    { code: 'DEMO-AST-002', name: 'Mixer Spiral 60 kg', category: 'Mesin Produksi', location: 'Toko & Dapur Pusat', frac: 0.03, cost: 62_000_000, salvagePct: 0.1, lifeMonths: 96, method: 'straight_line' },
    { code: 'DEMO-AST-003', name: 'Proofer 24 Tray', category: 'Mesin Produksi', location: 'Toko & Dapur Pusat', frac: 0.1, cost: 28_000_000, salvagePct: 0.08, lifeMonths: 84, method: 'straight_line' },
    { code: 'DEMO-AST-004', name: 'Mobil Box Pengiriman', category: 'Kendaraan', location: 'Toko & Dapur Pusat', frac: 0.3, cost: 168_000_000, salvagePct: 0.15, lifeMonths: 96, method: 'declining_balance', rate: 0.2 },
    { code: 'DEMO-AST-005', name: 'Etalase Kaca Gerai Margonda', category: 'Furnitur', location: 'Gerai Margonda', frac: 0.18, cost: 15_500_000, salvagePct: 0, lifeMonths: 60, method: 'straight_line' },
    { code: 'DEMO-AST-006', name: 'Mixer Planetary Lama', category: 'Mesin Produksi', location: 'Toko & Dapur Pusat', frac: 0.02, cost: 22_000_000, salvagePct: 0.05, lifeMonths: 60, method: 'straight_line', disposeAt: 0.6 },
  ],
  subsidiary: { code: 'KTR', name: 'Roti Nusantara Katering', legalName: 'PT Roti Nusantara Katering Prima', taxId: '92.345.678.9-412.000', salesShare: 0.22, salesLabel: 'Penjualan katering korporat', costLabel: 'Bahan baku katering' },
  expenseRequests: [
    { id: 'EXP-0001', note: 'Sewa booth bazar Ramadan, Rp 9.000.000', outcome: 'approved', submittedDaysAgo: 40 },
    { id: 'EXP-0002', note: 'Pembelian rak pendingin tambahan, Rp 21.500.000', outcome: 'rejected', submittedDaysAgo: 19, rejectNote: 'Tunggu hasil servis chiller lama dulu.' },
    { id: 'EXP-0003', note: 'Pelatihan sertifikasi halal tim produksi, Rp 6.800.000', outcome: 'pending', submittedDaysAgo: 2 },
    { id: 'EXP-0004', note: 'Penggantian conveyor pendingin roti, Rp 38.000.000', outcome: 'approved', twoStep: true, submittedDaysAgo: 12 },
  ],
  reversalMemo: 'Cetak katalog produk salah akun',
};

const LAUNDRY_SEGAR: FinanceProfile = {
  key: 'laundrysegar',
  refMonthlyRevenue: 90_000_000,
  targetNetMargin: 0.2,
  fallbackMonthly: 4_500_000,
  banks: [BCA('0412-771-336'), MANDIRI('127-00-5521690-4')],
  vendors: [
    { key: 'sewa', name: 'Koperasi Properti Margonda Jaya', contact: 'Sutrisno', city: 'Depok', address: 'Jl. Margonda Raya No. 118, Depok', termDays: 7 },
    { key: 'internet', name: 'PT Jaringan Nusantara Net', contact: 'Layanan Bisnis', city: 'Jakarta', address: 'Jl. Gatot Subroto Kav. 21, Jakarta Selatan', termDays: 14 },
    { key: 'pemasaran', name: 'Agensi Digital Bersinar', contact: 'Putra Aditya', city: 'Depok', address: 'Jl. Kukusan Teknik No. 5, Depok', termDays: 14 },
    { key: 'perawatan', name: 'UD Servis Mesin Cuci Sentosa', contact: 'Ahmad Fauzi', city: 'Depok', address: 'Jl. Raya Sawangan No. 60, Depok', termDays: 7 },
  ],
  shares: { sewa: 0.27, listrik: 0.2, internet: 0.03, honor: 0.14, pemasaran: 0.1, perawatan: 0.16, umum: 0.1 },
  memos: {
    honor: ['Upah harian setrika tambahan', 'Honor kurir lepas akhir pekan', 'Upah harian operator pengganti'],
    pemasaran: ['Brosur dan stiker promo kos-kosan', 'Iklan Google Maps dan media sosial', 'Paket promo langganan hotel dan klinik', 'Cetak kartu member'],
    perawatan: ['Servis mesin cuci industri', 'Penggantian elemen pemanas pengering', 'Perbaikan boiler setrika uap', 'Penggantian bearing drum'],
    umum: ['Gas elpiji boiler', 'Pembelian hanger cadangan', 'Bensin kurir antar-jemput', 'Plastik dan label nota', 'Air galon dan kebersihan', 'Keranjang cucian pengganti'],
  },
  sewaLabel: 'Sewa Cabang Margonda dan Kukusan',
  assets: [
    { code: 'DEMO-AST-001', name: 'Mesin Cuci Industri 20 kg (1)', category: 'Mesin Laundry', location: 'Cabang Margonda', frac: 0.0, cost: 54_000_000, salvagePct: 0.1, lifeMonths: 96, method: 'straight_line' },
    { code: 'DEMO-AST-002', name: 'Mesin Cuci Industri 20 kg (2)', category: 'Mesin Laundry', location: 'Cabang Kukusan', frac: 0.05, cost: 54_000_000, salvagePct: 0.1, lifeMonths: 96, method: 'straight_line' },
    { code: 'DEMO-AST-003', name: 'Pengering Gas 25 kg', category: 'Mesin Laundry', location: 'Cabang Margonda', frac: 0.1, cost: 41_000_000, salvagePct: 0.08, lifeMonths: 84, method: 'straight_line' },
    { code: 'DEMO-AST-004', name: 'Setrika Uap dan Boiler', category: 'Mesin Laundry', location: 'Cabang Kukusan', frac: 0.22, cost: 19_000_000, salvagePct: 0.05, lifeMonths: 60, method: 'straight_line' },
    { code: 'DEMO-AST-005', name: 'Sepeda Motor Antar-Jemput', category: 'Kendaraan', location: 'Cabang Margonda', frac: 0.3, cost: 22_000_000, salvagePct: 0.1, lifeMonths: 60, method: 'declining_balance', rate: 0.25 },
    { code: 'DEMO-AST-006', name: 'Mesin Cuci Bekas (cadangan)', category: 'Mesin Laundry', location: 'Cabang Kukusan', frac: 0.02, cost: 17_000_000, salvagePct: 0.05, lifeMonths: 48, method: 'straight_line', disposeAt: 0.6 },
  ],
  subsidiary: { code: 'KKS', name: 'Laundry Segar Jaya Kukusan', legalName: 'PT Segar Jaya Kukusan', taxId: '93.456.789.0-412.000', salesShare: 0.3, salesLabel: 'Pendapatan jasa cabang Kukusan', costLabel: 'Deterjen dan perlengkapan cabang' },
  expenseRequests: [
    { id: 'EXP-0001', note: 'Pembelian mesin pengering ketiga, Rp 41.000.000', outcome: 'pending', submittedDaysAgo: 4 },
    { id: 'EXP-0002', note: 'Kontrak iklan billboard Margonda, Rp 15.000.000', outcome: 'rejected', submittedDaysAgo: 26, rejectNote: 'Biaya terlalu tinggi, coba iklan digital dulu.' },
    { id: 'EXP-0003', note: 'Pengecatan ulang gerai Margonda, Rp 7.500.000', outcome: 'approved', submittedDaysAgo: 15 },
  ],
  reversalMemo: 'Cetak kartu member salah akun',
};

export const FINANCE_PROFILES: Record<string, FinanceProfile> = {
  kopisenja: KOPI_SENJA,
  rotinusantara: ROTI_NUSANTARA,
  laundrysegar: LAUNDRY_SEGAR,
};

/** Akun COA baru yang dibutuhkan modul keuangan; COA bawaan pendaftaran belum memilikinya. */
export const EXTRA_ACCOUNTS: Array<{ code: string; name: string; type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' }> = [
  { code: '1010', name: 'Bank Mandiri', type: 'asset' },
  { code: '1020', name: 'Bank BRI', type: 'asset' },
  { code: '1300', name: 'Aset Tetap', type: 'asset' },
  { code: '1390', name: 'Akumulasi Penyusutan', type: 'asset' },
  { code: '3000', name: 'Modal Awal', type: 'equity' },
  { code: '6200', name: 'Beban Penyusutan', type: 'expense' },
  { code: '6600', name: 'Beban Sewa', type: 'expense' },
  { code: '6610', name: 'Beban Listrik dan Air', type: 'expense' },
  { code: '6620', name: 'Beban Internet dan Telepon', type: 'expense' },
  { code: '6630', name: 'Beban Upah Harian dan Honor', type: 'expense' },
  { code: '6640', name: 'Beban Pemasaran', type: 'expense' },
  { code: '6650', name: 'Beban Perawatan dan Perbaikan', type: 'expense' },
  { code: '6660', name: 'Beban Administrasi Bank', type: 'expense' },
  { code: '6670', name: 'Beban Perlengkapan dan Umum', type: 'expense' },
];

/** Kode akun beban buatan domain ini; dikeluarkan dari hitungan "beban lain" saat menakar anggaran. */
export const OWN_EXPENSE_CODES = ['6200', '6600', '6610', '6620', '6630', '6640', '6650', '6660', '6670'];

export const CATEGORY_ACCOUNT: Record<ExpenseCategory, string> = {
  sewa: '6600',
  listrik: '6610',
  internet: '6620',
  honor: '6630',
  pemasaran: '6640',
  perawatan: '6650',
  umum: '6670',
};
