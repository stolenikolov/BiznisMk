/**
 * Invoice numbering.
 *
 * Macedonian practice is a per-year counter that restarts at 1 each January,
 * rendered zero-padded against the year — "0001/2026". The counter is scoped
 * to the company, so two tenants never collide.
 */

/** Width of the zero-padded counter, e.g. 7 -> "0007". */
const SEQUENCE_WIDTH = 4;

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${String(sequence).padStart(SEQUENCE_WIDTH, '0')}/${year}`;
}

/**
 * The counter for a new invoice, given the highest one already used in that
 * year. Passing `null` (no invoices yet this year) starts a fresh year at 1,
 * which is what makes the sequence restart every January.
 */
export function nextSequence(highestUsed: number | null): number {
  return (highestUsed ?? 0) + 1;
}
