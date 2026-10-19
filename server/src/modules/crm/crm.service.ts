import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { roundMoney } from '../../common/utils/money';
import { JournalService } from '../accounting/journal.service';
import { isUniqueViolation, retryOnConflict } from '../inventory/tx-retry';
import { ReceivablesService } from '../receivables/receivables.service';
import { isStockTracked } from '../sales/stock-lines';
import type {
  ConvertQuotationDto,
  MoveOpportunityDto,
  MoveQuotationDto,
  MoveStageDto,
  CreateComplaintDto,
  CreateCustomerDto,
  CreateInteractionDto,
  CreateLeadDto,
  CreateOpportunityDto,
  CreateQuotationDto,
  CreateSalesOrderDto,
  ResolveComplaintDto,
} from './dto/crm.dto';

const REVENUE_ACCOUNT = '4000';
const COGS_ACCOUNT = '5000';
const INVENTORY_ACCOUNT = '1100';
const RECEIVABLE_ACCOUNT = '1200';
const MAX_ITEM_PRICE = 1_000_000_000;

/**
 * Fase 3 — Penjualan & CRM.
 *
 * Alur dokumennya: Lead -> Opportunity -> Quotation -> SalesOrder -> Invoice.
 * Sales order baru mengurangi stok dan memposting jurnal setelah di-fulfil,
 * bukan saat dibuat — supaya SO yang masih draft tidak mengunci stok.
 */
