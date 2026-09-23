import { Module } from '@nestjs/common';
import { BankIntegrationController } from './bank-integration.controller.js';
import { BankWebhookController } from './bank-webhook.controller.js';
import { BankWebhookService } from './bank-webhook.service.js';
import { BankIntegrationProvider } from './bank-integration.provider.js';
import { MockBankIntegrationProvider } from './mock-bank-integration.service.js';
import { BankApiClient } from './bank-api.client.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';

/**
 * The single line to change when a real bank integration arrives: point
 * `useClass` at the new provider. Nothing outside this module names the mock.
 *
 * `PayrollModule` is imported for the webhook, which files a payroll run the
 * bank has completed. The outbound provider payroll uses to *start* a run
 * lives in `BankPayrollModule` rather than here, so the two do not import each
 * other.
 */
@Module({
  imports: [NotificationsModule, PayrollModule],
  controllers: [BankIntegrationController, BankWebhookController],
  providers: [
    BankApiClient,
    { provide: BankIntegrationProvider, useClass: MockBankIntegrationProvider },
    BankWebhookService,
  ],
  exports: [BankIntegrationProvider],
})
export class BankIntegrationModule {}
