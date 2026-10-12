/* eslint-disable no-console */
// Seed script Retalio — Database PostgreSQL Single Source of Truth
// Idempotent: data dihapus lalu diisi ulang secara bersih.
// Jalankan: npm run seed (di folder server)
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ensureFiscalCalendar } from '../src/common/utils/fiscal-calendar';
import { ensureTenantRoles } from '../src/common/rbac/ensure-tenant-roles';

const prisma = new PrismaClient();

const KELANA_TENANT_ID = 'tenant-demo-kopikelana';
const NEWSEM_TENANT_ID = 'tenant-newsem';
const KELANA_COMPANY_ID = 'company-kopikelana-main';
const NEWSEM_COMPANY_ID = 'company-newsem-main';

const CURRENCIES = [
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimalPlaces: 0 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 },
] as const;

const reorderPoints: Record<string, number> = {
  'ROT-001': 15, 'PST-001': 10, 'ROT-002': 20, 'PST-003': 8,
};

const DEFAULT_COA = [
  { code: '1000', name: 'Kas', type: 'asset' as const },
  { code: '1100', name: 'Persediaan', type: 'asset' as const },
  { code: '1200', name: 'Piutang Usaha', type: 'asset' as const },
  { code: '2000', name: 'Hutang Usaha', type: 'liability' as const },
  { code: '3000', name: 'Modal Awal', type: 'equity' as const },
  { code: '2100', name: 'Hutang PPN', type: 'liability' as const },
  { code: '2150', name: 'Piutang PPN', type: 'asset' as const },
  { code: '3100', name: 'Laba Ditahan', type: 'equity' as const },
  { code: '1300', name: 'Aset Tetap', type: 'asset' as const },
  { code: '1390', name: 'Akumulasi Penyusutan', type: 'asset' as const },
  { code: '6200', name: 'Beban Penyusutan', type: 'expense' as const },
  { code: '6400', name: 'Beban Pemeliharaan', type: 'expense' as const },
  { code: '6300', name: 'Beban Gaji', type: 'expense' as const },
  { code: '2160', name: 'Utang PPh 21', type: 'liability' as const },
  { code: '2200', name: 'Utang BPJS', type: 'liability' as const },
  { code: '4000', name: 'Pendapatan Usaha', type: 'revenue' as const },
  { code: '5000', name: 'Harga Pokok Penjualan', type: 'expense' as const },
  { code: '6100', name: 'Beban Operasional', type: 'expense' as const },
];

/**
 * Posting saldo awal periode berjalan: Dr Persediaan / Cr Modal Awal.
 *
 * Tanpa ini stok seed hanya ada di tabel inventory_stock dan tidak pernah
 * masuk buku besar, sehingga akun Persediaan di neraca negatif begitu ada
 * penjualan.
 */
async function postOpeningBalances(
  client: PrismaClient,
  params: { tenantId: string; companyId: string; inventoryValue: number },
): Promise<void> {
  const { tenantId, companyId, inventoryValue } = params;
  const period = await client.fiscalPeriod.findFirst({
    where: { tenantId, companyId, status: 'open' },
    orderBy: { code: 'asc' },
    select: { id: true, code: true },
  });
  if (!period) throw new Error('Periode fiskal terbuka tidak ditemukan untuk seed.');

  const accounts = await client.chartOfAccount.findMany({
    where: { tenantId, companyId, code: { in: ['1100', '3000'] } },
    select: { id: true, code: true },
  });
  const persediaan = accounts.find((a) => a.code === '1100');
  const modal = accounts.find((a) => a.code === '3000');
  if (!persediaan || !modal) throw new Error('COA 1100/3000 tidak ditemukan untuk seed.');

  await client.openingBalance.createMany({
    data: [
      {
        tenantId,
        companyId,
        periodId: period.id,
        accountId: persediaan.id,
        direction: 'debit',
        amount: inventoryValue,
      },
      {
        tenantId,
        companyId,
        periodId: period.id,
        accountId: modal.id,
        direction: 'credit',
        amount: inventoryValue,
      },
    ],
    skipDuplicates: true,
  });

  console.log(`  Saldo awal ${period.code}: persediaan & modal awal Rp ${inventoryValue.toLocaleString('id-ID')}`);
}

