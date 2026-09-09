import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { KNOWLEDGE_BASE, KB_FALLBACK } from './knowledge-base';
import type { FastIntent } from './ai-router.service';

export interface FastAnswer {
  answer: string;
  refs: string[];
}

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ─────────────────────────────────────────────────────────────
// FAST PATH — jawaban dihitung langsung dari database.
// Deterministik, instan, nol token LLM, selalu menyertakan refs.
// ─────────────────────────────────────────────────────────────
@Injectable()
export class FastPathService {
  constructor(private readonly prisma: PrismaService) {}

  async handle(intent: FastIntent, tenantId: string, periodDays?: number): Promise<FastAnswer> {
    switch (intent) {
      case 'greeting':
        return {
          answer:
            'Halo! Saya Retalio Intelligence. Tanyakan penjualan, stok, laba rugi, arus kas, atau performa outlet — saya jawab dari data aktual bisnismu, bukan tebakan.',
          refs: [],
        };
      case 'thanks':
        return { answer: 'Sama-sama! Senang bisa membantu. Ada lagi yang mau ditanyakan?', refs: [] };
      case 'sales_today':
        return this.salesToday(tenantId);
      case 'sales_range':
        return this.salesRange(tenantId, periodDays ?? 7);
      case 'top_products':
        return this.topProducts(tenantId, periodDays ?? 7);
      case 'low_stock':
        return this.lowStock(tenantId);
      case 'profit_loss':
        return this.profitLoss(tenantId, periodDays ?? 30);
      case 'cashflow':
        return this.cashflow(tenantId);
      case 'outlet_compare':
        return this.outletCompare(tenantId);
      case 'sync_status':
        return this.syncStatus(tenantId);
      case 'digest':
        return this.digest(tenantId);
      case 'how_to':
        // how_to butuh teks asli — selalu dipanggil via howTo(question) dari AiService
        return { answer: KB_FALLBACK, refs: ['knowledge_base:how_to'] };
    }
  }

  /** Jawaban how-to dari knowledge base lokal (scoring keyword terpanjang). */
  howTo(question: string): FastAnswer {
    const q = question.toLowerCase();
    let best: { score: number; answer: string } = { score: 0, answer: KB_FALLBACK };
    for (const entry of KNOWLEDGE_BASE) {
      const score = entry.keys.reduce((s, k) => (q.includes(k) ? s + k.length : s), 0);
      if (score > best.score) best = { score, answer: entry.answer };
    }
    return { answer: best.answer, refs: ['knowledge_base:how_to'] };
  }

  private async salesToday(tenantId: string): Promise<FastAnswer> {
    const agg = await this.prisma.salesTransaction.aggregate({
      _sum: { total: true },
      _count: true,
      where: { tenantId, clientTimestamp: { gte: startOfDay(new Date()) } },
    });
    const total = Number(agg._sum.total ?? 0);
    return {
      answer: `Penjualan hari ini sejauh ini ${idr.format(total)} dari ${agg._count} transaksi di semua outlet (termasuk transaksi offline yang sudah tersinkron).`,
      refs: ['sales_transactions:hari ini'],
    };
  }

  private async salesRange(tenantId: string, days: number): Promise<FastAnswer> {
    const since = new Date(Date.now() - days * 86400000);
    const agg = await this.prisma.salesTransaction.aggregate({
      _sum: { total: true },
      _count: true,
      where: { tenantId, clientTimestamp: { gte: since } },
    });
    const total = Number(agg._sum.total ?? 0);
    const avg = Math.round(total / days);
    return {
      answer: `Penjualan ${days} hari terakhir: total ${idr.format(total)} dari ${agg._count} transaksi — rata-rata ${idr.format(avg)} per hari.`,
      refs: [`sales_transactions:${days} hari`],
    };
  }

