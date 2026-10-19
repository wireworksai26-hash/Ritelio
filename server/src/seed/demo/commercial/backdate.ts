import type { DemoContext } from '../context';

/**
 * Memundurkan tanggal dokumen yang dibuat service aplikasi.
 *
 * SalesService.processOne, CrmService.fulfil, dan penerbitan faktur memakai `new Date()` untuk tanggal jurnal,
 * pergerakan stok, tanggal faktur, dan jatuh tempo, dan tidak menerima tanggal dari DTO. Agar tren penjualan,
 * laba rugi, arus kas, dan aging memakai tanggal rencana, setelah service selesai kolom tanggalnya diperbarui
 * secara terarah di sini. Hanya kolom tanggal (dan nomor jurnal supaya cocok dengan bulannya) yang diubah:
 * jumlah, akun, dan arah debit/kredit tidak pernah disentuh, sehingga buku besar tetap seimbang.
 */

const DAY_MS = 86_400_000;

export const periodKeyOf = (d: Date): string => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export class Backdater {
  private constructor(
    private readonly ctx: DemoContext,
    private readonly periods: Array<{ id: string; startDate: Date; endDate: Date }>,
  ) {}

  static async create(ctx: DemoContext): Promise<Backdater> {
    const periods = await ctx.prisma.fiscalPeriod.findMany({
      where: { tenantId: ctx.tenantId, companyId: ctx.companyId },
      select: { id: true, startDate: true, endDate: true },
    });
    return new Backdater(ctx, periods);
  }

  private periodFor(when: Date): string {
    const p = this.periods.find((x) => x.startDate <= when && when < x.endDate);
    if (!p) throw new Error(`Tidak ada periode fiskal untuk ${when.toISOString()}.`);
    return p.id;
  }

  /** Nomor jurnal berikutnya pada bulan `key`, dari penghitung yang sama dengan JournalService. */
  private async nextNumber(key: string): Promise<string> {
    const { prisma, tenantId, companyId } = this.ctx;
    await prisma.journalSequence.createMany({ data: [{ tenantId, companyId, periodKey: key, lastNumber: 0 }], skipDuplicates: true });
    const seq = await prisma.journalSequence.update({
      where: { tenantId_companyId_periodKey: { tenantId, companyId, periodKey: key } },
      data: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
    return `JRN-${key}-${String(seq.lastNumber).padStart(6, '0')}`;
  }

  /** Pindahkan satu jurnal ke tanggal `when` (periode dan nomor ikut menyesuaikan bulannya). */
  async journal(id: string, when: Date): Promise<void> {
    const header = await this.ctx.prisma.journalHeader.findUniqueOrThrow({ where: { id }, select: { number: true } });
    const key = periodKeyOf(when);
    const number = header.number.startsWith(`JRN-${key}-`) ? header.number : await this.nextNumber(key);
    await this.ctx.prisma.journalHeader.update({
      where: { id },
      data: { entryDate: when, postedAt: when, createdAt: when, periodId: this.periodFor(when), number },
    });
  }

  /** Semua jurnal bersumber (modul, referensi) tertentu, mis. ('pos', id transaksi) atau ('tax', id faktur). */
  async journalsOf(module: string, refId: string, when: Date): Promise<void> {
    const { prisma, tenantId, companyId } = this.ctx;
    const rows = await prisma.journalHeader.findMany({
      where: { tenantId, companyId, sourceModule: module, sourceRefId: refId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    for (const r of rows) await this.journal(r.id, when);
  }

  async stockMovements(refId: string, when: Date): Promise<void> {
    await this.ctx.prisma.stockMovement.updateMany({
      where: { tenantId: this.ctx.tenantId, companyId: this.ctx.companyId, refId },
      data: { createdAt: when },
    });
  }

  /** Faktur piutang: tanggal terbit, jatuh tempo (tanggal + termin), dan jurnal PPN keluarannya. */
  async invoice(invoiceId: string, when: Date, termDays: number): Promise<void> {
    const { prisma, tenantId, companyId } = this.ctx;
    await prisma.customerInvoice.update({
      where: { id: invoiceId },
      data: { invoiceDate: when, createdAt: when, updatedAt: when, dueDate: new Date(when.getTime() + termDays * DAY_MS) },
    });
    await prisma.taxComputation.updateMany({
      where: { tenantId, companyId, documentType: 'customer_invoice', documentId: invoiceId },
      data: { computedAt: when },
    });
    await this.journalsOf('tax', invoiceId, when);
  }

  /** Transaksi POS yang baru dibuat: dokumen, stok, jurnal, dan (untuk penjualan kredit) fakturnya. */
  async sale(txId: string, when: Date, invoice?: { id: string; termDays: number }): Promise<void> {
    await this.ctx.prisma.salesTransaction.update({ where: { id: txId }, data: { serverTimestamp: when, createdAt: when } });
    await this.stockMovements(txId, when);
    await this.journalsOf('pos', txId, when);
    if (invoice) await this.invoice(invoice.id, when, invoice.termDays);
  }

  /** Sales order yang baru di-fulfil: stok, jurnal penjualan, faktur, dan tanggal penyerahan. */
  async fulfilment(orderId: string, when: Date, invoice: { id: string; termDays: number }): Promise<void> {
    await this.ctx.prisma.salesOrder.update({ where: { id: orderId }, data: { fulfilledAt: when, updatedAt: when } });
    await this.stockMovements(orderId, when);
    await this.journalsOf('sales', orderId, when);
    await this.invoice(invoice.id, when, invoice.termDays);
  }

  /**
   * Stok awal dari seed:businesses tercatat "hari ini", padahal penjualan memakai tanggal-tanggal lampau.
   * Tanpa ini kartu stok urut tanggal dan neraca per tanggal lampau menampilkan persediaan negatif.
   * Hanya jurnal "Stok awal ..." dan pergerakan stok awalnya yang digeser, dan hanya bila lebih baru dari `when`.
   */
  async openingStock(when: Date): Promise<number> {
    const { prisma, tenantId, companyId } = this.ctx;
    const rows = await prisma.journalHeader.findMany({
      where: { tenantId, companyId, sourceModule: 'inventory-adjustment', memo: { startsWith: 'Stok awal' }, entryDate: { gt: when } },
      orderBy: { entryDate: 'asc' },
      select: { id: true, sourceRefId: true },
    });
    for (const r of rows) {
      await this.journal(r.id, when);
      if (r.sourceRefId) await this.stockMovements(r.sourceRefId, when);
    }
    return rows.length;
  }

  /** Penerimaan pelanggan: tanggal jurnal sudah dari payDate; sisanya hanya cap waktu pembuatan. */
  async receipt(receiptId: string, journalId: string, when: Date): Promise<void> {
    await this.ctx.prisma.customerReceipt.update({ where: { id: receiptId }, data: { createdAt: when } });
    await this.journal(journalId, when);
  }
}
