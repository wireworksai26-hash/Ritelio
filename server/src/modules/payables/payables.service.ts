import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { JournalService } from '../accounting/journal.service';
import { TaxDocumentsService } from '../tax/tax-documents.service';
import { buildBillNote, buildBillPosting, resolveDueDate, supplierInvoiceTag } from './bill-input';
import type {
  CreateBillDto,
  CreatePaymentDto,
  ListDocumentQueryDto,
} from './dto/payable.dto';

export interface CreateBillOptions {
  actorId?: string;
  /**
   * Kunci klaim atomik: satu kunci hanya boleh melahirkan satu tagihan
   * (mis. satu hasil OCR). Dipakai sebagai baris `documentSequence` unik,
   * sehingga request paralel yang sama ditolak tanpa kolom tambahan di skema.
   */
  idempotencyKey?: string;
  /** Penanda asal yang ikut ke catatan tagihan, mis. "Dari OCR abc123". */
  source?: string;
  /** Dijalankan di transaksi yang sama setelah tagihan terbentuk. */
  onCreated?: (tx: Prisma.TransactionClient, bill: { id: string; number: string }) => Promise<void>;
}

/**
 * AP: faktur pembelian dan pembayaran ke supplier.
 *
 * Faktur lahir saat PO diterima (createBillForReceipt). Pembayaran kemudian
 * menutup faktur secara parsial/penuh lewat allocatePayment, dan setiap
 * pembayaran memposting jurnal Dr Hutang / Cr Kas sehingga saldo hutang di
 * ledger selalu konsisten dengan dokumen.
 */
