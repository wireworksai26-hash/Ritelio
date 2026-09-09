/* eslint-disable no-console */
// Seed script Retalio — Database PostgreSQL Single Source of Truth
// Idempotent: data dihapus lalu diisi ulang secara bersih.
// Jalankan: npm run seed (di folder server)
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const KELANA_TENANT_ID = 'tenant-demo-kopikelana';
const NEWSEM_TENANT_ID = 'tenant-newsem';

function daysAgo(days: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log('Membersihkan data database lama…');
  const allTenantIds = [KELANA_TENANT_ID, NEWSEM_TENANT_ID];

  for (const tId of allTenantIds) {
    await prisma.notification.deleteMany({ where: { tenantId: tId } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tId } });
    await prisma.aiUsageCounter.deleteMany({ where: { tenantId: tId } });
    await prisma.aiInsightLog.deleteMany({ where: { tenantId: tId } });
    await prisma.financialEntry.deleteMany({ where: { tenantId: tId } });
    await prisma.chartOfAccount.deleteMany({ where: { tenantId: tId } });
    await prisma.salesTransaction.deleteMany({ where: { tenantId: tId } });
    await prisma.customer.deleteMany({ where: { tenantId: tId } });
    await prisma.purchaseOrder.deleteMany({ where: { tenantId: tId } });
    await prisma.supplier.deleteMany({ where: { tenantId: tId } });
    await prisma.stockMovement.deleteMany({ where: { tenantId: tId } });
    await prisma.inventoryStock.deleteMany({ where: { tenantId: tId } });
    await prisma.warehouse.deleteMany({ where: { tenantId: tId } });
    await prisma.product.deleteMany({ where: { tenantId: tId } });
    await prisma.productCategory.deleteMany({ where: { tenantId: tId } });
    await prisma.userOutlet.deleteMany({ where: { user: { tenantId: tId } } });
    await prisma.outlet.deleteMany({ where: { tenantId: tId } });
    await prisma.user.deleteMany({ where: { tenantId: tId } });
    await prisma.moduleConfig.deleteMany({ where: { tenantId: tId } });
    await prisma.subscription.deleteMany({ where: { tenantId: tId } });
    await prisma.tenant.deleteMany({ where: { id: tId } });
  }

  // Hapus akun superadmin jika ada
  await prisma.user.deleteMany({ where: { email: 'superadmin@retalio.id' } });

  console.log('Membuat katalog modul global…');
  const catalog = [
    ['inventory', 'Kontrol Inventori', 'Stok real-time multi-gudang, alert stok menipis, dan prediksi restock AI.'],
    ['pos', 'Kasir & POS', 'Kasir cepat multi-pembayaran dengan mode offline dan sinkronisasi otomatis.'],
    ['finance', 'Laporan Keuangan', 'Laba rugi, arus kas, forecast 30/60/90 hari, dan deteksi anomali.'],
    ['assistant', 'Retalio Intelligence', 'Asisten AI: tanya jawab bahasa natural, digest harian, dan rekomendasi.'],
    ['production', 'Produksi', 'Untuk manufaktur kecil: resep sederhana dan pencatatan produksi.'],
    ['booking', 'Booking & Reservasi', 'Untuk bisnis jasa: penjadwalan dan manajemen janji temu.'],
  ] as const;

  for (const [key, label, description] of catalog) {
    await prisma.moduleCatalog.upsert({
      where: { key },
      update: { label, description },
      create: { key, label, description },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 1. INSTITUSI NEWSEM BAKERY (Bisnis Riil User)
  // ═══════════════════════════════════════════════════════════
  console.log('Membuat institusi Newsem Bakery…');
  await prisma.tenant.create({
    data: {
      id: NEWSEM_TENANT_ID,
      name: 'Newsem Bakery',
      industryTemplate: 'manufacturing',
      subscriptionPlan: 'plus_ai',
      settings: { currency: 'IDR', timezone: 'Asia/Jakarta' },
    },
  });

  await prisma.subscription.create({
    data: { tenantId: NEWSEM_TENANT_ID, plan: 'plus_ai', status: 'active', aiQuota: 3000 },
  });

  for (const [key] of catalog) {
    await prisma.moduleConfig.create({
      data: { tenantId: NEWSEM_TENANT_ID, moduleKey: key, isActive: ['inventory', 'pos', 'finance', 'assistant'].includes(key) },
    });
  }

  // Karyawan & Pengguna Newsem Bakery
  const adminPassHash = await bcrypt.hash('admin123', 10);
  const ferryPassHash = await bcrypt.hash('ferry123', 10);

  // Superadmin
  await prisma.user.create({
    data: {
      id: 'u-superadmin',
      tenantId: NEWSEM_TENANT_ID,
      name: 'Raden Mas Arya',
      email: 'superadmin@retalio.id',
      passwordHash: adminPassHash,
      role: 'superadmin',
      permissions: { all: true, superadmin: true },
    },
  });

  // Owner Newsem
  await prisma.user.create({
    data: {
      id: 'u-owner-newsem',
      tenantId: NEWSEM_TENANT_ID,
      name: 'Owner Newsem Bakery',
      email: 'owner@newsembakery.id',
      passwordHash: adminPassHash,
      role: 'owner',
      permissions: { all: true },
    },
  });

  // Manager Ferry (Akun yang diminta user)
  await prisma.user.create({
    data: {
      id: 'u-ferry',
      tenantId: NEWSEM_TENANT_ID,
      name: 'Ferry',
      email: 'ferry@newsembakery',
      passwordHash: ferryPassHash,
      role: 'manager',
      permissions: {
        pos_access: true,
        inventory_access: true,
        finance_access: false,
        discount_permission: true,
        void_transaction: true,
        export_data: false,
        manage_products: true,
      },
    },
  });

  // Outlet & Gudang Newsem
  await prisma.outlet.create({
    data: {
      id: 'outlet-newsem-1',
      tenantId: NEWSEM_TENANT_ID,
      name: 'Cabang Utama Bakery',
      address: 'Jl. Roti Kencana No. 12, Jakarta',
    },
  });

  await prisma.warehouse.create({
    data: {
      id: 'wh-newsem-1',
      tenantId: NEWSEM_TENANT_ID,
      outletId: 'outlet-newsem-1',
      name: 'Gudang Produksi Roti',
      location: 'Pusat',
    },
  });

  // Kategori Newsem Bakery
  const newsemCategories = [
    ['cat-newsem-1', 'Roti Manis & Sobek'],
    ['cat-newsem-2', 'Pastry & Croissant'],
    ['cat-newsem-3', 'Roti Tawar & Artisan'],
    ['cat-newsem-4', 'Cake & Bolu'],
  ] as const;

  for (const [id, name] of newsemCategories) {
    await prisma.productCategory.create({ data: { id, tenantId: NEWSEM_TENANT_ID, name } });
  }

  // Produk Riil Newsem Bakery
  const newsemProducts = [
    ['p-nb-1', 'ROT-001', 'Roti Tawar Gandum Spesial', 'cat-newsem-3', 'pack', 22000, 12000, '8991001'],
    ['p-nb-2', 'PST-001', 'Croissant Butter Premium', 'cat-newsem-2', 'pcs', 25000, 13000, '8991002'],
    ['p-nb-3', 'ROT-002', 'Roti Cokelat Keju Lumer', 'cat-newsem-1', 'pcs', 16000, 8500, '8991003'],
    ['p-nb-4', 'ROT-003', 'Baguette Artisan Prancis', 'cat-newsem-3', 'pcs', 28000, 14000, '8991004'],
    ['p-nb-5', 'CAK-001', 'Bolu Gulung Mocca Nougat', 'cat-newsem-4', 'box', 65000, 35000, '8991005'],
    ['p-nb-6', 'PST-002', 'Donat Kentang Glaze Cokelat', 'cat-newsem-2', 'pcs', 12000, 5500, '8991006'],
    ['p-nb-7', 'ROT-004', 'Roti Sisir Mentega Spesial', 'cat-newsem-1', 'pack', 24000, 12500, '8991007'],
    ['p-nb-8', 'PST-003', 'Pain au Chocolat Belgia', 'cat-newsem-2', 'pcs', 27000, 14000, '8991008'],
  ] as const;

  for (const [id, sku, name, categoryId, unit, sellPrice, costPrice, barcode] of newsemProducts) {
    await prisma.product.create({
      data: { id, tenantId: NEWSEM_TENANT_ID, sku, name, categoryId, unit, sellPrice, costPrice, barcode },
    });
  }

  // Stok Newsem Bakery
  const newsemStocks: Array<[string, number, number]> = [
    ['p-nb-1', 35, 10],
    ['p-nb-2', 6, 12], // Stok menipis
    ['p-nb-3', 42, 15],
    ['p-nb-4', 18, 8],
    ['p-nb-5', 12, 5],
    ['p-nb-6', 4, 10], // Stok menipis
    ['p-nb-7', 26, 10],
    ['p-nb-8', 15, 8],
  ];

  for (const [productId, quantity, minThreshold] of newsemStocks) {
    await prisma.inventoryStock.create({
      data: { tenantId: NEWSEM_TENANT_ID, productId, warehouseId: 'wh-newsem-1', quantity, minThreshold },
    });
  }

  // Suppliers & Customers Newsem Bakery
  await prisma.supplier.createMany({
    data: [
      { id: 's-nb-1', tenantId: NEWSEM_TENANT_ID, name: 'PT Bogasari Flour Mills', contact: '021-4390-001' },
      { id: 's-nb-2', tenantId: NEWSEM_TENANT_ID, name: 'CV Anchor Butter Perkasa', contact: '0812-8888-900' },
      { id: 's-nb-3', tenantId: NEWSEM_TENANT_ID, name: 'Distributor Cokelat Tulip Sejahtera', contact: '0813-7777-111' },
    ],
  });

  await prisma.customer.createMany({
    data: [
      { id: 'c-nb-1', tenantId: NEWSEM_TENANT_ID, name: 'Hendro Wijaya', contact: '0812-1122-334', loyaltyPoints: 95 },
      { id: 'c-nb-2', tenantId: NEWSEM_TENANT_ID, name: 'Clara Monica', contact: '0813-4455-667', loyaltyPoints: 140 },
    ],
  });

  // Transaksi Penjualan Newsem Bakery
  const newsemTxRows: Array<[number, number, number, Array<[number, number]>, 'cash' | 'qris' | 'debit' | 'transfer', 'synced' | 'pending']> = [
    [0, 8, 30, [[0, 2], [1, 2]], 'qris', 'synced'],
    [0, 9, 45, [[2, 3], [5, 2]], 'cash', 'synced'],
    [0, 10, 15, [[4, 1]], 'transfer', 'synced'],
    [0, 11, 20, [[1, 4], [3, 1]], 'debit', 'pending'],
    [0, 13, 0, [[6, 2], [2, 2]], 'cash', 'synced'],
    [1, 9, 10, [[0, 3], [1, 2]], 'qris', 'synced'],
    [1, 14, 20, [[4, 2], [7, 2]], 'transfer', 'synced'],
    [1, 16, 40, [[2, 4], [5, 3]], 'cash', 'synced'],
    [2, 10, 0, [[0, 2], [1, 3]], 'cash', 'synced'],
    [3, 11, 30, [[2, 5], [6, 2]], 'qris', 'synced'],
    [4, 9, 20, [[4, 1], [0, 2]], 'debit', 'synced'],
    [5, 15, 10, [[1, 4], [7, 3]], 'cash', 'synced'],
  ];

  for (let i = 0; i < newsemTxRows.length; i++) {
    const [d, h, m, pairs, payment, sync] = newsemTxRows[i];
    const ts = daysAgo(d, h, m);
    const items = pairs.map(([pIdx, qty]) => ({
      productId: newsemProducts[pIdx][0] as string,
      qty,
      price: newsemProducts[pIdx][5] as number,
    }));
    const total = items.reduce((s, it) => s + it.qty * it.price, 0);

    await prisma.salesTransaction.create({
      data: {
        id: `txn-nb-${String(i + 1).padStart(3, '0')}`,
        tenantId: NEWSEM_TENANT_ID,
        outletId: 'outlet-newsem-1',
        cashierId: 'u-ferry',
        customerId: 'c-nb-1',
        clientGeneratedId: `cgid-nb-${String(i + 1).padStart(3, '0')}`,
        syncStatus: sync,
        clientTimestamp: ts,
        serverTimestamp: sync === 'synced' ? ts : null,
        total,
        paymentMethod: payment,
        items: { create: items },
      },
    });
  }

  // Notifikasi Newsem Bakery
  await prisma.notification.createMany({
    data: [
      { tenantId: NEWSEM_TENANT_ID, type: 'low_stock', title: 'Stok menipis: Croissant Butter Premium', body: 'Sisa 6 pcs di Gudang Produksi Roti (ambang 12). Segera siapkan batch baru.', read: false, link: '/app/inventory', createdAt: daysAgo(0, 7, 5) },
      { tenantId: NEWSEM_TENANT_ID, type: 'low_stock', title: 'Stok menipis: Donat Kentang Glaze Cokelat', body: 'Sisa 4 pcs di Gudang Produksi Roti (ambang 10).', read: false, link: '/app/inventory', createdAt: daysAgo(0, 7, 5) },
      { tenantId: NEWSEM_TENANT_ID, type: 'insight_digest', title: 'Digest Harian Newsem Bakery', body: 'Penjualan berjalan aktif dengan produk terlaris Roti Tawar Gandum.', read: false, link: '/app', createdAt: daysAgo(0, 7, 0) },
    ],
  });

  // ═══════════════════════════════════════════════════════════
  // 2. INSTITUSI KOPI KELANA (Tenant Tambahan)
  // ═══════════════════════════════════════════════════════════
  console.log('Membuat tenant Kopi Kelana…');
  await prisma.tenant.create({
    data: {
      id: KELANA_TENANT_ID,
      name: 'Kopi Kelana',
      industryTemplate: 'retail',
      subscriptionPlan: 'plus_ai',
      settings: { currency: 'IDR', timezone: 'Asia/Jakarta' },
    },
  });

  await prisma.subscription.create({
    data: { tenantId: KELANA_TENANT_ID, plan: 'plus_ai', status: 'active', aiQuota: 1000 },
  });

  for (const [key] of catalog) {
    await prisma.moduleConfig.create({
      data: { tenantId: KELANA_TENANT_ID, moduleKey: key, isActive: ['inventory', 'pos', 'finance', 'assistant'].includes(key) },
    });
  }

  // Pengguna Kopi Kelana
  const userRows = [
    ['u-1', 'Sari Wulandari', 'sari@kopikelana.id', 'owner'],
    ['u-2', 'Bima Prasetyo', 'bima@kopikelana.id', 'manager'],
    ['u-3', 'Dewi Lestari', 'dewi@kopikelana.id', 'cashier'],
    ['u-4', 'Andi Kurniawan', 'andi@kopikelana.id', 'staff'],
  ] as const;

  for (const [id, name, email, role] of userRows) {
    await prisma.user.create({ data: { id, tenantId: KELANA_TENANT_ID, name, email, passwordHash: adminPassHash, role } });
  }

  console.log('\nSeed Database Selesai!');
  console.log('Akun Terdaftar:');
  console.log('  Superadmin  : superadmin@retalio.id  / admin123');
  console.log('  Owner Newsem: owner@newsembakery.id  / admin123');
  console.log('  Manager Newsem: ferry@newsembakery   / ferry123');
  console.log('  Owner Kelana: sari@kopikelana.id    / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
