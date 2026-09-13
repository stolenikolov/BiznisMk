import { Transform } from 'class-transformer';

/**
 * Lowercases and trims an email before validation.
 *
 * The local part of an address is technically case-sensitive per RFC 5321, but
 * no mail provider treats it that way, and users do not either — someone who
 * signs up as Ana@example.com will type ana@example.com next time. Postgres
 * compares strings exactly, so without this the lookup silently misses and the
 * account becomes unreachable.
 */
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
