import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Proving a webhook really came from the bank.
 *
 * The bank signs `HMAC-SHA256(rawBody, WEBHOOK_SIGNING_SECRET)` as hex and sends
 * it as `X-Signature`. This is the only thing standing between the endpoint and
 * anyone on the internet who knows the URL — there is no session on a webhook —
 * so it is kept pure and tested on its own.
 *
 * Two rules that are easy to get wrong and expensive to get wrong:
 *
 *  - The signature covers the **raw bytes**. Re-serialising the parsed JSON
 *    would produce different bytes (key order, spacing, number formatting) and
 *    a signature that never matches.
 *  - The comparison is timing-safe. A plain `===` leaks how many leading
 *    characters were right, which is enough to recover a signature one byte at
 *    a time.
 */

export function signBody(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Whether `signature` is the bank's signature over `rawBody`.
 *
 * False for a missing secret as much as for a wrong signature: an unset secret
 * must close the door, never open it to everyone.
 */
export function isValidSignature(
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!rawBody || !signature || !secret) return false;

  const expected = Buffer.from(signBody(rawBody, secret), 'utf8');
  const received = Buffer.from(signature.trim().toLowerCase(), 'utf8');

  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // expected length — so the lengths are compared first and a wrong-length
  // signature is simply wrong.
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}