const LEAD_FLOW = ['new', 'contacted', 'qualified', 'converted'] as const;
const OPPORTUNITY_FLOW = [
  'prospecting',
  'qualification',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

/** Probability default per tahapan — dipakai kalau klien tidak menetapkannya. */
const DEFAULT_PROBABILITY: Record<string, number> = {
  prospecting: 10,
  qualification: 25,
  proposal: 50,
  negotiation: 75,
  closed_won: 100,
  closed_lost: 0,
};

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalService,
    private readonly receivables: ReceivablesService,
  ) {}

  // ============================== LEAD ==============================

  listLeads(tenantId: string) {
    return this.prisma.$transaction(async (tx) =>
      this.companyOf(tx, tenantId).then((companyId) =>
        tx.lead.findMany({
      take: 500,
          where: { tenantId, companyId },
          include: {
            customer: { select: { id: true, code: true, name: true } },
            opportunities: { select: { id: true, title: true, stage: true, value: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );
  }

  async createLead(tenantId: string, dto: CreateLeadDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.lead.create({
      data: {
        tenantId,
        companyId,
        name: dto.name,
        contactName: dto.contactName ?? '',
        phone: dto.phone ?? '',
        email: dto.email ?? '',
        source: dto.source ?? '',
        notes: dto.notes ?? '',
      },
    });
  }

  /** Ubah lead jadi pelanggan. Idempoten: lead yang sudah converted ditolak. */
  async convertLead(tenantId: string, id: string, dto: CreateCustomerDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId, companyId } });
    if (!lead) throw new NotFoundException('Lead tidak ditemukan.');
    if (lead.status === 'converted') {
      throw new ConflictException('Lead ini sudah dikonversi jadi pelanggan.');
    }
    if (dto.phone && dto.phone !== lead.phone) {
      const clash = await this.prisma.customer.findFirst({
        where: { tenantId, companyId, phone: dto.phone, isActive: true },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException('Pelanggan dengan nomor telepon tersebut sudah ada.');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Klaim lead dulu: dua konversi bersamaan tidak boleh melahirkan dua pelanggan.
        const claimed = await tx.lead.updateMany({
          where: { id, tenantId, companyId, status: { not: 'converted' } },
          data: { status: 'converted', convertedAt: new Date() },
        });
        if (claimed.count !== 1) throw new ConflictException('Lead ini sudah dikonversi jadi pelanggan.');
        const customer = await tx.customer.create({
          data: {
            tenantId,
            companyId,
            code: dto.code ?? (await this.nextCode(tx, 'customer', 'CUST', tenantId, companyId)),
            name: dto.name,
            contact: dto.contact ?? lead.contactName,
            phone: dto.phone ?? lead.phone,
            email: dto.email ?? lead.email,
            city: dto.city ?? '',
            address: dto.address ?? '',
            paymentTermDays: dto.paymentTermDays ?? 0,
          },
        });
        await tx.lead.update({ where: { id }, data: { customerId: customer.id } });
        return customer;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`Kode pelanggan "${dto.code}" sudah dipakai.`);
      throw error;
    }
  }

  // ============================== PROSPEK ==============================

  /**
   * Geser status prospek. Urutannya dijaga agar laporan pipeline tidak
   *contains lompatanstage yang tidak pernah terjadi di lapangan.
   */
  async moveLeadStage(tenantId: string, id: string, dto: MoveStageDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId, companyId } });
    if (!lead) throw new NotFoundException('Prospek tidak ditemukan.');
    if (lead.status === 'converted') {
      throw new ConflictException('Prospek sudah menjadi pelanggan.');
    }

    // "converted" hanya boleh lewat convertLead: tanpa itu status berubah tapi pelanggan tidak pernah dibuat.
    if (dto.status === 'converted') {
      throw new BadRequestException('Gunakan konversi prospek untuk menjadikannya pelanggan.');
    }
    if (dto.status === 'lost') {
      return this.prisma.lead.update({
        where: { id },
        data: { status: 'lost', notes: dto.notes ?? lead.notes, lostAt: new Date() },
      });
    }

    const from = LEAD_FLOW.indexOf(lead.status as never);
    const to = LEAD_FLOW.indexOf(dto.status as never);
    if (to === -1) throw new BadRequestException(`Status "${dto.status}" tidak dikenal.`);
    if (from === -1) throw new BadRequestException(`Status saat ini "${lead.status}" tidak dikenal.`);
    if (to > from + 1) {
      throw new BadRequestException(
        `Status harus berurutan: sekarang "${lead.status}", tidak bisa langsung ke "${dto.status}".`,
      );
    }

    return this.prisma.lead.update({
      where: { id },
      data: { status: dto.status, notes: dto.notes ?? lead.notes },
    });
  }

  // ============================== OPPORTUNITY ==============================

  async listOpportunities(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.opportunity.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        quotations: { select: { id: true, number: true, status: true, total: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOpportunity(tenantId: string, dto: CreateOpportunityDto) {
    const company = await this.companyOf(this.prisma, tenantId);
    // lead/pelanggan harus milik tenant ini: FK tanpa cek tenant bisa menautkan data lintas tenant.
    if (dto.customerId) await this.assertCustomer(tenantId, company, dto.customerId);
    if (dto.leadId) {
      const lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, tenantId, companyId: company }, select: { id: true } });
      if (!lead) throw new NotFoundException('Lead tidak ditemukan.');
    }
    return Promise.resolve(company).then((companyId) =>
      this.prisma.opportunity.create({
        data: {
          tenantId,
          companyId,
          title: dto.title,
          leadId: dto.leadId ?? null,
          customerId: dto.customerId ?? null,
          value: new Prisma.Decimal(dto.value ?? 0),
          stage: dto.stage ?? 'prospecting',
          probability: dto.probability ?? 10,
          expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
          notes: dto.notes ?? '',
        },
      }),
    );
  }

  /**
   * Geser tahap opportunity. Urutannya dijaga: deal tidak bisa lompat dari
   * prospecting ke negotiation tanpa pernah melewati proposal, dan tahap
   * tertutup tidak bisa dibuka lagi.
   */
  async moveOpportunity(tenantId: string, id: string, dto: MoveOpportunityDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const opp = await this.prisma.opportunity.findFirst({ where: { id, tenantId, companyId } });
    if (!opp) throw new NotFoundException('Opportunity tidak ditemukan.');

    const from = OPPORTUNITY_FLOW.indexOf(opp.stage);
    const to = OPPORTUNITY_FLOW.indexOf(dto.stage);
    if (to === -1) throw new BadRequestException(`Tahap "${dto.stage}" tidak dikenal.`);
    if (from === -1) throw new BadRequestException(`Tahap saat ini "${opp.stage}" tidak dikenal.`);
    if (opp.stage === 'closed_won' || opp.stage === 'closed_lost') {
      throw new ConflictException(`Opportunity sudah ${opp.stage} dan tidak bisa diubah.`);
    }
    // closed_lost bisa terjadi dari tahap terbuka mana pun (deal gagal kapan saja);
    // tanpa pengecualian ini urutan enum membuatnya tak pernah bisa dicapai.
    if (dto.stage !== 'closed_lost' && to > from + 1) {
      throw new BadRequestException(
        `Tahap harus berurutan: sekarang "${opp.stage}", tidak bisa langsung ke "${dto.stage}".`,
      );
    }
    if (to < from && dto.stage !== 'prospecting') {
      throw new BadRequestException('Deal yang sudah berjalan tidak bisa dikembalikan tahapnya.');
    }

    const closing = dto.stage === 'closed_won' || dto.stage === 'closed_lost';
    // Klaim bersyarat pada tahap asal: dua pemindahan bersamaan tidak saling menimpa.
    const claimed = await this.prisma.opportunity.updateMany({
      where: { id, tenantId, companyId, stage: opp.stage },
      data: {
        stage: dto.stage,
        probability: dto.probability ?? DEFAULT_PROBABILITY[dto.stage] ?? opp.probability,
        closedAt: closing ? new Date() : null,
        notes: dto.notes ?? opp.notes,
      },
    });
    if (claimed.count !== 1) throw new ConflictException('Tahap deal baru saja diubah oleh permintaan lain.');
    return this.prisma.opportunity.findUniqueOrThrow({ where: { id } });
  }

  /** Bobot per tahapan — dasar pipeline forecast. */
  async pipeline(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const rows = await this.prisma.opportunity.findMany({
      where: { tenantId, companyId },
      select: { stage: true, value: true, probability: true, expectedCloseDate: true },
    });

    const byStage = OPPORTUNITY_FLOW.map((stage) => {
      const items = rows.filter((r) => r.stage === stage);
      return {
        stage,
        count: items.length,
        value: roundMoney(items.reduce((s, r) => s + Number(r.value), 0)),
      };
    });

    const open = rows.filter((r) => r.stage !== 'closed_won' && r.stage !== 'closed_lost');
    // Weighted = Σ(nilai_i × probabilitas_i), bukan nilai total × rata-rata
    // probabilitas. Rata-rata meremehkan portofolio yang bimodal.
    const weightedValue = roundMoney(open.reduce((s, r) => s + Number(r.value) * (r.probability / 100), 0));
    const openValue = roundMoney(open.reduce((s, r) => s + Number(r.value), 0));

    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const inMonth = open.filter((r) => {
        if (!r.expectedCloseDate) return false;
        const d = new Date(r.expectedCloseDate);
        return d >= start && d < end;
      });
      return {
        month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
        count: inMonth.length,
        value: roundMoney(inMonth.reduce((s, r) => s + Number(r.value), 0)),
        weightedValue: roundMoney(inMonth.reduce((s, r) => s + Number(r.value) * (r.probability / 100), 0)),
      };
    });

    return {
      byStage,
      openCount: open.length,
      openValue,
      weightedValue,
      winRatePct: roundMoney(
        rows.length > 0 ? (rows.filter((r) => r.stage === 'closed_won').length / rows.length) * 100 : 0,
      ),
      forecastByMonth: months,
    };
  }

  // ============================== QUOTATION ==============================

  async listQuotations(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.quotation.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        opportunity: { select: { id: true, title: true } },
        salesOrder: { select: { id: true, number: true, status: true } },
        lines: { include: { product: { select: { sku: true, name: true, unit: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuotation(tenantId: string, dto: CreateQuotationDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertProducts(tenantId, dto.lines.map((l) => l.productId));
    if (dto.customerId) await this.assertCustomer(tenantId, companyId, dto.customerId);
    if (dto.opportunityId) {
      const opp = await this.prisma.opportunity.findFirst({
        where: { id: dto.opportunityId, tenantId, companyId },
        select: { id: true },
      });
      if (!opp) throw new NotFoundException('Opportunity tidak ditemukan.');
    }

    return this.prisma.$transaction(async (tx) => {
      const total = roundMoney(dto.lines.reduce((s, l) => s + l.qty * l.price, 0));
      return tx.quotation.create({
        data: {
          tenantId,
          companyId,
          number: await this.nextCode(tx, 'quotation', 'QUO', tenantId, companyId),
          customerId: dto.customerId ?? null,
          opportunityId: dto.opportunityId ?? null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          note: dto.note ?? '',
          total: new Prisma.Decimal(total),
          lines: {
            create: dto.lines.map((l) => ({
              productId: l.productId,
              qty: new Prisma.Decimal(l.qty),
              price: new Prisma.Decimal(l.price),
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  /** draft -> sent -> accepted | rejected, atau kedaluwarsa. */
  async moveQuotation(tenantId: string, id: string, dto: MoveQuotationDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, tenantId, companyId },
      include: { lines: true, salesOrder: { select: { id: true, number: true } } },
    });
    if (!quotation) throw new NotFoundException('Penawaran tidak ditemukan.');
    if (quotation.salesOrder) {
      throw new ConflictException(
        `Penawaran ini sudah menjadi pesanan ${quotation.salesOrder.number}.`,
      );
    }

    const allowed: Record<string, string[]> = {
      draft: ['sent', 'expired'],
      sent: ['accepted', 'rejected', 'expired'],
    };
    if (!allowed[quotation.status]?.includes(dto.status)) {
      throw new BadRequestException(
        `Penawaran berstatus "${quotation.status}" tidak bisa diubah ke "${dto.status}".`,
      );
    }
    if (dto.status === 'accepted' && !quotation.customerId) {
      throw new BadRequestException('Penawaran tanpa pelanggan tidak bisa diterima.');
    }
    if (quotation.validUntil && new Date(quotation.validUntil) < new Date() && dto.status === 'accepted') {
      throw new ConflictException('Penawaran sudah melewati masa berlaku.');
    }

    const claimed = await this.prisma.quotation.updateMany({
      where: { id, tenantId, companyId, status: quotation.status },
      data: { status: dto.status },
    });
    if (claimed.count !== 1) throw new ConflictException('Status penawaran baru saja diubah oleh permintaan lain.');
    return this.prisma.quotation.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Konversi penawaran menjadi pesanan penjualan.
   *
   * Baris diambil dari penawaran itu sendiri — bukan dari input klien. Kalau
   *IClien boleh mengetik ulang barisnya, angka yang disetujui pelanggan bisa
   * berbeda dari yang tercatat, dan itu Persis kesalahan yang harus dihindari.
   */
  async convertQuotation(tenantId: string, id: string, dto: ConvertQuotationDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, tenantId, companyId },
      include: { lines: { include: { product: true } }, salesOrder: { select: { id: true, number: true } } },
    });
    if (!quotation) throw new NotFoundException('Penawaran tidak ditemukan.');
    if (quotation.salesOrder) {
      throw new ConflictException(`Penawaran ini sudah menjadi pesanan ${quotation.salesOrder.number}.`);
    }
    if (quotation.status !== 'accepted') {
      throw new BadRequestException(
        `Hanya penawaran yang sudah diterima yang bisa jadi pesanan (sekarang: ${quotation.status}).`,
      );
    }
if (!quotation.customerId) throw new BadRequestException('Penawaran tidak punya pelanggan.');
    if (quotation.lines.length === 0) throw new BadRequestException('Penawaran tidak punya baris.');
    const customerId = quotation.customerId;

    const warehouse = dto.warehouseId
      ? await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, tenantId, companyId } })
      : await this.prisma.warehouse.findFirst({ where: { tenantId, companyId }, orderBy: { code: 'asc' } });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan.');

    const total = roundMoney(quotation.lines.reduce((s, l) => s + Number(l.qty) * Number(l.price), 0));

    return this.prisma.$transaction(async (tx) => {
      // Klaim penawaran secara atomik supaya dua konversi bersamaan tidak
      // menghasilkan dua pesanan dari satu penawaran.
      const claim = await tx.quotation.updateMany({
        where: { id, status: 'accepted' },
        data: { status: 'converted' },
      });
      if (claim.count !== 1) {
        throw new ConflictException('Penawaran sudah diproses oleh permintaan lain.');
      }

      return tx.salesOrder.create({
        data: {
          tenantId,
          companyId,
          number: await this.nextCode(tx, 'sales-order', 'SO', tenantId, companyId),
          customerId,
          warehouseId: warehouse.id,
          quotationId: quotation.id,
          note: dto.note ?? `Dari penawaran ${quotation.number}`,
          total: new Prisma.Decimal(total),
          lines: {
            create: quotation.lines.map((l) => ({
              productId: l.productId,
              qty: new Prisma.Decimal(l.qty),
              price: new Prisma.Decimal(l.price),
            })),
          },
        },
        include: { lines: true, quotation: { select: { number: true } } },
      });
    });
  }

  // ============================== SALES ORDER ==============================

  async listSalesOrders(tenantId: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.salesOrder.findMany({
      take: 500,
      where: { tenantId, companyId },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        quotation: { select: { id: true, number: true } },
        lines: { include: { product: { select: { sku: true, name: true, unit: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSalesOrder(tenantId: string, dto: CreateSalesOrderDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertCustomer(tenantId, companyId, dto.customerId);
    await this.assertProducts(tenantId, dto.lines.map((l) => l.productId));

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, companyId },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan.');
    if (dto.quotationId) {
      // Penawaran harus milik tenant ini dan belum menjadi pesanan lain (quotationId unik).
      const quotation = await this.prisma.quotation.findFirst({
        where: { id: dto.quotationId, tenantId, companyId },
        select: { id: true, salesOrder: { select: { number: true } } },
      });
      if (!quotation) throw new NotFoundException('Penawaran tidak ditemukan.');
      if (quotation.salesOrder) {
        throw new ConflictException(`Penawaran ini sudah menjadi pesanan ${quotation.salesOrder.number}.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const total = roundMoney(dto.lines.reduce((s, l) => s + l.qty * l.price, 0));
      return tx.salesOrder.create({
        data: {
          tenantId,
          companyId,
          number: await this.nextCode(tx, 'sales-order', 'SO', tenantId, companyId),
          customerId: dto.customerId,
          warehouseId: dto.warehouseId,
          quotationId: dto.quotationId ?? null,
          note: dto.note ?? '',
          total: new Prisma.Decimal(total),
          lines: {
            create: dto.lines.map((l) => ({
              productId: l.productId,
              qty: new Prisma.Decimal(l.qty),
              price: new Prisma.Decimal(l.price),
            })),
          },
        },
        include: { lines: true },
      });
    });
  }

  /** Konfirmasi pesanan: draft -> confirmed. Setelah ini fulfil diizinkan. */
  async confirm(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.prisma.salesOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!order) throw new NotFoundException('Pesanan penjualan tidak ditemukan.');
    if (order.status === 'confirmed') throw new ConflictException('Pesanan sudah dikonfirmasi.');
    if (order.status !== 'draft') {
      throw new BadRequestException(`Hanya pesanan draft yang bisa dikonfirmasi (status ${order.status}).`);
    }
    const claimed = await this.prisma.salesOrder.updateMany({
      where: { id, tenantId, companyId, status: 'draft' },
      data: { status: 'confirmed' },
    });
    if (claimed.count !== 1) throw new ConflictException('Pesanan sudah diubah oleh permintaan lain.');
    return this.prisma.salesOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  }

  async cancel(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.prisma.salesOrder.findFirst({ where: { id, tenantId, companyId } });
    if (!order) throw new NotFoundException('Pesanan penjualan tidak ditemukan.');
    if (order.status === 'fulfilled') throw new ConflictException('Pesanan yang sudah di-fulfil tidak bisa dibatalkan.');
    if (order.status === 'cancelled') throw new ConflictException('Pesanan sudah dibatalkan.');
    // Klaim bersyarat: tanpa ini cancel yang berpapasan dengan fulfil menimpa
    // status 'fulfilled' menjadi 'cancelled' padahal stok & jurnal sudah berjalan.
    const claimed = await this.prisma.salesOrder.updateMany({
      where: { id, tenantId, companyId, status: { in: ['draft', 'confirmed'] } },
      data: { status: 'cancelled' },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Status pesanan baru saja berubah (mis. sudah di-fulfil) dan tidak bisa dibatalkan.');
    }
    return this.prisma.salesOrder.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Fulfil sales order: kurangi stok, catat HPP, posting jurnal pendapatan +
   * HPP, lalu terbitkan faktur piutang. Semua dalam satu transaksi supaya
   * tidak pernah ada barang keluar tanpa jurnal.
   */
  async fulfil(tenantId: string, id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId, companyId },
      include: {
        lines: { include: { product: { select: { id: true, name: true, productType: true } } } },
        customer: true,
      },
    });
    if (!order) throw new NotFoundException('Pesanan penjualan tidak ditemukan.');
    if (order.status === 'fulfilled') throw new ConflictException('Pesanan sudah di-fulfil.');
    if (order.status !== 'confirmed') {
      throw new BadRequestException('Hanya pesanan berstatus confirmed yang bisa di-fulfil.');
    }
    if (!order.customer.isActive) {
      throw new BadRequestException('Pelanggan berstatus nonaktif.');
    }

    const [revenueAcc, cogsAcc, inventoryAcc, receivableAcc] = await Promise.all([
      this.account(tenantId, companyId, REVENUE_ACCOUNT, 'Pendapatan Usaha'),
      this.account(tenantId, companyId, COGS_ACCOUNT, 'Harga Pokok Penjualan'),
      this.account(tenantId, companyId, INVENTORY_ACCOUNT, 'Persediaan'),
      this.account(tenantId, companyId, RECEIVABLE_ACCOUNT, 'Piutang Usaha'),
    ]);

    return retryOnConflict(() => this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.salesOrder.updateMany({
          where: { id, tenantId, companyId, status: 'confirmed' },
          data: { status: 'fulfilled', fulfilledAt: new Date() },
        });
        if (claimed.count !== 1) throw new ConflictException('Pesanan sudah di-fulfil.');

        let totalCogs = 0;
        const costByProduct = new Map<string, number>();

        for (const line of order.lines) {
          // Jasa tidak punya stok: tidak dicek, tidak dikurangi, tanpa HPP persediaan.
          if (!isStockTracked(line.product.productType)) continue;
          const stock = await tx.inventoryStock.findUnique({
            where: {
              tenantId_companyId_productId_warehouseId: {
                tenantId,
                companyId,
                productId: line.productId,
                warehouseId: order.warehouseId,
              },
            },
            select: { quantity: true, avgCost: true },
          });
          const onHand = Number(stock?.quantity ?? 0);
          if (onHand < Number(line.qty)) {
            throw new BadRequestException(
              `Stok "${line.product.name}" tidak cukup (tersedia ${onHand}, diminta ${line.qty}).`,
            );
          }
          // Pengurangan bersyarat: bila stok berubah sejak dibaca, jangan sampai negatif.
          const taken = await tx.inventoryStock.updateMany({
            where: {
              tenantId,
              companyId,
              productId: line.productId,
              warehouseId: order.warehouseId,
              quantity: { gte: line.qty },
            },
            data: { quantity: { decrement: line.qty } },
          });
          if (taken.count !== 1) {
            throw new BadRequestException(`Stok "${line.product.name}" tidak cukup.`);
          }
          await tx.stockMovement.create({
            data: {
              tenantId,
              companyId,
              productId: line.productId,
              warehouseId: order.warehouseId,
              type: 'sale',
              quantity: new Prisma.Decimal(line.qty).negated(),
              note: `Fulfil ${order.number}`,
              refId: order.id,
            },
          });
          const unitCost = Number(stock?.avgCost ?? 0);
          totalCogs += unitCost * Number(line.qty);
          costByProduct.set(line.productId, unitCost);
        }

        const cogs = roundMoney(totalCogs);
        const total = roundMoney(Number(order.total));
        const entryDate = new Date();

        const journal = await this.journals.post(tx, {
          tenantId,
          companyId,
          entryDate,
          sourceModule: 'sales',
          sourceRefId: order.id,
          memo: `Fulfil pesanan ${order.number}`,
          lines: [
            { accountId: receivableAcc.id, direction: 'debit', amount: total, memo: 'Piutang usaha' },
            { accountId: revenueAcc.id, direction: 'credit', amount: total, memo: 'Pendapatan penjualan' },
            ...(cogs > 0
              ? [
                  { accountId: cogsAcc.id, direction: 'debit' as const, amount: cogs, memo: 'Harga pokok penjualan' },
                  { accountId: inventoryAcc.id, direction: 'credit' as const, amount: cogs, memo: 'Pengurangan persediaan' },
                ]
              : []),
          ],
        });

        // Faktur piutang terbit saat barang diserahkan, bukan saat SO dibuat.
        const dueDays = order.customer.paymentTermDays ?? 0;
        const dueDate = new Date(entryDate);
        dueDate.setDate(dueDate.getDate() + dueDays);
        const invoice = await this.receivables.createInvoiceForSale(tx, {
          tenantId,
          companyId,
          customerId: order.customerId,
          // Sales order bukan SalesTransaction, jadi kolom ini sengaja dikosongkan;
          // invoice-nya ditautkan lewat salesOrder.invoiceId.
          salesTransactionId: undefined,
          journalId: journal.id,
          total,
          dueDate,
        });

        await tx.salesOrder.update({ where: { id }, data: { invoiceId: invoice.id } });
        if (order.quotationId) {
          await tx.quotation.updateMany({
            where: { id: order.quotationId, status: 'accepted' },
            data: { status: 'accepted' },
          });
        }

        return { fulfilled: true, number: order.number, cogs, invoice };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ));
  }

  // ============================== INTERAKSI & KELUHAN ==============================

  listCustomerHistory(tenantId: string, customerId: string) {
    return this.companyOf(this.prisma, tenantId).then((companyId) =>
      this.prisma.$transaction(async (tx) => {
        await this.assertCustomer(tenantId, companyId, customerId);
        const [customer, interactions, complaints, orders] = await Promise.all([
          tx.customer.findUnique({
            where: { id: customerId },
            include: { salesOrders: { select: { id: true, number: true, total: true, status: true, createdAt: true } } },
          }),
          tx.customerInteraction.findMany({
            where: { tenantId, companyId, customerId },
            orderBy: { interactionDate: 'desc' },
            take: 50,
          }),
          tx.customerComplaint.findMany({
            where: { tenantId, companyId, customerId },
            orderBy: { createdAt: 'desc' },
          }),
          tx.salesOrder.aggregate({
            where: { tenantId, companyId, customerId },
            _sum: { total: true },
            _count: { _all: true },
          }),
        ]);
        if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan.');
        return {
          customer,
          summary: {
            totalOrders: orders._count._all,
            totalValue: roundMoney(Number(orders._sum.total ?? 0)),
            openComplaints: complaints.filter((c) => c.status !== 'resolved').length,
          },
          interactions,
          complaints,
        };
      }),
    );
  }

  async createInteraction(tenantId: string, customerId: string, userId: string, dto: CreateInteractionDto) {
    const company = await this.companyOf(this.prisma, tenantId);
    await this.assertCustomer(tenantId, company, customerId);
    return Promise.resolve(company).then((companyId) =>
      this.prisma.customerInteraction.create({
        data: {
          tenantId,
          companyId,
          customerId,
          type: dto.type ?? 'note',
          summary: dto.summary,
          detail: dto.detail ?? '',
          handledById: userId,
          interactionDate: dto.interactionDate ? new Date(dto.interactionDate) : new Date(),
        },
      }),
    );
  }

  listComplaints(tenantId: string) {
    return this.companyOf(this.prisma, tenantId).then((companyId) =>
      this.prisma.customerComplaint.findMany({
      take: 500,
        where: { tenantId, companyId },
        include: { customer: { select: { code: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async createComplaint(tenantId: string, dto: CreateComplaintDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    await this.assertCustomer(tenantId, companyId, dto.customerId);
    if (dto.salesTransactionId) {
      const sale = await this.prisma.salesTransaction.findFirst({
        where: { id: dto.salesTransactionId, tenantId, companyId },
        select: { id: true },
      });
      if (!sale) throw new NotFoundException('Transaksi penjualan tidak ditemukan.');
    }
    return this.prisma.customerComplaint.create({
      data: {
        tenantId,
        companyId,
        customerId: dto.customerId,
        salesTransactionId: dto.salesTransactionId ?? null,
        title: dto.title,
        description: dto.description ?? '',
      },
    });
  }

  async resolveComplaint(tenantId: string, id: string, dto: ResolveComplaintDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const complaint = await this.prisma.customerComplaint.findFirst({ where: { id, tenantId, companyId } });
    if (!complaint) throw new NotFoundException('Keluhan tidak ditemukan.');
    if (complaint.status === 'resolved') throw new ConflictException('Keluhan sudah diselesaikan.');
    return this.prisma.customerComplaint.update({
      where: { id },
      data: {
        status: dto.status === 'in_progress' ? 'in_progress' : 'resolved',
        resolution: dto.resolution ?? '',
        resolvedAt: dto.status === 'in_progress' ? null : new Date(),
      },
    });
  }

  // ============================== HELPERS ==============================

  private async companyOf(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    if (client === this.prisma) return defaultCompanyId(this.prisma, tenantId);
    const company = await client.company.findFirst({
      where: { tenantId, code: 'MAIN' },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Perusahaan utama belum disiapkan.');
    return company.id;
  }

  private async assertProducts(tenantId: string, productIds: string[]) {
    const unique = [...new Set(productIds)];
    const found = await this.prisma.product.count({ where: { tenantId, id: { in: unique } } });
    if (found !== unique.length) throw new NotFoundException('Ada produk yang tidak ditemukan.');
  }

  private async assertCustomer(tenantId: string, companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, companyId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan pada company ini.');
  }

  private async account(tenantId: string, companyId: string, code: string, label: string) {
    const account = await this.prisma.chartOfAccount.findFirst({ where: { tenantId, companyId, code } });
    if (!account) {
      throw new NotFoundException(`Akun ${code} (${label}) belum ada pada COA perusahaan.`);
    }
    return account;
  }

  private async nextCode(
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
      const candidate = `${prefix}-${year}-${String(counter.nextValue - 1).padStart(5, '0')}`;
      let exists: { id: string } | null = null;
      if (kind === 'quotation') {
        exists = await tx.quotation.findFirst({ where: { tenantId, companyId, number: candidate }, select: { id: true } });
      } else if (kind === 'sales-order') {
        exists = await tx.salesOrder.findFirst({ where: { tenantId, companyId, number: candidate }, select: { id: true } });
      } else {
        exists = await tx.customer.findFirst({ where: { tenantId, companyId, code: candidate }, select: { id: true } });
      }
      if (!exists) return candidate;
    }
    throw new ConflictException('Gagal membuat nomor dokumen, coba lagi.');
  }
}

export const CRM_MAX_PRICE = MAX_ITEM_PRICE;