import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module.js';
import { BankIntegrationModule } from './bank-integration/bank-integration.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { PayrollModule } from './payroll/payroll.module.js';
import { WorkScheduleModule } from './schedule/schedule.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { envValidationSchema } from './config/env.validation.js';
import appConfig from './config/app.config.js';
import jwtConfig from './config/jwt.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: envValidationSchema,
      load: [appConfig, jwtConfig],
    }),
    // Drives the daily due-date sweep in NotificationsModule.
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    CompaniesModule,
    BankAccountsModule,
    BankIntegrationModule,
    TransactionsModule,
    InvoicesModule,
    EmployeesModule,
    PayrollModule,
    WorkScheduleModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
