import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { ensureTenantRoles } from '../common/rbac/ensure-tenant-roles';
import { AuthService } from '../modules/auth/auth.service';
import { HrmService } from '../modules/hrm/hrm.service';
import { InventoryService } from '../modules/inventory/inventory.service';
import { ManufacturingService } from '../modules/manufacturing/manufacturing.service';
import { WorkCenterService } from '../modules/manufacturing/workcenter.service';
import { OutletsService } from '../modules/outlets/outlets.service';
import { PartyService } from '../modules/parties/parties.service';
import {
  BUSINESSES,
  SUPERADMIN,
  barcodeFor,
  ownerEmailOf,
  staffEmailOf,
  type BusinessSeed,
  type PartySeed,
} from './businesses.data';
import { deriveSeedPassword, resolveMasterSecret } from './seed-passwords';

/**
 * Seed tiga usaha (retail, manufaktur, jasa) lengkap dengan akun, outlet, katalog, stok, pemasok,
 * pelanggan, dan SDM. Aman untuk produksi: TIDAK menghapus apa pun dan aman diulang.
 *
 *   SEED_MASTER_SECRET   wajib di produksi (>= 16 karakter). Kata sandi semua akun diturunkan darinya.
 *   SEED_RESET_PASSWORDS=yes   atur ulang kata sandi akun yang sudah ada ke nilai turunan.
 *
 * Dibangun di atas service aplikasi (bukan insert mentah) agar stok awal ikut terjurnal di buku besar
 * dan semua aturan bisnis berlaku.
 */

interface Services {
  prisma: PrismaService;
  auth: AuthService;
  outlets: OutletsService;
  inventory: InventoryService;
  parties: PartyService;
  hrm: HrmService;
  manufacturing: ManufacturingService;
  workCenters: WorkCenterService;
}

interface AccountRow {
  business: string;
  role: string;
  email: string;
  password: string;
  status: 'baru' | 'sudah ada' | 'diatur ulang' | 'sudah ada, sandi BERBEDA';
}

const log = (msg: string) => console.log(msg);

async function ensureAccount(
  svc: Services,
  rows: AccountRow[],
  opts: { business: string; tenantId: string; roleId: string; role: 'admin' | 'manager' | 'cashier' | 'staff' | 'superadmin'; name: string; email: string; secret: string; reset: boolean; permissions?: object },
): Promise<void> {
  const password = deriveSeedPassword(opts.secret, opts.email);
  const existing = await svc.prisma.user.findFirst({ where: { email: opts.email }, select: { id: true, passwordHash: true } });

  if (!existing) {
    await svc.prisma.user.create({
      data: {
        tenantId: opts.tenantId,
        name: opts.name,
        email: opts.email,
        passwordHash: await bcrypt.hash(password, 12),
        role: opts.role,
        roleId: opts.roleId,
        ...(opts.permissions ? { permissions: opts.permissions } : {}),
      },
    });
    rows.push({ business: opts.business, role: opts.role, email: opts.email, password, status: 'baru' });
    return;
  }

  if (opts.reset) {
    await svc.prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
    rows.push({ business: opts.business, role: opts.role, email: opts.email, password, status: 'diatur ulang' });
    return;
  }

  // Akun sudah ada dan kata sandinya tidak diubah. Periksa apakah masih sama dengan turunan saat ini.
  const same = await bcrypt.compare(password, existing.passwordHash);
  rows.push({
    business: opts.business,
    role: opts.role,
    email: opts.email,
    password: same ? password : '(tidak diubah)',
    status: same ? 'sudah ada' : 'sudah ada, sandi BERBEDA',
  });
}

