import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
import {
  BroadcastPushDto,
  RegisterPushSubscriptionDto,
  TestPushDto,
} from './dto/notification-push.dto';
import { NotificationsService } from './notifications.service';
import { OneSignalService } from './onesignal.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly oneSignal: OneSignalService,
  ) {}

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

  @Get('push-config')
  @RequirePermissions('notifications:read')
  pushConfig() {
    return this.oneSignal.getPublicConfig();
  }

  @Post('subscribe')
  @RequirePermissions('notifications:read')
  subscribe(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterPushSubscriptionDto,
  ) {
    return this.oneSignal.registerSubscription(tenantId, user.sub, dto);
  }

  @Post('test-push')
  @RequirePermissions('notifications:read')
  testPush(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: TestPushDto,
  ) {
    return this.oneSignal.sendTestPush(tenantId, user.sub, dto);
  }

  @Post('broadcast')
  @RequirePermissions('settings:write')
  broadcast(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: BroadcastPushDto,
  ) {
    return this.oneSignal.broadcast(tenantId, user.sub, user.role === 'superadmin', dto);
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
