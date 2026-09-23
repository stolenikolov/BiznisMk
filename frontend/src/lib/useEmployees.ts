import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import type { CompanyRole } from '../auth/types.ts';
import type { SalaryBreakdown } from './payroll.ts';

export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SICK_LEAVE';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  email: string;
  phone: string;
  role: CompanyRole;
  status: EmployeeStatus;
  /** Monthly gross, as a decimal string. */
  salary: string;
  /** YYYY-MM-DD. */
  hireDate: string;
  vacationDaysTotal: number;
  vacationDaysRemaining: number;
  iban: string;
  /** This month's gross → net. Null when the tax year's settings are missing. */
  pay: SalaryBreakdown | null;
}

export interface TeamSummary {
  total: number;
  /** On leave or on sick leave. */
  absent: number;
  /** Null when the tax year's settings are missing. */
  netPayrollThisMonth: string | null;
  /** The tax year the net figures are for. */
  taxYear: number;
  currency: string;
}

/** What the employee form sends: POST to add, PATCH to edit. */
export interface EmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: CompanyRole;
  salary: string;
  hireDate: string;
  vacationDaysRemaining: number;
  iban: string;
  /** Only when editing; a new hire starts ACTIVE. */
  status?: EmployeeStatus;
}

export const EMPLOYEE_STATUSES: EmployeeStatus[] = ['ACTIVE', 'ON_LEAVE', 'SICK_LEAVE'];

/** Top of the company down, the order the list and the role select use. */
export const EMPLOYEE_ROLES: CompanyRole[] = ['EMPLOYEE', 'MANAGER', 'CEO'];

/** Under a quarter of the entitlement left is worth flagging to whoever plans leave. */
export const LOW_VACATION_RATIO = 0.25;

export function employeesPath(companyId: string): string {
  return `/companies/${companyId}/employees`;
}

export function initials(employee: Pick<Employee, 'firstName' | 'lastName'>): string {
  return `${employee.firstName.trim().charAt(0)}${employee.lastName.trim().charAt(0)}`.toUpperCase();
}

/** Remaining share of the vacation entitlement, 0–1. */
export function vacationRatio(employee: Pick<Employee, 'vacationDaysTotal' | 'vacationDaysRemaining'>): number {
  if (employee.vacationDaysTotal <= 0) return 0;
  return Math.min(1, Math.max(0, employee.vacationDaysRemaining / employee.vacationDaysTotal));
}

const EMPTY_SUMMARY: TeamSummary = {
  total: 0,
  absent: 0,
  netPayrollThisMonth: '0.00',
  taxYear: new Date().getFullYear(),
  currency: 'MKD',
};

export function useEmployees(companyId: string | undefined) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<TeamSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await api.get<{ employees: Employee[]; summary: TeamSummary }>(employeesPath(companyId));
      setEmployees(data.employees);
      setSummary(data.summary);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { employees, summary, isLoading, hasError, reload: load };
}
