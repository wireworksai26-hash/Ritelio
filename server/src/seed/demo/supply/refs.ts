import { Prisma } from '@prisma/client';
import type { DemoContext } from '../context';

/**
 * Daftar rujukan dokumen yang sudah dibuat domain ini: kunci rencana (mis. "po:P1") -> id dokumen.
 *
 * Kenapa perlu: nomor dokumen (PO-2026-001, TRF-..., SOP-...) dibangkitkan service, dan purchase order bahkan
 * tidak punya kolom teks bebas untuk menandai asalnya. Tanpa daftar ini, dijalankan ulang akan membuat dokumen
 * kembar. Disimpan di Tenant.settings.demoRefs.supply (JSON), terpisah dari penanda selesai milik orkestrator
 * (Tenant.settings.demo) sehingga keduanya tidak saling menimpa.
 *
 * Catatan teks "[demo] DEMO-..." pada dokumen yang punya kolom catatan hanya untuk dibaca manusia.
 */

type SettingsShape = { demoRefs?: Record<string, Record<string, string>> } & Record<string, unknown>;

const DOMAIN = 'supply';

export class DemoRefs {
  private constructor(
    private readonly ctx: DemoContext,
    private readonly map: Record<string, string>,
  ) {}

  static async load(ctx: DemoContext): Promise<DemoRefs> {
    const settings = await DemoRefs.read(ctx);
    return new DemoRefs(ctx, { ...(settings.demoRefs?.[DOMAIN] ?? {}) });
  }

  private static async read(ctx: DemoContext): Promise<SettingsShape> {
    const t = await ctx.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { settings: true } });
    return (t.settings && typeof t.settings === 'object' && !Array.isArray(t.settings) ? t.settings : {}) as SettingsShape;
  }

  get(key: string): string | undefined {
    return this.map[key];
  }

  has(key: string): boolean {
    return key in this.map;
  }

  /** Simpan segera setelah dokumen terbentuk, supaya kegagalan di langkah berikutnya tidak membuatnya terulang. */
  async set(key: string, value: string): Promise<void> {
    this.map[key] = value;
    const settings = await DemoRefs.read(this.ctx);
    const next: SettingsShape = { ...settings, demoRefs: { ...(settings.demoRefs ?? {}), [DOMAIN]: { ...this.map } } };
    await this.ctx.prisma.tenant.update({ where: { id: this.ctx.tenantId }, data: { settings: next as Prisma.InputJsonValue } });
  }
}
