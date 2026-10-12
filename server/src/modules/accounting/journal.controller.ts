import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { defaultCompanyId } from '../../common/utils/default-company';
import { PrismaService } from '../../common/prisma.service';
import { CreateManualJournalDto, ListJournalsDto, ReverseJournalDto } from './dto/journal.dto';
import { JournalService } from './journal.service';

@Controller('journals')
export class JournalController {
  constructor(
    private readonly journals: JournalService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions('finance:read')
  async list(@Tenant() tenantId: string, @Query() query: ListJournalsDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    const rows = await this.journals.listJournals(tenantId, companyId, {
      status: query.status,
      sourceModule: query.sourceModule,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      take: query.take ?? 50,
      cursor: query.cursor,
    });
    return {
      data: rows,
      nextCursor: rows.length === (query.take ?? 50) ? rows[rows.length - 1]?.id : null,
    };
  }

  @Post()
  @RequirePermissions('finance:write')
  async createManual(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateManualJournalDto,
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.$transaction((tx) =>
      this.journals.postManual(tx, {
        tenantId,
        companyId,
        entryDate: new Date(dto.entryDate),
        memo: dto.memo,
        actorId: user.sub,
        lines: dto.lines,
      }),
    );
  }

  @Post(':id/reverse')
  @RequirePermissions('finance:write')
  reverse(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReverseJournalDto,
  ) {
    const companyIdPromise = defaultCompanyId(this.prisma, tenantId);
    return companyIdPromise.then((companyId) =>
      this.prisma.$transaction((tx) =>
        this.journals.reverse(tx, {
          tenantId,
          companyId,
          journalId: id,
          entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(),
          memo: dto.memo,
          actorId: user.sub,
        }),
      ),
    );
  }
}