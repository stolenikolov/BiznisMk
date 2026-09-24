import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsGateway } from './notifications.gateway.js';
import { DueRemindersService } from './due-reminders.service.js';
import { CronController } from './cron.controller.js';

/**
 * Notifications: persisted rows, a websocket that pushes them, and the daily
 * sweep that generates the date-based ones.
 *
 * `JwtModule.register({})` rather than an import of AuthModule: the gateway
 * only needs to verify an access token, and depending on the auth module here
 * would make every feature module that notifies depend on it transitively.
 * The secret comes from ConfigService, the same place AuthModule reads it.
 *
 * `NotificationsService` is exported because notifying is something other
 * features do — recording a transaction, settling an invoice — and they all go
 * through that one door.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [NotificationsController, CronController],
  providers: [NotificationsService, NotificationsGateway, DueRemindersService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
