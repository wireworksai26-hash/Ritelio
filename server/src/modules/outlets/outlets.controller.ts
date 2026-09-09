import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { CreateOutletDto, UpdateOutletDto } from './dto/outlet.dto';
import { OutletsService } from './outlets.service';

@Controller('outlets')
export class OutletsController {
  constructor(private readonly outlets: OutletsService) {}

  @Get()
  @RequirePermissions('outlets:read')
  list(@Tenant() tenantId: string) {
    return this.outlets.list(tenantId);
  }

  @Post()
  @RequirePermissions('outlets:write')
  create(@Tenant() tenantId: string, @Body() dto: CreateOutletDto) {
    return this.outlets.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('outlets:write')
  update(@Tenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateOutletDto) {
    return this.outlets.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('outlets:write')
  remove(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.outlets.remove(tenantId, id);
  }
}
