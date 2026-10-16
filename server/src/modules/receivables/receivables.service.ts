import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { JournalService } from '../accounting/journal.service';
import { grossAmount, outstandingOf } from '../finance/document-amounts';
import { TaxDocumentsService } from '../tax/tax-documents.service';
import { nextDocumentNumber } from '../payables/payables.service';
import type { CreateReceiptDto, ListDocumentQueryDto } from './dto/receivable.dto';

/**
 * AR: faktur penjualan dan penerimaan kas dari pelanggan.
 *
 * Faktur dibuat hanya untuk penjualan kredit (non-tunai). Penjualan tunai sudah
 * langsung terbit kas di jurnal POS, jadi membuat faktur untuknya akan
 * menghitung piutang dua kali.
 */
@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
    private readonly tax: TaxDocumentsService,
  ) {}

  async listInvoices(tenantId: string, query: ListDocumentQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const invoices = await this.prisma.customerInvoice.findMany({
      where: {
        tenantId,
        companyId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      include: { customer: { select: { id: true, code: true, name: true } } },
      orderBy: [{ invoiceDate: 'desc' }],
    });
    return invoices.map((i) => this.withOutstanding(i));
  }

  async aging(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const invoices = await this.prisma.customerInvoice.findMany({
      where: { tenantId, companyId, status: { in: ['open', 'partial'] } },
      select: { dueDate: true, total: true, taxTotal: true, paidAmount: true },
    });

    const today = new Date();
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    let total = 0;
    for (const inv of invoices) {
      const outstanding = outstandingOf(inv);
      total += outstanding;
      const daysLate = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      if (daysLate <= 0) buckets.current += outstanding;
      else if (daysLate <= 30) buckets.d1_30 += outstanding;
      else if (daysLate <= 60) buckets.d31_60 += outstanding;
      else if (daysLate <= 90) buckets.d61_90 += outstanding;
      else buckets.d90plus += outstanding;
    }

    return {
      total: roundMoney(total),
      buckets: {
        current: roundMoney(buckets.current),
        d1_30: roundMoney(buckets.d1_30),
        d31_60: roundMoney(buckets.d31_60),
        d61_90: roundMoney(buckets.d61_90),
        d90plus: roundMoney(buckets.d90plus),
      },
    };
  }

  async createInvoiceForSale(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      companyId: string;
      customerId: string;
      /** Hanya diisi bila dokumen asal benar-benar SalesTransaction (POS). */
      salesTransactionId?: string;
      /** Diisi saat tagihan berasal dari proyek. */
      projectId?: string;
      journalId: string;
      total: number;
      dueDate: Date;
    },
  ): Promise<{ id: string; number: string }> {
    const number = await nextDocumentNumber(tx, 'customer-invoice', 'INV', params.tenantId, params.companyId);
    const invoice = await tx.customerInvoice.create({
      data: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        number,
        customerId: params.customerId,
        salesTransactionId: params.salesTransactionId ?? null,
        projectId: params.projectId ?? null,
        journalId: params.journalId,
        dueDate: params.dueDate,
        total: new Prisma.Decimal(params.total),
      },
      select: { id: true, number: true },
    });

    // PPN keluaran menempel otomatis di sini, bukan di panggilan manual, supaya
    // tidak ada faktur yang terbit tanpa pajak padahal aturan PPN-nya aktif.
    await this.tax.applyToInvoice(tx, {
      tenantId: params.tenantId,
      companyId: params.companyId,
      invoiceId: invoice.id,
      net: params.total,
      on: new Date(),
    });

    return invoice;
  }

  /**
   * Terima pembayaran faktur. Baris faktur dikunci (FOR UPDATE) di dalam
   * transaksi agar penerimaan paralel tidak melampaui tagihan, dan nilai yang
   * dilunasi adalah nilai penuh faktur (DPP + PPN keluaran) karena PPN ikut
   * masuk ke Piutang Usaha di buku besar.
   */
  async receive(tenantId: string, invoiceId: string, dto: CreateReceiptDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    if (dto.amount <= 0) throw new BadRequestException('Nominal penerimaan harus positif.');

    const [piutang, kas] = await Promise.all([
      this.findAccount(tenantId, companyId, ['1200'], 'asset', 'Piutang Usaha'),
      this.findAccount(tenantId, companyId, ['1000'], 'asset', 'Kas'),
    ]);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_invoices WHERE id = ${invoiceId} AND tenant_id = ${tenantId} AND company_id = ${companyId} FOR UPDATE`;
      const invoice = await tx.customerInvoice.findFirst({
        where: { id: invoiceId, tenantId, companyId },
      });
      if (!invoice) throw new NotFoundException('Faktur penjualan tidak ditemukan.');
      if (invoice.status === 'paid' || invoice.status === 'voided') {
        throw new BadRequestException(`Faktur ${invoice.number} sudah ${invoice.status}.`);
      }
      if (!invoice.customerId) {
        throw new BadRequestException('Faktur tanpa pelanggan tidak bisa dilunasi.');
      }

      const gross = grossAmount(invoice);
      const outstanding = roundMoney(gross - Number(invoice.paidAmount));
      if (dto.amount > outstanding) {
        throw new BadRequestException(
          `Penerimaan melebihi sisa tagihan. Sisa: ${outstanding.toLocaleString('id-ID')}.`,
        );
      }

      const payDate = dto.payDate ? new Date(dto.payDate) : new Date();
      const journal = await this.journals.post(tx, {
        tenantId,
        companyId,
        entryDate: payDate,
        sourceModule: 'receivables',
        sourceRefId: invoiceId,
        memo: `Penerimaan faktur ${invoice.number}`,
        lines: [
          { accountId: kas.id, direction: 'debit', amount: dto.amount, memo: 'Penerimaan pelanggan' },
          { accountId: piutang.id, direction: 'credit', amount: dto.amount, memo: 'Pelunasan piutang usaha' },
        ],
      });

      const number = await nextDocumentNumber(tx, 'customer-receipt', 'RCP', tenantId, companyId);
      const receipt = await tx.customerReceipt.create({
        data: {
          tenantId,
          companyId,
          number,
          customerId: invoice.customerId,
          invoiceId,
          journalId: journal.id,
          payDate,
          amount: new Prisma.Decimal(dto.amount),
          method: dto.method ?? 'cash',
          note: dto.note ?? '',
        },
      });

      const paidAmount = roundMoney(Number(invoice.paidAmount) + dto.amount);
      // Dibandingkan dengan nilai penuh, bukan sisa: `paidAmount` sudah kumulatif.
      const status = paidAmount >= gross ? 'paid' : 'partial';
      await tx.customerInvoice.update({
        where: { id: invoiceId },
        data: { paidAmount: new Prisma.Decimal(paidAmount), status },
      });

      return { receipt, invoiceStatus: status, journalId: journal.id };
    });
  }

  private async findAccount(
    tenantId: string,
    companyId: string,
    codes: string[],
    _type: 'asset',
    label: string,
  ) {
    for (const code of codes) {
      const account = await this.prisma.chartOfAccount.findFirst({
        where: { tenantId, companyId, code },
      });
      if (account) return account;
    }
    // Tanpa fallback berdasarkan tipe: akun aset pertama bisa saja Persediaan/Aset Tetap.
    throw new NotFoundException(`Akun ${label} belum ada pada COA perusahaan.`);
  }

  private withOutstanding<T extends { total: unknown; taxTotal?: unknown; paidAmount: unknown }>(inv: T) {
    return { ...inv, grossTotal: grossAmount(inv), outstanding: outstandingOf(inv) };
  }
}