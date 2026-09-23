import { useEffect, useState } from 'react';
import axios from 'axios';
import { api } from './api.ts';

/**
 * Gross → net for one monthly salary, exactly as the API computed it. The
 * browser never recomputes any of these figures: the formula and the tax
 * parameters live on the server, in one place.
 */
export interface SalaryBreakdown {
  gross: string;
  contributions: string;
  baseAfterContributions: string;
  /** The allowance as applied — capped at the base it is deducted from. */
  personalAllowance: string;
  taxableBase: string;
  incomeTax: string;
  net: string;
  taxYear: number;
  /** Percent, e.g. "28.00". */
  contributionsRate: string;
  /** Percent, e.g. "10.00". */
  incomeTaxRate: string;
  personalAllowanceMonthly: string;
}

/**
 * Turns what people type into the plain decimal string the API accepts, or
 * null when it cannot be read as a positive amount.
 *
 * Macedonian writes 40.000,50 — dots group thousands, a comma marks decimals —
 * but plenty of people type 40000.50. A comma, or dots in groups of exactly
 * three, means the local convention; otherwise a dot is the decimal point.
 */
export function parseSalaryInput(raw: string): string | null {
  let value = raw.replace(/\s+/g, '');
  const localGrouping = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(value);

  if (localGrouping || value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.');
  }

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value) || Number(value) <= 0) return null;
  return value;
}

/** "28.00" → "28", "10.50" → "10,5" in Macedonian. */
export function formatRate(percent: string, locale: string): string {
  const trimmed = percent.includes('.') ? percent.replace(/\.?0+$/, '') : percent;
  return locale.startsWith('mk') ? trimmed.replace('.', ',') : trimmed;
}

export type NetSalaryPreview =
  | { state: 'empty' }
  | { state: 'ready'; breakdown: SalaryBreakdown; isUpdating: boolean }
  | { state: 'missing-settings'; year: number };

interface Settled {
  gross: string;
  breakdown: SalaryBreakdown | null;
  missingYear: number | null;
}

const PREVIEW_DELAY_MS = 300;

/**
 * The breakdown for a salary that is still being typed, asked of the server a
 * moment after typing stops. `stored` is the employee's saved breakdown, used
 * as-is while the field still holds that same salary.
 */
export function useNetSalaryPreview(
  companyId: string,
  grossInput: string,
  stored: SalaryBreakdown | null,
): NetSalaryPreview {
  const gross = parseSalaryInput(grossInput);
  const matchesStored = gross !== null && stored !== null && Number(gross).toFixed(2) === stored.gross;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (gross === null || matchesStored) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.get<{ breakdown: SalaryBreakdown }>(
          `/companies/${companyId}/payroll/net-salary`,
          { params: { gross }, signal: controller.signal },
        );
        setSettled({ gross, breakdown: data.breakdown, missingYear: null });
      } catch (err) {
        if (axios.isCancel(err)) return;
        const body = axios.isAxiosError(err) ? err.response?.data : undefined;
        if (body?.errorCode === 'TAX_SETTINGS_MISSING') {
          setSettled({ gross, breakdown: null, missingYear: Number(body.year) });
        }
        // Anything else leaves the last good figures up rather than blanking
        // the panel over a dropped request.
      }
    }, PREVIEW_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [companyId, gross, matchesStored]);

  if (gross === null) return { state: 'empty' };
  if (matchesStored) return { state: 'ready', breakdown: stored, isUpdating: false };
  if (settled?.missingYear != null && settled.gross === gross) {
    return { state: 'missing-settings', year: settled.missingYear };
  }
  // While a new figure is being priced, the last known breakdown stays up,
  // marked as updating, instead of the panel blinking out and back.
  const last = settled?.breakdown ?? stored;
  if (last) {
    return { state: 'ready', breakdown: last, isUpdating: !(settled?.breakdown && settled.gross === gross) };
  }
  return { state: 'empty' };
}
