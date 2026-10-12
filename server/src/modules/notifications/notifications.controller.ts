import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions('notifications:read')
  list(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Query('unread') unread?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.notifications.list(tenantId, user, { unread, page, limit });
  }

  // PENTING: route statis dideklarasikan SEBELUM route parametrik ':id/read'.
  @Get('unread-count')
  @RequirePermissions('notifications:read')
  unreadCount(@Tenant() tenantId: string, @CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(tenantId, user);
  }

  @Post('read-all')
  @RequirePermissions('notifications:read')
  markAllRead(@Tenant() tenantId: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(tenantId, user);
  }

  @Post(':id/read')
  @RequirePermissions('notifications:read')
  markRead(@Tenant() tenantId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(tenantId, id, user);
  }
}
