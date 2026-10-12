import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/audit.dto';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('logs')
  @RequirePermissions('audit:read')
  list(@Tenant() tenantId: string, @Query() query: QueryAuditDto) {
    return this.audit.list({
      tenantId,
      entity: query.entity,
      entityId: query.entityId,
      userId: query.userId,
      action: query.action,
      outcome: query.outcome,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      take: query.take ?? 50,
      cursor: query.cursor,
    });
  }

  @Get('logs/:id')
  @RequirePermissions('audit:read')
  async detail(@Tenant() tenantId: string, @Param('id') id: string) {
    const row = await this.audit.detail(tenantId, id);
    if (!row) throw new NotFoundException('Entri audit tidak ditemukan.');
    return row;
  }

  @Get('facets')
  @RequirePermissions('audit:read')
  facets(@Tenant() tenantId: string) {
    return this.audit.facets(tenantId);
  }
}