@Injectable()
export class PayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
    private readonly tax: TaxDocumentsService,
  ) {}

  async listBills(tenantId: string, query: ListDocumentQueryDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const where = {
      tenantId,
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    };
    const bills = await this.prisma.vendorBill.findMany({
      where,
      include: { supplier: { select: { id: true, code: true, name: true } } },
      orderBy: [{ billDate: 'desc' }],
    });
    return bills.map((b) => this.withOutstanding(b));
  }

  /**
   * Aging hutang usaha. Bucket mengikutiUmur jatuh tempo, bukan tanggal dokumen.
   */
  async aging(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const bills = await this.prisma.vendorBill.findMany({
      where: { tenantId, companyId, status: { in: ['open', 'partial'] } },
      select: { dueDate: true, total: true, paidAmount: true },
    });

    const today = new Date();
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    let total = 0;
    for (const b of bills) {
      const outstanding = roundMoney(Number(b.total) - Number(b.paidAmount));
      total += outstanding;
      const daysLate = Math.floor((today.getTime() - new Date(b.dueDate).getTime()) / 86400000);
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

  /**
   * Catat tagihan pemasok manual (tanpa PO): Dr beban/aset per baris, Cr Hutang
   * Usaha, lalu PPN masukan lewat tax engine. Semuanya satu transaksi
   * Serializable, jadi tagihan tanpa jurnal (atau sebaliknya) tidak mungkin ada.
   */
  async createBill(tenantId: string, dto: CreateBillDto, opts: CreateBillOptions = {}) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId, companyId },
      select: { id: true, code: true, name: true, isActive: true, paymentTermDays: true },
    });
    if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan.');
    if (!supplier.isActive) throw new BadRequestException(`Pemasok ${supplier.code} berstatus nonaktif.`);

    // Hanya akun beban/aset yang boleh di-debit pada tagihan; akun utang,
    // ekuitas, dan pendapatan jelas salah dan akan merusak laporan.
    const accountIds = [...new Set(dto.lines.map((l) => l.accountId))];
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, companyId, id: { in: accountIds } },
      select: { id: true, code: true, name: true, type: true },
    });
    if (accounts.length !== accountIds.length) {
      throw new NotFoundException('Ada akun pada baris tagihan yang tidak ditemukan.');
    }
    const wrong = accounts.find((a) => a.type !== 'expense' && a.type !== 'asset');
    if (wrong) {
      throw new BadRequestException(
        `Akun ${wrong.code} ${wrong.name} bukan akun beban/aset, tidak bisa dipakai pada tagihan pemasok.`,
      );
    }

    const apAccount = await this.findAccount(tenantId, companyId, '2000', 'Hutang Usaha');
    const { total, journalLines } = buildBillPosting(dto.lines, apAccount.id);

    const billDate = dto.billDate ? new Date(dto.billDate) : new Date();
    const dueDate = resolveDueDate(
      billDate,
      dto.dueDate ? new Date(dto.dueDate) : null,
      supplier.paymentTermDays ?? 0,
    );
    const note = buildBillNote(dto.supplierInvoiceNumber, dto.note, opts.source);
    const billId = randomUUID();

    return this.prisma.$transaction(
      async (tx) => {
        if (opts.idempotencyKey) {
          try {
            await tx.documentSequence.create({
              data: { tenantId, companyId, kind: opts.idempotencyKey, nextValue: 1 },
            });
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              throw new ConflictException('Dokumen sumber ini sudah dijadikan tagihan.');
            }
            throw err;
          }
        }

        if (dto.supplierInvoiceNumber) {
          const dup = await tx.vendorBill.findFirst({
            where: {
              tenantId,
              companyId,
              supplierId: supplier.id,
              status: { not: 'voided' },
              note: { startsWith: supplierInvoiceTag(dto.supplierInvoiceNumber) },
            },
            select: { number: true },
          });
          if (dup) {
            throw new ConflictException(
              `Faktur ${dto.supplierInvoiceNumber} dari ${supplier.name} sudah tercatat sebagai ${dup.number}.`,
            );
          }
        }

        const journal = await this.journals.post(tx, {
          tenantId,
          companyId,
          entryDate: billDate,
          sourceModule: 'payables',
          sourceRefId: billId,
          memo: `Tagihan pemasok ${supplier.name}${dto.supplierInvoiceNumber ? ` ${dto.supplierInvoiceNumber}` : ''}`,
          actorId: opts.actorId,
          lines: journalLines,
        });

        const number = await nextDocumentNumber(tx, 'vendor-bill', 'AP', tenantId, companyId);
        await tx.vendorBill.create({
          data: {
            id: billId,
            tenantId,
            companyId,
            number,
            supplierId: supplier.id,
            journalId: journal.id,
            billDate,
            dueDate,
            total: new Prisma.Decimal(total),
            note,
          },
        });

        if (dto.applyTax !== false) {
          await this.tax.applyToBill(tx, { tenantId, companyId, billId, net: total, on: billDate });
        }
        if (opts.onCreated) await opts.onCreated(tx, { id: billId, number });

        const bill = await tx.vendorBill.findUniqueOrThrow({
          where: { id: billId },
          include: { supplier: { select: { id: true, code: true, name: true } } },
        });
        return { ...this.withOutstanding(bill), journalId: journal.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Dipanggil dari purchasing.receive dalam transaksi yang sama. */
  async createBillForReceipt(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      companyId: string;
      supplierId: string;
      purchaseOrderId: string;
      journalId: string;
      total: number;
      dueDate: Date;
      note?: string;
    },
  ): Promise<{ id: string; number: string }> {
    const number = await nextDocumentNumber(tx, 'vendor-bill', 'AP', params.tenantId, params.companyId);
    const bill = await tx.vendorBill.create({
      data: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        number,
        supplierId: params.supplierId,
        purchaseOrderId: params.purchaseOrderId,
        journalId: params.journalId,
        dueDate: params.dueDate,
        total: new Prisma.Decimal(params.total),
        note: params.note ?? '',
      },
      select: { id: true, number: true },
    });

    await this.tax.applyToBill(tx, {
      tenantId: params.tenantId,
      companyId: params.companyId,
      billId: bill.id,
      net: params.total,
      on: new Date(),
    });

    return bill;
  }

  /** Bayar satu faktur. Excess payment ditolak agar tidak jadi uang hilang. */
  async payBill(tenantId: string, billId: string, dto: CreatePaymentDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const bill = await this.prisma.vendorBill.findFirst({ where: { id: billId, tenantId, companyId } });
    if (!bill) throw new NotFoundException('Faktur pembelian tidak ditemukan.');
    if (bill.status === 'paid' || bill.status === 'voided') {
      throw new BadRequestException(`Faktur ${bill.number} sudah ${bill.status}.`);
    }

    const outstanding = roundMoney(Number(bill.total) - Number(bill.paidAmount));
    if (dto.amount <= 0) throw new BadRequestException('Nominal pembayaran harus positif.');
    if (dto.amount > outstanding) {
      throw new BadRequestException(
        `Pembayaran melebihi sisa tagihan. Sisa: ${outstanding.toLocaleString('id-ID')}.`,
      );
    }

    const [hutang, kas] = await Promise.all([
      this.findAccount(tenantId, companyId, '2000', 'Hutang Usaha'),
      this.findAccount(tenantId, companyId, '1000', 'Kas'),
    ]);

    return this.prisma.$transaction(async (tx) => {
      const journal = await this.journals.post(tx, {
        tenantId,
        companyId,
        entryDate: dto.payDate ? new Date(dto.payDate) : new Date(),
        sourceModule: 'payables',
        sourceRefId: billId,
        memo: `Pembayaran faktur ${bill.number}`,
        lines: [
          { accountId: hutang.id, direction: 'debit', amount: dto.amount, memo: 'Pelunasan utang usaha' },
          { accountId: kas.id, direction: 'credit', amount: dto.amount, memo: 'Pembayaran ke supplier' },
        ],
      });

      const number = await nextDocumentNumber(tx, 'vendor-payment', 'PAY', tenantId, companyId);
      const payment = await tx.vendorPayment.create({
        data: {
          tenantId,
          companyId,
          number,
          supplierId: bill.supplierId,
          billId,
          journalId: journal.id,
          payDate: dto.payDate ? new Date(dto.payDate) : new Date(),
          amount: new Prisma.Decimal(dto.amount),
          method: dto.method ?? 'cash',
          note: dto.note ?? '',
        },
      });

      const paidAmount = roundMoney(Number(bill.paidAmount) + dto.amount);
      // Dibandingkan dengan total, bukan sisa: `paidAmount` sudah kumulatif.
      const status = paidAmount >= roundMoney(Number(bill.total)) ? 'paid' : 'partial';
      await tx.vendorBill.update({
        where: { id: billId },
        data: { paidAmount: new Prisma.Decimal(paidAmount), status },
      });

      return { payment, billStatus: status, journalId: journal.id };
    });
  }

  private async findAccount(tenantId: string, companyId: string, code: string, fallback: string) {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, companyId, code },
    });
    if (account) return account;
    // Fallback by type agar sistem tetap jalan walau COA dikustom.
    if (code === '1000') {
      const cash = await this.prisma.chartOfAccount.findFirst({
        where: { tenantId, companyId, type: 'asset', code: { startsWith: '1' } },
      });
      if (cash) return cash;
    } else {
      const liability = await this.prisma.chartOfAccount.findFirst({
        where: { tenantId, companyId, type: 'liability', code: { startsWith: '2' } },
      });
      if (liability) return liability;
    }
    throw new NotFoundException(`Akun ${code} (${fallback}) belum ada pada COA perusahaan.`);
  }

  private withOutstanding<T extends { total: unknown; paidAmount: unknown }>(bill: T) {
    return {
      ...bill,
      outstanding: roundMoney(Number(bill.total) - Number(bill.paidAmount)),
    };
  }
}

/** Nomor dokumen berurutan per company; retry aman terhadap P2002. */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  kind: string,
  prefix: string,
  tenantId: string,
  companyId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const counter = await tx.documentSequence.upsert({
      where: { tenantId_companyId_kind: { tenantId, companyId, kind } },
      update: { nextValue: { increment: 1 } },
      create: { tenantId, companyId, kind, nextValue: 2 },
    });
    const value = counter.nextValue - 1;
    const candidate = `${prefix}-${year}-${String(value).padStart(5, '0')}`;
    const where = { where: { tenantId, companyId, number: candidate }, select: { id: true } };
    // Cek tabel milik jenis dokumennya sendiri (dulu semua selain vendor-bill ikut mengecek vendorPayment).
    const exists =
      kind === 'vendor-bill'
        ? await tx.vendorBill.findFirst(where)
        : kind === 'vendor-payment'
          ? await tx.vendorPayment.findFirst(where)
          : kind === 'customer-invoice'
            ? await tx.customerInvoice.findFirst(where)
            : kind === 'customer-receipt'
              ? await tx.customerReceipt.findFirst(where)
              : null;
    if (!exists) return candidate;
  }
  throw new ConflictException('Gagal membuat nomor dokumen, coba lagi.');
}