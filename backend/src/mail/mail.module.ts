import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import mailConfig from '../config/mail.config.js';
import { MailService } from './mail.service.js';

/** Outgoing email, for whichever feature needs to reach people outside the app. */
@Module({
  imports: [ConfigModule.forFeature(mailConfig)],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
