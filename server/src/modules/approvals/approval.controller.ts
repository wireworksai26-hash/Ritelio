import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma.service';
import { defaultCompanyId } from '../../common/utils/default-company';
import { ApprovalService } from './approval.service';
import { DecideApprovalDto, SubmitApprovalDto } from './dto/approval.dto';

@Controller('approvals')
export class ApprovalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
  ) {}

  /** Daftar approval yang menunggu, newest first. */
  @Get()
  @RequirePermissions('finance:read')
  async list(
    @Tenant() tenantId: string,
    @Query('status') status?: string,
    @Query('documentType') documentType?: string,
  ) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.approvalRequest.findMany({
      where: {
        tenantId,
        companyId,
        ...(status ? { status: status as never } : {}),
        ...(documentType ? { documentType } : {}),
      },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get(':id')
  @RequirePermissions('finance:read')
  async detail(@Tenant() tenantId: string, @Param('id') id: string) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.prisma.approvalRequest.findFirst({
      where: { id, tenantId, companyId },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });
  }

  /** Ajukan approval untuk dokumen apa pun (requisition, PO, timesheet, expense, diskon). */
  @Post()
  @RequirePermissions('finance:write')
  async submit(@Tenant() tenantId: string, @CurrentUser() user: AuthUser, @Body() dto: SubmitApprovalDto) {
    const companyId = await defaultCompanyId(this.prisma, tenantId);
    return this.approvals.submit({
      tenantId,
      companyId,
      documentType: dto.documentType,
      documentId: dto.documentId,
      submittedById: user.sub,
      note: dto.note,
      steps: dto.steps.map((s) => ({ approverRoleId: s.approverRoleId, requiredPermission: s.requiredPermission })),
    });
  }

  /** Setujui atau tolak tahap yang sedang berjalan. */
  @Post(':id/decide')
  @RequirePermissions('finance:write')
  decide(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    const companyId = defaultCompanyId(this.prisma, tenantId);
    return companyId.then((cid) =>
      this.approvals.decide(tenantId, cid, id, user.sub, dto.decision, dto.note ?? ''),
    );
  }
}