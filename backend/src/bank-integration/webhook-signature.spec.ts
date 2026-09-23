import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { isValidSignature, signBody } from './webhook-signature.js';

const SECRET = 'dev-webhook-secret';
const BODY = '{"eventType":"TRANSACTION_CREATED","iban":"MK07250120000058984"}';

/** Signed the way the bank does it, independently of our own helper. */
const bankSignature = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

describe('signBody', () => {
  it('produces the same hex digest the bank computes', () => {
    expect(signBody(BODY, SECRET)).toBe(bankSignature(BODY));
  });

  it('signs bytes, so a Buffer and its string form agree', () => {
    expect(signBody(Buffer.from(BODY, 'utf8'), SECRET)).toBe(signBody(BODY, SECRET));
  });
});

describe('isValidSignature', () => {
  it('accepts the bank signature over the raw body', () => {
    expect(isValidSignature(Buffer.from(BODY), bankSignature(BODY), SECRET)).toBe(true);
  });

  it('accepts an upper-case hex signature', () => {
    expect(isValidSignature(BODY, bankSignature(BODY).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    expect(isValidSignature(BODY, bankSignature(BODY, 'someone-elses-secret'), SECRET)).toBe(false);
  });

  // The reason the raw bytes must be kept: the same JSON re-serialised is
  // different bytes, and its signature will not match.
  it('rejects a signature over a body that differs by even one byte', () => {
    const tampered = BODY.replace('58984', '58985');
    expect(isValidSignature(tampered, bankSignature(BODY), SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length rather than throwing', () => {
    expect(isValidSignature(BODY, 'abc123', SECRET)).toBe(false);
    expect(isValidSignature(BODY, `${bankSignature(BODY)}00`, SECRET)).toBe(false);
  });

  it('rejects a non-hex signature of the right length', () => {
    expect(isValidSignature(BODY, 'z'.repeat(64), SECRET)).toBe(false);
  });

  // An unset secret must close the door, not open it to everyone.
  it('refuses everything when the secret is missing', () => {
    expect(isValidSignature(BODY, bankSignature(BODY), undefined)).toBe(false);
    expect(isValidSignature(BODY, bankSignature(BODY), '')).toBe(false);
  });

  it('refuses a request with no signature or no body', () => {
    expect(isValidSignature(BODY, undefined, SECRET)).toBe(false);
    expect(isValidSignature(BODY, '', SECRET)).toBe(false);
    expect(isValidSignature(undefined, bankSignature(BODY), SECRET)).toBe(false);
  });
});
