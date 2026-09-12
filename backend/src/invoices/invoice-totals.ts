import { Prisma } from '../generated/prisma/client.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Money is handled as Decimal end-to-end, never as a float. */
export type Money = Decimal | string | number;

export interface InvoiceLineInput {
  description: string;
  quantity: Money;
  unitPrice: Money;
  /** Percent, e.g. 18 or 5. Ignored entirely for non-VAT-payers. */
  vatRate?: Money;
}

export interface InvoiceLineTotal {
  description: string;
  quantity: Decimal;
  unitPrice: Decimal;
  net: Decimal;
}

export interface VatBreakdownEntry {
  rate: Decimal;
  base: Decimal;
  amount: Decimal;
}

export interface InvoiceTotals {
  lines: InvoiceLineTotal[];
  /** Sum of line nets — the only figure a non-VAT-payer's invoice shows. */
  net: Decimal;
  /** True only when the issuing company is VAT-registered. */
  vatApplied: boolean;
  /** Empty when `vatApplied` is false: no VAT rows are rendered at all. */
  vatBreakdown: VatBreakdownEntry[];
  vatTotal: Decimal;
  total: Decimal;
}

/** Rounds to 2 decimal places, half-up — the convention for MKD invoice lines. */
function round2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Computes invoice totals for an issuing company.
 *
 * The `isVatPayer` branch is the whole point of this function: a company below
 * the ДДВ registration threshold must not show VAT rows on its invoices at
 * all — not a 0% row, no row. So when it is false, VAT input on the lines is
 * discarded and the total equals the net.
 */
export function calculateInvoiceTotals(
  lines: InvoiceLineInput[],
  issuer: { isVatPayer: boolean; defaultVatRate?: Money },
): InvoiceTotals {
  const lineTotals: InvoiceLineTotal[] = lines.map((line) => {
    const quantity = new Decimal(line.quantity);
    const unitPrice = new Decimal(line.unitPrice);
    return {
      description: line.description,
      quantity,
      unitPrice,
      net: round2(quantity.mul(unitPrice)),
    };
  });

  const net = round2(lineTotals.reduce((sum, line) => sum.add(line.net), new Decimal(0)));

  if (!issuer.isVatPayer) {
    return {
      lines: lineTotals,
      net,
      vatApplied: false,
      vatBreakdown: [],
      vatTotal: new Decimal(0),
      total: net,
    };
  }

  const fallbackRate = new Decimal(issuer.defaultVatRate ?? 18);
  const basesByRate = new Map<string, { rate: Decimal; base: Decimal }>();

  lines.forEach((line, index) => {
    const rate = line.vatRate === undefined ? fallbackRate : new Decimal(line.vatRate);
    const key = rate.toString();
    const existing = basesByRate.get(key);
    const lineNet = lineTotals[index]!.net;
    basesByRate.set(key, {
      rate,
      base: existing ? existing.base.add(lineNet) : lineNet,
    });
  });

  const vatBreakdown: VatBreakdownEntry[] = [...basesByRate.values()]
    .sort((a, b) => b.rate.comparedTo(a.rate))
    .map(({ rate, base }) => ({
      rate,
      base: round2(base),
      amount: round2(base.mul(rate).div(100)),
    }));

  const vatTotal = round2(vatBreakdown.reduce((sum, entry) => sum.add(entry.amount), new Decimal(0)));

  return {
    lines: lineTotals,
    net,
    vatApplied: true,
    vatBreakdown,
    vatTotal,
    total: round2(net.add(vatTotal)),
  };
}
