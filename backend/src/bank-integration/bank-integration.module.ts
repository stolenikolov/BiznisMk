import { Module } from '@nestjs/common';
import { BankIntegrationController } from './bank-integration.controller.js';
import { BankIntegrationProvider } from './bank-integration.provider.js';
import { MockBankIntegrationProvider } from './mock-bank-integration.service.js';

/**
 * The single line to change when a real bank integration arrives: point
 * `useClass` at the new provider. Nothing outside this module names the mock.
 */
@Module({
  controllers: [BankIntegrationController],
  providers: [{ provide: BankIntegrationProvider, useClass: MockBankIntegrationProvider }],
  exports: [BankIntegrationProvider],
})
export class BankIntegrationModule {}
