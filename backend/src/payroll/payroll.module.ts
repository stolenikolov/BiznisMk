import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';
import { PayrollRunService } from './payroll-run.service.js';
import { BankPayrollModule } from '../bank-integration/bank-payroll.module.js';

/**
 * Owns net-salary calculation and paying a month's salaries.
 *
 * `PayrollService` is exported so every salary-bearing feature — the team
 * list, payslips later — uses the one implementation. `PayrollRunService` is
 * exported for the bank webhook, which files a run the bank completed without
 * this app having started it.
 */
@Module({
  imports: [BankPayrollModule],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollRunService],
  exports: [PayrollService, PayrollRunService],
})
export class PayrollModule {}
