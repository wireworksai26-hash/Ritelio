import type { NotificationType } from '@prisma/client';
import { LEDGER_STATUSES } from '../../../modules/accounting/ledger';
import { outstandingOf } from '../../../modules/finance/document-amounts';
import { formatRupiah } from './format';
import type { FinanceEnv } from './env';

interface Draft {
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  /** berapa jam lalu */
  hoursAgo: number;
  toOwner: boolean;
}

/**
 * Notifikasi untuk owner. NotificationsService hanya punya baca/tandai-terbaca (tanpa API membuat), dan modul lain
 * (penjualan, pengadaan) juga membuat baris notifikasi langsung lewat Prisma; mengikuti pola itu. Bukan data uang.
 * Isi diambil dari data yang benar-benar ada, bukan karangan. Kunci alami: judul (dicek per tenant).
 */
export async function seedNotifications(env: FinanceEnv): Promise<number> {
  const { ctx } = env;
  const drafts: Draft[] = [];

  const pending = await ctx.prisma.approvalRequest.count({ where: { tenantId: ctx.tenantId, companyId: ctx.companyId, status: 'pending' } });
  if (pending > 0) {
    drafts.push({
      type: 'approval',
      title: 'Persetujuan menunggu keputusan Anda',
      body: `${pending} dokumen menunggu persetujuan: tagihan pemasok, pengajuan pengeluaran, dan pesanan pembelian.`,
      link: '/app/approvals',
      hoursAgo: 3,
      toOwner: true,
    });
  }

  const openBills = await ctx.prisma.vendorBill.findMany({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, status: { in: ['open', 'partial'] } },
    orderBy: { dueDate: 'asc' },
    take: 1,
    select: { number: true, dueDate: true, total: true, taxTotal: true, paidAmount: true, supplier: { select: { name: true } } },
  });
  for (const b of openBills) {
    const late = b.dueDate.getTime() < Date.now();
    drafts.push({
      type: 'approval',
      title: late ? `Tagihan ${b.supplier.name} lewat jatuh tempo` : `Tagihan ${b.supplier.name} segera jatuh tempo`,
      body: `Faktur ${b.number} senilai ${formatRupiah(outstandingOf(b))} jatuh tempo ${b.dueDate.toISOString().slice(0, 10)}.`,
      link: '/app/billing',
      hoursAgo: 8,
      toOwner: true,
    });
  }

  const invoices = await ctx.prisma.customerInvoice.findMany({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, status: { in: ['open', 'partial'] }, dueDate: { lt: new Date() } },
    orderBy: { dueDate: 'asc' },
    take: 1,
    select: { number: true, dueDate: true, total: true, taxTotal: true, paidAmount: true },
  });
  for (const inv of invoices) {
    drafts.push({
      type: 'approval',
      title: `Faktur ${inv.number} jatuh tempo`,
      body: `Sisa tagihan ${formatRupiah(outstandingOf(inv))} sudah lewat ${inv.dueDate.toISOString().slice(0, 10)}. Kirim pengingat ke pelanggan.`,
      link: '/app/billing',
      hoursAgo: 20,
      toOwner: true,
    });
  }

  const stocks = await ctx.prisma.inventoryStock.groupBy({ by: ['productId'], where: { tenantId: ctx.tenantId }, _sum: { quantity: true } });
  const qtyOf = new Map(stocks.map((s) => [s.productId, Number(s._sum.quantity ?? 0)]));
  const products = await ctx.prisma.product.findMany({
    where: { tenantId: ctx.tenantId, isActive: true, productType: { not: 'service' }, reorderPoint: { gt: 0 } },
    select: { id: true, name: true, unit: true, reorderPoint: true },
  });
  const low = products
    .map((p) => ({ p, qty: qtyOf.get(p.id) ?? 0 }))
    .filter((x) => x.qty <= Number(x.p.reorderPoint))
    .sort((a, b) => a.qty / Number(a.p.reorderPoint || 1) - b.qty / Number(b.p.reorderPoint || 1))
    .slice(0, 2);
  low.forEach(({ p, qty }, i) =>
    drafts.push({
      type: 'low_stock',
      title: `Stok menipis: ${p.name}`,
      body: `Sisa ${qty} ${p.unit} (titik pesan ulang ${Number(p.reorderPoint)}). Perlu restock.`,
      link: '/app/inventory',
      hoursAgo: 30 + i * 18,
      toOwner: false,
    }),
  );

  const unreconciled = await ctx.prisma.bankStatement.count({ where: { tenantId: ctx.tenantId, companyId: ctx.companyId, isReconciled: false } });
  if (unreconciled > 0) {
    drafts.push({
      type: 'insight_digest',
      title: 'Mutasi bank menunggu rekonsiliasi',
      body: `${unreconciled} mutasi rekening belum dicocokkan dengan jurnal kas. Tinjau di menu Kas & Bank.`,
      link: '/app/banking',
      hoursAgo: 26,
      toOwner: true,
    });
  }

  const lastDep = await ctx.prisma.depreciationSchedule.findFirst({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId },
    orderBy: { period: { startDate: 'desc' } },
    select: { period: { select: { name: true, code: true } } },
  });
  if (lastDep) {
    const sum = await ctx.prisma.depreciationSchedule.aggregate({
      where: { tenantId: ctx.tenantId, companyId: ctx.companyId, period: { code: lastDep.period.code } },
      _sum: { depreciation: true },
    });
    drafts.push({
      type: 'insight_digest',
      title: `Penyusutan ${lastDep.period.name} sudah dijurnal`,
      body: `Beban penyusutan aset tetap sebesar ${formatRupiah(Number(sum._sum.depreciation ?? 0))} tercatat otomatis.`,
      link: '/app/assets',
      hoursAgo: 60,
      toOwner: false,
    });
  }

  const net = await ledgerNet(env);
  drafts.push({
    type: 'insight_digest',
    title: 'Ringkasan keuangan 30 hari terakhir',
    body: net,
    link: '/app/finance',
    hoursAgo: 42,
    toOwner: true,
  });

  let created = 0;
  for (const d of drafts) {
    const exists = await ctx.prisma.notification.findFirst({ where: { tenantId: ctx.tenantId, title: d.title }, select: { id: true } });
    if (exists) continue;
    await ctx.prisma.notification.create({
      data: {
        tenantId: ctx.tenantId,
        userId: d.toOwner ? ctx.users.owner.id : null,
        type: d.type,
        title: d.title,
        body: d.body,
        link: d.link,
        read: d.hoursAgo > 40,
        createdAt: new Date(Date.now() - d.hoursAgo * 3_600_000),
      },
    });
    created++;
  }
  return created;
}

async function ledgerNet(env: FinanceEnv): Promise<string> {
  const { ctx } = env;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await ctx.prisma.journalLine.groupBy({
    by: ['accountId', 'direction'],
    where: {
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      journal: { status: { in: LEDGER_STATUSES }, entryDate: { gte: since } },
      account: { type: { in: ['revenue', 'expense'] } },
    },
    _sum: { amount: true },
  });
  const accounts = await ctx.prisma.chartOfAccount.findMany({
    where: { tenantId: ctx.tenantId, companyId: ctx.companyId, type: { in: ['revenue', 'expense'] } },
    select: { id: true, type: true },
  });
  const type = new Map(accounts.map((a) => [a.id, a.type]));
  let revenue = 0;
  let expense = 0;
  for (const r of rows) {
    const amount = Number(r._sum.amount ?? 0);
    const dr = r.direction === 'debit' ? amount : -amount;
    if (type.get(r.accountId) === 'revenue') revenue -= dr;
    else expense += dr;
  }
  return `Pendapatan ${formatRupiah(revenue)}, beban ${formatRupiah(expense)}, selisih ${formatRupiah(revenue - expense)}.`;
}
