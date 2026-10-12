import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import {
  CloseTaxRuleDto,
  CreateTaxRuleDto,
  QueryTaxComputationsDto,
  RecordTaxPaymentDto,
  UpdateTaxRuleDto,
} from './dto/tax.dto';
import { TaxDocumentsService } from './tax-documents.service';
import { TaxRulesService } from './tax-rules.service';

@Controller('tax')
export class TaxDocumentsController {
  constructor(
    private readonly tax: TaxDocumentsService,
    private readonly rules: TaxRulesService,
  ) {}

  /** PPN yang sudah menempel pada faktur penjualan. */
  @Get('sale/:invoiceId')
  @RequirePermissions('finance:read')
  saleTax(@Tenant() tenantId: string, @Param('invoiceId') invoiceId: string) {
    return this.tax.detail(tenantId, { kind: 'sale', documentId: invoiceId });
  }

  /** PPN yang sudah menempel pada faktur pembelian. */
  @Get('purchase/:billId')
  @RequirePermissions('finance:read')
  purchaseTax(@Tenant() tenantId: string, @Param('billId') billId: string) {
    return this.tax.detail(tenantId, { kind: 'purchase', documentId: billId });
  }

  @Post('payment')
  @RequirePermissions('finance:write')
  recordPayment(@Tenant() tenantId: string, @Body() dto: RecordTaxPaymentDto) {
    return this.tax.recordPayment(tenantId, dto);
  }

  // ── Aturan & bracket ────────────────────────────────────────────────────

  @Get('rules')
  @RequirePermissions('finance:read')
  listRules(@Tenant() tenantId: string) {
    return this.rules.list(tenantId);
  }

  @Post('rules')
  @RequirePermissions('finance:write')
  createRule(@Tenant() tenantId: string, @Body() dto: CreateTaxRuleDto) {
    return this.rules.create(tenantId, dto);
  }

  @Patch('rules/:id')
  @RequirePermissions('finance:write')
  updateRule(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateTaxRuleDto) {
    return this.rules.update(tenantId, id, dto);
  }

  @Post('rules/:id/close')
  @RequirePermissions('finance:write')
  closeRule(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: CloseTaxRuleDto) {
    return this.rules.closeVersion(tenantId, id, dto.effectiveTo);
  }

  @Get('computations')
  @RequirePermissions('finance:read')
  computations(@Tenant() tenantId: string, @Query() query: QueryTaxComputationsDto) {
    return this.rules.computations(tenantId, {
      documentType: query.documentType,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      take: query.take ?? 50,
    });
  }
}