async function ensureParty(
  svc: Services,
  tenantId: string,
  kind: 'supplier' | 'customer',
  p: PartySeed,
): Promise<string> {
  const found =
    kind === 'supplier'
      ? await svc.prisma.supplier.findFirst({ where: { tenantId, name: p.name }, select: { id: true } })
      : await svc.prisma.customer.findFirst({ where: { tenantId, name: p.name }, select: { id: true } });
  if (found) return found.id;

  const dto = {
    name: p.name,
    contact: p.contact,
    email: p.email,
    phone: p.phone,
    city: p.city,
    address: p.address,
    paymentTermDays: p.paymentTermDays,
    ...(p.creditLimit ? { creditLimit: p.creditLimit } : {}),
  };
  const created =
    kind === 'supplier' ? await svc.parties.createSupplier(tenantId, dto) : await svc.parties.createCustomer(tenantId, dto);
  return (created as { id: string }).id;
}

async function seedBusiness(
  svc: Services,
  biz: BusinessSeed,
  index: number,
  secret: string,
  reset: boolean,
  rows: AccountRow[],
): Promise<{ tenantId: string; roleIds: Record<string, string> }> {
  const { prisma } = svc;
  log(`\n== ${biz.businessName} (${biz.industry})`);

  // 1. Bisnis + akun owner lewat alur pendaftaran yang sama dengan aplikasi.
  const ownerEmail = ownerEmailOf(biz);
  let owner = await prisma.user.findFirst({ where: { email: ownerEmail }, select: { id: true, tenantId: true } });
  const createdNow = !owner;
  if (!owner) {
    await svc.auth.register({
      businessName: biz.businessName,
      industryTemplate: biz.industry,
      ownerName: biz.ownerName,
      email: ownerEmail,
      password: deriveSeedPassword(secret, ownerEmail),
    });
    owner = await prisma.user.findFirstOrThrow({ where: { email: ownerEmail }, select: { id: true, tenantId: true } });
    log('  bisnis dan akun owner dibuat');
  } else {
    log('  bisnis sudah ada, melengkapi data yang kurang');
  }
  const tenantId = owner.tenantId;

  // Pendaftaran membuat masa percobaan 14 hari. Akun seed harus tetap bisa login, jadi dijadikan aktif.
  if (createdNow) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionPlan: biz.plan } });
    const sub = await prisma.subscription.findFirst({ where: { tenantId }, orderBy: { startedAt: 'desc' } });
    const subData = { plan: biz.plan, status: 'active', endsAt: null, aiQuota: biz.aiQuota };
    if (sub) await prisma.subscription.update({ where: { id: sub.id }, data: subData });
    else await prisma.subscription.create({ data: { tenantId, ...subData } });
  }

  const roleIds = await ensureTenantRoles(prisma, tenantId);

  // 2. Akun staf. Owner ikut dicatat untuk ringkasan kredensial.
  {
    const password = deriveSeedPassword(secret, ownerEmail);
    const ownerRow = await prisma.user.findUniqueOrThrow({ where: { id: owner.id }, select: { passwordHash: true } });
    if (reset) {
      await prisma.user.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
      rows.push({ business: biz.businessName, role: 'owner', email: ownerEmail, password, status: 'diatur ulang' });
    } else {
      const same = await bcrypt.compare(password, ownerRow.passwordHash);
      rows.push({
        business: biz.businessName,
        role: 'owner',
        email: ownerEmail,
        password: same ? password : '(tidak diubah)',
        status: createdNow ? 'baru' : same ? 'sudah ada' : 'sudah ada, sandi BERBEDA',
      });
    }
  }
  for (const s of biz.staff) {
    await ensureAccount(svc, rows, {
      business: biz.businessName,
      tenantId,
      roleId: roleIds[s.role],
      role: s.role,
      name: s.name,
      email: staffEmailOf(biz, s),
      secret,
      reset,
    });
  }

  // 3. Outlet (gudang dibuat otomatis per outlet).
  const outletIds: string[] = [];
  for (const o of biz.outlets) {
    const found = await prisma.outlet.findFirst({ where: { tenantId, name: o.name }, select: { id: true } });
    outletIds.push(found ? found.id : (await svc.outlets.create(tenantId, { name: o.name, address: o.address })).id);
  }
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId, outletId: outletIds[0] }, select: { id: true } });
  if (!warehouse) throw new Error(`Gudang untuk ${biz.outlets[0].name} tidak ditemukan setelah outlet dibuat.`);

  // 4. Kategori, pemasok, pelanggan.
  const categoryIds = new Map<string, string>();
  for (const name of biz.categories) {
    const found = await prisma.productCategory.findFirst({ where: { tenantId, name }, select: { id: true } });
    categoryIds.set(name, found ? found.id : (await svc.inventory.createCategory(tenantId, { name })).id);
  }
  const supplierIds = new Map<string, string>();
  for (const s of biz.suppliers) supplierIds.set(s.name, await ensureParty(svc, tenantId, 'supplier', s));
  for (const c of biz.customers) await ensureParty(svc, tenantId, 'customer', c);

  // 5. Produk. Stok awal dicatat lewat service sehingga ikut terjurnal di buku besar.
  const productIds = new Map<string, string>();
  for (const [i, p] of biz.products.entries()) {
    const found = await prisma.product.findFirst({ where: { tenantId, sku: p.sku }, select: { id: true } });
    if (found) {
      productIds.set(p.sku, found.id);
      continue;
    }
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) throw new Error(`Kategori "${p.category}" untuk ${p.sku} tidak ada di daftar kategori.`);
    if (p.supplier && !supplierIds.has(p.supplier)) throw new Error(`Pemasok "${p.supplier}" untuk ${p.sku} tidak ada.`);

    const created = await svc.inventory.createProduct(tenantId, {
      sku: p.sku,
      name: p.name,
      categoryId,
      productType: p.kind ?? 'goods',
      unit: p.unit,
      sellPrice: p.sell,
      costPrice: p.cost,
      reorderPoint: p.reorderPoint,
      reorderQty: p.reorderQty,
      preferredSupplierId: p.supplier ? supplierIds.get(p.supplier) : undefined,
      barcode: p.kind === 'service' ? undefined : barcodeFor(index + 1, i + 1),
      ...(p.stock && p.stock > 0 ? { initialStock: p.stock, warehouseId: warehouse.id } : {}),
    });
    productIds.set(p.sku, (created as { id: string }).id);
  }
  log(`  ${biz.products.length} produk, ${biz.suppliers.length} pemasok, ${biz.customers.length} pelanggan`);

  // 6. Manufaktur: work center dan BOM.
  for (const wc of biz.workCenters ?? []) {
    const found = await prisma.workCenter.findFirst({ where: { tenantId, code: wc.code }, select: { id: true } });
    if (!found) await svc.workCenters.create(tenantId, wc);
  }
  for (const bom of biz.boms ?? []) {
    const productId = productIds.get(bom.product);
    if (!productId) throw new Error(`BOM merujuk produk ${bom.product} yang tidak ada.`);
    const found = await prisma.billOfMaterials.findFirst({ where: { tenantId, productId }, select: { id: true } });
    if (found) continue;
    await svc.manufacturing.createBom(tenantId, {
      productId,
      name: bom.name,
      outputQty: bom.outputQty,
      lines: bom.lines.map((l) => {
        const id = productIds.get(l.sku);
        if (!id) throw new Error(`BOM ${bom.product} merujuk komponen ${l.sku} yang tidak ada.`);
        return { productId: id, qtyRequired: l.qty, ...(l.scrapPercent ? { scrapPercent: l.scrapPercent } : {}) };
      }),
    });
  }
  if (biz.boms?.length) log(`  ${biz.workCenters?.length ?? 0} work center, ${biz.boms.length} BOM`);

  // 7. SDM: departemen, jabatan, karyawan.
  const departmentIds = new Map<string, string>();
  for (const d of biz.departments) {
    const found = await prisma.department.findFirst({ where: { tenantId, code: d.code }, select: { id: true } });
    departmentIds.set(d.code, found ? found.id : (await svc.hrm.createDepartment(tenantId, d)).id);
  }
  const positionIds = new Map<string, string>();
  for (const p of biz.positions) {
    const found = await prisma.position.findFirst({ where: { tenantId, code: p.code }, select: { id: true } });
    positionIds.set(
      p.code,
      found
        ? found.id
        : (
            await svc.hrm.createPosition(tenantId, {
              code: p.code,
              name: p.name,
              departmentId: departmentIds.get(p.department),
              baseSalary: p.baseSalary,
            })
          ).id,
    );
  }
  for (const e of biz.employees) {
    const found = await prisma.employee.findFirst({ where: { tenantId, employeeNo: e.no }, select: { id: true } });
    if (found) continue;
    const position = biz.positions.find((p) => p.code === e.position);
    await svc.hrm.createEmployee(tenantId, {
      employeeNo: e.no,
      fullName: e.name,
      departmentId: position ? departmentIds.get(position.department) : undefined,
      positionId: positionIds.get(e.position),
      employmentType: e.type,
      hireDate: e.hired,
      baseSalary: e.salary,
    });
  }
  log(`  ${biz.outlets.length} outlet, ${biz.employees.length} karyawan`);

  return { tenantId, roleIds };
}

