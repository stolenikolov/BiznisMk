import { Module } from '@nestjs/common';
import { ScheduleEntriesController, ShiftTemplatesController } from './schedule.controller.js';
import { ScheduleService } from './schedule.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MailModule } from '../mail/mail.module.js';

/**
 * The weekly schedule: company-defined shift templates, day assignments, and
 * publishing, which emails employees their week. Named after the section
 * rather than `ScheduleModule`, which is the cron module from
 * @nestjs/schedule already registered in AppModule.
 */
@Module({
  imports: [NotificationsModule, MailModule],
  controllers: [ShiftTemplatesController, ScheduleEntriesController],
  providers: [ScheduleService],
})
export class WorkScheduleModule {}
