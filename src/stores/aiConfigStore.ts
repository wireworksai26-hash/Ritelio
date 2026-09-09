import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { redactSensitiveData, sanitizeErrorMessage } from '../lib/security';

export interface NimModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  badge?: string;
}

export const AVAILABLE_NIM_MODELS: NimModelOption[] = [
  {
    id: 'meta/llama-3.1-70b-instruct',
    name: 'Meta Llama 3.1 70B Instruct',
    provider: 'Meta',
    description: 'Model unggulan untuk analisis bisnis, strategi keuangan, dan penalaran akurat.',
    badge: 'Rekomendasi Utama',
  },
  {
    id: 'meta/llama-3.1-8b-instruct',
    name: 'Meta Llama 3.1 8B Instruct',
    provider: 'Meta',
    description: 'Model ultra cepat & ringan untuk respon instan query operasional.',
    badge: 'Cepat & Ringan',
  },
  {
    id: 'deepseek-ai/deepseek-r1',
    name: 'DeepSeek R1 (Reasoning)',
    provider: 'DeepSeek',
    description: 'Penalaran mendalam untuk kalkulasi biaya, simulasi profit, dan optimasi HPP.',
    badge: 'Deep Thinking',
  },
  {
    id: 'mistralai/mixtral-8x7b-instruct-v0.1',
    name: 'Mistral Mixtral 8x7B Instruct',
    provider: 'Mistral AI',
    description: 'MoE serbaguna untuk perumusan strategi penjualan & copywriting produk.',
  },
  {
    id: 'google/gemma-2-27b-it',
    name: 'Google Gemma 2 27B IT',
    provider: 'Google',
    description: 'Analisis ringkas dan presisi tinggi dengan parameter efisien.',
  },
  {
    id: 'nvidia/nemotron-4-340b-instruct',
    name: 'NVIDIA Nemotron 4 340B',
    provider: 'NVIDIA',
    description: 'Model enterprise skala besar untuk analisa multi-outlet dan data kompleks.',
  },
];

export const FALLBACK_OPTIONS = [
  { id: 'meta/llama-3.1-8b-instruct', name: 'Meta Llama 3.1 8B (NIM Fallback)' },
  { id: 'mistralai/mixtral-8x7b-instruct-v0.1', name: 'Mistral 8x7B (NIM Fallback)' },
  { id: 'local_fast_path', name: 'Fast-Path Lokal (Deterministik & Cepat)' },
];

interface AiConfigState {
  apiKey: string;
  baseUrl: string;
  primaryModel: string;
  fallbackModel: string;
  isEnabled: boolean;
  temperature: number;
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'error' | 'idle';
  lastTestLatency?: number;
  lastTestMessage?: string;

  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setPrimaryModel: (model: string) => void;
  setFallbackModel: (model: string) => void;
  setIsEnabled: (enabled: boolean) => void;
  setTemperature: (temp: number) => void;
  testConnection: () => Promise<{ success: boolean; latency: number; message: string }>;
  invokeNim: (
    prompt: string,
    systemPrompt?: string,
    businessContext?: string,
  ) => Promise<{ answer: string; modelUsed: string; isFallback: boolean }>;
}