function printSummary(rows: AccountRow[], secret: string, generated: boolean): void {
  const pad = (s: string, n: number) => s.padEnd(n);
  const w = {
    biz: Math.max(...rows.map((r) => r.business.length), 6),
    role: Math.max(...rows.map((r) => r.role.length), 4),
    email: Math.max(...rows.map((r) => r.email.length), 5),
    pw: Math.max(...rows.map((r) => r.password.length), 8),
  };
  log('\n================ AKUN ================');
  log(`${pad('Usaha', w.biz)}  ${pad('Peran', w.role)}  ${pad('Email', w.email)}  ${pad('Kata sandi', w.pw)}  Status`);
  for (const r of rows) {
    log(`${pad(r.business, w.biz)}  ${pad(r.role, w.role)}  ${pad(r.email, w.email)}  ${pad(r.password, w.pw)}  ${r.status}`);
  }
  if (generated) {
    log(`\nKunci induk dibangkitkan acak (SEED_MASTER_SECRET tidak diisi): ${secret}`);
    log('Simpan kunci ini. Tanpa itu kata sandi di atas tidak bisa diturunkan lagi untuk seed berikutnya.');
  }
  if (rows.some((r) => r.status === 'sudah ada, sandi BERBEDA')) {
    log('\nAda akun yang sudah ada dengan kata sandi berbeda dari turunan saat ini. Jalankan ulang dengan');
    log('SEED_RESET_PASSWORDS=yes bila ingin menyamakannya.');
  }
  log('\nCatat kata sandi dengan aman lalu hapus tampilan ini dari log/terminal. Ganti kata sandi setelah login pertama.');
}

