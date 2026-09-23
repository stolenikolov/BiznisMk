/**
 * Money and account-number formatting.
 *
 * Kept free of React and of the API client so the rules below can be reasoned
 * about — and run — on their own.
 */

/**
 * Formats a decimal string for display.
 *
 * Deliberately not Intl.NumberFormat: not every browser ships Macedonian
 * locale data, and the ones that don't silently fall back to English
 * separators — which would print 124.500 ден as "124,500". Grouping the digit
 * string directly also avoids Number(), so large amounts keep every digit the
 * database stored.
 *
 * Denar figures are shown as whole denars: дени exist on paper but nobody
 * quotes business amounts in them. Other currencies keep their two decimals,
 * because euro cents are real money to the reader. The rounding is display
 * only — the stored value keeps both decimals, since that is what the bank
 * sent and what every total is computed from.
 */
export function formatAmount(
  amount: string,
  locale: string,
  currency = 'MKD',
  /** Keep the deni too — for a payslip, whose lines must visibly add up. */
  { exact = false }: { exact?: boolean } = {},
): string {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(amount.trim());
  if (!match) return amount;

  const [, sign = '', whole = '0', fraction = ''] = match;
  const isMk = locale.startsWith('mk');
  const groupSeparator = isMk ? '.' : ',';
  const decimalSeparator = isMk ? ',' : '.';
  const twoPlaces = fraction.padEnd(2, '0').slice(0, 2);

  if (currency === 'MKD' && !exact) {
    // Half up, on the digit string, so nothing is pushed through Number().
    const rounded = twoPlaces >= '50' ? incrementDigits(whole) : whole;
    return `${sign}${group(rounded, groupSeparator)}`;
  }

  return `${sign}${group(whole, groupSeparator)}${decimalSeparator}${twoPlaces}`;
}

function group(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** Adds one to an arbitrarily long digit string, carrying by hand. */
function incrementDigits(digits: string): string {
  const out = digits.split('');

  for (let index = out.length - 1; index >= 0; index -= 1) {
    if (out[index] === '9') {
      out[index] = '0';
      continue;
    }
    out[index] = String(Number(out[index]) + 1);
    return out.join('');
  }

  return `1${out.join('')}`;
}

/** Full IBAN in four-character groups, the way it is printed on a statement. */
export function groupIban(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** Shows only the last four characters, the way a bank statement would. */
export function maskAccount(iban: string): string {
  const trimmed = iban.trim();
  return trimmed.length <= 4 ? trimmed : `•••• ${trimmed.slice(-4)}`;
}
