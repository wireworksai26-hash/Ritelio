import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import {
  CreateBankAccountDto,
  CreateStatementDto,
  ReconcileDto,
} from './dto/banking.dto';
import { BankingService } from './banking.service';

@Controller('banking')
export class BankingController {
  constructor(private readonly banking: BankingService) {}

  @Get('accounts')
  @RequirePermissions('finance:read')
  listAccounts(@Tenant() tenantId: string) {
    return this.banking.listAccounts(tenantId);
  }

  @Post('accounts')
  @RequirePermissions('finance:write')
  createAccount(@Tenant() tenantId: string, @Body() dto: CreateBankAccountDto) {
    return this.banking.createAccount(tenantId, dto);
  }

  @Get('accounts/:id/statements')
  @RequirePermissions('finance:read')
  listStatements(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.banking.listStatements(tenantId, id);
  }

  @Post('statements')
  @RequirePermissions('finance:write')
  importStatement(@Tenant() tenantId: string, @Body() dto: CreateStatementDto) {
    return this.banking.importStatement(tenantId, dto);
  }

  @Post('reconcile')
  @RequirePermissions('finance:write')
  reconcile(@Tenant() tenantId: string, @Body() dto: ReconcileDto) {
    return this.banking.reconcile(tenantId, dto);
  }

  @Get('summary')
  @RequirePermissions('finance:read')
  summary(@Tenant() tenantId: string) {
    return this.banking.summary(tenantId);
  }
}