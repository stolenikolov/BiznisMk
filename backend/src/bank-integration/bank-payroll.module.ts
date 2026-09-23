import { Module } from '@nestjs/common';
import { BankPayrollProvider } from './bank-payroll.provider.js';
import { HttpBankPayrollProvider } from './http-bank-payroll.service.js';
import { BankApiClient } from './bank-api.client.js';

/**
 * The outbound half of the bank integration, on its own.
 *
 * Separate from `BankIntegrationModule` for a structural reason: that module
 * receives the bank's webhooks and therefore has to reach into payroll to file
 * a completed run, while payroll has to reach out through this provider to
 * start one. Keeping the provider here is what stops those two from importing
 * each other.
 *
 * The single line to change when a real bank arrives: point `useClass` at the
 * new provider.
 */
@Module({
  providers: [BankApiClient, { provide: BankPayrollProvider, useClass: HttpBankPayrollProvider }],
  exports: [BankPayrollProvider],
})
export class BankPayrollModule {}
