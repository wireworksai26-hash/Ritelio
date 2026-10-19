import type { INestApplicationContext, Type } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';
import { ownerEmailOf, staffEmailOf, type BusinessSeed } from '../businesses.data';

/**
 * Konteks bersama untuk seed data transaksi contoh ("demo data"). Satu konteks per usaha.
 *
 * Aturan main untuk semua domain demo:
 *  - Semua perubahan uang/stok lewat SERVICE aplikasi (ctx.get(...)), jangan insert mentah ke tabel
 *    jurnal atau stok. Insert mentah hanya untuk kolom kosmetik non-keuangan dan harus diberi komentar.
 *  - Idempoten: dijalankan ulang tidak boleh menggandakan data. Pakai kunci alami yang deterministik
 *    (nomor faktur pemasok, kode, catatan berawalan "[demo]", dst.). Penanda domain (isDomainDone) hanya
 *    pengaman kedua.
 *  - Tanggal selalu lewat ctx.daysAgo / ctx.at. Tidak pernah sebelum 1 Januari tahun berjalan, karena
 *    kalender fiskal hanya dibuat untuk tahun itu.
 *  - Stok tidak boleh negatif dan buku besar harus tetap seimbang.
 */

export type DemoRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'staff';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: DemoRole;
}

export interface DemoProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  productType: string;
  sellPrice: number;
  costPrice: number;
}

export interface DemoContext {
  app: INestApplicationContext;
  prisma: PrismaService;
  /** Ambil service/provider aplikasi, mis. ctx.get(PurchasingService). */
  get<T>(token: Type<T> | (abstract new (...args: never[]) => T)): T;

  biz: BusinessSeed;
  /** 0 = Kopi Senja, 1 = Roti Nusantara, 2 = Laundry Segar Jaya */
  index: number;
  tenantId: string;
  /** Perusahaan utama (MAIN) tenant ini. */
  companyId: string;

  users: Record<DemoRole, DemoUser>;
  /** Urutan sama dengan biz.outlets. */
  outletIds: string[];
  /** Gudang bawaan tiap outlet, urutan sama dengan outletIds. */
  warehouseIds: string[];

  productIds: Map<string, string>;
  products: Map<string, DemoProduct>;
  supplierIds: Map<string, string>;
  customerIds: Map<string, string>;
  employeeIds: Map<string, string>;

  /** AuthUser untuk service yang membutuhkan aktor. */
  actor(role: DemoRole): AuthUser;
  product(sku: string): DemoProduct;

  /** Tanggal n hari lalu, tengah hari WIB, tidak sebelum awal tahun berjalan. */
  daysAgo(n: number): Date;
  /** Tanggal n hari lalu pada jam (WIB) tertentu, tidak sebelum awal tahun berjalan. */
  at(daysAgo: number, hourWib: number, minute?: number): Date;
  /** YYYY-MM-DD */
  isoDay(d: Date): string;
  log(msg: string): void;
}

const WIB_OFFSET_HOURS = 7;

function startOfYearUtc(): number {
  return Date.UTC(new Date().getUTCFullYear(), 0, 2); // 2 Jan: aman dari selisih zona waktu
}

export function makeDateHelpers(now: Date = new Date()) {
  const floor = Date.UTC(now.getUTCFullYear(), 0, 2);
  const clamp = (ms: number) => new Date(Math.max(ms, floor));
  return {
    daysAgo(n: number): Date {
      const d = new Date(now.getTime());
      d.setUTCHours(12 - WIB_OFFSET_HOURS, 0, 0, 0);
      return clamp(d.getTime() - n * 86_400_000);
    },
    at(daysAgo: number, hourWib: number, minute = 0): Date {
      const d = new Date(now.getTime());
      d.setUTCHours(hourWib - WIB_OFFSET_HOURS, minute, 0, 0);
      return clamp(d.getTime() - daysAgo * 86_400_000);
    },
    isoDay(d: Date): string {
      return d.toISOString().slice(0, 10);
    },
  };
}

