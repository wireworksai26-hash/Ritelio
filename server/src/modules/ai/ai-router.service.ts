import { Injectable } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────
// ROUTER AI — menentukan pertanyaan masuk FAST PATH (dijawab
// deterministik dari DB, nol token LLM) atau SLOW PATH (NVIDIA NIM).
//
// Tujuan: hemat token & latensi rendah untuk pertanyaan operasional
// yang jawabannya memang bisa dihitung langsung dari data.
// ─────────────────────────────────────────────────────────────

export type FastIntent =
  | 'greeting'
  | 'thanks'
  | 'sales_today'
  | 'sales_range'
  | 'top_products'
  | 'low_stock'
  | 'profit_loss'
  | 'cashflow'
  | 'outlet_compare'
  | 'sync_status'
  | 'digest'
  | 'how_to';

export interface RouteResult {
  intent: FastIntent | 'slow';
  /** Periode hari yang terdeteksi dari teks (untuk sales_range/profit_loss) */
  periodDays?: number;
}

interface Rule {
  intent: FastIntent;
  pattern: RegExp;
}

// Urutan = prioritas (paling spesifik di atas)
const RULES: Rule[] = [
  { intent: 'greeting', pattern: /^(halo|hai|hi|hello|hei|selamat\s(pagi|siang|sore|malam)|pagi|siang|sore|malam)\b/ },
  { intent: 'thanks', pattern: /(terima kasih|makasih|thanks|thank you)/ },
  { intent: 'sync_status', pattern: /(sinkron|sinkronisasi|konflik|needs.?review|antre|antrian|offline)/ },
  { intent: 'low_stock', pattern: /((stok|stock).*(menipis|habis|kurang|tipis)|restock|restok|(barang|produk)\s*(apa|yang|mana)?\s*(habis|menipis))/ },
  { intent: 'top_products', pattern: /(terlaris|paling laku|terbaik|favorit|top\s?\d*\s?produk|produk unggulan)/ },
  { intent: 'cashflow', pattern: /(arus kas|cash\s?flow|proyeksi|forecast|prediksi.*(kas|penjualan)|ramalan)/ },
  { intent: 'profit_loss', pattern: /(laba|rugi|profit|untung|margin|profitabilitas)/ },
  { intent: 'outlet_compare', pattern: /((outlet|cabang|toko).*(banding|performa|mana|vs)|bandingkan)/ },
  { intent: 'digest', pattern: /(digest|ringkasan (harian|mingguan)|rangkuman|insight (harian|terbaru)|laporan singkat)/ },
  { intent: 'sales_today', pattern: /(penjualan|omzet|omset|pendapatan).*(hari ini|today|sekarang)|hari ini.*(penjualan|omzet)/ },
  { intent: 'sales_range', pattern: /(penjualan|omzet|omset|pendapatan)/ },
  { intent: 'how_to', pattern: /^(cara|bagaimana|gimana|bagaimana cara|how to)|tutorial|panduan|bantuan|^help\b/ },
];

@Injectable()
export class AiRouterService {
  classify(rawQuestion: string): RouteResult {
    const q = rawQuestion.trim().toLowerCase();

    for (const rule of RULES) {
      if (rule.pattern.test(q)) {
        return { intent: rule.intent, periodDays: this.extractPeriodDays(q) };
      }
    }
    return { intent: 'slow', periodDays: this.extractPeriodDays(q) };
  }

  private extractPeriodDays(q: string): number | undefined {
    const explicit = q.match(/(\d+)\s*hari/);
    if (explicit) return Math.min(Number(explicit[1]), 365);
    if (/kemarin/.test(q)) return 1;
    if (/minggu|pekan/.test(q)) return 7;
    if (/bulan/.test(q)) return 30;
    return undefined;
  }
}
