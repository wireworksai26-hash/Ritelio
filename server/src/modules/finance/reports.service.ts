import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { LEDGER_STATUSES } from '../accounting/ledger';
import type { ConsolidationQueryDto, ReportQueryDto } from './dto/report.dto';
import { FxService, type FxResult } from './fx.service';
import { openingRowsWithoutJournal } from './opening-balances';

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

interface AccountBalance {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
  ) {}

  /**
   * Nilai tukar untuk laporan. Semua jalur laporan lewat sini supaya konversi
   * tidak hanya berlaku di sebagian laporan.
   */
  async resolveFx(tenantId: string, companyId: string, asOf: Date, currency?: string) {
    return this.fx.rates(tenantId, companyId, asOf, currency);
  }

  /** Konversi mata uang dasar -> mata uang laporan, dibulatkan satu kali di tampilan. */
  private converter(fx: FxResult) {
    return (value: number) => roundMoney(this.fx.convert(fx, value, fx.baseCurrency).amount);
  }

  /**
   * Saldo per akun dalam mata uang dasar perusahaan (belum dikonversi).
   *
   * Jurnal `posted` dan `voided` ikut dihitung karena jurnal asal yang sudah dibalik
   * berstatus `voided` sementara pembaliknya `posted`; keduanya harus terbaca
   * berpasangan supaya saldo kembali ke semula (lihat `LEDGER_STATUSES`). Draft tidak
   * pernah ikut. Saldo awal yang tidak punya jurnal ditambahkan terpisah; yang sudah
   * punya jurnal tidak dihitung dua kali.
   */
  private async trialBase(tenantId: string, companyId: string, asOf: Date) {
    const [accounts, lines, openings] = await Promise.all([
      this.prisma.chartOfAccount.findMany({
        where: { tenantId, companyId },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.journalLine.groupBy({
        by: ['accountId', 'direction'],
        where: {
          tenantId,
          companyId,
          journal: { status: { in: LEDGER_STATUSES }, entryDate: { lte: asOf } },
        },
        _sum: { amount: true },
      }),
      openingRowsWithoutJournal(this.prisma, tenantId, companyId, asOf),
    ]);

    const debitByAccount = new Map<string, number>();
    const creditByAccount = new Map<string, number>();
    for (const row of [...lines, ...openings]) {
      const amount = Number(row._sum?.amount ?? 0);
      const target = row.direction === 'debit' ? debitByAccount : creditByAccount;
      target.set(row.accountId, (target.get(row.accountId) ?? 0) + amount);
    }

    const rows: AccountBalance[] = accounts
      .map((acc) => ({
        code: acc.code,
        name: acc.name,
        type: acc.type,
        debit: roundMoney(debitByAccount.get(acc.id) ?? 0),
        credit: roundMoney(creditByAccount.get(acc.id) ?? 0),
      }))
      .filter((r) => r.debit !== 0 || r.credit !== 0);

    return {
      rows,
      totalDebit: roundMoney(rows.reduce((s, r) => s + r.debit, 0)),
      totalCredit: roundMoney(rows.reduce((s, r) => s + r.credit, 0)),
    };
  }

  /**
   * Neraca Saldo (Trial Balance).
   *
   * Total debit harus sama dengan total kredit. Kalau tidak, itu berarti ada
   * jurnal tidak seimbang yang lolos — jadi sengaja ditampilkan sebagai
   * `balanced: false` alih-alih disembunyikan. Keseimbangan dinilai pada mata
   * uang dasar; konversi kurs hanya mengubah tampilan sehingga pembulatan per
   * baris tidak bisa membuat laporan tampak tidak seimbang.
   */
  async trialBalance(tenantId: string, query: ReportQueryDto, explicitCompanyId?: string) {
    const companyId = explicitCompanyId ?? (await defaultCompanyId(this.prisma, tenantId));
    const asOf = this.endOf(query.asOf);
    const fx = await this.resolveFx(tenantId, companyId, asOf, query.currency);
    const conv = this.converter(fx);

    const base = await this.trialBase(tenantId, companyId, asOf);
    return {
      asOf: this.fmt(asOf),
      currency: fx.reportingCurrency,
      fxFallbackUsed: fx.fallbackUsed,
      data: base.rows.map((r) => ({ ...r, debit: conv(r.debit), credit: conv(r.credit) })),
      totalDebit: conv(base.totalDebit),
      totalCredit: conv(base.totalCredit),
      difference: conv(base.totalDebit - base.totalCredit),
      balanced: base.totalDebit === base.totalCredit,
    };
  }

  /**
   * Neraca (Balance Sheet).
   *
   * Aset & kewajiban diambil langsung dari saldo akun. Ekuitas = akun ekuitas
   * yang memang dicatat (modal awal, laba ditahan) ditambah laba kumulatif
   * (pendapatan - beban, dihitung neto per akun dari awal pembukuan sampai
   * `asOf`). Belum ada jurnal penutup tahun, jadi akun pendapatan/beban tidak
   * pernah di-nol-kan; hanya laba kumulatif yang membuat assets = liabilities +
   * equity berlaku di tanggal mana pun.
   */
  async balanceSheet(tenantId: string, query: ReportQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const asOf = this.endOf(query.asOf);
    const fx = await this.resolveFx(tenantId, companyId, asOf, query.currency);
    const conv = this.converter(fx);
    const base = await this.trialBase(tenantId, companyId, asOf);

    const net = (types: AccountType[]) =>
      base.rows.filter((r) => types.includes(r.type)).reduce((s, r) => s + r.debit - r.credit, 0);

    const assetsBase = roundMoney(net(['asset']));
    const liabilitiesBase = roundMoney(-net(['liability']));
    const bookEquityBase = roundMoney(-net(['equity']));
    const profitBase = roundMoney(-net(['revenue', 'expense']));
    const equityBase = roundMoney(bookEquityBase + profitBase);
    const totalLiabilitiesEquityBase = roundMoney(liabilitiesBase + equityBase);

    const present = (type: AccountType) =>
      splitByType(base.rows, type).map((r) => ({ ...r, balance: conv(r.balance) }));
    const assetDetail = present('asset');
    // Saldo aset negatif hampir selalu berarti saldo awal persediaan belum
    // dijurnalkan. Nilainya tidak bisa disembunyikan, hanya dilaporkan.
    const negativeAssets = assetDetail
      .filter((r) => r.balance < 0)
      .map((r) => `${r.code} ${r.name} bersaldo negatif (${r.balance})`);

    return {
      asOf: this.fmt(asOf),
      currency: fx.reportingCurrency,
      fxFallbackUsed: fx.fallbackUsed,
      assets: { total: conv(assetsBase), detail: assetDetail },
      liabilities: { total: conv(liabilitiesBase), detail: present('liability') },
      equity: {
        total: conv(equityBase),
        bookEquity: conv(bookEquityBase),
        retainedProfit: conv(profitBase),
        detail: present('equity'),
      },
      totalLiabilitiesEquity: conv(totalLiabilitiesEquityBase),
      balanced: assetsBase === totalLiabilitiesEquityBase,
      warnings: negativeAssets,
    };
  }

  /**
   * Konsolidasi seluruh anak perusahaan dalam satu grup.
   *
   * Setiap company punya kurs dan saldo sendiri, jadi tidak boleh dijumlahkan
   * mentah. Nominal per company dikonversi ke reporting currency lebih dulu,
   * lalu digabung per kode akun. Company yang kursnya tidak tersedia ditandai
   * di `excluded` supaya angkanya tidak hilang diam-diam.
   */
  async consolidate(tenantId: string, query: ConsolidationQueryDto) {
    const asOf = this.endOf(query.asOf);
    const companies = await this.prisma.company.findMany({
      where: { tenantId, ...(query.companyId ? { id: query.companyId } : {}) },
      select: { id: true, code: true, name: true, defaultCurrencyCode: true, parentId: true },
      orderBy: { code: 'asc' },
    });
    if (companies.length === 0) throw new NotFoundException('Tidak ada perusahaan yang bisa dikonsolidasikan.');

    const targetCurrency = (query.currency ?? companies[0].defaultCurrencyCode ?? 'IDR').toUpperCase();
    const perCompany: Array<{
      companyId: string;
      code: string;
      name: string;
      currency: string;
      assets: number;
      liabilities: number;
      equity: number;
      profit: number;
      fxFallbackUsed: string[];
    }> = [];
    const byCode = new Map<string, { code: string; name: string; type: AccountType; debit: number; credit: number }>();
    const excluded: Array<{ code: string; reason: string }> = [];

    for (const company of companies) {
      const fx = await this.resolveFx(tenantId, company.id, asOf, targetCurrency);
      if (fx.fallbackUsed.length > 0) {
        excluded.push({
          code: company.code,
          reason: `Tidak ada kurs ${fx.baseCurrency} -> ${targetCurrency} pada ${this.fmt(asOf)}.`,
        });
        continue;
      }

      const companyId = company.id;
      const trial = await this.trialBase(tenantId, companyId, asOf);
      const profit = roundMoney(
        -trial.rows
          .filter((r) => r.type === 'revenue' || r.type === 'expense')
          .reduce((s, r) => s + r.debit - r.credit, 0),
      );

      const convert = (amount: number) => this.fx.convert(fx, amount, fx.baseCurrency).amount;
      for (const row of trial.rows) {
        const key = row.code;
        const existing = byCode.get(key) ?? { code: row.code, name: row.name, type: row.type, debit: 0, credit: 0 };
        existing.debit += convert(row.debit);
        existing.credit += convert(row.credit);
        byCode.set(key, existing);
      }

      const sumType = (types: AccountType[]) =>
        trial.rows
          .filter((r) => types.includes(r.type))
          .reduce((s, r) => s + r.debit - r.credit, 0);

      perCompany.push({
        companyId,
        code: company.code,
        name: company.name,
        currency: fx.baseCurrency,
        assets: roundMoney(convert(sumType(['asset']))),
        liabilities: roundMoney(-convert(sumType(['liability']))),
        equity: roundMoney(-convert(sumType(['equity'])) + convert(profit)),
        profit: roundMoney(convert(profit)),
        fxFallbackUsed: fx.fallbackUsed,
      });
    }

    const rows = [...byCode.values()]
      .map((r) => ({ ...r, debit: roundMoney(r.debit), credit: roundMoney(r.credit) }))
      .filter((r) => r.debit !== 0 || r.credit !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));

    const total = (fn: (r: { debit: number; credit: number }) => number) =>
      roundMoney(rows.reduce((s, r) => s + fn(r), 0));

    return {
      asOf: this.fmt(asOf),
      reportingCurrency: targetCurrency,
      companies: perCompany,
      excluded,
      byAccount: rows,
      totalAssets: total((r) => r.debit - r.credit),
      totalLiabilitiesEquity: total((r) => r.credit - r.debit),
      totalProfit: roundMoney(perCompany.reduce((s, c) => s + c.profit, 0)),
      // Selisih pembulatan konversi per perusahaan sebesar satu sen tidak boleh
      // membuat laporan dianggap tidak seimbang.
      balanced:
        Math.abs(
          roundMoney(perCompany.reduce((s, c) => s + c.assets, 0)) -
            roundMoney(perCompany.reduce((s, c) => s + c.liabilities + c.equity, 0)),
        ) <= 0.01 * Math.max(1, perCompany.length),
    };
  }

  /**
   * Buku Besar satu akun: saldo awal + mutasi + saldo berjalan.
   *
   * Tanpa `from`, saldo awal adalah 0 dan semua mutasi sampai `asOf` tampil di
   * baris (dulu semua baris juga dihitung sebagai saldo awal sehingga saldo
   * penutup berlipat dua). Dengan `from`, hari `from` itu sendiri ikut periode.
   */
  async generalLedger(tenantId: string, accountId: string, query: ReportQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { id: accountId, tenantId, companyId },
      select: { id: true, code: true, name: true, type: true },
    });
    if (!account) throw new NotFoundException('Akun tidak ditemukan pada company ini.');

    const to = this.endOf(query.asOf);
    const from = query.from ? this.startOf(query.from) : null;

    const lines = await this.prisma.journalLine.findMany({
      where: {
        tenantId,
        companyId,
        accountId,
        journal: { status: { in: LEDGER_STATUSES }, entryDate: { lte: to } },
      },
      select: {
        journalId: true,
        amount: true,
        direction: true,
        lineNo: true,
        memo: true,
        journal: { select: { number: true, entryDate: true, sourceModule: true, sourceRefId: true } },
      },
      orderBy: [{ journal: { entryDate: 'asc' } }, { lineNo: 'asc' }],
    });

    const isDebitNormal = account.type === 'asset' || account.type === 'expense';
    const sign = (dir: string, amount: number) => {
      const signed = dir === 'debit' ? amount : -amount;
      return isDebitNormal ? signed : -signed;
    };

    // Saldo awal tanpa jurnal (data lama) menjadi titik awal buku besar.
    const legacy = (await openingRowsWithoutJournal(this.prisma, tenantId, companyId, to))
      .filter((r) => r.accountId === accountId)
      .reduce((s, r) => s + sign(r.direction, Number(r._sum.amount ?? 0)), 0);

    const openingLines = from ? lines.filter((l) => new Date(l.journal.entryDate) < from) : [];
    const periodLines = from ? lines.filter((l) => new Date(l.journal.entryDate) >= from) : lines;

    const opening = roundMoney(legacy + openingLines.reduce((s, l) => s + sign(l.direction, Number(l.amount)), 0));
    let running = opening;

    const rows = periodLines.map((l) => {
      const amount = Number(l.amount);
      running = roundMoney(running + sign(l.direction, amount));
      return {
        journalNumber: l.journal.number,
        date: this.fmt(new Date(l.journal.entryDate)),
        sourceModule: l.journal.sourceModule,
        sourceRefId: l.journal.sourceRefId,
        memo: l.memo,
        debit: l.direction === 'debit' ? amount : 0,
        credit: l.direction === 'credit' ? amount : 0,
        balance: running,
      };
    });

    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type },
      period: { from: from ? this.fmt(from) : null, to: this.fmt(to) },
      openingBalance: opening,
      closingBalance: running,
      data: rows,
    };
  }

  private endOf(value?: string): Date {
    if (!value) return new Date();
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Tanggal tidak valid.');
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private startOf(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Tanggal tidak valid.');
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/**
 * Detail memakai konvensi tanda yang sama dengan total, jadi jumlah detail
 * selalu sama dengan total. Akun Persediaan bernilai negatif (kredit
 * melebihi debit) harus tetap tampil negatif — memakai Math.abs() akan
 * menyembunyikan saldo negatif sekaligus membuat detail tidak cocok dengan
 * total.
 */
function splitByType(rows: AccountBalance[], type: AccountType) {
  const debitNormal = type === 'asset' || type === 'expense';
  return rows
    .filter((r) => r.type === type)
    .map((r) => ({
      code: r.code,
      name: r.name,
      balance: roundMoney(debitNormal ? r.debit - r.credit : r.credit - r.debit),
    }));
}
