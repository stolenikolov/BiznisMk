/**
 * Macedonian IBAN: MK + 2 check digits + 3-digit bank code + 10-digit account
 * + 2 national check digits, 19 characters in all.
 *
 * Structure only, deliberately without the MOD-97 checksum: the mock bank
 * issues plausible-looking IBANs that are not checksum-valid, and salaries are
 * paid through it. The bank is the authority on whether an account exists.
 */
export const MK_IBAN_PATTERN = /^MK\d{17}$/;

/** How IBANs are written by people (grouped, lower case) → how they are stored. */
export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}
