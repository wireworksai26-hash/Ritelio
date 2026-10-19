// Data seed tiga usaha dari tiga lini bisnis. Murni data (tanpa akses database) supaya bisa diuji.
// Semua nama orang, perusahaan, telepon, dan email adalah rekaan. Domain email memakai TLD ".test"
// yang dicadangkan RFC 2606 dan tidak pernah ada di internet.

export type IndustryTemplate = 'retail' | 'manufacturing' | 'services';
export type StaffRole = 'admin' | 'manager' | 'cashier' | 'staff';
export type ProductKind = 'goods' | 'raw_material' | 'semi_finished' | 'service';

export interface StaffSeed {
  role: StaffRole;
  name: string;
  /** bagian lokal email; domain mengikuti usaha */
  local: string;
}

export interface OutletSeed {
  name: string;
  address: string;
}

export interface PartySeed {
  name: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  paymentTermDays: number;
  creditLimit?: number;
}

export interface ProductSeed {
  sku: string;
  name: string;
  category: string;
  kind?: ProductKind;
  unit: string;
  sell: number;
  cost?: number;
  /** stok awal di gudang outlet pertama; kosong untuk jasa */
  stock?: number;
  reorderPoint?: number;
  reorderQty?: number;
  /** nama pemasok pilihan (harus ada di `suppliers`) */
  supplier?: string;
}

export interface BomSeed {
  /** sku produk jadi */
  product: string;
  name: string;
  outputQty: number;
  lines: Array<{ sku: string; qty: number; scrapPercent?: number }>;
}

export interface WorkCenterSeed {
  code: string;
  name: string;
  kind: 'machine' | 'facility' | 'labor';
  capacityPerDay: number;
  capacityMinutes: number;
  hourlyRate: number;
}

export interface DepartmentSeed {
  code: string;
  name: string;
}

export interface PositionSeed {
  code: string;
  name: string;
  department: string;
  baseSalary: number;
}

export interface EmployeeSeed {
  no: string;
  name: string;
  position: string;
  type: 'permanent' | 'contract' | 'intern';
  hired: string;
  salary: number;
}

export interface BusinessSeed {
  key: string;
  businessName: string;
  industry: IndustryTemplate;
  plan: 'basic' | 'plus_ai' | 'custom';
  aiQuota: number;
  /** domain email akun usaha ini */
  domain: string;
  ownerName: string;
  staff: StaffSeed[];
  outlets: OutletSeed[];
  categories: string[];
  suppliers: PartySeed[];
  customers: PartySeed[];
  products: ProductSeed[];
  workCenters?: WorkCenterSeed[];
  boms?: BomSeed[];
  departments: DepartmentSeed[];
  positions: PositionSeed[];
  employees: EmployeeSeed[];
}

/** Barcode EAN-13 valid (digit pemeriksa dihitung), supaya aman dipindai/diuji di pemindai. */
export function ean13(body12: string): string {
  if (!/^\d{12}$/.test(body12)) throw new Error(`Badan EAN-13 harus 12 digit: ${body12}`);
  const sum = body12.split('').reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body12 + String((10 - (sum % 10)) % 10);
}

/** Barcode unik per usaha dan urutan produk: 899 + digit usaha + 8 digit urutan + pemeriksa. */
export function barcodeFor(businessDigit: number, seq: number): string {
  return ean13(`899${businessDigit}${String(seq).padStart(8, '0')}`);
}

