// "Otak" mock untuk Retalio Intelligence — Natural Language Query berbasis
// keyword di atas data aktual (mock). Setiap jawaban numerik menyertakan
// based_on_refs untuk prinsip explainability (TRD).
import { formatIDR } from '../lib/format';
import {
  cashflowSeries,
  lowStockItems,
  outletPerformance,
  profitLoss,
  salesByDay,
  salesToday,
  topProducts,
} from '../lib/stats';

export interface AssistantAnswer {
  content: string;
  based_on_refs?: string[];
}

export const suggestionPrompts = [
  'Berapa penjualan hari ini?',
  'Produk apa yang stoknya menipis?',
  'Proyeksi arus kas 30 hari ke depan',
  'Produk terlaris minggu ini?',
  'Bandingkan performa outlet',
];

export function answerQuestion(text: string): AssistantAnswer {
  const q = text.toLowerCase();

  if (/(penjualan|omzet|omset|pendapatan)/.test(q) && /(hari ini|today|sekarang)/.test(q)) {
    const { total, count } = salesToday();
    return {
      content: `Penjualan hari ini sejauh ini ${formatIDR(total)} dari ${count} transaksi di semua outlet. Angka ini termasuk transaksi yang masih menunggu sinkronisasi.`,
      based_on_refs: ['sales_transactions:hari ini'],
    };
  }

  if (/(stok|stock|inventori|menipis|habis|restock)/.test(q)) {
    const low = lowStockItems();
    if (low.length === 0) {
      return { content: 'Semua stok berada di atas ambang minimum saat ini.', based_on_refs: ['inventory_stock:threshold'] };
    }
    const lines = low.map((i) => `• ${i.product.name} — sisa ${i.quantity} ${i.product.unit} di ${i.warehouse} (ambang ${i.min_threshold})`);
    const suggestNames = low.slice(0, 2).map((i) => i.product.name).join(' dan ');
    return {
      content: `Ada ${low.length} produk di bawah ambang batas minimum:\n${lines.join('\n')}\n\nDisarankan segera membuat Purchase Order (PO) atau restock untuk ${suggestNames} sebelum stok habis.`,
      based_on_refs: ['inventory_stock:threshold', 'stock_movements:14 hari terakhir'],
    };
  }

  if (/(laba|rugi|profit|untung|margin)/.test(q)) {
    const pl = profitLoss(30);
    return {
      content: `Laba rugi 30 hari terakhir:\n• Pendapatan: ${formatIDR(pl.revenue)}\n• HPP: ${formatIDR(pl.cogs)}\n• Laba kotor: ${formatIDR(pl.gross)}\n• Beban operasional: ${formatIDR(pl.opex)}\n• Laba bersih: ${formatIDR(pl.net)}\n\nMargin kotor sekitar ${Math.round((pl.gross / Math.max(pl.revenue, 1)) * 100)}%.`,
      based_on_refs: ['sales_transactions:30 hari', 'financial_entries:30 hari'],
    };
  }

  if (/(arus kas|cashflow|cash flow|proyeksi|forecast|prediksi)/.test(q)) {
    const series = cashflowSeries(14, 30);
    const forecast = series.filter((p) => p.forecast);
    const inflow = forecast.reduce((s, p) => s + p.inflow, 0);
    const outflow = forecast.reduce((s, p) => s + p.outflow, 0);
    return {
      content: `Proyeksi 30 hari ke depan: kas masuk ≈ ${formatIDR(inflow)}, kas keluar ≈ ${formatIDR(outflow)}, estimasi surplus ${formatIDR(inflow - outflow)}. Tren dihitung dari rata-rata 7 hari terakhir. Detail grafiknya ada di halaman Keuangan.`,
      based_on_refs: ['sales_transactions:14 hari', 'financial_entries:14 hari'],
    };
  }

  if (/(terlaris|terbaik|paling laku|top|favorit)/.test(q)) {
    const top = topProducts(7, 5);
    if (top.length === 0) {
      return {
        content: 'Belum ada data penjualan tercatat dalam 7 hari terakhir.',
        based_on_refs: ['sales_transaction_items:7 hari'],
      };
    }
    const lines = top.map((t, i) => `${i + 1}. ${t.product.name} — ${t.qty} ${t.product.unit} (${formatIDR(t.revenue)})`);
    return {
      content: `Produk terlaris 7 hari terakhir:\n${lines.join('\n')}`,
      based_on_refs: ['sales_transaction_items:7 hari'],
    };
  }

  if (/(outlet|cabang|toko|banding)/.test(q)) {
    const perf = outletPerformance(14);
    if (perf.length === 0) {
      return {
        content: 'Data performa outlet belum tersedia.',
        based_on_refs: ['sales_transactions:grouped by outlet_id'],
      };
    }
    const lines = perf.map(
      (p) => `• ${p.name}: ${formatIDR(p.total)} (${p.count} transaksi, ${p.growthPct >= 0 ? '+' : ''}${p.growthPct}% vs pekan lalu)`,
    );
    return {
      content: `Performa outlet 14 hari terakhir:\n${lines.join('\n')}`,
      based_on_refs: ['sales_transactions:grouped by outlet_id'],
    };
  }

  if (/(penjualan|omzet)/.test(q) && /(kemarin|minggu|pekan|7 hari)/.test(q)) {
    const days = salesByDay(7);
    const total = days.reduce((s, d) => s + d.value, 0);
    const count = days.reduce((s, d) => s + d.count, 0);
    return {
      content: `Penjualan 7 hari terakhir total ${formatIDR(total)} dari ${count} transaksi (rata-rata ${formatIDR(Math.round(total / 7))}/hari).`,
      based_on_refs: ['sales_transactions:7 hari'],
    };
  }

  if (/(cara|bagaimana|tutorial|panduan|help|bantuan)/.test(q)) {
    return {
      content:
        'Saya bisa membantu panduan operasional, misalnya:\n• Tambah produk: buka Inventori → "Tambah Produk"\n• Terima barang: Inventori → tab Purchase Order → "Terima Barang"\n• Mode offline POS: transaksi otomatis tersimpan lokal dan disinkronkan saat online\n• Atur modul: Pengaturan → Manajemen Modul\n\nMau saya jelaskan salah satunya lebih detail?',
      based_on_refs: ['knowledge_base:onboarding'],
    };
  }

  if (/(halo|hai|hi|hello|pagi|siang|sore|malam)/.test(q)) {
    return {
      content:
        'Halo! Saya Retalio Intelligence. Tanyakan apa saja tentang penjualan, stok, keuangan, atau performa outlet — jawaban saya selalu dihitung dari data aktual bisnismu, bukan tebakan.',
    };
  }

  return {
    content:
      'Saya belum menemukan jawaban yang pasti untuk pertanyaan itu. Coba tanyakan seputar:\n• "Penjualan hari ini"\n• "Stok menipis"\n• "Laba rugi bulan ini"\n• "Proyeksi arus kas"\n• "Produk terlaris"\n• "Bandingkan outlet"',
    based_on_refs: ['knowledge_base:faq'],
  };
}
