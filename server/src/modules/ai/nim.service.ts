import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { redactSensitive } from '../../common/utils/redact';

export class NimNotConfiguredError extends Error {
  constructor() {
    super('NIM_API_KEY belum dikonfigurasi');
  }
}

export interface NimAnswer {
  answer: string;
  model: string;
  cached: boolean;
}

// System prompt slow path — grounding ketat: hanya data konteks, tak mengarang angka.
const SYSTEM_PROMPT = `Kamu adalah Retalio Intelligence, asisten bisnis AI untuk pemilik UKM Indonesia.

Aturan wajib:
1. Jawab selalu dalam Bahasa Indonesia yang hangat dan jelas.
2. JANGAN PERNAH mengarang angka. Gunakan hanya angka dari blok KONTEKS BISNIS. Jika data tidak cukup, katakan dengan jujur dan sarankan langkah untuk mendapatkannya.
3. Ringkas: maksimal 120 kata. Gunakan poin bila membantu.
4. Setiap rekomendasi bersifat saran — selalu akhiri dengan aksi yang bisa dipilih pengguna (bukan eksekusi otomatis).
5. Jika pertanyaan di luar konteks bisnis, jawab singkat lalu arahkan kembali ke topik operasional bisnis.`;

// ─────────────────────────────────────────────────────────────
// NVIDIA NIM client — OpenAI-compatible /chat/completions.
// Hosted: https://integrate.api.nvidia.com/v1 · Self-hosted: http://<host>:8000/v1
// Termasuk: redaksi data sensitif + cache jawaban (TTL) untuk hemat token.
// ─────────────────────────────────────────────────────────────
@Injectable()
export class NimService {
  private readonly logger = new Logger(NimService.name);
  private readonly cache = new Map<string, { value: NimAnswer; expiresAt: number }>();

  private get ttlMs(): number {
    return Number(process.env.AI_CACHE_TTL_SECONDS ?? 600) * 1000;
  }

  async answer(tenantId: string, question: string, snapshot: string): Promise<NimAnswer> {
    const baseUrl = (process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
    const apiKey = process.env.NIM_API_KEY;
    const model = process.env.NIM_MODEL ?? 'meta/llama-3.1-8b-instruct';
    if (!apiKey) throw new NimNotConfiguredError();

    // Cache per tenant + pertanyaan ternormalisasi
    const cacheKey = createHash('sha256')
      .update(`${tenantId}:${question.trim().toLowerCase()}`)
      .digest('hex');
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return { ...hit.value, cached: true };
    }

    const redacted = redactSensitive(question);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `KONTEKS BISNIS (data aktual saat ini):\n${snapshot}\n\nPERTANYAAN PENGGUNA:\n${redacted}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 512,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`NIM error ${res.status}: ${body.slice(0, 200)}`);
      throw new Error(`NVIDIA NIM mengembalikan status ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Respons NIM kosong');

    const value: NimAnswer = { answer: content, model, cached: false };
    this.cache.set(cacheKey, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }
}
