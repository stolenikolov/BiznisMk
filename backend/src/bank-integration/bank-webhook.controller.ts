import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { BankWebhookService } from './bank-webhook.service.js';
import { parseBankWebhookEvent } from './bank-webhook.types.js';
import { isValidSignature } from './webhook-signature.js';
import { Public } from '../auth/decorators/public.decorator.js';

/**
 * Where the bank tells us money moved.
 *
 * Public in the sense that it carries no session — there is no user behind a
 * webhook — but not unauthenticated: every request must carry an `X-Signature`
 * the bank computed over the raw body with the shared secret. That signature is
 * the whole of the authentication, so the endpoint fails closed if the secret
 * is not configured rather than accepting whatever arrives.
 *
 * The status codes are chosen for how the bank retries. It retries on anything
 * that is not 2xx, three times with a backoff, and then files the event as
 * failed:
 *
 *  - A bad signature is 401. It will never become valid, but a caller that
 *    cannot sign is exactly who should be told no.
 *  - A body we cannot act on — malformed, or an event type we do not handle —
 *    is 200. Retrying it would fail identically every time.
 *  - An IBAN no company here has connected is 200. Nothing is wrong; there is
 *    simply nobody to tell.
 *  - A database failure is left to throw as a 500, which is the one case worth
 *    retrying.
 */
@Controller('webhooks')
export class BankWebhookController {
  private readonly logger = new Logger(BankWebhookController.name);

  constructor(
    private readonly webhooks: BankWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('bank')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    const secret = this.config.get<string>('app.bankWebhookSecret', { infer: true });

    if (!secret) {
      this.logger.error(
        'A bank webhook arrived but BANK_WEBHOOK_SIGNING_SECRET is not set; refusing it',
      );
      throw new ServiceUnavailableException('Webhook receiver is not configured');
    }

    // Verified against the bytes as they arrived. Re-serialising the parsed
    // JSON would change key order and number formatting, and no signature
    // would ever match.
    if (!isValidSignature(request.rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = parseBankWebhookEvent(body);

    if (!event) {
      this.logger.warn('Ignoring a bank webhook that carried nothing actionable');
      return { received: true, applied: false };
    }

    const outcome = await this.webhooks.apply(event);

    this.logger.log(
      `${event.eventType}: recorded ${outcome.recorded}, ` +
        `${outcome.duplicates} already on file, ` +
        `${outcome.unknownAccounts} account(s) not connected here`,
    );

    return { received: true, applied: true, ...outcome };
  }
}
