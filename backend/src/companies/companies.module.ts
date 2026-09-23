import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { CompanySettingsController } from './company-settings.controller.js';
import { CompanySettingsService } from './company-settings.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [CompaniesController, CompanySettingsController],
  providers: [CompaniesService, CompanySettingsService],
})
export class CompaniesModule {}
