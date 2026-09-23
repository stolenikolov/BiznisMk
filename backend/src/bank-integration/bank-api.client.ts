import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Long enough for the bank to price a run, short enough not to hang a click. */
const TIMEOUT_MS = 10_000;

/** The bank answered: its status and JSON body, whether it said yes or no. */
export interface BankApiResponse {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

/**
 * HTTP to the Mock Bank API, with its `X-API-Key`.
 *
 * Only the bank's own answers come back from `call`, refusals included — what
 * a refusal means is the caller's business. Anything that is not the bank
 * answering — no configuration, a refused connection, a timeout, a body that
 * is not JSON — is a 503: the app is fine, the bank is not reachable, and
 * retrying later is the right advice.
 */
@Injectable()
export class BankApiClient {
  private readonly logger = new Logger(BankApiClient.name);
  private readonly baseUrl: string | undefined;
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('app.bankApiUrl', { infer: true })?.replace(/\/+$/, '');
    this.apiKey = config.get<string>('app.bankApiKey', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<BankApiResponse> {
    if (!this.baseUrl || !this.apiKey) {
      throw new ServiceUnavailableException({
        errorCode: 'BANK_NOT_CONFIGURED',
        message: 'BANK_API_URL and BANK_API_KEY are not set; the app cannot reach the bank',
      });
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'X-API-Key': this.apiKey,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        // Spread rather than a key set to undefined: a GET carrying a `body`
        // key at all is malformed, whatever its value.
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Bank unreachable on ${method} ${path}: ${String(error)}`);
      throw new ServiceUnavailableException({
        errorCode: 'BANK_UNREACHABLE',
        message: 'The bank did not answer',
      });
    }

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!isRecord(payload)) {
      this.logger.error(`Bank answered ${method} ${path} with ${response.status} and no JSON body`);
      throw bankBadResponse();
    }

    return { ok: response.ok, status: response.status, body: payload };
  }
}

export function bankBadResponse() {
  return new ServiceUnavailableException({
    errorCode: 'BANK_BAD_RESPONSE',
    message: 'The bank answered with something we cannot read',
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value ? value : undefined;
}
