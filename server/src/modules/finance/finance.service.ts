import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { CreateEntryDto, ResolveAnomalyDto } from './dto/finance.dto';

interface CashflowPoint {
  date: string;
  inflow: number;
  outflow: number;
  forecast: boolean;
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Format tanggal lokal menjadi 'YYYY-MM-DD'. */
  private fmtDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Awal hari (00:00) waktu lokal. */
  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** Escape nilai CSV: kutip ganda digandakan, bungkus kutip bila perlu. */
  private csvCell(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /** Format angka rupiah untuk pesan notifikasi. */
  private rupiah(n: number): string {
    return `Rp ${n.toLocaleString('id-ID')}`;
  }

  /** Laporan laba rugi ringkas untuk N hari terakhir. */
  async profitLoss(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [salesAgg, items, opexAgg] = await Promise.all([
      this.prisma.salesTransaction.aggregate({
        where: { tenantId, clientTimestamp: { gte: since } },
        _sum: { total: true },
      }),
      // HPP: item transaksi pada periode (item tidak punya tenantId, filter via relasi)
      this.prisma.salesTransactionItem.findMany({
        where: { transaction: { tenantId, clientTimestamp: { gte: since } } },
        select: { qty: true, product: { select: { costPrice: true } } },
      }),
      // Beban operasional: konvensi sourceModule 'finance'
      this.prisma.financialEntry.aggregate({
        where: { tenantId, sourceModule: 'finance', entryDate: { gte: since } },
        _sum: { amount: true },
      }),
    ]);

    const revenue = Number(salesAgg._sum.total ?? 0);
    const cogs = items.reduce((s, i) => s + Number(i.qty) * Number(i.product.costPrice), 0);
    const opex = Number(opexAgg._sum.amount ?? 0);
    const gross = revenue - cogs;
    const net = gross - opex;
    const marginPct = revenue > 0 ? Math.round((gross / revenue) * 100) : 0;

    return { periodDays: days, revenue, cogs, gross, opex, net, marginPct };
  }

  /** Arus kas aktual per hari + prakiraan linear sederhana (lokal, tanpa modul AI). */
  async cashflow(tenantId: string, days = 14, forecastDays = 30) {
    const today = this.startOfDay(new Date());
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));

    const [sales, entries] = await Promise.all([
      this.prisma.salesTransaction.findMany({
        where: { tenantId, clientTimestamp: { gte: start } },
        select: { total: true, clientTimestamp: true },
      }),
      this.prisma.financialEntry.findMany({
        where: { tenantId, sourceModule: 'finance', entryDate: { gte: start } },
        select: { amount: true, entryDate: true },
      }),
    ]);

    // Kelompokkan ke map per tanggal
    const inflowMap = new Map<string, number>();
    for (const s of sales) {
      const key = this.fmtDate(new Date(s.clientTimestamp));
      inflowMap.set(key, (inflowMap.get(key) ?? 0) + Number(s.total));
    }
    const outflowMap = new Map<string, number>();
    for (const e of entries) {
      const key = this.fmtDate(new Date(e.entryDate));
      outflowMap.set(key, (outflowMap.get(key) ?? 0) + Number(e.amount));
    }