export const useAiConfigStore = create<AiConfigState>()(
  persist(
    (set, get) => ({
      apiKey: '',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      primaryModel: 'meta/llama-3.1-70b-instruct',
      fallbackModel: 'meta/llama-3.1-8b-instruct',
      isEnabled: true,
      temperature: 0.3,
      lastTestStatus: 'idle',

      setApiKey: (apiKey) => set({ apiKey: apiKey.trim(), lastTestStatus: 'idle' }),
      setBaseUrl: (baseUrl) => set({ baseUrl: baseUrl.trim() }),
      setPrimaryModel: (primaryModel) => set({ primaryModel }),
      setFallbackModel: (fallbackModel) => set({ fallbackModel }),
      setIsEnabled: (isEnabled) => set({ isEnabled }),
      setTemperature: (temperature) => set({ temperature }),

      testConnection: async () => {
        const { apiKey, baseUrl, primaryModel } = get();
        if (!apiKey) {
          const res = { success: false, latency: 0, message: 'API Key belum diisi. Masukkan API Key Nvidia NIM (nvapi-...).' };
          set({ lastTestStatus: 'error', lastTestMessage: res.message, lastTestedAt: new Date().toISOString() });
          return res;
        }

        const startTime = Date.now();
        try {
          const cleanUrl = baseUrl.replace(/\/$/, '');
          const response = await fetch(`${cleanUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: primaryModel,
              messages: [
                {
                  role: 'system',
                  content: 'Kamu adalah Retalio AI Assistant. Jawab tes koneksi dalam 1 kalimat ramah.',
                },
                {
                  role: 'user',
                  content: 'Halo, cek koneksi API Nvidia NIM untuk Retalio POS.',
                },
              ],
              max_tokens: 60,
              temperature: 0.2,
            }),
          });

          const latency = Date.now() - startTime;

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
            const cleanErr = sanitizeErrorMessage(errMsg);
            const res = { success: false, latency, message: `Koneksi gagal: ${cleanErr}` };
            set({
              lastTestStatus: 'error',
              lastTestMessage: res.message,
              lastTestLatency: latency,
              lastTestedAt: new Date().toISOString(),
            });
            return res;
          }

          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content?.trim() || 'Koneksi Berhasil';
          const res = { success: true, latency, message: `Tersambung ke ${primaryModel} (${latency}ms): "${reply}"` };
          set({
            lastTestStatus: 'success',
            lastTestMessage: res.message,
            lastTestLatency: latency,
            lastTestedAt: new Date().toISOString(),
          });
          return res;
        } catch (err) {
          const latency = Date.now() - startTime;
          const msg = sanitizeErrorMessage(err);
          const res = { success: false, latency, message: `Koneksi gagal: ${msg}` };
          set({
            lastTestStatus: 'error',
            lastTestMessage: res.message,
            lastTestLatency: latency,
            lastTestedAt: new Date().toISOString(),
          });
          return res;
        }
      },

      invokeNim: async (prompt, systemPrompt, businessContext) => {
        const { apiKey, baseUrl, primaryModel, fallbackModel, temperature, isEnabled } = get();

        if (!isEnabled || !apiKey) {
          throw new Error('NIM_NOT_CONFIGURED');
        }

        const defaultSystem = `Kamu adalah Retalio Intelligence, asisten bisnis AI untuk pemilik UKM Indonesia.
Aturan penting:
1. Jawab selalu dalam Bahasa Indonesia yang ramah, profesional, dan to the point.
2. Gunakan data kontekstual bisnis aktual jika disediakan. Berikan insight actionable (saran strategis, perhitungan margin, atau rekomendasi harga).
3. Format teks dengan rapi (gunakan poin-poin bila membantu).`;

        const finalSystem = systemPrompt || defaultSystem;
        const messages: Array<{ role: string; content: string }> = [
          { role: 'system', content: finalSystem },
        ];

        // Redaksi keamanan otomatis sebelum dikirim ke luar
        const sanitizedPrompt = redactSensitiveData(prompt);
        const sanitizedContext = businessContext ? redactSensitiveData(businessContext) : '';

        if (sanitizedContext) {
          messages.push({
            role: 'user',
            content: `KONTEKS BISNIS AKTUAL:\n${sanitizedContext}\n\nPERTANYAAN / PERMINTAAN:\n${sanitizedPrompt}`,
          });
        } else {
          messages.push({
            role: 'user',
            content: sanitizedPrompt,
          });
        }

        const callModel = async (modelName: string) => {
          const cleanUrl = baseUrl.replace(/\/$/, '');
          const response = await fetch(`${cleanUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: modelName,
              messages,
              max_tokens: 1024,
              temperature: temperature || 0.3,
            }),
          });

          if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            const cleanErr = sanitizeErrorMessage(errBody);
            throw new Error(`NIM ${modelName} error (${response.status}): ${cleanErr.slice(0, 150)}`);
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content?.trim();
          if (!content) throw new Error('Respons NIM kosong');
          return content;
        };

        // Try Primary Model first
        try {
          const answer = await callModel(primaryModel);
          return { answer, modelUsed: primaryModel, isFallback: false };
        } catch (primaryErr) {
          if (fallbackModel && fallbackModel !== 'local_fast_path' && fallbackModel !== primaryModel) {
            try {
              const answer = await callModel(fallbackModel);
              return { answer, modelUsed: fallbackModel, isFallback: true };
            } catch (fallbackErr) {
              throw fallbackErr;
            }
          }
          throw primaryErr;
        }
      },
    }),
    { name: 'retalio-ai-config' },
  ),
);
