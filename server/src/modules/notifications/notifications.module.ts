import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OneSignalService } from './onesignal.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, OneSignalService],
  exports: [NotificationsService, OneSignalService],
})
export class NotificationsModule {}
