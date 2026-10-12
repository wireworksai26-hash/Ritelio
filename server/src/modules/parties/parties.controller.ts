import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CreatePartyDto, ListPartyQueryDto, UpdatePartyDto } from './dto/party.dto';
import { PartyService } from './parties.service';

@Controller('parties')
export class PartyController {
  constructor(private readonly parties: PartyService) {}

  // ===================== PEMASOK =====================

  @Get('suppliers')
  @RequirePermissions('inventory:read')
  listSuppliers(@Tenant() tenantId: string, @Query() query: ListPartyQueryDto) {
    return this.parties.listSuppliers(tenantId, query);
  }

  @Post('suppliers')
  @RequirePermissions('inventory:write')
  createSupplier(@Tenant() tenantId: string, @Body() dto: CreatePartyDto) {
    return this.parties.createSupplier(tenantId, dto);
  }

  @Patch('suppliers/:id')
  @RequirePermissions('inventory:write')
  updateSupplier(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePartyDto,
  ) {
    return this.parties.updateSupplier(tenantId, id, dto);
  }

  @Post('suppliers/:id/deactivate')
  @RequirePermissions('inventory:write')
  deactivateSupplier(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.parties.deactivateSupplier(tenantId, id);
  }

  @Delete('suppliers/:id')
  @RequirePermissions('inventory:write')
  deleteSupplier(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.parties.deleteSupplier(tenantId, id);
  }

  // ===================== PELANGGAN =====================

  @Get('customers')
  @RequirePermissions('pos:read')
  listCustomers(@Tenant() tenantId: string, @Query() query: ListPartyQueryDto) {
    return this.parties.listCustomers(tenantId, query);
  }

  @Post('customers')
  @RequirePermissions('pos:write')
  createCustomer(@Tenant() tenantId: string, @Body() dto: CreatePartyDto) {
    return this.parties.createCustomer(tenantId, dto);
  }

  @Patch('customers/:id')
  @RequirePermissions('pos:write')
  updateCustomer(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePartyDto,
  ) {
    return this.parties.updateCustomer(tenantId, id, dto);
  }

  @Post('customers/:id/deactivate')
  @RequirePermissions('pos:write')
  deactivateCustomer(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.parties.deactivateCustomer(tenantId, id);
  }

  @Delete('customers/:id')
  @RequirePermissions('pos:write')
  deleteCustomer(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.parties.deleteCustomer(tenantId, id);
  }
}