function daysAgo(days: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log('Membersihkan data database lama…');
  const allTenantIds = [KELANA_TENANT_ID, NEWSEM_TENANT_ID];

  console.log('Memastikan katalog mata uang tersedia…');
  for (const currency of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: { name: currency.name, symbol: currency.symbol, decimalPlaces: currency.decimalPlaces },
      create: currency,
    });
  }

  for (const tId of allTenantIds) {
    // Urutan wajib anak -> induk. Beberapa relasi memakai onDelete: Restrict
    // (mis. financial_entry -> chart_of_accounts), jadi tabel anak tidak bisa
    // mengandalkan cascade dari tenant dan harus dihapus eksplisit lebih dulu.
    await prisma.notification.deleteMany({ where: { tenantId: tId } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tId } });
    await prisma.aiUsageCounter.deleteMany({ where: { tenantId: tId } });
    await prisma.aiInsightLog.deleteMany({ where: { tenantId: tId } });

// Dokumen hutang & piutang dulu: semuanya Restrict ke journal_header,
    // jadi harus dihapus sebelum jurnal dihapus.
    await prisma.stockTransferLine.deleteMany({ where: { transfer: { tenantId: tId } } });
    // Fase 4C/4D: proyek, shipment, armada, dan EAM
    await prisma.ocrResult.deleteMany({ where: { tenantId: tId } });
    await prisma.sensorReading.deleteMany({ where: { tenantId: tId } });
    await prisma.sensorDevice.deleteMany({ where: { tenantId: tId } });
    await prisma.performanceReview.deleteMany({ where: { tenantId: tId } });
    await prisma.kpiTarget.deleteMany({ where: { tenantId: tId } });
    await prisma.kpiDefinition.deleteMany({ where: { tenantId: tId } });
    await prisma.applicant.deleteMany({ where: { tenantId: tId } });
    await prisma.jobPosting.deleteMany({ where: { tenantId: tId } });
    await prisma.shipmentEvent.deleteMany({ where: { tenantId: tId } });
    await prisma.resourceAllocation.deleteMany({ where: { tenantId: tId } });
    await prisma.productionSchedule.deleteMany({ where: { tenantId: tId } });
    await prisma.workCenter.deleteMany({ where: { tenantId: tId } });
    await prisma.qcStageConfig.deleteMany({ where: { tenantId: tId } });
    await prisma.workOrder.deleteMany({ where: { tenantId: tId } });
    await prisma.maintenancePlan.deleteMany({ where: { tenantId: tId } });
    await prisma.fuelLog.deleteMany({ where: { tenantId: tId } });
    await prisma.vehicle.deleteMany({ where: { tenantId: tId } });
    await prisma.shipmentItem.deleteMany({ where: { shipment: { tenantId: tId } } });
    await prisma.shipment.deleteMany({ where: { tenantId: tId } });
    await prisma.projectMilestone.deleteMany({ where: { tenantId: tId } });
    await prisma.timesheet.deleteMany({ where: { tenantId: tId } });
    await prisma.project.deleteMany({ where: { tenantId: tId } });
    await prisma.stockTransfer.deleteMany({ where: { tenantId: tId } });
    await prisma.purchaseRequisitionLine.deleteMany({ where: { requisition: { tenantId: tId } } });
    await prisma.purchaseRequisition.deleteMany({ where: { tenantId: tId } });
    await prisma.vendorPerformance.deleteMany({ where: { tenantId: tId } });
    await prisma.depreciationSchedule.deleteMany({ where: { tenantId: tId } });
    await prisma.qualityCheck.deleteMany({ where: { tenantId: tId } });
    await prisma.productionConsumption.deleteMany({ where: { tenantId: tId } });
    await prisma.productionOrder.deleteMany({ where: { tenantId: tId } });
    await prisma.bomLine.deleteMany({ where: { bom: { tenantId: tId } } });
    await prisma.billOfMaterials.deleteMany({ where: { tenantId: tId } });
    await prisma.payrollItem.deleteMany({ where: { tenantId: tId } });
    await prisma.payrollRun.deleteMany({ where: { tenantId: tId } });
    await prisma.attendance.deleteMany({ where: { tenantId: tId } });
    await prisma.leaveRequest.deleteMany({ where: { tenantId: tId } });
    await prisma.employee.deleteMany({ where: { tenantId: tId } });
    await prisma.position.deleteMany({ where: { tenantId: tId } });
    await prisma.department.deleteMany({ where: { tenantId: tId } });
    await prisma.customerComplaint.deleteMany({ where: { tenantId: tId } });
    await prisma.customerInteraction.deleteMany({ where: { tenantId: tId } });
    await prisma.quotationLine.deleteMany({ where: { quotation: { tenantId: tId } } });
    await prisma.salesOrderLine.deleteMany({ where: { salesOrder: { tenantId: tId } } });
    await prisma.salesOrder.deleteMany({ where: { tenantId: tId } });
    await prisma.quotation.deleteMany({ where: { tenantId: tId } });
    await prisma.opportunity.deleteMany({ where: { tenantId: tId } });
    await prisma.lead.deleteMany({ where: { tenantId: tId } });
    await prisma.bankStatement.deleteMany({ where: { tenantId: tId } });
    await prisma.bankAccount.deleteMany({ where: { tenantId: tId } });
    await prisma.fixedAsset.deleteMany({ where: { tenantId: tId } });
    await prisma.customerReceipt.deleteMany({ where: { tenantId: tId } });
    await prisma.customerInvoice.deleteMany({ where: { tenantId: tId } });
    await prisma.vendorPayment.deleteMany({ where: { tenantId: tId } });
    await prisma.vendorBill.deleteMany({ where: { tenantId: tId } });
    await prisma.documentSequence.deleteMany({ where: { tenantId: tId } });

    // GL v2 dan pembukuan
    await prisma.journalLine.deleteMany({ where: { tenantId: tId } });
    await prisma.journalHeader.deleteMany({ where: { tenantId: tId } });
    await prisma.journalSequence.deleteMany({ where: { tenantId: tId } });
    await prisma.openingBalance.deleteMany({ where: { tenantId: tId } });
    await prisma.financialEntry.deleteMany({ where: { tenantId: tId } });

    // Transaksi operasional (restrict ke supplier/customer/warehouse)
    await prisma.salesTransaction.deleteMany({ where: { tenantId: tId } });
    await prisma.purchaseOrder.deleteMany({ where: { tenantId: tId } });

    // Inventori & stock op
    await prisma.stockOpLine.deleteMany({ where: { stockOp: { tenantId: tId } } });
    await prisma.stockOp.deleteMany({ where: { tenantId: tId } });
    await prisma.stockMovement.deleteMany({ where: { tenantId: tId } });
    await prisma.inventoryStock.deleteMany({ where: { tenantId: tId } });

    // Pajak, approval, master party
    await prisma.taxComputation.deleteMany({ where: { tenantId: tId } });
    await prisma.taxRule.deleteMany({ where: { tenantId: tId } });
    await prisma.approvalRequest.deleteMany({ where: { tenantId: tId } });
    await prisma.exchangeRate.deleteMany({ where: { tenantId: tId } });
    await prisma.customer.deleteMany({ where: { tenantId: tId } });
    await prisma.supplier.deleteMany({ where: { tenantId: tId } });

    // Master data
    await prisma.chartOfAccount.deleteMany({ where: { tenantId: tId } });
    await prisma.fiscalPeriod.deleteMany({ where: { tenantId: tId } });
    await prisma.fiscalYear.deleteMany({ where: { tenantId: tId } });
    await prisma.warehouse.deleteMany({ where: { tenantId: tId } });
    await prisma.product.deleteMany({ where: { tenantId: tId } });
    await prisma.productCategory.deleteMany({ where: { tenantId: tId } });

    // Akses & konfigurasi
    await prisma.userOutlet.deleteMany({ where: { user: { tenantId: tId } } });
    await prisma.outlet.deleteMany({ where: { tenantId: tId } });
    await prisma.user.deleteMany({ where: { tenantId: tId } });
    await prisma.rolePermission.deleteMany({ where: { role: { tenantId: tId } } });
    await prisma.accessRole.deleteMany({ where: { tenantId: tId } });
    await prisma.moduleConfig.deleteMany({ where: { tenantId: tId } });
    await prisma.subscription.deleteMany({ where: { tenantId: tId } });
    await prisma.company.deleteMany({ where: { tenantId: tId } });
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

  await prisma.company.create({
    data: {
      id: NEWSEM_COMPANY_ID,
      tenantId: NEWSEM_TENANT_ID,
      code: 'MAIN',
      name: 'Newsem Bakery',
      legalName: 'Newsem Bakery',
      defaultCurrencyCode: 'IDR',
    },
  });
  await ensureFiscalCalendar(prisma, NEWSEM_TENANT_ID, NEWSEM_COMPANY_ID, new Date().getUTCFullYear());
  const newsemRoles = await ensureTenantRoles(prisma, NEWSEM_TENANT_ID);

  await prisma.chartOfAccount.createMany({
    data: DEFAULT_COA.map((account) => ({
      tenantId: NEWSEM_TENANT_ID,
      companyId: NEWSEM_COMPANY_ID,
      ...account,
    })),
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
      roleId: newsemRoles.superadmin,
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
      roleId: newsemRoles.owner,
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
      roleId: newsemRoles.manager,
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
      companyId: NEWSEM_COMPANY_ID,
      outletId: 'outlet-newsem-1',
      code: 'WH-0001',
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
      data: {
        id, tenantId: NEWSEM_TENANT_ID, sku, name, categoryId, unit, sellPrice, costPrice, barcode,
        reorderPoint: reorderPoints[sku] ?? 0, reorderQty: (reorderPoints[sku] ?? 0) * 2,
      },
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

  let openingInventory = 0;
  for (const [productId, quantity, minThreshold] of newsemStocks) {
    // Stok awal dianggap dibeli seharga harga master, supaya HPP tidak 0.
    const product = await prisma.product.findFirst({
      where: { id: productId },
      select: { costPrice: true },
    });
    openingInventory += quantity * Number(product?.costPrice ?? 0);
    await prisma.inventoryStock.create({
      data: {
        tenantId: NEWSEM_TENANT_ID,
        companyId: NEWSEM_COMPANY_ID,
        productId,
        warehouseId: 'wh-newsem-1',
        quantity,
        minThreshold,
        avgCost: product?.costPrice ?? 0,
      },
    });
  }

  // Saldo awal wajib masuk pembukuan, kalau tidak akun Persediaan di neraca
  // akan negatif begitu saja begitu ada penjualan.
  await postOpeningBalances(prisma, {
    tenantId: NEWSEM_TENANT_ID,
    companyId: NEWSEM_COMPANY_ID,
    inventoryValue: openingInventory,
  });

  // Suppliers & Customers Newsem Bakery
  await prisma.supplier.createMany({
    data: [
      {
        id: 's-nb-1', tenantId: NEWSEM_TENANT_ID, companyId: NEWSEM_COMPANY_ID,
        code: 'SUPP-00001', name: 'PT Bogasari Flour Mills', contact: '021-4390-001',
        email: 'sales@bogasari.co.id', phone: '021-4390-001', city: 'Jakarta',
        paymentTermDays: 30,
      },
      {
        id: 's-nb-2', tenantId: NEWSEM_TENANT_ID, companyId: NEWSEM_COMPANY_ID,
        code: 'SUPP-00002', name: 'CV Anchor Butter Perkasa', contact: '0812-8888-900',
        phone: '0812-8888-900', city: 'Jakarta', paymentTermDays: 14,
      },
      {
        id: 's-nb-3', tenantId: NEWSEM_TENANT_ID, companyId: NEWSEM_COMPANY_ID,
        code: 'SUPP-00003', name: 'Distributor Cokelat Tulip Sejahtera', contact: '0813-7777-111',
        phone: '0813-7777-111', city: 'Bandung', paymentTermDays: 30,
      },
    ],
  });

  await prisma.customer.createMany({
    data: [
      {
        id: 'c-nb-1', tenantId: NEWSEM_TENANT_ID, companyId: NEWSEM_COMPANY_ID,
        code: 'CUST-00001', name: 'Hendro Wijaya', contact: '0812-1122-334',
        phone: '0812-1122-334', loyaltyPoints: 95, paymentTermDays: 0,
      },
      {
        id: 'c-nb-2', tenantId: NEWSEM_TENANT_ID, companyId: NEWSEM_COMPANY_ID,
        code: 'CUST-00002', name: 'Clara Monica', contact: '0813-4455-667',
        phone: '0813-4455-667', loyaltyPoints: 140, paymentTermDays: 30,
        creditLimit: 5000000,
      },
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
        companyId: NEWSEM_COMPANY_ID,
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

// PPh 21 (data contoh). PERINGATAN: tarif di bawah berlabel
  // 'estimate', bukan 'official' — dipakai untuk menguji jalur hitung,
  // BUKAN untuk produksi. Sebelum dipakai sungguhan, ganti dengan bracket
  // resmi PMK dan set source = 'official' (lihat catatan risiko PRD).
  const pph21From = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const pph21Rule = await prisma.taxRule.create({
    data: {
      tenantId: NEWSEM_TENANT_ID,
      companyId: NEWSEM_COMPANY_ID,
      code: 'PPH21-ESTIMATE',
      name: 'PPh 21 (estimasi — ganti dengan bracket resmi)',
      category: 'withholding',
      basisType: 'monthly_gross',
      effectiveFrom: pph21From,
      source: 'estimate',
      isActive: true,
    },
  });
  await prisma.taxBracket.createMany({
    data: [
      { tenantId: NEWSEM_TENANT_ID, companyId: NEWSEM_COMPANY_ID, taxRuleId: pph21Rule.id, sortOrder: 1, lowerBound: 0, upperBound: 5_000_000, ratePercent: 5, effectiveFrom: pph21From },
      { tenantId: NEWSEM_TENANT_ID, companyId: NEWSEM_COMPANY_ID, taxRuleId: pph21Rule.id, sortOrder: 2, lowerBound: 5_000_000, upperBound: 20_000_000, ratePercent: 15, effectiveFrom: pph21From },
      { tenantId: NEWSEM_TENANT_ID, companyId: NEWSEM_COMPANY_ID, taxRuleId: pph21Rule.id, sortOrder: 3, lowerBound: 20_000_000, upperBound: null, ratePercent: 25, effectiveFrom: pph21From },
    ],
  });

  // PPN 11% (PPN 2022 No. 49, tarifa umum barang/jasa). Dua aturan terpisah
  // dengan `direction` berbeda: keluaran menempel ke faktur penjualan, masukan
  // ke faktur pembelian. Tanpa keduanya, engine tidak menemukan aturan aktif.
  for (const [code, name, direction] of [
    ['PPN-KELUARAN', 'PPN Keluaran 11%', 'output'],
    ['PPN-MASUKAN', 'PPN Masukan 11%', 'input'],
  ] as const) {
    await prisma.taxRule.create({
      data: {
        tenantId: NEWSEM_TENANT_ID,
        companyId: NEWSEM_COMPANY_ID,
        code,
        name,
        category: 'vat',
        direction,
        basisType: 'net',
        rate: 0.11,
        effectiveFrom: new Date(Date.UTC(2022, 0, 1)),
        sourceRef: 'PPN 2022 No. 49',
        source: 'official',
        isActive: true,
      },
    });
  }

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

  await prisma.company.create({
    data: {
      id: KELANA_COMPANY_ID,
      tenantId: KELANA_TENANT_ID,
      code: 'MAIN',
      name: 'Kopi Kelana',
      legalName: 'Kopi Kelana',
      defaultCurrencyCode: 'IDR',
    },
  });
  await ensureFiscalCalendar(prisma, KELANA_TENANT_ID, KELANA_COMPANY_ID, new Date().getUTCFullYear());
  const kelanaRoles = await ensureTenantRoles(prisma, KELANA_TENANT_ID);

  await prisma.chartOfAccount.createMany({
    data: DEFAULT_COA.map((account) => ({
      tenantId: KELANA_TENANT_ID,
      companyId: KELANA_COMPANY_ID,
      ...account,
    })),
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
    await prisma.user.create({
      data: {
        id,
        tenantId: KELANA_TENANT_ID,
        name,
        email,
        passwordHash: adminPassHash,
        role,
        roleId: kelanaRoles[role],
      },
    });
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
