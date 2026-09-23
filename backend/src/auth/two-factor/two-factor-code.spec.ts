import { describe, expect, it } from 'vitest';
import {
  canResend,
  challengeState,
  codeMatches,
  CODE_TTL_MS,
  deriveCodeKey,
  generateCode,
  hashCode,
  maskEmail,
  MAX_ATTEMPTS,
  resendAvailableAt,
  RESEND_COOLDOWN_MS,
} from './two-factor-code.js';

const KEY = deriveCodeKey('test-secret');
const ANA = { userId: 'user-ana', purpose: 'LOGIN' };
const NOW = new Date('2026-09-19T10:00:00.000Z');

describe('generateCode', () => {
  it('is always six digits, leading zeros kept', () => {
    const codes = Array.from({ length: 2000 }, generateCode);
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateCode));
    // A million possibilities: 2000 draws colliding more than a handful of times would mean a broken source.
    expect(codes.size).toBeGreaterThan(1990);
  });
});

describe('hashCode', () => {
  it('is stable for the same code, and never the code itself', () => {
    const hash = hashCode(KEY, ANA, '042917');
    expect(hashCode(KEY, ANA, '042917')).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('042917');
  });

  it('differs for another code, another user, another purpose or another server secret', () => {
    const hash = hashCode(KEY, ANA, '042917');
    expect(hashCode(KEY, ANA, '042918')).not.toBe(hash);
    expect(hashCode(KEY, { ...ANA, userId: 'user-marko' }, '042917')).not.toBe(hash);
    expect(hashCode(KEY, { ...ANA, purpose: 'DISABLE' }, '042917')).not.toBe(hash);
    expect(hashCode(deriveCodeKey('another-secret'), ANA, '042917')).not.toBe(hash);
  });
});

describe('codeMatches', () => {
  const stored = hashCode(KEY, ANA, '042917');

  it('accepts the code that was sent', () => {
    expect(codeMatches(KEY, ANA, '042917', stored)).toBe(true);
  });

  it('refuses any other code, or the right code for the wrong purpose', () => {
    expect(codeMatches(KEY, ANA, '042918', stored)).toBe(false);
    expect(codeMatches(KEY, ANA, '000000', stored)).toBe(false);
    expect(codeMatches(KEY, { ...ANA, purpose: 'ENABLE' }, '042917', stored)).toBe(false);
  });

  it('answers false rather than throwing for a stored value of another length', () => {
    expect(codeMatches(KEY, ANA, '042917', 'abc')).toBe(false);
  });
});

describe('challengeState', () => {
  const fresh = { consumedAt: null, expiresAt: new Date(NOW.getTime() + CODE_TTL_MS), attempts: 0 };

  it('is open while unused, unexpired and under the attempt limit', () => {
    expect(challengeState(fresh, NOW)).toBe('open');
    expect(challengeState({ ...fresh, attempts: MAX_ATTEMPTS - 1 }, NOW)).toBe('open');
  });

  it('expires exactly ten minutes after it was sent', () => {
    expect(CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(challengeState(fresh, new Date(fresh.expiresAt.getTime() - 1))).toBe('open');
    expect(challengeState(fresh, fresh.expiresAt)).toBe('expired');
  });

  it('dies after five wrong guesses', () => {
    expect(MAX_ATTEMPTS).toBe(5);
    expect(challengeState({ ...fresh, attempts: 5 }, NOW)).toBe('exhausted');
  });

  it('works once: a used code is spent, whatever else is true', () => {
    expect(challengeState({ ...fresh, consumedAt: NOW }, NOW)).toBe('consumed');
  });
});

describe('resend cooldown', () => {
  it('waits sixty seconds after the last code', () => {
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
    expect(resendAvailableAt(NOW)).toEqual(new Date(NOW.getTime() + 60_000));
    expect(canResend(NOW, new Date(NOW.getTime() + 59_999))).toBe(false);
    expect(canResend(NOW, new Date(NOW.getTime() + 60_000))).toBe(true);
  });
});

describe('maskEmail', () => {
  it('keeps the first and last letter of the name and the whole domain', () => {
    expect(maskEmail('stolenikolov12345@gmail.com')).toBe('s***5@gmail.com');
    expect(maskEmail('stole@gmail.com')).toBe('s***e@gmail.com');
  });

  it('gives nothing away for very short names', () => {
    expect(maskEmail('ab@firma.mk')).toBe('a***@firma.mk');
    expect(maskEmail('a@firma.mk')).toBe('a***@firma.mk');
  });
});
