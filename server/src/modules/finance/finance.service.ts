import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { roundMoney } from '../../common/utils/money';
import { defaultCompanyId } from '../../common/utils/default-company';
import { JournalService } from '../accounting/journal.service';
import { LEDGER_STATUSES } from '../accounting/ledger';
import { FxService } from './fx.service';
import type { CreateEntryDto, ResolveAnomalyDto } from './dto/finance.dto';

interface CashflowPoint {
  date: string;
  inflow: number;
  outflow: number;
  forecast: boolean;
}

/** Klasifikasi akun HPP memakai awalan kode 5 (konvensi PSAK). */
const COGS_CODE_PREFIX = /^5\d+$/;

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
    private readonly fx: FxService,
  ) {}

  /** Format tanggal lokal menjadi 'YYYY-MM-DD'. */
  private fmtDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Akhir hari (23:59:59.999) waktu lokal. */
  private endOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  /** Awal hari (00:00) waktu lokal. */
  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /**
   * Escape nilai CSV untuk spreadsheet.
   * Selain quoting, menutup formula injection: Excel/LibreOffice/Sheets mengeksekusi
   * sel yang diawali =, +, -, @ atau karakter kontrol saat file dibuka.
   */
  private csvCell(value: string): string {
    const neutralized = /^[\s]*[=+\-@\t\r]/.test(value) || /^[\t\r]/.test(value)
      ? `'${value}`
      : value;
    if (/[",\n\r]/.test(neutralized)) {
      return `"${neutralized.replace(/"/g, '""')}"`;
    }
    return neutralized;
  }

  /** Format angka rupiah untuk pesan notifikasi. */
  private rupiah(n: number): string {
    return `Rp ${n.toLocaleString('id-ID')}`;
  }

  /** Laporan laba rugi ringkas untuk N hari terakhir. */
  /**
   * Laporan laba rugi diturunkan dari buku besar (journal_lines), bukan dari
   * tabel transaksi. Alasannya: HPP pada jurnal memakai moving average saat
   * penjualan terjadi, sementara product.costPrice hanya harga master. Kalau
   * laporan memakai harga master, angka laporan tidak akan cocok dengan jurnal
   * dan laba menipu.
   *
   * Klasifikasi memakai konvensi kode akun PSAK: 5xxx = HPP, selain itu = beban
   * operasional.
   */
  async profitLoss(tenantId: string, days = 30, currency?: string) {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const until = this.endOfDay(now);
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const fx = await this.fx.rates(tenantId, companyId, now, currency);
    const toReporting = (value: number) => this.fx.convert(fx, value, fx.baseCurrency).amount;

    // Neto per akun (debit - kredit): jurnal pembalik dan retur mengurangi
    // pendapatan/beban, bukan diabaikan. Jurnal asal yang sudah dibalik
    // (voided) ikut terbaca agar pasangannya saling meniadakan.
    const rows = await this.prisma.journalLine.groupBy({
      by: ['accountId', 'direction'],
      where: {
        tenantId,
        companyId,
        journal: { status: { in: LEDGER_STATUSES }, entryDate: { gte: since, lte: until } },
        account: { type: { in: ['revenue', 'expense'] } },
      },
      _sum: { amount: true },
    });
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, companyId, type: { in: ['revenue', 'expense'] } },
      select: { id: true, code: true, type: true },
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    let revenueBase = 0;
    let cogsBase = 0;
    let opexBase = 0;
    for (const row of rows) {
      const account = accountById.get(row.accountId);
      if (!account) continue;
      const amount = Number(row._sum.amount ?? 0);
      const debitMinusCredit = row.direction === 'debit' ? amount : -amount;
      if (account.type === 'revenue') revenueBase -= debitMinusCredit;
      else if (COGS_CODE_PREFIX.test(account.code)) cogsBase += debitMinusCredit;
      else opexBase += debitMinusCredit;
    }

    const revenue = roundMoney(toReporting(roundMoney(revenueBase)));
    const cogsRounded = roundMoney(toReporting(roundMoney(cogsBase)));
    const opexRounded = roundMoney(toReporting(roundMoney(opexBase)));
    const gross = roundMoney(revenue - cogsRounded);
    const net = roundMoney(gross - opexRounded);
    const marginPct = revenue > 0 ? Math.round((gross / revenue) * 100) : 0;

    return {
      periodDays: days,
      from: this.fmtDate(since),
      to: this.fmtDate(now),
      currency: fx.reportingCurrency,
      fxFallbackUsed: fx.fallbackUsed,
      revenue,
      cogs: cogsRounded,
      gross,
      opex: opexRounded,
      net,
      marginPct,
    };
  }

  /** Arus kas aktual per hari + prakiraan linear sederhana (lokal, tanpa modul AI). */
  async cashflow(tenantId: string, days = 14, forecastDays = 30, currency?: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const today = this.startOfDay(new Date());
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));

    // Arus kas dihitung dari jurnal GL, bukan dari tabel transaksi.
    // Membaca `salesTransaction`/`financialEntry` dulu berarti laporan bisa
    // berbeda dari buku besar untuk nominal yang sama — melanggar prinsip
    // "GL adalah satu-satunya sumber kebenaran".
    const fx = await this.fx.rates(tenantId, companyId, new Date(), currency);
    const toReporting = (value: number) => this.fx.convert(fx, value, fx.baseCurrency).amount;

    const cashAccountIds = await this.cashAccountIds(tenantId, companyId);
    if (cashAccountIds.length === 0) {
      throw new NotFoundException(
        'Akun kas belum ada pada COA perusahaan, arus kas tidak bisa dihitung.',
      );
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        tenantId,
        companyId,
        accountId: { in: cashAccountIds },
        journal: { status: { in: LEDGER_STATUSES }, entryDate: { gte: start, lte: this.endOfDay(today) } },
      },
      select: { direction: true, amount: true, journal: { select: { entryDate: true } } },
    });

    const inflowMap = new Map<string, number>();
    const outflowMap = new Map<string, number>();
    for (const line of lines) {
      const key = this.fmtDate(new Date(line.journal.entryDate));
      const target = line.direction === 'debit' ? inflowMap : outflowMap;
      target.set(key, (target.get(key) ?? 0) + Number(line.amount));
    }

    // Seri aktual: dari (hari ini - (days-1)) sampai hari ini
    const series: CashflowPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = this.fmtDate(d);
      series.push({
        date: key,
        inflow: Math.round(toReporting(inflowMap.get(key) ?? 0)),
        outflow: Math.round(toReporting(outflowMap.get(key) ?? 0)),
        forecast: false,
      });
    }

