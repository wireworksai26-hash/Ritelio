import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { FxService } from '../finance/fx.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { LEDGER_STATUSES } from '../accounting/ledger';
import { outstandingOf } from '../finance/document-amounts';
import { openingRowsWithoutJournal } from '../finance/opening-balances';

export interface DashboardSnapshot {
  periodDays: number;
  currency: string;
  fxFallbackUsed: string[];
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  netProfit: number;
  marginPct: number;
  cash: number;
  receivable: number;
  payable: number;
  inventory: number;
  assets: number;
  liabilities: number;
  equity: number;
  salesTrend: Array<{ date: string; revenue: number; transactions: number }>;
  topProducts: Array<{ sku: string; name: string; qty: number; revenue: number }>;
  lowStock: Array<{ sku: string; name: string; onHand: number; minThreshold: number }>;
  openPayables: number;
  openReceivables: number;
}

/**
 * Ringkasan dashboard untuk BI. Semua angka berasal dari buku besar dan
 * dokumen, bukan dari tabel transaksi, supaya sama dengan laporan resmi.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
  ) {}

  async snapshot(tenantId: string, days = 30, currency?: string): Promise<DashboardSnapshot> {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const fxResult = await this.fx.rates(tenantId, companyId, new Date(), currency);
    const toReporting = (value: number) => this.fx.convert(fxResult, value, fxResult.baseCurrency).amount;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const now = new Date();
    const until = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [plRows, plAccounts, txRows, topItems, lowStock, bills, invoices, balances] =
      await Promise.all([
        this.prisma.journalLine.groupBy({
          by: ['accountId', 'direction'],
          where: {
            tenantId,
            companyId,
            journal: { status: { in: LEDGER_STATUSES }, entryDate: { gte: since, lte: until } },
            account: { type: { in: ['revenue', 'expense'] } },
          },
          _sum: { amount: true },
        }),
        this.prisma.chartOfAccount.findMany({
          where: { tenantId, companyId, type: { in: ['revenue', 'expense'] } },
          select: { id: true, code: true, type: true },
        }),
        this.prisma.salesTransaction.findMany({
          where: {
            tenantId,
            companyId,
            syncStatus: 'synced',
            clientTimestamp: { gte: since },
          },
          select: { total: true, clientTimestamp: true },
        }),
        this.prisma.salesTransactionItem.groupBy({
          by: ['productId'],
          where: { transaction: { tenantId, companyId, syncStatus: 'synced', clientTimestamp: { gte: since } } },
          _sum: { qty: true, price: true },
        }),
        this.prisma.inventoryStock.findMany({
          where: { tenantId, companyId },
          select: { quantity: true, minThreshold: true, product: { select: { sku: true, name: true } } },
        }),
        this.prisma.vendorBill.findMany({
          where: { tenantId, companyId, status: { in: ['open', 'partial'] } },
          select: { total: true, taxTotal: true, paidAmount: true },
        }),
        this.prisma.customerInvoice.findMany({
          where: { tenantId, companyId, status: { in: ['open', 'partial'] } },
          select: { total: true, taxTotal: true, paidAmount: true },
        }),
        this.ledgerBalances(tenantId, companyId, until),
      ]);

    // Neto per akun: jurnal pembalik/retur mengurangi pendapatan dan beban.
    const plAccountById = new Map(plAccounts.map((a) => [a.id, a]));
    let revenueRaw = 0;
    let cogs = 0;
    let opex = 0;
    for (const row of plRows) {
      const account = plAccountById.get(row.accountId);
      if (!account) continue;
      const amount = Number(row._sum.amount ?? 0);
      const debitMinusCredit = row.direction === 'debit' ? amount : -amount;
      if (account.type === 'revenue') revenueRaw -= debitMinusCredit;
      else if (/^5\d+$/.test(account.code)) cogs += debitMinusCredit;
      else opex += debitMinusCredit;
    }
    const revenue = roundMoney(revenueRaw);
    cogs = roundMoney(cogs);
    opex = roundMoney(opex);

    const grossProfit = roundMoney(revenue - cogs);
    const netProfit = roundMoney(grossProfit - opex);

    // Tren harian penjualan
    const trend = new Map<string, { revenue: number; transactions: number }>();
    for (const tx of txRows) {
      const key = tx.clientTimestamp.toISOString().slice(0, 10);
      const cur = trend.get(key) ?? { revenue: 0, transactions: 0 };
      cur.revenue += Number(tx.total);
      cur.transactions += 1;
      trend.set(key, cur);
    }
    const salesTrend = [...trend.entries()]
      .map(([date, v]) => ({ date, revenue: roundMoney(v.revenue), transactions: v.transactions }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const productIds = topItems.map((i) => i.productId);
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, sku: true, name: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));
    const topProducts = topItems
      .map((i) => {
        const p = productMap.get(i.productId);
        const qty = Number(i._sum.qty ?? 0);
        return {
          sku: p?.sku ?? i.productId,
          name: p?.name ?? '-',
          qty,
          revenue: roundMoney(qty * Number(i._sum.price ?? 0)),
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const lowStockList = lowStock
      .filter((s) => Number(s.minThreshold) > 0 && Number(s.quantity) <= Number(s.minThreshold))
      .map((s) => ({
        sku: s.product.sku,
        name: s.product.name,
        onHand: Number(s.quantity),
        minThreshold: Number(s.minThreshold),
      }))
      .slice(0, 10);

return {
      periodDays: days,
      currency: fxResult.reportingCurrency,
      fxFallbackUsed: fxResult.fallbackUsed,
      revenue: roundMoney(toReporting(revenue)),
      cogs: roundMoney(toReporting(cogs)),
      grossProfit: roundMoney(toReporting(grossProfit)),
      opex: roundMoney(toReporting(opex)),
      netProfit: roundMoney(toReporting(netProfit)),
      marginPct: revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0,
      cash: balances.cash,
      receivable: balances.receivable,
      payable: balances.payable,
      inventory: balances.inventory,
      assets: balances.assets,
      liabilities: balances.liabilities,
      equity: balances.equity,
      salesTrend,
      topProducts,
      lowStock: lowStockList,
openPayables: roundMoney(toReporting(bills.reduce((sum, b) => sum + outstandingOf(b), 0))),
      openReceivables: roundMoney(toReporting(invoices.reduce((sum, i) => sum + outstandingOf(i), 0))),
    };
  }

  private async ledgerBalances(tenantId: string, companyId: string, until: Date) {
    const [rows, openings] = await Promise.all([
      this.prisma.journalLine.groupBy({
        by: ['accountId', 'direction'],
        where: { tenantId, companyId, journal: { status: { in: LEDGER_STATUSES }, entryDate: { lte: until } } },
        _sum: { amount: true },
      }),
      // Saldo awal tanpa jurnal wajib ikut dihitung; yang sudah dijurnalkan
      // tidak boleh dihitung dua kali. Hasilnya harus sama dengan Neraca.
      openingRowsWithoutJournal(this.prisma, tenantId, companyId, until),
    ]);
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, companyId },
      select: { id: true, code: true, type: true },
    });
    const debit = new Map<string, number>();
    const credit = new Map<string, number>();
    for (const r of [...rows, ...openings]) {
      const amount = Number(r._sum?.amount ?? 0);
      if (r.direction === 'debit') debit.set(r.accountId, (debit.get(r.accountId) ?? 0) + amount);
      else credit.set(r.accountId, (credit.get(r.accountId) ?? 0) + amount);
    }

    let assets = 0;
    let liabilities = 0;
    let equityBook = 0;
    let cash = 0;
    let receivable = 0;
    let inventory = 0;
    let payable = 0;

    for (const a of accounts) {
      const net = (debit.get(a.id) ?? 0) - (credit.get(a.id) ?? 0);
      if (a.type === 'asset') assets += net;
      else if (a.type === 'liability') liabilities += -net;
      else if (a.type === 'equity') equityBook += -net;

      if (a.type === 'asset' && /^1\d+$/.test(a.code)) {
        if (a.code === CASH_CODE) cash += net;
        else if (/^11/.test(a.code)) inventory += net;
        else receivable += net;
      }
      if (a.type === 'liability') payable += -net;
    }

    // Laba kumulatif (belum ada jurnal penutup tahun): sama dengan Neraca.
    let profit = 0;
    for (const a of accounts) {
      if (a.type !== 'revenue' && a.type !== 'expense') continue;
      profit -= (debit.get(a.id) ?? 0) - (credit.get(a.id) ?? 0);
    }
    const equity = roundMoney(equityBook + profit);

    return {
      cash: roundMoney(cash),
      receivable: roundMoney(receivable),
      inventory: roundMoney(inventory),
      payable: roundMoney(payable),
      assets: roundMoney(assets),
      liabilities: roundMoney(liabilities),
      equity,
    };
  }
}

const CASH_CODE = '1000';