import { Module } from '@nestjs/common';
import { BankVerificationController } from './bank-verification.controller.js';
import { BankVerificationProvider } from './bank-verification.provider.js';
import { MockBankVerificationProvider } from './mock-bank-verification.service.js';

/**
 * The single line to change when a real bank integration arrives: point
 * `useClass` at the new provider. Nothing outside this module names the mock.
 */
@Module({
  controllers: [BankVerificationController],
  providers: [{ provide: BankVerificationProvider, useClass: MockBankVerificationProvider }],
  exports: [BankVerificationProvider],
})
export class BankVerificationModule {}