async function main(): Promise<void> {
  const { secret, generated } = resolveMasterSecret(process.env);
  const reset = process.env.SEED_RESET_PASSWORDS === 'yes';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc: Services = {
      prisma: app.get(PrismaService),
      auth: app.get(AuthService),
      outlets: app.get(OutletsService),
      inventory: app.get(InventoryService),
      parties: app.get(PartyService),
      hrm: app.get(HrmService),
      manufacturing: app.get(ManufacturingService),
      workCenters: app.get(WorkCenterService),
    };
    const rows: AccountRow[] = [];
    let first: { tenantId: string; roleIds: Record<string, string> } | undefined;

    for (const [index, biz] of BUSINESSES.entries()) {
      const result = await seedBusiness(svc, biz, index, secret, reset, rows);
      first ??= result;
    }

    // Akun platform dilekatkan ke usaha pertama (sama seperti seed lama).
    if (first) {
      await ensureAccount(svc, rows, {
        business: '(platform)',
        tenantId: first.tenantId,
        roleId: first.roleIds.superadmin,
        role: 'superadmin',
        name: SUPERADMIN.name,
        email: SUPERADMIN.email,
        secret,
        reset,
        permissions: { all: true, superadmin: true },
      });
    }

    printSummary(rows, secret, generated);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nSeed gagal:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
