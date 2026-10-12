import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { roundMoney } from '../../common/utils/money';

export interface FxResult {
  reportingCurrency: string;
  baseCurrency: string;
  rates: Record<string, number>;
  /** Kurs yang benar-benar dipakai; kalau ada yang hilang, sumber nilainya. */
  fallbackUsed: string[];
  asOf: Date;
}

/**
 * Konversi mata uang untuk laporan.
 *
 * Kurs diambil dari `ExchangeRate` pada tanggal laporan, memakai kurs paling
 * baru yang berlaku pada atau sebelum `asOf` — bukan kurs terakhir saja,
 * supaya laporan periode lalu bisa direproduksi dengan kurs 당시.
 *
 * Bila tidak ada kurs sama sekali untuk suatu mata uang, nominal dikembalikan
 * apa adanya dan currency-nya dicatat di `fallbackUsed`. Menyamakan nominal
 * antar-mata uang tanpa kurs adalah kesalahan diam-diam yang jauh lebih buruk
 * daripada laporan yang menandai sendiri kebutuhannya.
 */
@Injectable()
export class FxService {
  constructor(private readonly prisma: PrismaService) {}

  async rates(tenantId: string, companyId: string, asOf: Date, reportingCurrency?: string): Promise<FxResult> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId },
      select: { defaultCurrencyCode: true },
    });
    const baseCurrency = company?.defaultCurrencyCode ?? 'IDR';
    const target = (reportingCurrency ?? baseCurrency).toUpperCase();

    if (target === baseCurrency) {
      return { reportingCurrency: target, baseCurrency, rates: { [baseCurrency]: 1 }, fallbackUsed: [], asOf };
    }

    const rows = await this.prisma.exchangeRate.findMany({
      where: { tenantId, companyId, effectiveDate: { lte: asOf } },
      orderBy: { effectiveDate: 'desc' },
      select: { baseCurrencyCode: true, quoteCurrencyCode: true, rate: true, effectiveDate: true, source: true },
    });

    const rates: Record<string, number> = { [baseCurrency]: 1 };
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.baseCurrencyCode}/${row.quoteCurrencyCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rates[key] = Number(row.rate);
    }

    // Lewati pasangan yang memuat target lebih dari sekali supaya tidak
    // ada jalur兑换 yang saling meniadakan (A/B dan B/A Sekaligus).
    const fallbackUsed: string[] = [];
    if (!rates[`${baseCurrency}/${target}`] && !rates[`${target}/${baseCurrency}`]) {
      fallbackUsed.push(`${baseCurrency}->${target}`);
    }

    return { reportingCurrency: target, baseCurrency, rates, fallbackUsed, asOf };
  }

  /**
   * Ubah nominal dari `currency` ke reporting currency. Mengembalikan
   * `{ amount, converted, reason }` supaya pemanggil bisa menandai di UI
   * ketika konversi tidak bisa dilakukan.
   */
  convert(fx: FxResult, amount: number, currency: string | null | undefined): {
    amount: number;
    converted: boolean;
    rate: number;
    reason?: string;
  } {
    const value = roundMoney(amount);
    const from = (currency ?? fx.baseCurrency).toUpperCase();
    if (from === fx.reportingCurrency) {
      return { amount: value, converted: true, rate: 1 };
    }
    const direct = fx.rates[`${from}/${fx.reportingCurrency}`];
    if (direct) {
      return { amount: roundMoney(value * direct), converted: true, rate: direct };
    }
    const inverse = fx.rates[`${fx.reportingCurrency}/${from}`];
    if (inverse && inverse !== 0) {
      const rate = 1 / inverse;
      return { amount: roundMoney(value * rate), converted: true, rate };
    }
    return {
      amount: value,
      converted: false,
      rate: 1,
      reason: `Tidak ada kurs ${from} -> ${fx.reportingCurrency} pada ${fx.asOf.toISOString().slice(0, 10)}.`,
    };
  }

  /** Kurs yang sudah tua — perlu ditinjau sebelum dipakai laporan berikutnya. */
  async staleRates(tenantId: string, companyId: string, olderThanDays = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    return this.prisma.exchangeRate.findMany({
      where: { tenantId, companyId, effectiveDate: { lt: cutoff } },
      orderBy: { effectiveDate: 'desc' },
      select: { baseCurrencyCode: true, quoteCurrencyCode: true, rate: true, effectiveDate: true, source: true },
    });
  }
}