// Prakiraan memakai pola mingguan aktual, bukan garis lurus. Pemerataan juga
    // memperhitungkan hari dengan toko tutup: hari yang kosong dianggap tutup,
    // bukan omzet nol.
    const avgIn = averageByWeekday(series, 'inflow');
    const avgOut = averageByWeekday(series, 'outflow');
    const weekdayAverages = avgIn.length > 0;

    for (let i = 1; i <= forecastDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      if (!weekdayAverages) continue;
      const weekday = d.getDay();
      series.push({
        date: this.fmtDate(d),
        inflow: Math.round(toReporting(avgIn[weekday] ?? 0)),
        outflow: Math.round(toReporting(avgOut[weekday] ?? 0)),
        forecast: true,
      });
    }

    const actual = series.filter((p) => !p.forecast);
    return {
      days,
      forecastDays,
      series,
      currency: fx.reportingCurrency,
      fxFallbackUsed: fx.fallbackUsed,
      totals: {
        inflow: actual.reduce((s, p) => s + p.inflow, 0),
        outflow: actual.reduce((s, p) => s + p.outflow, 0),
        net: actual.reduce((s, p) => s + p.inflow - p.outflow, 0),
      },
      method: weekdayAverages
        ? 'pola mingguan dari jurnal GL'
        : 'belum ada data cukup untuk prakiraan',
    };
  }

  /**
   * Akun kas = akun 1000 ditambah akun COA yang ditautkan ke rekening bank aktif,
   * supaya penerimaan/pembayaran lewat rekening selain 1000 tetap terbaca.
   */
  private async cashAccountIds(tenantId: string, companyId: string): Promise<string[]> {
    const [cash, banks] = await Promise.all([
      this.prisma.chartOfAccount.findFirst({
        where: { tenantId, companyId, code: '1000', type: 'asset' },
        select: { id: true },
      }),
      this.prisma.bankAccount.findMany({
        where: { tenantId, companyId, isActive: true },
        select: { accountId: true },
      }),
    ]);
    return [...new Set([...(cash ? [cash.id] : []), ...banks.map((b) => b.accountId)])];
  }

  /** Ambil peta id akun -> {code, name} untuk tenant (COA tidak berelasi ke financialEntry). */
  private async accountMap(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const accounts = await this.prisma.chartOfAccount.findMany({ where: { tenantId, companyId } });
    return new Map(accounts.map((a) => [a.id, { code: a.code, name: a.name }]));
  }

