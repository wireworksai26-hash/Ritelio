import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { UpdateOneSignalConfigDto } from '../notifications/dto/notification-push.dto';
import {
  CreateSuperadminTenantDto,
  CreateSuperadminUserDto,
  UpdateSuperadminTenantDto,
  UpdateSuperadminUserDto,
} from './dto/superadmin.dto';
import { SuperadminService } from './superadmin.service';

@Controller('superadmin')
export class SuperadminController {
  constructor(private readonly superadmin: SuperadminService) {}

  @Get('overview')
  @RequirePermissions('settings:write')
  overview(@Tenant() tenantId: string, @CurrentUser() user: AuthUser) {
    return this.superadmin.overview(tenantId, user);
  }

  @Post('tenants')
  @RequirePermissions('settings:write')
  createTenant(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSuperadminTenantDto,
  ) {
    return this.superadmin.createTenant(tenantId, user, dto);
  }

  @Patch('tenants/:id')
  @RequirePermissions('settings:write')
  updateTenant(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSuperadminTenantDto,
  ) {
    return this.superadmin.updateTenant(tenantId, id, user, dto);
  }

  @Post('users')
  @RequirePermissions('users:manage')
  createUser(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSuperadminUserDto,
  ) {
    return this.superadmin.createUser(tenantId, user, dto);
  }

  @Patch('users/:id')
  @RequirePermissions('users:manage')
  updateUser(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSuperadminUserDto,
  ) {
    return this.superadmin.updateUser(tenantId, id, user, dto);
  }

  @Post('users/:id/revoke-sessions')
  @RequirePermissions('users:manage')
  revokeUserSessions(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.superadmin.revokeUserSessions(tenantId, id, user);
  }

  @Put('onesignal-config')
  @RequirePermissions('settings:write')
  updateOneSignalConfig(
    @Tenant() tenantId: string,
    @Body() dto: UpdateOneSignalConfigDto,
  ) {
    return this.superadmin.updateOneSignalConfig(tenantId, dto);
  }
}
