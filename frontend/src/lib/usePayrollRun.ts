import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';

/** Why a period cannot be paid; the page explains each one. */
export type PayrollBlocker =
  | 'NO_EMPLOYEES'
  | 'TAX_SETTINGS_MISSING'
  | 'NO_ACCOUNTS'
  | 'BANK_NOT_CONFIGURED';

export interface PayrollLine {
  employeeId: string;
  name: string;
  /** Take-home pay: what the bank transfers to this person. */
  net: string;
  /** Their gross, which the net and the two statutory charges add up to. */
  gross: string;
  iban: string;
}

/** Contributions and income tax are withheld from gross and paid to the УЈП. */
export type StatutoryKind = 'CONTRIBUTIONS' | 'INCOME_TAX';

export interface PayrollStatutoryLine {
  kind: StatutoryKind;
  amount: string;
}

/** How the server labels its own two payments in the bank's priced run. */
export const STATUTORY_PREFIX = 'statutory:';

export interface PayrollRunStatus {
  /** `YYYY-MM`. */
  period: string;
  /** `YYYY-MM-DD`, or null when the company has set no payday. */
  payday: string | null;
  currency: string;
  lines: PayrollLine[];
  /** Contributions and income tax, which go to the УЈП rather than to a person. */
  statutory: PayrollStatutoryLine[];
  /** What reaches the employees' own accounts. */
  netTotal: string;
  /** What goes to the УЈП. */
  statutoryTotal: string;
  /** Everything that leaves the company account: gross. */
  total: string;
  /** Set once the salaries are out, whoever started the run. */
  paidAt: string | null;
  /** The button shows on exactly this. */
  canPay: boolean;
  blockedBy: PayrollBlocker | null;
}

/** One salary in the bank's plan, and which account it comes from. */
export interface PayrollAllocationEntry {
  employeeId: string;
  employeeName: string;
  amount: string;
  iban: string;
}

export interface PayrollAccountTotal {
  iban: string;
  currency: string;
  balanceBefore: string;
  totalDebited: string;
  balanceAfter: string;
  paymentCount: number;
}

/**
 * A run the bank has priced but not executed. Nothing has moved yet: this is
 * what the confirmation modal shows.
 */
export interface PayrollQuote {
  requestId: string;
  currency: string;
  allocation: PayrollAllocationEntry[];
  accountTotals: PayrollAccountTotal[];
  ineligibleAccounts: { iban: string; reason: string }[];
}

const payrollPath = (companyId: string) => `/companies/${companyId}/payroll/run`;

/**
 * This period's payroll: whether it is still owed, what it comes to, and the
 * two calls that pay it.
 *
 * `status` is the whole of the button's logic — the app never decides locally
 * that salaries are paid, because only the bank knows that. Which is also why
 * the page reloads this whenever a notification arrives: a run approved at the
 * bank reaches us as a webhook, and the button has to go away by itself.
 */
export function usePayrollRun(companyId: string | undefined) {
  const [status, setStatus] = useState<PayrollRunStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data } = await api.get<{ run: PayrollRunStatus }>(payrollPath(companyId));
      setStatus(data.run);
    } catch {
      // A failed read offers no button rather than a button that cannot work.
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Phase one: what the bank says the run would look like. Moves nothing. */
  const preview = useCallback(async (): Promise<PayrollQuote> => {
    const { data } = await api.post<{ status: PayrollRunStatus; quote: PayrollQuote }>(
      `${payrollPath(companyId!)}/preview`,
    );
    setStatus(data.status);
    return data.quote;
  }, [companyId]);

  /** Phase two: pay it. */
  const confirm = useCallback(
    async (requestId: string): Promise<PayrollRunStatus> => {
      const { data } = await api.post<{ run: PayrollRunStatus }>(
        `${payrollPath(companyId!)}/confirm`,
        { requestId },
      );
      setStatus(data.run);
      return data.run;
    },
    [companyId],
  );

  return { status, isLoading, reload: load, preview, confirm };
}