  private async topProducts(tenantId: string, days: number): Promise<FastAnswer> {
    const since = new Date(Date.now() - days * 86400000);
    const items = await this.prisma.salesTransactionItem.findMany({
      where: { transaction: { tenantId, clientTimestamp: { gte: since } } },
      include: { product: { select: { name: true, unit: true } } },
    });
    const map = new Map<string, { name: string; unit: string; qty: number; revenue: number }>();
    for (const it of items) {
      const cur = map.get(it.productId) ?? { name: it.product.name, unit: it.product.unit, qty: 0, revenue: 0 };
      cur.qty += Number(it.qty);
      cur.revenue += Number(it.qty) * Number(it.price);
      map.set(it.productId, cur);
    }
    const top = [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    if (top.length === 0) {
      return { answer: `Belum ada penjualan dalam ${days} hari terakhir.`, refs: [`sales_transaction_items:${days} hari`] };
    }
    const lines = top.map((t, i) => `${i + 1}. ${t.name} — ${t.qty} ${t.unit} (${idr.format(t.revenue)})`);
    return {
      answer: `Produk terlaris ${days} hari terakhir:\n${lines.join('\n')}`,
      refs: [`sales_transaction_items:${days} hari`],
    };
  }

  private async lowStock(tenantId: string): Promise<FastAnswer> {
    const stocks = await this.prisma.inventoryStock.findMany({
      where: { tenantId },
      include: { product: { select: { name: true, unit: true } }, warehouse: { select: { name: true } } },
    });
    const low = stocks
      .filter((s) => Number(s.quantity) <= Number(s.minThreshold))
      .sort((a, b) => Number(a.quantity) - Number(b.quantity));
    if (low.length === 0) {
      return { answer: 'Semua stok berada di atas ambang minimum saat ini.', refs: ['inventory_stock:threshold'] };
    }
    const lines = low.map(
      (s) => `• ${s.product.name} — sisa ${Number(s.quantity)} ${s.product.unit} di ${s.warehouse.name} (ambang ${Number(s.minThreshold)})`,
    );
    return {
      answer: `Ada ${low.length} produk di bawah ambang minimum:\n${lines.join('\n')}\n\nPertimbangkan membuat Purchase Order untuk item teratas sebelum akhir pekan.`,
      refs: ['inventory_stock:threshold', 'stock_movements:14 hari'],
    };
  }

  private async profitLoss(tenantId: string, days: number): Promise<FastAnswer> {
    const since = new Date(Date.now() - days * 86400000);
    const txs = await this.prisma.salesTransaction.findMany({
      where: { tenantId, clientTimestamp: { gte: since } },
      include: { items: { include: { product: { select: { costPrice: true } } } } },
    });
    const revenue = txs.reduce((s, t) => s + Number(t.total), 0);
    const cogs = txs.reduce(
      (s, t) => s + t.items.reduce((si, i) => si + Number(i.qty) * Number(i.product.costPrice), 0),
      0,
    );
    const opexAgg = await this.prisma.financialEntry.aggregate({
      _sum: { amount: true },
      where: { tenantId, sourceModule: 'finance', entryDate: { gte: since } },
    });
    const opex = Number(opexAgg._sum.amount ?? 0);
    const gross = revenue - cogs;
    const net = gross - opex;
    const margin = revenue > 0 ? Math.round((gross / revenue) * 100) : 0;
    return {
      answer: `Laba rugi ${days} hari terakhir:\n• Pendapatan: ${idr.format(revenue)}\n• HPP: ${idr.format(cogs)}\n• Laba kotor: ${idr.format(gross)} (margin ${margin}%)\n• Beban operasional: ${idr.format(opex)}\n• Laba bersih: ${idr.format(net)}`,
      refs: [`sales_transactions:${days} hari`, `financial_entries:${days} hari`],
    };
  }

  /** Seri arus kas: aktual N hari + forecast linear sederhana (upgrade path: model time-series). */
  async cashflowSeries(tenantId: string, actualDays = 14, forecastDays = 30) {
    const points: Array<{ date: string; inflow: number; outflow: number; forecast: boolean }> = [];
    for (let i = actualDays - 1; i >= 0; i--) {
      const day = startOfDay(new Date(Date.now() - i * 86400000));
      const next = new Date(day.getTime() + 86400000);
      const [inAgg, outAgg] = await Promise.all([
        this.prisma.salesTransaction.aggregate({
          _sum: { total: true },
          where: { tenantId, clientTimestamp: { gte: day, lt: next } },
        }),
        this.prisma.financialEntry.aggregate({
          _sum: { amount: true },
          where: { tenantId, sourceModule: 'finance', entryDate: { gte: day, lt: next } },
        }),
      ]);
      points.push({
        date: day.toISOString().slice(0, 10),
        inflow: Number(inAgg._sum.total ?? 0),
        outflow: Number(outAgg._sum.amount ?? 0),
        forecast: false,
      });
    }
    const last7 = points.slice(-7);
    const avgIn = last7.reduce((s, p) => s + p.inflow, 0) / Math.max(last7.length, 1);
    const avgOut = last7.reduce((s, p) => s + p.outflow, 0) / Math.max(last7.length, 1);
    for (let i = 1; i <= forecastDays; i++) {
      const factor = 1 + i * 0.005;
      points.push({
        date: new Date(Date.now() + i * 86400000).toISOString().slice(0, 10),
        inflow: Math.round(avgIn * factor),
        outflow: Math.round(avgOut),
        forecast: true,
      });
    }
    return points;
  }

  private async cashflow(tenantId: string): Promise<FastAnswer> {
    const series = await this.cashflowSeries(tenantId, 14, 30);
    const forecast = series.filter((p) => p.forecast);
    const inflow = forecast.reduce((s, p) => s + p.inflow, 0);
    const outflow = forecast.reduce((s, p) => s + p.outflow, 0);
    return {
      answer: `Proyeksi 30 hari ke depan: kas masuk ≈ ${idr.format(inflow)}, kas keluar ≈ ${idr.format(outflow)}, estimasi surplus ${idr.format(inflow - outflow)}. Dihitung dari rata-rata 7 hari terakhir dengan asumsi pertumbuhan 0,5%/hari. Grafik lengkap ada di halaman Keuangan.`,
      refs: ['sales_transactions:14 hari', 'financial_entries:14 hari'],
    };
  }

  private async outletCompare(tenantId: string): Promise<FastAnswer> {
    const outlets = await this.prisma.outlet.findMany({ where: { tenantId } });
    if (outlets.length < 2) {
      return { answer: 'Perbandingan outlet membutuhkan minimal 2 outlet aktif.', refs: ['outlets'] };
    }
    const now = Date.now();
    const recentSince = new Date(now - 14 * 86400000);
    const prevSince = new Date(now - 28 * 86400000);

    const lines: string[] = [];
    for (const o of outlets) {
      const [recent, prev] = await Promise.all([
        this.prisma.salesTransaction.aggregate({
          _sum: { total: true },
          _count: true,
          where: { tenantId, outletId: o.id, clientTimestamp: { gte: recentSince } },
        }),
        this.prisma.salesTransaction.aggregate({
          _sum: { total: true },
          where: { tenantId, outletId: o.id, clientTimestamp: { gte: prevSince, lt: recentSince } },
        }),
      ]);
      const r = Number(recent._sum.total ?? 0);
      const p = Number(prev._sum.total ?? 0);
      const growth = p > 0 ? Math.round(((r - p) / p) * 100) : 0;
      lines.push(`• ${o.name}: ${idr.format(r)} (${recent._count} transaksi, ${growth >= 0 ? '+' : ''}${growth}% vs 14 hari sebelumnya)`);
    }
    return {
      answer: `Performa outlet 14 hari terakhir:\n${lines.join('\n')}`,
      refs: ['sales_transactions:grouped by outlet_id'],
    };
  }

  private async syncStatus(tenantId: string): Promise<FastAnswer> {
    const grouped = await this.prisma.salesTransaction.groupBy({
      by: ['syncStatus'],
      _count: true,
      where: { tenantId },
    });
    const count = (s: string) => grouped.find((g) => g.syncStatus === s)?._count ?? 0;
    const pending = count('pending');
    const conflicts = count('needs_review') + count('conflict');
    let answer = `Status sinkronisasi: ${count('synced')} tersinkron, ${pending} pending, ${conflicts} perlu review.`;
    if (conflicts > 0) {
      answer += '\n\nAda transaksi berkonflik dengan stok server — buka Notifikasi untuk meninjaunya (tidak pernah ditolak otomatis).';
    }
    return { answer, refs: ['sales_transactions:sync_status'] };
  }

  private async digest(tenantId: string): Promise<FastAnswer> {
    const latest = await this.prisma.aiInsightLog.findFirst({
      where: { tenantId, insightType: 'insight_digest' },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      return { answer: 'Digest harian belum tersedia. Digest dibuat otomatis setiap pagi.', refs: ['ai_insights_log'] };
    }
    return { answer: latest.content, refs: latest.basedOnRefs as string[] };
  }

  /** Snapshot bisnis ringkas — konteks grounding untuk slow path (NIM). */
  async snapshot(tenantId: string): Promise<string> {
    const [today, week, month] = await Promise.all([
      this.prisma.salesTransaction.aggregate({
        _sum: { total: true },
        _count: true,
        where: { tenantId, clientTimestamp: { gte: startOfDay(new Date()) } },
      }),
      this.prisma.salesTransaction.aggregate({
        _sum: { total: true },
        _count: true,
        where: { tenantId, clientTimestamp: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
      this.prisma.salesTransaction.aggregate({
        _sum: { total: true },
        _count: true,
        where: { tenantId, clientTimestamp: { gte: new Date(Date.now() - 30 * 86400000) } },
      }),
    ]);

    const stocks = await this.prisma.inventoryStock.findMany({
      where: { tenantId },
      include: { product: { select: { name: true } } },
    });
    const low = stocks.filter((s) => Number(s.quantity) <= Number(s.minThreshold));
    const anomalies = await this.prisma.financialEntry.count({
      where: { tenantId, isAnomalyFlagged: true },
    });
    const pending = await this.prisma.salesTransaction.count({
      where: { tenantId, syncStatus: { in: ['pending', 'needs_review', 'conflict'] } },
    });

    return [
      `Penjualan hari ini: ${idr.format(Number(today._sum.total ?? 0))} (${today._count} transaksi)`,
      `Penjualan 7 hari: ${idr.format(Number(week._sum.total ?? 0))} (${week._count} transaksi)`,
      `Penjualan 30 hari: ${idr.format(Number(month._sum.total ?? 0))} (${month._count} transaksi)`,
      `Stok menipis (${low.length} produk): ${low.slice(0, 3).map((s) => `${s.product.name} sisa ${Number(s.quantity)}`).join(', ') || '-'}`,
      `Anomali keuangan aktif: ${anomalies}`,
      `Antrean sinkron POS: ${pending}`,
    ].join('\n');
  }
}
