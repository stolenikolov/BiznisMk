import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';
import { EmployeeMessagesService } from './employee-messages.service.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { MailModule } from '../mail/mail.module.js';

@Module({
  imports: [PayrollModule, MailModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeMessagesService],
})
export class EmployeesModule {}