    // Seri aktual: dari (hari ini - (days-1)) sampai hari ini
    const series: CashflowPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = this.fmtDate(d);
      series.push({
        date: key,
        inflow: Math.round(inflowMap.get(key) ?? 0),
        outflow: Math.round(outflowMap.get(key) ?? 0),
        forecast: false,
      });
    }

    // Rata-rata 7 hari aktual terakhir sebagai dasar prakiraan
    const last7 = series.slice(-7);
    const avgIn = last7.reduce((s, p) => s + p.inflow, 0) / (last7.length || 1);
    const avgOut = last7.reduce((s, p) => s + p.outflow, 0) / (last7.length || 1);

    for (let i = 1; i <= forecastDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      series.push({
        date: this.fmtDate(d),
        inflow: Math.round(avgIn * (1 + i * 0.005)),
        outflow: Math.round(avgOut),
        forecast: true,
      });
    }

    return { days, forecastDays, series };
  }

  /** Ambil peta id akun -> {code, name} untuk tenant (COA tidak berelasi ke financialEntry). */
  private async accountMap(tenantId: string) {
    const accounts = await this.prisma.chartOfAccount.findMany({ where: { tenantId } });
    return new Map(accounts.map((a) => [a.id, { code: a.code, name: a.name }]));
  }

  /** Daftar jurnal terbaru dulu, dengan nama akun debit/kredit. */
  async entries(
    tenantId: string,
    query: { anomaly?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const where: Prisma.FinancialEntryWhereInput = {
      tenantId,
      ...(query.anomaly === 'true' ? { isAnomalyFlagged: true } : {}),
    };

    const [rows, total, accounts] = await Promise.all([
      this.prisma.financialEntry.findMany({
        where,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.financialEntry.count({ where }),
      this.accountMap(tenantId),
    ]);

    const data = rows.map((e) => ({
      ...e,
      amount: Number(e.amount),
      debitAccount: accounts.get(e.debitAccountId) ?? null,
      creditAccount: accounts.get(e.creditAccountId) ?? null,
    }));

    return { data, meta: { page, limit, total } };
  }

  /** Jurnal manual: validasi kedua kode akun ada di COA tenant. */
  async createEntry(tenantId: string, dto: CreateEntryDto) {
    const [debit, credit] = await Promise.all([
      this.prisma.chartOfAccount.findFirst({
        where: { tenantId, code: dto.debitAccountCode },
      }),
      this.prisma.chartOfAccount.findFirst({
        where: { tenantId, code: dto.creditAccountCode },
      }),
    ]);
    if (!debit) {
      throw new NotFoundException(`Akun ${dto.debitAccountCode} tidak ditemukan.`);
    }
    if (!credit) {
      throw new NotFoundException(`Akun ${dto.creditAccountCode} tidak ditemukan.`);
    }

    const entry = await this.prisma.financialEntry.create({
      data: {
        tenantId,
        sourceModule: 'finance',
        sourceRefId: `manual:${dto.note ?? 'jurnal'}`,
        debitAccountId: debit.id,
        creditAccountId: credit.id,
        amount: dto.amount,
        entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(),
      },
    });
    return { ...entry, amount: Number(entry.amount) };
  }

  /**
   * Resolusi flag anomali:
   * - valid=false -> cabut flag + catat feedback ke aiInsightLog
   * - valid=true  -> pertahankan flag + eskalasi via notification
   */
  async resolveAnomaly(tenantId: string, id: string, dto: ResolveAnomalyDto, user: AuthUser) {
    const entry = await this.prisma.financialEntry.findFirst({ where: { id, tenantId } });
    if (!entry) {
      throw new NotFoundException('Entry tidak ditemukan.');
    }

    if (!dto.valid) {
      const updated = await this.prisma.financialEntry.update({
        where: { id: entry.id },
        data: { isAnomalyFlagged: false },
      });
      await this.prisma.aiInsightLog.create({
        data: {
          tenantId,
          userId: user.sub,
          module: 'finance',
          insightType: 'anomaly',
          title: 'Anomali ditandai tidak valid',
          content: `Entry ${id} ditandai bukan anomali oleh pengguna.`,
          basedOnRefs: [`financial_entries:${id}`],
        },
      });
      return { ...updated, amount: Number(updated.amount) };
    }

    await this.prisma.notification.create({
      data: {
        tenantId,
        type: 'approval',
        title: 'Anomali dieskalasi',
        body: `Pengeluaran/entry ${id} senilai ${this.rupiah(Number(entry.amount))} dikonfirmasi sebagai anomali dan dieskalasi.`,
        link: '/app/finance',
      },
    });
    return { ...entry, amount: Number(entry.amount) };
  }

  /** Daftar COA tenant, urut kode akun. */
  async accounts(tenantId: string) {
    const data = await this.prisma.chartOfAccount.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });
    return { data };
  }

  /** Bangun CSV jurnal periode; hanya format csv yang didukung. */
  async exportCsv(tenantId: string, format = 'csv', days = 30): Promise<string> {
    if (format !== 'csv') {
      throw new BadRequestException('Format didukung: csv. PDF/Excel menyusul.');
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [rows, accounts] = await Promise.all([
      this.prisma.financialEntry.findMany({
        where: { tenantId, entryDate: { gte: since } },
        orderBy: { entryDate: 'asc' },
      }),
      this.accountMap(tenantId),
    ]);

    const header = ['Tanggal', 'Modul', 'Referensi', 'Akun Debit', 'Akun Kredit', 'Jumlah'];
    const lines = rows.map((e) => {
      const debit = accounts.get(e.debitAccountId);
      const credit = accounts.get(e.creditAccountId);
      return [
        this.fmtDate(new Date(e.entryDate)),
        e.sourceModule,
        e.sourceRefId,
        debit ? `${debit.code} - ${debit.name}` : e.debitAccountId,
        credit ? `${credit.code} - ${credit.name}` : e.creditAccountId,
        String(Number(e.amount)),
      ]
        .map((c) => this.csvCell(c))
        .join(',');
    });

    // BOM agar Excel membaca UTF-8 dengan benar
    return '\uFEFF' + [header.join(','), ...lines].join('\r\n');
  }
}
