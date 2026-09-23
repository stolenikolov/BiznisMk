/**
 * The rules of an emailed two-factor code, free of Nest and Prisma so each one
 * can be tested on its own: how a code is made, how it is stored, and when a
 * challenge still accepts one.
 */

import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const CODE_LENGTH = 6;
/** A code works for 10 minutes. The email states it; keep the two together. */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_TTL_MINUTES = CODE_TTL_MS / 60_000;
/** Wrong guesses a challenge takes before it is dead. */
export const MAX_ATTEMPTS = 5;
/** A new code for the same challenge waits this long after the last one. */
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** How long "remember this device" lasts. */
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const CODE_PATTERN = /^\d{6}$/;

/** Six digits, uniformly from 000000 to 999999, from the OS's secure source. */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/**
 * The key codes are hashed with. Derived from a server secret rather than
 * being a plain SHA-256: there are only a million codes, so an unkeyed hash
 * read out of a database copy would give the code away in a second.
 */
export function deriveCodeKey(serverSecret: string): Buffer {
  return createHash('sha256').update(`biznismk:two-factor-code:${serverSecret}`).digest();
}

/**
 * The stored form of a code. Bound to whose code it is and what it is for,
 * so a hash cannot be moved from one account or purpose to another.
 */
export function hashCode(key: Buffer, binding: { userId: string; purpose: string }, code: string): string {
  return createHmac('sha256', key).update(`${binding.userId}:${binding.purpose}:${code}`).digest('hex');
}

/** Compares in constant time, so how long a wrong guess takes says nothing about how close it was. */
export function codeMatches(
  key: Buffer,
  binding: { userId: string; purpose: string },
  code: string,
  storedHash: string,
): boolean {
  const candidate = Buffer.from(hashCode(key, binding, code), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export type ChallengeState = 'open' | 'consumed' | 'expired' | 'exhausted';

/** Whether a challenge still takes a code, and if not, why not. */
export function challengeState(
  challenge: { consumedAt: Date | null; expiresAt: Date; attempts: number },
  now: Date,
): ChallengeState {
  if (challenge.consumedAt) return 'consumed';
  if (challenge.attempts >= MAX_ATTEMPTS) return 'exhausted';
  if (challenge.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'open';
}

/** When the next code for a challenge may be sent. */
export function resendAvailableAt(lastSentAt: Date): Date {
  return new Date(lastSentAt.getTime() + RESEND_COOLDOWN_MS);
}

export function canResend(lastSentAt: Date, now: Date): boolean {
  return now.getTime() >= resendAvailableAt(lastSentAt).getTime();
}

/**
 * Enough of the address to recognise it, not enough to learn it:
 * "stolenikolov@gmail.com" → "s***v@gmail.com".
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return local.length <= 2 ? `${local[0]}***${domain}` : `${local[0]}***${local[local.length - 1]}${domain}`;
}
