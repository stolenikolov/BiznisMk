import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { BankVerificationProvider } from './bank-verification.provider.js';
import type { BankVerificationRequest, BankVerificationResult } from './bank-verification.types.js';

/**
 * PLACEHOLDER — this talks to no bank. Every value below is invented locally
 * and is not connected to any real institution or account.
 *
 * It exists so the add-account flow can be built and demoed with a realistic
 * verification step before an actual open-banking integration is available.
 * Replace it by implementing BankVerificationProvider against the real API and
 * rebinding it in BankVerificationModule.
 */
@Injectable()
export class MockBankVerificationProvider extends BankVerificationProvider {
  private readonly logger = new Logger(MockBankVerificationProvider.name);

  /** Roughly one in ten checks fails, so the unhappy path is reachable in demos. */
  private static readonly FAILURE_RATE = 0.1;
  /** Nominal floor, in minor units of the account currency. */
  private static readonly MINIMUM_FUNDS = 50_000;
  /** Stand-in for network latency, so the UI's checking state is visible. */
  private static readonly LATENCY_MS = 900;

  async checkAccount(request: BankVerificationRequest): Promise<BankVerificationResult> {
    this.logger.debug(`Mock verification for ${request.bankName} (${request.iban})`);
    await new Promise((resolve) => setTimeout(resolve, MockBankVerificationProvider.LATENCY_MS));

    const verified = randomInt(0, 100) >= MockBankVerificationProvider.FAILURE_RATE * 100;
    if (!verified) {
      return { verified: false, hasSufficientFunds: false, mockBalance: '0.00', provider: 'mock' };
    }

    // Minor units keep the invented figure free of floating-point artefacts.
    const balanceMinor = randomInt(0, 25_000_000);
    return {
      verified: true,
      hasSufficientFunds: balanceMinor >= MockBankVerificationProvider.MINIMUM_FUNDS,
      mockBalance: (balanceMinor / 100).toFixed(2),
      provider: 'mock',
    };
  }
}
