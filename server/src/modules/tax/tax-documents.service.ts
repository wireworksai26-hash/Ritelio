import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { JournalService } from '../accounting/journal.service';
import type { RecordTaxPaymentDto } from './dto/tax.dto';
import { TaxEngineService } from './tax-engine.service';

// 2100 Utang PPN, 2150 Piutang PPN (sisa lebih), 6100 Beban PPN masukan.
const PPN_PAYABLE = '2100';
const PPN_INPUT = '6100';
const AR_ACCOUNT = '1200';
const AP_ACCOUNT = '2000';
const CASH_ACCOUNT = '1000';

@Injectable()
export class TaxDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
    private readonly taxEngine: TaxEngineService,
  ) {}

  /**
   * PPN otomatis saat faktur terbit.
   *
   * Jurnal pajak dibuat terpisah dari jurnal penjualan: sisi Piutang/Hutang
   * dinaikkan sebesar pajak, sisi Utang PPN dicatat. Dengan begitu jurnal
   * utama (Dr Piutang / Cr Pendapatan atas nilai neto) tidak perlu diubah,
   * dan pajak tetap punya jejak sendiri di TaxComputation.
   */
  async applyToInvoice(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; companyId: string; invoiceId: string; net: number; on: Date },
  ) {
    const result = await this.taxEngine.computeAndPersist(tx, {
      tenantId: params.tenantId,
      companyId: params.companyId,
      kind: 'sale',
      documentType: 'customer_invoice',
      documentId: params.invoiceId,
      base: params.net,
      on: params.on,
    });
    if (!result) return { taxAmount: 0, taxTotal: params.net, journalId: null };

    const payable = await this.requireAccount(tx, params.tenantId, params.companyId, PPN_PAYABLE);
    const receivable = await this.requireAccount(tx, params.tenantId, params.companyId, AR_ACCOUNT);

    const journal = await this.journals.post(tx, {
      tenantId: params.tenantId,
      companyId: params.companyId,
      entryDate: params.on,
      sourceModule: 'tax',
      sourceRefId: params.invoiceId,
      memo: `PPN keluaran ${result.ruleCode}`,
      lines: [
        { accountId: receivable.id, direction: 'debit', amount: result.tax, memo: 'PPN atas tagihan' },
        { accountId: payable.id, direction: 'credit', amount: result.tax, memo: 'Utang PPN keluaran' },
      ],
    });

    const taxTotal = roundMoney(params.net + result.tax);
    await tx.customerInvoice.update({
      where: { id: params.invoiceId },
      data: { taxAmount: new Prisma.Decimal(result.tax), taxTotal: new Prisma.Decimal(taxTotal) },
    });
    return { taxAmount: result.tax, taxTotal, journalId: journal.id };
  }

  /** PPN otomatis saat faktur pembelian terbit; Hutang naik, Beban PPN debit. */
  async applyToBill(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; companyId: string; billId: string; net: number; on: Date },
  ) {
    const result = await this.taxEngine.computeAndPersist(tx, {
      tenantId: params.tenantId,
      companyId: params.companyId,
      kind: 'purchase',
      documentType: 'vendor_bill',
      documentId: params.billId,
      base: params.net,
      on: params.on,
    });
    if (!result) return { taxAmount: 0, taxTotal: params.net, journalId: null };

    const input = await this.requireAccount(tx, params.tenantId, params.companyId, PPN_INPUT);
    const payable = await this.requireAccount(tx, params.tenantId, params.companyId, AP_ACCOUNT);

    const journal = await this.journals.post(tx, {
      tenantId: params.tenantId,
      companyId: params.companyId,
      entryDate: params.on,
      sourceModule: 'tax',
      sourceRefId: params.billId,
      memo: `PPN masukan ${result.ruleCode}`,
      lines: [
        { accountId: input.id, direction: 'debit', amount: result.tax, memo: 'PPN masukan (kredit pajak)' },
        { accountId: payable.id, direction: 'credit', amount: result.tax, memo: 'Hutang usaha naik karena PPN' },
      ],
    });

    const taxTotal = roundMoney(params.net + result.tax);
    await tx.vendorBill.update({
      where: { id: params.billId },
      data: { taxAmount: new Prisma.Decimal(result.tax), taxTotal: new Prisma.Decimal(taxTotal) },
    });
    return { taxAmount: result.tax, taxTotal, journalId: journal.id };
  }

  /** Hitung saja, tanpa menyimpan — dipakai pratinjau di form. */
  async preview(tenantId: string, opts: { kind: 'sale' | 'purchase'; base: number; on?: Date }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const rule = await this.taxEngine.resolveRule(this.prisma as never, {
      tenantId,
      companyId,
      kind: opts.kind,
      on: opts.on ?? new Date(),
    });
    if (!rule) return { rate: 0, base: opts.base, tax: 0, ruleCode: null, source: null };
    return {
      ruleCode: rule.code,
      rate: rule.rate,
      source: rule.source,
      base: roundMoney(opts.base),
      tax: roundMoney(opts.base * rule.rate),
    };
  }

  /** PPN yang menempel pada dokumen + riwayat perhitungannya. */
  async detail(tenantId: string, opts: { kind: 'sale' | 'purchase'; documentId: string }) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const documentType = opts.kind === 'sale' ? 'customer_invoice' : 'vendor_bill';
    const computation = await this.prisma.taxComputation.findFirst({
      where: { tenantId, companyId, documentType, documentId: opts.documentId },
      include: { taxRule: { select: { code: true, name: true, source: true, rate: true } } },
      orderBy: { computedAt: 'desc' },
    });
    const document =
      opts.kind === 'sale'
        ? await this.prisma.customerInvoice.findFirst({
            where: { id: opts.documentId, tenantId, companyId },
            select: { number: true, total: true, taxAmount: true, taxTotal: true },
          })
        : await this.prisma.vendorBill.findFirst({
            where: { id: opts.documentId, tenantId, companyId },
            select: { number: true, total: true, taxAmount: true, taxTotal: true },
          });
    if (!document) throw new NotFoundException('Dokumen pajak tidak ditemukan.');
    return { document, computation };
  }

  /** Pelunasan pajak: Dr Utang PPN / Cr Kas. */
  async recordPayment(tenantId: string, dto: RecordTaxPaymentDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const payable = await this.requireAccount(this.prisma as never, tenantId, companyId, PPN_PAYABLE);
    const cash = await this.requireAccount(this.prisma as never, tenantId, companyId, CASH_ACCOUNT);
    const amount = dto.amount;
    if (amount <= 0) throw new BadRequestException('Nominal pajak harus lebih dari 0.');

    return this.prisma.$transaction(async (tx) => {
      const journal = await this.journals.post(tx, {
        tenantId,
        companyId,
        entryDate: dto.payDate ? new Date(dto.payDate) : new Date(),
        sourceModule: 'tax',
        sourceRefId: dto.reference ?? null,
        memo: `Pembayaran PPN${dto.reference ? ` ${dto.reference}` : ''}`,
        lines: [
          { accountId: payable.id, direction: 'debit', amount, memo: 'Utang PPN dibayar' },
          { accountId: cash.id, direction: 'credit', amount, memo: 'Pembayaran PPN ke negara' },
        ],
      });
      return { paid: amount, journalId: journal.id };
    });
  }

  private async requireAccount(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    companyId: string,
    code: string,
  ) {
    const account = await tx.chartOfAccount.findFirst({ where: { tenantId, companyId, code } });
    if (!account) {
      throw new NotFoundException(
        `Akun pajak ${code} belum ada pada COA perusahaan. Tambahkan dulu sebelum mencatat pajak.`,
      );
    }
    return account;
  }
}