/** Bagian lokal email dari nama kontak: "Dr. Andini" -> "dr.andini" (tanpa titik di ujung atau ganda). */
export function emailLocal(contact: string): string {
  return contact
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

const party = (
  name: string,
  contact: string,
  slug: string,
  phone: string,
  city: string,
  address: string,
  paymentTermDays: number,
  creditLimit?: number,
): PartySeed => ({
  name,
  contact,
  email: `${emailLocal(contact)}@${slug}.example.com`,
  phone,
  city,
  address,
  paymentTermDays,
  ...(creditLimit ? { creditLimit } : {}),
});

// ───────────────────────────── 1. Kopi Senja (retail, kafe) ─────────────────────────────
const KOPI_SENJA: BusinessSeed = {
  key: 'kopisenja',
  businessName: 'Kopi Senja',
  industry: 'retail',
  plan: 'plus_ai',
  aiQuota: 1000,
  domain: 'kopisenja.test',
  ownerName: 'Rina Marlina',
  staff: [
    { role: 'admin', name: 'Dimas Pratama', local: 'admin' },
    { role: 'manager', name: 'Bayu Nugroho', local: 'manager' },
    { role: 'cashier', name: 'Putri Ayu', local: 'kasir' },
    { role: 'staff', name: 'Agus Salim', local: 'gudang' },
  ],
  outlets: [
    { name: 'Outlet Senopati', address: 'Jl. Senopati No. 12, Jakarta Selatan' },
    { name: 'Outlet Dago', address: 'Jl. Ir. H. Juanda No. 88, Bandung' },
  ],
  categories: ['Kopi', 'Non-Kopi', 'Makanan', 'Biji Kopi'],
  suppliers: [
    party('PT Kopi Nusantara Sejahtera', 'Hasan Basri', 'kopinusantara', '0812-0000-0101', 'Bandung', 'Jl. Soekarno-Hatta No. 210, Bandung', 14),
    party('CV Susu Segar Lembang', 'Maya Sari', 'susulembang', '0812-0000-0102', 'Lembang', 'Jl. Raya Lembang No. 77, Lembang', 7),
    party('Toko Bahan Kue Mawar', 'Ibu Mawar', 'bahankuemawar', '0812-0000-0103', 'Jakarta', 'Jl. Pasar Minggu Raya No. 5, Jakarta Selatan', 7),
  ],
  customers: [
    party('Komunitas Kerja Remote Jakarta', 'Anton Wibowo', 'remotejakarta', '0813-0000-0201', 'Jakarta', 'Jl. Kemang Raya No. 20, Jakarta Selatan', 14, 3_000_000),
    party('PT Maju Bersama Konsultan', 'Fitri Handayani', 'majubersama', '0813-0000-0202', 'Jakarta', 'Jl. Sudirman Kav. 45, Jakarta Pusat', 30, 10_000_000),
    party('Budi Hartono (member)', 'Budi Hartono', 'member', '0813-0000-0203', 'Jakarta', 'Jl. Tebet Timur No. 9, Jakarta Selatan', 0),
  ],
  products: [
    { sku: 'KS-001', name: 'Espresso', category: 'Kopi', unit: 'cup', sell: 18000, cost: 6000, stock: 150, reorderPoint: 30, reorderQty: 100 },
    { sku: 'KS-002', name: 'Americano', category: 'Kopi', unit: 'cup', sell: 22000, cost: 7000, stock: 150, reorderPoint: 30, reorderQty: 100 },
    { sku: 'KS-003', name: 'Cafe Latte', category: 'Kopi', unit: 'cup', sell: 28000, cost: 10000, stock: 140, reorderPoint: 30, reorderQty: 100 },
    { sku: 'KS-004', name: 'Kopi Susu Senja', category: 'Kopi', unit: 'cup', sell: 24000, cost: 8500, stock: 200, reorderPoint: 40, reorderQty: 150 },
    { sku: 'KS-005', name: 'Cappuccino', category: 'Kopi', unit: 'cup', sell: 28000, cost: 10000, stock: 120, reorderPoint: 30, reorderQty: 100 },
    { sku: 'KS-006', name: 'Matcha Latte', category: 'Non-Kopi', unit: 'cup', sell: 30000, cost: 12000, stock: 90, reorderPoint: 20, reorderQty: 60 },
    { sku: 'KS-007', name: 'Teh Tarik', category: 'Non-Kopi', unit: 'cup', sell: 20000, cost: 6500, stock: 100, reorderPoint: 20, reorderQty: 60 },
    // Sengaja di bawah titik pesan ulang agar peringatan stok menipis dan saran reorder langsung terlihat.
    { sku: 'KS-008', name: 'Croissant Mentega', category: 'Makanan', unit: 'pcs', sell: 25000, cost: 12000, stock: 6, reorderPoint: 12, reorderQty: 40, supplier: 'Toko Bahan Kue Mawar' },
    { sku: 'KS-009', name: 'Roti Bakar Cokelat', category: 'Makanan', unit: 'porsi', sell: 22000, cost: 9000, stock: 35, reorderPoint: 10, reorderQty: 30, supplier: 'Toko Bahan Kue Mawar' },
    { sku: 'KS-010', name: 'Nasi Goreng Kampung', category: 'Makanan', unit: 'porsi', sell: 35000, cost: 16000, stock: 40, reorderPoint: 10, reorderQty: 30 },
    { sku: 'KS-011', name: 'Biji Kopi Arabika Gayo 250 g', category: 'Biji Kopi', unit: 'pack', sell: 95000, cost: 58000, stock: 45, reorderPoint: 15, reorderQty: 50, supplier: 'PT Kopi Nusantara Sejahtera' },
    { sku: 'KS-012', name: 'Biji Kopi Robusta Lampung 250 g', category: 'Biji Kopi', unit: 'pack', sell: 65000, cost: 38000, stock: 60, reorderPoint: 20, reorderQty: 60, supplier: 'PT Kopi Nusantara Sejahtera' },
  ],
  departments: [
    { code: 'OPS', name: 'Operasional Outlet' },
    { code: 'GDG', name: 'Gudang' },
  ],
  positions: [
    { code: 'STM', name: 'Store Manager', department: 'OPS', baseSalary: 7_500_000 },
    { code: 'BRS', name: 'Barista', department: 'OPS', baseSalary: 4_800_000 },
    { code: 'KSR', name: 'Kasir', department: 'OPS', baseSalary: 4_600_000 },
    { code: 'ADG', name: 'Admin Gudang', department: 'GDG', baseSalary: 4_700_000 },
  ],
  employees: [
    { no: 'KS-0001', name: 'Bayu Nugroho', position: 'STM', type: 'permanent', hired: '2024-02-01', salary: 7_500_000 },
    { no: 'KS-0002', name: 'Citra Lestari', position: 'BRS', type: 'permanent', hired: '2024-05-15', salary: 4_800_000 },
    { no: 'KS-0003', name: 'Putri Ayu', position: 'KSR', type: 'permanent', hired: '2024-08-01', salary: 4_600_000 },
    { no: 'KS-0004', name: 'Agus Salim', position: 'ADG', type: 'contract', hired: '2025-01-10', salary: 4_700_000 },
  ],
};

// ───────────────────────────── 2. Roti Nusantara (manufaktur, bakery) ─────────────────────────────
const ROTI_NUSANTARA: BusinessSeed = {
  key: 'rotinusantara',
  businessName: 'Roti Nusantara',
  industry: 'manufacturing',
  plan: 'custom',
  aiQuota: 3000,
  domain: 'rotinusantara.test',
  ownerName: 'Hendra Wijaya',
  staff: [
    { role: 'admin', name: 'Sari Utami', local: 'admin' },
    { role: 'manager', name: 'Joko Santoso', local: 'manager' },
    { role: 'cashier', name: 'Lina Marlina', local: 'kasir' },
    { role: 'staff', name: 'Eko Prasetyo', local: 'gudang' },
  ],
  outlets: [
    { name: 'Toko & Dapur Pusat', address: 'Jl. Raya Bogor No. 45, Depok' },
    { name: 'Gerai Margonda', address: 'Jl. Margonda Raya No. 300, Depok' },
  ],
  categories: ['Roti & Kue', 'Bahan Baku', 'Kemasan'],
  suppliers: [
    party('PT Sumber Tepung Makmur', 'Rahmat Hidayat', 'sumbertepung', '0812-0000-0111', 'Cikarang', 'Kawasan Industri Jababeka Blok C-12, Cikarang', 30),
    party('CV Telur Sehat Farm', 'Tarno', 'telursehat', '0812-0000-0112', 'Bogor', 'Jl. Peternakan No. 3, Bogor', 7),
    party('UD Mentega Prima', 'Yanti Susanti', 'mentegaprima', '0812-0000-0113', 'Bandung', 'Jl. Cibaduyut Raya No. 18, Bandung', 14),
    party('PT Kemasan Rapi Indonesia', 'Dedi Kurniawan', 'kemasanrapi', '0812-0000-0114', 'Tangerang', 'Jl. Industri Raya No. 9, Tangerang', 30),
  ],
  customers: [
    party('Kafe Titik Temu', 'Reza Mahendra', 'titiktemu', '0813-0000-0211', 'Depok', 'Jl. Kukusan Raya No. 8, Depok', 14, 5_000_000),
    party('Toko Kue Bu Ratna', 'Ratna Dewi', 'kuebuatna', '0813-0000-0212', 'Jakarta', 'Jl. Pondok Gede Raya No. 40, Jakarta Timur', 30, 10_000_000),
    party('Hotel Melati Indah', 'Sigit Purnomo', 'melatiindah', '0813-0000-0213', 'Bogor', 'Jl. Pajajaran No. 101, Bogor', 30, 20_000_000),
    party('Koperasi Karyawan Sinar', 'Wahyu Adi', 'koperasisinar', '0813-0000-0214', 'Depok', 'Jl. Juanda No. 15, Depok', 14, 6_000_000),
  ],
  products: [
    // Barang jadi
    { sku: 'RN-001', name: 'Roti Tawar Premium', category: 'Roti & Kue', unit: 'loaf', sell: 18000, cost: 8500, stock: 40, reorderPoint: 15, reorderQty: 60 },
    { sku: 'RN-002', name: 'Roti Sobek Cokelat', category: 'Roti & Kue', unit: 'pcs', sell: 22000, cost: 10000, stock: 30, reorderPoint: 10, reorderQty: 40 },
    { sku: 'RN-003', name: 'Donat Gula', category: 'Roti & Kue', unit: 'pcs', sell: 6000, cost: 2600, stock: 120, reorderPoint: 40, reorderQty: 150 },
    { sku: 'RN-004', name: 'Bolu Pandan Gulung', category: 'Roti & Kue', unit: 'pcs', sell: 45000, cost: 21000, stock: 12, reorderPoint: 5, reorderQty: 20 },
    { sku: 'RN-005', name: 'Croissant Butter', category: 'Roti & Kue', unit: 'pcs', sell: 15000, cost: 7200, stock: 50, reorderPoint: 15, reorderQty: 60 },
    // Bahan baku
    { sku: 'BB-001', name: 'Tepung Terigu Protein Tinggi', category: 'Bahan Baku', kind: 'raw_material', unit: 'kg', sell: 13000, cost: 11500, stock: 250, reorderPoint: 100, reorderQty: 300, supplier: 'PT Sumber Tepung Makmur' },
    { sku: 'BB-002', name: 'Gula Pasir', category: 'Bahan Baku', kind: 'raw_material', unit: 'kg', sell: 17000, cost: 15500, stock: 120, reorderPoint: 50, reorderQty: 150, supplier: 'PT Sumber Tepung Makmur' },
    { sku: 'BB-003', name: 'Ragi Instan 500 g', category: 'Bahan Baku', kind: 'raw_material', unit: 'pack', sell: 28000, cost: 25000, stock: 20, reorderPoint: 10, reorderQty: 30, supplier: 'PT Sumber Tepung Makmur' },
    // Sengaja di bawah titik pesan ulang agar MRP dan saran reorder langsung terlihat.
    { sku: 'BB-004', name: 'Mentega', category: 'Bahan Baku', kind: 'raw_material', unit: 'kg', sell: 120000, cost: 108000, stock: 18, reorderPoint: 20, reorderQty: 40, supplier: 'UD Mentega Prima' },
    { sku: 'BB-005', name: 'Telur Ayam', category: 'Bahan Baku', kind: 'raw_material', unit: 'kg', sell: 30000, cost: 27000, stock: 60, reorderPoint: 25, reorderQty: 80, supplier: 'CV Telur Sehat Farm' },
    { sku: 'BB-006', name: 'Susu Bubuk', category: 'Bahan Baku', kind: 'raw_material', unit: 'kg', sell: 85000, cost: 78000, stock: 30, reorderPoint: 10, reorderQty: 30, supplier: 'UD Mentega Prima' },
    { sku: 'BB-007', name: 'Cokelat Meses', category: 'Bahan Baku', kind: 'raw_material', unit: 'kg', sell: 65000, cost: 58000, stock: 35, reorderPoint: 10, reorderQty: 30, supplier: 'PT Sumber Tepung Makmur' },
    // Kemasan
    { sku: 'KM-001', name: 'Kantong Kertas Roti', category: 'Kemasan', kind: 'raw_material', unit: 'pcs', sell: 800, cost: 600, stock: 1000, reorderPoint: 300, reorderQty: 1000, supplier: 'PT Kemasan Rapi Indonesia' },
    { sku: 'KM-002', name: 'Kotak Kue Mika', category: 'Kemasan', kind: 'raw_material', unit: 'pcs', sell: 2500, cost: 1800, stock: 400, reorderPoint: 100, reorderQty: 400, supplier: 'PT Kemasan Rapi Indonesia' },
  ],
  workCenters: [
    { code: 'WC-MIXER', name: 'Mixer Spiral', kind: 'machine', capacityPerDay: 400, capacityMinutes: 480, hourlyRate: 30_000 },
    { code: 'WC-OVEN', name: 'Oven Rotary', kind: 'machine', capacityPerDay: 600, capacityMinutes: 960, hourlyRate: 45_000 },
    { code: 'WC-PACK', name: 'Meja Pengemasan', kind: 'labor', capacityPerDay: 800, capacityMinutes: 480, hourlyRate: 20_000 },
  ],
  boms: [
    {
      product: 'RN-001',
      name: 'Roti Tawar Premium (10 loaf)',
      outputQty: 10,
      lines: [
        { sku: 'BB-001', qty: 5, scrapPercent: 2 },
        { sku: 'BB-002', qty: 0.4 },
        { sku: 'BB-003', qty: 0.1 },
        { sku: 'BB-004', qty: 0.5 },
        { sku: 'BB-005', qty: 0.3 },
        { sku: 'BB-006', qty: 0.3 },
        { sku: 'KM-001', qty: 10 },
      ],
    },
    {
      product: 'RN-002',
      name: 'Roti Sobek Cokelat (10 pcs)',
      outputQty: 10,
      lines: [
        { sku: 'BB-001', qty: 4, scrapPercent: 2 },
        { sku: 'BB-002', qty: 0.5 },
        { sku: 'BB-003', qty: 0.08 },
        { sku: 'BB-004', qty: 0.4 },
        { sku: 'BB-005', qty: 0.4 },
        { sku: 'BB-007', qty: 0.8 },
        { sku: 'KM-001', qty: 10 },
      ],
    },
    {
      product: 'RN-003',
      name: 'Donat Gula (50 pcs)',
      outputQty: 50,
      lines: [
        { sku: 'BB-001', qty: 3, scrapPercent: 3 },
        { sku: 'BB-002', qty: 1 },
        { sku: 'BB-003', qty: 0.1 },
        { sku: 'BB-004', qty: 0.3 },
        { sku: 'BB-005', qty: 0.5 },
        { sku: 'KM-002', qty: 5 },
      ],
    },
  ],
  departments: [
    { code: 'PRD', name: 'Produksi' },
    { code: 'GDG', name: 'Gudang' },
    { code: 'SLS', name: 'Penjualan' },
  ],
  positions: [
    { code: 'KPR', name: 'Kepala Produksi', department: 'PRD', baseSalary: 9_000_000 },
    { code: 'BKR', name: 'Baker', department: 'PRD', baseSalary: 5_200_000 },
    { code: 'PGM', name: 'Pengemas', department: 'PRD', baseSalary: 4_600_000 },
    { code: 'ADG', name: 'Admin Gudang', department: 'GDG', baseSalary: 4_900_000 },
    { code: 'SLS', name: 'Sales Pelanggan Korporat', department: 'SLS', baseSalary: 5_500_000 },
  ],
  employees: [
    { no: 'RN-0001', name: 'Joko Santoso', position: 'KPR', type: 'permanent', hired: '2023-03-01', salary: 9_000_000 },
    { no: 'RN-0002', name: 'Maman Suryaman', position: 'BKR', type: 'permanent', hired: '2023-06-12', salary: 5_200_000 },
    { no: 'RN-0003', name: 'Neneng Rohaeni', position: 'BKR', type: 'permanent', hired: '2024-01-08', salary: 5_200_000 },
    { no: 'RN-0004', name: 'Wati Sulastri', position: 'PGM', type: 'contract', hired: '2025-02-03', salary: 4_600_000 },
    { no: 'RN-0005', name: 'Eko Prasetyo', position: 'ADG', type: 'permanent', hired: '2024-04-22', salary: 4_900_000 },
  ],
};

// ───────────────────────────── 3. Laundry Segar Jaya (jasa) ─────────────────────────────
const LAUNDRY_SEGAR: BusinessSeed = {
  key: 'laundrysegar',
  businessName: 'Laundry Segar Jaya',
  industry: 'services',
  plan: 'basic',
  aiQuota: 0,
  domain: 'laundrysegar.test',
  ownerName: 'Siti Aminah',
  staff: [
    { role: 'admin', name: 'Rudi Hartono', local: 'admin' },
    { role: 'manager', name: 'Wulan Sari', local: 'manager' },
    { role: 'cashier', name: 'Dewi Anggraini', local: 'kasir' },
    { role: 'staff', name: 'Tono Wijaya', local: 'gudang' },
  ],
  outlets: [
    { name: 'Cabang Margonda', address: 'Jl. Margonda Raya No. 120, Depok' },
    { name: 'Cabang Kukusan', address: 'Jl. Kukusan Raya No. 15, Depok' },
  ],
  categories: ['Layanan Kiloan', 'Layanan Satuan', 'Layanan Tambahan', 'Perlengkapan'],
  suppliers: [
    party('PT Kimia Bersih Abadi', 'Lukman Hakim', 'kimiabersih', '0812-0000-0121', 'Jakarta', 'Jl. Raya Cakung No. 66, Jakarta Timur', 30),
    party('CV Plastik Kemasan Jaya', 'Sri Wahyuni', 'plastikjaya', '0812-0000-0122', 'Bekasi', 'Jl. Raya Narogong No. 12, Bekasi', 14),
  ],
  customers: [
    party('Kos Putri Melati', 'Ibu Melati', 'kosmelati', '0813-0000-0221', 'Depok', 'Jl. Margonda Gg. Melati No. 4, Depok', 7),
    party('Klinik Sehat Sentosa', 'Dr. Andini', 'kliniksehat', '0813-0000-0222', 'Depok', 'Jl. Raya Sawangan No. 90, Depok', 30, 8_000_000),
    party('Hotel Seruni Asri', 'Pak Hendro', 'serunias', '0813-0000-0223', 'Depok', 'Jl. Raya Bogor Km 30, Depok', 30, 15_000_000),
    party('Dewi Kartika (member)', 'Dewi Kartika', 'member', '0813-0000-0224', 'Depok', 'Jl. Kukusan Teknik No. 21, Depok', 0),
  ],
  products: [
    // Jasa: tidak punya stok
    { sku: 'LS-001', name: 'Cuci Kering Setrika (kiloan)', category: 'Layanan Kiloan', kind: 'service', unit: 'kg', sell: 9000, cost: 3500 },
    { sku: 'LS-002', name: 'Cuci Kering Lipat (kiloan)', category: 'Layanan Kiloan', kind: 'service', unit: 'kg', sell: 6500, cost: 2800 },
    { sku: 'LS-003', name: 'Setrika Saja (kiloan)', category: 'Layanan Kiloan', kind: 'service', unit: 'kg', sell: 5000, cost: 2000 },
    { sku: 'LS-004', name: 'Cuci Express 6 Jam (kiloan)', category: 'Layanan Kiloan', kind: 'service', unit: 'kg', sell: 14000, cost: 5000 },
    { sku: 'LS-005', name: 'Cuci Jas / Blazer', category: 'Layanan Satuan', kind: 'service', unit: 'pcs', sell: 45000, cost: 18000 },
    { sku: 'LS-006', name: 'Cuci Bedcover', category: 'Layanan Satuan', kind: 'service', unit: 'pcs', sell: 40000, cost: 15000 },
    { sku: 'LS-007', name: 'Cuci Karpet', category: 'Layanan Satuan', kind: 'service', unit: 'm2', sell: 15000, cost: 6000 },
    { sku: 'LS-008', name: 'Cuci Sepatu', category: 'Layanan Satuan', kind: 'service', unit: 'pasang', sell: 35000, cost: 12000 },
    { sku: 'LS-009', name: 'Antar-Jemput', category: 'Layanan Tambahan', kind: 'service', unit: 'trip', sell: 10000, cost: 6000 },
    // Perlengkapan habis pakai (berstok)
    { sku: 'PL-001', name: 'Deterjen Cair 5 L', category: 'Perlengkapan', unit: 'jerigen', sell: 85000, cost: 68000, stock: 24, reorderPoint: 10, reorderQty: 24, supplier: 'PT Kimia Bersih Abadi' },
    // Sengaja di bawah titik pesan ulang agar peringatan stok menipis langsung terlihat.
    { sku: 'PL-002', name: 'Pelembut Pakaian 5 L', category: 'Perlengkapan', unit: 'jerigen', sell: 78000, cost: 62000, stock: 8, reorderPoint: 10, reorderQty: 20, supplier: 'PT Kimia Bersih Abadi' },
    { sku: 'PL-003', name: 'Plastik Kemasan (roll)', category: 'Perlengkapan', unit: 'roll', sell: 45000, cost: 36000, stock: 30, reorderPoint: 10, reorderQty: 30, supplier: 'CV Plastik Kemasan Jaya' },
    { sku: 'PL-004', name: 'Hanger Plastik (isi 12)', category: 'Perlengkapan', unit: 'pack', sell: 18000, cost: 13000, stock: 50, reorderPoint: 15, reorderQty: 50, supplier: 'CV Plastik Kemasan Jaya' },
  ],
  departments: [
    { code: 'OPS', name: 'Operasional Cabang' },
    { code: 'LOG', name: 'Antar-Jemput' },
  ],
  positions: [
    { code: 'KCB', name: 'Kepala Cabang', department: 'OPS', baseSalary: 6_500_000 },
    { code: 'OPM', name: 'Operator Mesin Cuci', department: 'OPS', baseSalary: 4_300_000 },
    { code: 'KUR', name: 'Kurir', department: 'LOG', baseSalary: 4_200_000 },
  ],
  employees: [
    { no: 'LS-0001', name: 'Wulan Sari', position: 'KCB', type: 'permanent', hired: '2024-01-15', salary: 6_500_000 },
    { no: 'LS-0002', name: 'Slamet Riyadi', position: 'OPM', type: 'permanent', hired: '2024-03-04', salary: 4_300_000 },
    { no: 'LS-0003', name: 'Yati Nurhayati', position: 'OPM', type: 'contract', hired: '2025-05-19', salary: 4_300_000 },
    { no: 'LS-0004', name: 'Tono Wijaya', position: 'KUR', type: 'permanent', hired: '2024-09-02', salary: 4_200_000 },
  ],
};

export const BUSINESSES: BusinessSeed[] = [KOPI_SENJA, ROTI_NUSANTARA, LAUNDRY_SEGAR];

/** Akun platform (superadmin) ikut dibuat dan dilekatkan ke usaha pertama, seperti seed lama. */
export const SUPERADMIN = { name: 'Super Admin Retalio', email: 'superadmin@retalio.id' };

export function ownerEmailOf(b: BusinessSeed): string {
  return `owner@${b.domain}`;
}

export function staffEmailOf(b: BusinessSeed, s: StaffSeed): string {
  return `${s.local}@${b.domain}`;
}