export async function buildContext(
  app: INestApplicationContext,
  biz: BusinessSeed,
  index: number,
  log: (msg: string) => void,
): Promise<DemoContext | null> {
  const prisma = app.get(PrismaService);

  const owner = await prisma.user.findFirst({ where: { email: ownerEmailOf(biz) }, select: { id: true, tenantId: true } });
  if (!owner) return null; // seed:businesses belum dijalankan untuk usaha ini
  const tenantId = owner.tenantId;

  const company = await prisma.company.findFirstOrThrow({ where: { tenantId, code: 'MAIN' }, select: { id: true } });

  const userRows = await prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true, email: true } });
  const byEmail = new Map(userRows.map((u) => [u.email, u]));
  const need = (email: string) => {
    const u = byEmail.get(email);
    if (!u) throw new Error(`Akun ${email} tidak ditemukan; jalankan seed:businesses dulu.`);
    return u;
  };
  const ownerUser = need(ownerEmailOf(biz));
  const users = { owner: { ...ownerUser, role: 'owner' } } as Record<DemoRole, DemoUser>;
  for (const s of biz.staff) users[s.role] = { ...need(staffEmailOf(biz, s)), role: s.role };

  const outletIds: string[] = [];
  const warehouseIds: string[] = [];
  for (const o of biz.outlets) {
    const outlet = await prisma.outlet.findFirstOrThrow({ where: { tenantId, name: o.name }, select: { id: true } });
    const wh = await prisma.warehouse.findFirstOrThrow({ where: { tenantId, outletId: outlet.id }, select: { id: true } });
    outletIds.push(outlet.id);
    warehouseIds.push(wh.id);
  }

  const productRows = await prisma.product.findMany({
    where: { tenantId },
    select: { id: true, sku: true, name: true, unit: true, productType: true, sellPrice: true, costPrice: true },
  });
  const products = new Map<string, DemoProduct>();
  for (const p of productRows) {
    products.set(p.sku, {
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      productType: String(p.productType),
      sellPrice: Number(p.sellPrice),
      costPrice: Number(p.costPrice),
    });
  }
  const productIds = new Map([...products.values()].map((p) => [p.sku, p.id]));

  const suppliers = await prisma.supplier.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const customers = await prisma.customer.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const employees = await prisma.employee.findMany({ where: { tenantId }, select: { id: true, employeeNo: true } });

  const dates = makeDateHelpers();
  const ctx: DemoContext = {
    app,
    prisma,
    get: (token) => app.get(token as Type<unknown>, { strict: false }) as never,
    biz,
    index,
    tenantId,
    companyId: company.id,
    users,
    outletIds,
    warehouseIds,
    productIds,
    products,
    supplierIds: new Map(suppliers.map((s) => [s.name, s.id])),
    customerIds: new Map(customers.map((c) => [c.name, c.id])),
    employeeIds: new Map(employees.map((e) => [e.employeeNo, e.id])),
    actor: (role) => ({ sub: users[role].id, tenantId, role, email: users[role].email }),
    product: (sku) => {
      const p = products.get(sku);
      if (!p) throw new Error(`Produk ${sku} tidak ada di ${biz.businessName}.`);
      return p;
    },
    daysAgo: dates.daysAgo,
    at: dates.at,
    isoDay: dates.isoDay,
    log: (msg) => log(`  [${biz.key}] ${msg}`),
  };
  return ctx;
}

// ───────── penanda domain selesai (disimpan di Tenant.settings.demo) ─────────

type SettingsShape = { demo?: Record<string, string> } & Record<string, unknown>;

async function readSettings(ctx: DemoContext): Promise<SettingsShape> {
  const t = await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { settings: true } });
  return (t.settings && typeof t.settings === 'object' && !Array.isArray(t.settings) ? t.settings : {}) as SettingsShape;
}

export async function isDomainDone(ctx: DemoContext, key: string): Promise<boolean> {
  return Boolean((await readSettings(ctx)).demo?.[key]);
}

export async function markDomainDone(ctx: DemoContext, key: string): Promise<void> {
  const settings = await readSettings(ctx);
  const next: SettingsShape = { ...settings, demo: { ...(settings.demo ?? {}), [key]: new Date().toISOString() } };
  await ctx.prisma.tenant.update({ where: { id: ctx.tenantId }, data: { settings: next as Prisma.InputJsonValue } });
}

export interface DemoDomain {
  /** Kunci pendek untuk SEED_DEMO_ONLY dan penanda, mis. 'supply'. */
  key: string;
  title: string;
  /**
   * false = kerangka yang belum diisi. Domain seperti ini DILEWATI dan tidak ditandai selesai, supaya setelah
   * diisi kelak ia tetap berjalan (kalau tidak, penanda "selesai" dari kerangka kosong akan menghalanginya).
   */
  implemented?: boolean;
  run(ctx: DemoContext): Promise<void>;
}

export type RunDecision = 'run' | 'skip-filtered' | 'skip-not-implemented' | 'skip-done';

/** Keputusan murni apakah sebuah domain dijalankan; dipisah dari orchestrator agar bisa diuji. */
export function decideRun(
  domain: Pick<DemoDomain, 'key' | 'implemented'>,
  opts: { only: string[]; force: boolean; done: boolean },
): RunDecision {
  if (opts.only.length > 0 && !opts.only.includes(domain.key)) return 'skip-filtered';
  if (domain.implemented === false) return 'skip-not-implemented';
  if (!opts.force && opts.done) return 'skip-done';
  return 'run';
}
