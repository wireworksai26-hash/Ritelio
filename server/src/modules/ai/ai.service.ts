import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { paidAiQuotaFor } from '../../common/config/plans.config';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AiRouterService } from './ai-router.service';
import { FastPathService } from './fast-path.service';
import { NimNotConfiguredError, NimService } from './nim.service';

export interface ChatResponse {
  answer: string;
  path: 'fast' | 'slow' | 'quota_exceeded' | 'unconfigured' | 'error';
  intent?: string;
  basedOnRefs: string[];
  model?: string;
  cached?: boolean;
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly router: AiRouterService,
    private readonly fastPath: FastPathService,
    private readonly nim: NimService,
  ) {}

  private monthKey(): string {
    return new Date().toISOString().slice(0, 7);
  }

  /** Kuota AI bulanan per tenant: dari subscription, fallback mapping plan. */
  private async quotaFor(tenantId: string): Promise<number> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (tenant.subscriptionPlan === 'custom') return Number.POSITIVE_INFINITY;
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trialing'] } },
      orderBy: { startedAt: 'desc' },
    });
    // Trial yang sudah lewat tanggalnya tidak lagi memberi kuota.
    if (sub && sub.endsAt && sub.endsAt.getTime() < Date.now()) return 0;
    if (sub) return sub.aiQuota;
    return tenant.subscriptionPlan === 'plus_ai' ? paidAiQuotaFor('plus_ai') : 0;
  }

  private async usage(tenantId: string): Promise<number> {
    const counter = await this.prisma.aiUsageCounter.findUnique({
      where: { tenantId_month: { tenantId, month: this.monthKey() } },
    });
    return counter?.count ?? 0;
  }

  private async incrementUsage(tenantId: string): Promise<void> {
    await this.prisma.aiUsageCounter.upsert({
      where: { tenantId_month: { tenantId, month: this.monthKey() } },
      update: { count: { increment: 1 } },
      create: { tenantId, month: this.monthKey(), count: 1 },
    });
  }

  /**
   * Reserve satu slot kuota secara atomik: hanya satu request yang bisa menaikkan
   * count dari (quota-1) ke quota. Mengembalikan false berarti kuota habis.
   * Row counter yang belum ada dibuat dengan nilai 0 lalu di-poll — bounded agar
   * Request tidak macet bila ada race saat row baru dibuat.
   */
  private async reserveUsage(tenantId: string, quota: number): Promise<boolean> {
    if (quota === Number.POSITIVE_INFINITY) {
      await this.incrementUsage(tenantId);
      return true;
    }
    const month = this.monthKey();
    // Row counter dibuat lebih dulu agar updateMany berikutnya punya target.
    await this.prisma.aiUsageCounter
      .upsert({
        where: { tenantId_month: { tenantId, month } },
        update: {},
        create: { tenantId, month, count: 0 },
      })
      .catch(() => undefined);

    // Filter count: { lt: quota } membuat increment bersifat atomik: hanya satu
    // request yang bisa menaikkan count dari quota-1 ke quota.
    const updated = await this.prisma.aiUsageCounter.updateMany({
      where: { tenantId, month, count: { lt: quota } },
      data: { count: { increment: 1 } },
    });
    return updated.count === 1;
  }

  /** Kembalikan slot yang direservasi ketika panggilan LLM gagal. */
  private async releaseUsage(tenantId: string): Promise<void> {
    await this.prisma.aiUsageCounter
      .updateMany({
        where: { tenantId, month: this.monthKey(), count: { gt: 0 } },
        data: { count: { decrement: 1 } },
      })
      .catch(() => undefined);
  }

  private async log(
    tenantId: string,
    userId: string,
    question: string,
    answer: string,
    refs: string[],
  ) {
    await this.prisma.aiInsightLog
      .create({
        data: {
          tenantId,
          userId,
          module: 'assistant',
          insightType: 'nlq_chat',
          title: question.slice(0, 80),
          content: answer,
          basedOnRefs: refs,
        },
      })
      .catch(() => undefined);
  }

  // ── Chat utama dengan routing fast/slow path ──────────────
  async chat(user: AuthUser, question: string): Promise<ChatResponse> {
    const quota = await this.quotaFor(user.tenantId);

    // Paket Basic: tidak ada AI sama sekali
    if (quota === 0) {
      throw new ForbiddenException(
        'Paket Basic tidak mencakup Retalio Intelligence. Upgrade ke paket +AI untuk mengaktifkan asisten cerdas.',
      );
    }

    const route = this.router.classify(question);

    // FAST PATH — deterministik dari DB, nol token, tidak mengonsumsi kuota LLM
    if (route.intent !== 'slow') {
      const result =
        route.intent === 'how_to'
          ? this.fastPath.howTo(question)
          : await this.fastPath.handle(route.intent, user.tenantId, route.periodDays);
      await this.log(user.tenantId, user.sub, question, result.answer, result.refs);
      return { answer: result.answer, path: 'fast', intent: route.intent, basedOnRefs: result.refs };
    }

    // SLOW PATH (NVIDIA NIM) — hanya jalur ini yang mengonsumsi kuota.
    // Kuota direservasi ATOMIK sebelum panggilan LLM; kalau hanya dibaca lalu
    // ditulis setelahnya, N request paralel semuanya lolos despite kuota habis.
    const reserved = await this.reserveUsage(user.tenantId, quota);
    if (!reserved) {
      const used = await this.usage(user.tenantId);
      const answer =
        `Kuota AI bulan ini sudah habis (${used}/${quota} query). ` +
        'Pertanyaan operasional seperti "penjualan hari ini", "stok menipis", "laba rugi", "proyeksi arus kas", dan "produk terlaris" tetap bisa saya jawab lewat jalur cepat. ' +
        'Untuk kuota tanpa batas, upgrade ke paket Custom.';
      await this.log(user.tenantId, user.sub, question, answer, []);
      return { answer, path: 'quota_exceeded', basedOnRefs: [] };
    }

    try {
      const snapshot = await this.fastPath.snapshot(user.tenantId);
      const result = await this.nim.answer(user.tenantId, question, snapshot);
      const refs = [`llm:${result.model}`, 'konteks:snapshot_bisnis'];
      await this.log(user.tenantId, user.sub, question, result.answer, refs);
      return {
        answer: result.answer,
        path: 'slow',
        basedOnRefs: refs,
        model: result.model,
        cached: result.cached,
      };
    } catch (err) {
      // Panggilan gagal tidak boleh membebankan kuota.
      await this.releaseUsage(user.tenantId);
      const answer =
        err instanceof NimNotConfiguredError
          ? 'Model AI utama (NVIDIA NIM) belum dikonfigurasi — atur NIM_API_KEY di server. Sementara itu, saya tetap bisa menjawab lewat jalur cepat: "penjualan hari ini", "stok menipis", "laba rugi 30 hari", "proyeksi arus kas", "produk terlaris", "bandingkan outlet", atau panduan "cara tambah produk".'
          : 'Maaf, model AI sedang tidak dapat dijangkau. Coba beberapa saat lagi — atau gunakan pertanyaan operasional (penjualan, stok, laba rugi, arus kas) yang saya jawab lewat jalur cepat.';
      await this.log(user.tenantId, user.sub, question, answer, []);
      return { answer, path: err instanceof NimNotConfiguredError ? 'unconfigured' : 'error', basedOnRefs: [] };
    }
  }

  // ── Insight log, feedback, usage ──────────────────────────
  async insights(tenantId: string, module?: string) {
    return this.prisma.aiInsightLog.findMany({
      where: { tenantId, ...(module ? { module } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async feedback(tenantId: string, id: string, feedback: number) {
    const insight = await this.prisma.aiInsightLog.findFirst({ where: { id, tenantId } });
    if (!insight) throw new NotFoundException('Insight tidak ditemukan.');
    return this.prisma.aiInsightLog.update({ where: { id }, data: { userFeedback: feedback } });
  }

  async usageInfo(tenantId: string) {
    const quota = await this.quotaFor(tenantId);
    const used = await this.usage(tenantId);
    return {
      month: this.monthKey(),
      used,
      quota: quota === Number.POSITIVE_INFINITY ? 'unlimited' : quota,
      note: 'Hanya jalur slow path (LLM NVIDIA NIM) yang mengonsumsi kuota. Jawaban jalur cepat tidak dihitung.',
    };
  }

  async cashflowForecast(tenantId: string, days: number) {
    return { forecastDays: days, series: await this.fastPath.cashflowSeries(tenantId, 14, days) };
  }

  // OCR struk/invoice — butuh vision model (NIM_VISION_MODEL)
}