/**
 * Daftar jurnal sebagai tampilan薄 untuk endpoint lama `/finance/entries`.
 * Sekarang dibaca dari `journal_headers`/`journal_lines`, bukan
 * `financial_entries` — supaya UI yang sudah ada tetap jalan tanpa perlu
 * punya sumber kedua yang bisa berbeda dari buku besar.
 *
 * `anomaly` tidak lagi jadi filter di sini; penandaan anomali hidup di
 * `ai_insight_logs` yang memang surpassed dipakai AI.
 */
  async entries(
    tenantId: string,
    query: { anomaly?: string; page?: number; limit?: number },
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const where = { tenantId, companyId, ...(query.anomaly === 'true' ? { sourceModule: 'anomaly' } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.journalHeader.findMany({
        where,
        include: { lines: { orderBy: { lineNo: 'asc' } } },
        orderBy: [{ entryDate: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalHeader.count({ where }),
    ]);

    const accountIds = [...new Set(rows.flatMap((r) => r.lines.map((l) => l.accountId)))];
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, code: true, name: true },
    });
    const accMap = new Map(accounts.map((a) => [a.id, { code: a.code, name: a.name }]));

    const data = rows.map((journal) => {
      const debit = journal.lines.find((l) => l.direction === 'debit');
      const credit = journal.lines.find((l) => l.direction === 'credit');
      return {
        id: journal.id,
        number: journal.number,
        sourceModule: journal.sourceModule,
        sourceRefId: journal.sourceRefId,
        entryDate: journal.entryDate,
        status: journal.status,
        memo: journal.memo,
        amount: Number(debit?.amount ?? 0),
        debitAccount: accMap.get(debit?.accountId ?? '') ?? null,
        creditAccount: accMap.get(credit?.accountId ?? '') ?? null,
        lineCount: journal.lines.length,
        isAnomalyFlagged: false,
      };
    });

    return { data, meta: { page, limit, total } };
  }

  /** Jurnal manual: validasi kedua kode akun ada di COA tenant. */
  async createEntry(tenantId: string, dto: CreateEntryDto) {
    if (dto.debitAccountCode === dto.creditAccountCode) {
      throw new BadRequestException('Akun debit dan kredit tidak boleh sama.');
    }
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const [debit, credit] = await Promise.all([
      this.prisma.chartOfAccount.findFirst({
        where: { tenantId, companyId, code: dto.debitAccountCode },
      }),
      this.prisma.chartOfAccount.findFirst({
        where: { tenantId, companyId, code: dto.creditAccountCode },
      }),
    ]);
    if (!debit) {
      throw new NotFoundException(`Akun ${dto.debitAccountCode} tidak ditemukan.`);
    }
    if (!credit) {
      throw new NotFoundException(`Akun ${dto.creditAccountCode} tidak ditemukan.`);
    }

    // Tanggal entri dikunci: menolak backdate lebih dari 90 hari dan tanggal
    // masa depan, supaya jurnal tidak bisa ditulis ke periode yang sudah tutup.
    const now = new Date();
    const entryDate = dto.entryDate ? new Date(dto.entryDate) : now;
    if (Number.isNaN(entryDate.getTime())) {
      throw new BadRequestException('Tanggal jurnal tidak valid.');
    }
    const daysFromNow = (entryDate.getTime() - now.getTime()) / 86_400_000;
    if (daysFromNow > 1) {
      throw new BadRequestException('Tanggal jurnal tidak boleh di masa depan.');
    }
    if (daysFromNow < -90) {
      throw new BadRequestException('Backdate jurnal dibatasi maksimal 90 hari.');
    }

const entry = await this.prisma.$transaction(async (tx) =>
      this.journals.post(tx, {
        tenantId,
        companyId,
        entryDate,
        sourceModule: 'finance',
        sourceRefId: `manual:${dto.note ?? 'jurnal'}`,
        memo: dto.note ?? 'Jurnal manual',
        lines: [
          { accountId: debit.id, direction: 'debit', amount: dto.amount, memo: dto.note ?? '' },
          { accountId: credit.id, direction: 'credit', amount: dto.amount, memo: dto.note ?? '' },
        ],
      }),
    );
    return {
      id: entry.id,
      number: entry.number,
      entryDate: entry.entryDate,
      amount: dto.amount,
      debitAccount: { code: debit.code, name: debit.name },
      creditAccount: { code: credit.code, name: credit.name },
    };
  }

/**
 * Tindak lanjuti penandaan anomali dari AI.
 * Sekarang id yang diberikan adalah `journalHeader` — flag tidak lagi
 * disimpan pada baris `financial_entries` yang sudah tidak dipakai.
 */
  async resolveAnomaly(tenantId: string, id: string, dto: ResolveAnomalyDto, user: AuthUser) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const journal = await this.prisma.journalHeader.findFirst({
      where: { id, tenantId, companyId },
      include: { lines: { select: { direction: true, amount: true } } },
    });
    if (!journal) {
      throw new NotFoundException('Jurnal tidak ditemukan.');
    }

    if (!dto.valid) {
      await this.prisma.aiInsightLog.create({
        data: {
          tenantId,
          userId: user.sub,
          module: 'finance',
          insightType: 'anomaly',
          title: 'Anomali ditandai tidak valid',
          content: `Jurnal ${journal.number} ditandai bukan anomali oleh pengguna.`,
          basedOnRefs: [`journal_headers:${journal.id}`],
        },
      });
      return { id: journal.id, number: journal.number, resolved: 'dismissed' };
    }

const amount = journal.lines.find((l) => l.direction === 'debit')?.amount ?? 0;
    await this.prisma.notification.create({
      data: {
        tenantId,
        type: 'approval',
        title: 'Anomali dieskalasi',
        body: `Jurnal ${journal.number} senilai ${this.rupiah(Number(amount))} dikonfirmasi sebagai anomali dan dieskalasi.`,
        link: '/app/finance',
      },
    });
    return { id: journal.id, number: journal.number, resolved: 'escalated' };
  }

  /** Bangun CSV jurnal periode; hanya format csv yang didukung. */
  async exportCsv(tenantId: string, format = 'csv', days = 30): Promise<string> {
    if (format !== 'csv') {
      throw new BadRequestException('Format didukung: csv. PDF/Excel menyusul.');
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const rows = await this.prisma.journalLine.findMany({
      where: {
        tenantId,
        companyId,
        journal: { status: { in: LEDGER_STATUSES }, entryDate: { gte: since } },
      },
      include: { account: { select: { code: true, name: true } }, journal: { select: { number: true, entryDate: true } } },
      orderBy: [{ journal: { entryDate: 'asc' } }, { lineNo: 'asc' }],
    });
    const accounts = await this.accountMap(tenantId);

const header = ['Tanggal', 'Jurnal', 'Baris', 'Akun', 'Kode', 'Debit', 'Kredit', 'Memo'];
    const lines = rows.map((line) =>
      [
        this.fmtDate(new Date(line.journal.entryDate)),
        line.journal.number,
        String(line.lineNo),
        line.account.name,
        line.account.code,
        line.direction === 'debit' ? String(Number(line.amount)) : '0',
        line.direction === 'credit' ? String(Number(line.amount)) : '0',
        line.memo,
      ]
        .map((c) => this.csvCell(c))
        .join(','),
    );

    // BOM agar Excel membaca UTF-8 dengan benar
    return '\uFEFF' + [header.join(','), ...lines].join('\r\n');
  }
}

/**
 * Rata-rata per hari-dalam-minggu dari seri aktual. Hari tanpa transaksi di
 * dalam rentang dianggap hari tutup, bukan angka nol — ini yang membedakan
 * "tutup" dari "omzetnya memang nol".
 */
function averageByWeekday(series: CashflowPoint[], field: 'inflow' | 'outflow'): number[] {
  const sums = Array.from({ length: 7 }, () => ({ total: 0, days: 0 }));
  for (const point of series) {
    if (point.forecast) continue;
    const [y, m, d] = point.date.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay();
    sums[day].total += point[field];
    sums[day].days += 1;
  }
  const out = sums.map((s) => (s.days > 0 ? s.total / s.days : 0));
  return out.some((v) => v > 0) ? out : [];
}