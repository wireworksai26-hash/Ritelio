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
import type {
  CreatePODto,
  CreateSupplierDto,
  OrderQueryDto,
  UpdatePODto,
  UpdateSupplierDto,
} from './dto/purchasing.dto';
import { PurchasingService } from './purchasing.service';

@Controller('purchasing')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  // ============================== PEMASOK ==============================

  @Get('suppliers')
  @RequirePermissions('purchasing:read')
  listSuppliers(@Tenant() tenantId: string) {
    return this.purchasing.listSuppliers(tenantId);
  }

  @Post('suppliers')
  @RequirePermissions('purchasing:write')
  createSupplier(@Tenant() tenantId: string, @Body() dto: CreateSupplierDto) {
    return this.purchasing.createSupplier(tenantId, dto);
  }

  @Patch('suppliers/:id')
  @RequirePermissions('purchasing:write')
  updateSupplier(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.purchasing.updateSupplier(tenantId, id, dto);
  }

  @Delete('suppliers/:id')
  @RequirePermissions('purchasing:write')
  removeSupplier(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.purchasing.removeSupplier(tenantId, id);
  }

  // ============================== PURCHASE ORDER ==============================

  @Get('orders')
  @RequirePermissions('purchasing:read')
  listOrders(@Tenant() tenantId: string, @Query() query: OrderQueryDto) {
    return this.purchasing.listOrders(tenantId, query);
  }

  @Get('orders/:id')
  @RequirePermissions('purchasing:read')
  getOrder(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.purchasing.getOrder(tenantId, id);
  }

  @Post('orders')
  @RequirePermissions('purchasing:write')
  createOrder(@Tenant() tenantId: string, @Body() dto: CreatePODto) {
    return this.purchasing.createOrder(tenantId, dto);
  }

  @Patch('orders/:id')
  @RequirePermissions('purchasing:write')
  updateOrder(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdatePODto) {
    return this.purchasing.updateOrder(tenantId, id, dto);
  }

  @Post('orders/:id/receive')
  @RequirePermissions('purchasing:write')
  receiveOrder(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.purchasing.receiveOrder(tenantId, id);
  }
}
