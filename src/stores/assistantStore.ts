import { create } from 'zustand';
import type { ChatMessage } from '../types';
import { uid, formatIDR } from '../lib/format';
import { answerQuestion } from '../data/assistantBrain';
import { apiConfigured, apiFetch, getToken } from '../lib/api';
import { useSyncStore } from './syncStore';
import { useAiConfigStore } from './aiConfigStore';
import { useBusinessStore } from './businessStore';
import { salesToday, lowStockItems, topProducts, profitLoss } from '../lib/stats';

interface AssistantState {
  isOpen: boolean;
  messages: ChatMessage[];
  thinking: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  send: (text: string) => Promise<void>;
  clear: () => void;
}

function buildBusinessContext(): string {
  const { tenant, outlets, products } = useBusinessStore.getState();
  const { total: salesTotal, count: salesCount } = salesToday();
  const lowStock = lowStockItems();
  const top = topProducts(7, 3);
  const pl = profitLoss(30);

  const lowStockText =
    lowStock.length > 0
      ? lowStock.map((l) => `${l.product.name} (sisa: ${l.quantity} ${l.product.unit}, threshold: ${l.min_threshold})`).join(', ')
      : 'Semua stok aman di atas ambang minimum';

  const topProductsText =
    top.length > 0
      ? top.map((t) => `${t.product.name} (${t.qty} ${t.product.unit}, omzet ${formatIDR(t.revenue)})`).join(', ')
      : 'Belum ada data penjualan 7 hari terakhir';

  return `Nama Bisnis: ${tenant.name}
Kategori Industri: ${tenant.industry_template.toUpperCase()}
Paket Langganan: ${tenant.subscription_plan}
Jumlah Outlet: ${outlets.length} (${outlets.map((o) => o.name).join(', ')})
Total Produk Katalog: ${products.length} produk
Penjualan Hari Ini: ${formatIDR(salesTotal)} (${salesCount} transaksi)
Laba Bersih 30 Hari: ${formatIDR(pl.net)} (Margin: ${Math.round((pl.gross / Math.max(pl.revenue, 1)) * 100)}%)
Stok Menipis / Perlu Restock: ${lowStockText}
Top 3 Produk Terlaris: ${topProductsText}`;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  isOpen: false,
  messages: [],
  thinking: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().thinking) return;

    const userMsg: ChatMessage = {
      id: uid('msg'),
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ messages: [...s.messages, userMsg], thinking: true }));

    const pushAssistant = (content: string, basedOnRefs?: string[]) =>
      set((s) => ({
        thinking: false,
        messages: [
          ...s.messages,
          { id: uid('msg'), role: 'assistant', content, based_on_refs: basedOnRefs, created_at: new Date().toISOString() },
        ],
      }));

    // AI adalah Network Only (TRD): saat offline tampilkan pesan eksplisit
    if (!useSyncStore.getState().isOnline) {
      setTimeout(
        () =>
          pushAssistant(
            'Fitur Retalio Intelligence membutuhkan koneksi internet. Pertanyaanmu akan bisa dijawab begitu perangkat kembali online.',
          ),
        500,
      );
      return;
    }

    const aiConfig = useAiConfigStore.getState();

    // 1. Jika API Key NVIDIA NIM telah diisi oleh admin/owner di Settings, gunakan model NIM langsung!
    if (aiConfig.apiKey && aiConfig.isEnabled) {
      try {
        const businessContext = buildBusinessContext();
        const res = await aiConfig.invokeNim(trimmed, undefined, businessContext);
        pushAssistant(res.answer, [
          `NVIDIA NIM (${res.modelUsed}${res.isFallback ? ' · Fallback' : ''})`,
          'Konteks Real-Time Bisnis',
        ]);
        return;
      } catch (err) {
        console.warn('NIM LLM direct call failed, attempting fallback...', err);
      }
    }

    // 2. Backend nyata (bila VITE_API_URL terkonfigurasi)
    if (apiConfigured() && getToken()) {
      try {
        const res = await apiFetch<{ answer: string; basedOnRefs?: string[] }>(
          '/v1/ai/chat',
          { method: 'POST', body: JSON.stringify({ question: trimmed }) },
          15000,
        );
        pushAssistant(res.answer, res.basedOnRefs);
        return;
      } catch {
        // Continue to local fast-path
      }
    }

    // 3. Fallback Fast-Path lokal yang responsif & akurat dengan data real-time
    setTimeout(() => {
      const answer = answerQuestion(trimmed);
      pushAssistant(answer.content, answer.based_on_refs);
    }, 600);
  },
  clear: () => set({ messages: [] }),
}));

