import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReceiveOrderDto } from './dto/purchasing.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
// DTO harus value import: lihat catatan di inventory.controller.ts.
import { CreatePODto, OrderQueryDto, UpdatePODto } from './dto/purchasing.dto';
import { PurchasingService } from './purchasing.service';

@Controller('purchasing')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  // Route pemasok (/purchasing/suppliers) pindah ke PartyController (/parties/suppliers)
  // supaya master supplier & customer punya satu service.

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

  @Post('orders/:id/send')
  @RequirePermissions('purchasing:write')
  sendOrder(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.purchasing.sendOrder(tenantId, id);
  }

  @Post('orders/:id/receive')
  @RequirePermissions('purchasing:write')
  receiveOrder(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: ReceiveOrderDto) {
    return this.purchasing.receiveOrder(tenantId, id, dto?.rejections);
  }
}
