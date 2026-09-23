import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import type { TFunction } from 'i18next';
import { api } from '../lib/api.ts';
import { groupIban } from '../lib/money.ts';
import { Modal } from './Modal.tsx';
import { CameraIcon } from './icons.tsx';
import { SalaryBreakdownPanel } from './SalaryBreakdownPanel.tsx';
import { parseSalaryInput, useNetSalaryPreview } from '../lib/payroll.ts';
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_STATUSES,
  employeesPath,
  type Employee,
  type EmployeeInput,
  type EmployeeStatus,
} from '../lib/useEmployees.ts';
import type { CompanyRole } from '../auth/types.ts';

const DEFAULT_VACATION_DAYS = 20;

/** Same shape the API enforces: MK and 17 digits once spaces are gone. */
const MK_IBAN = /^MK\d{17}$/;

/** Today as YYYY-MM-DD in the user's own time zone, not UTC's. */
function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

interface Props {
  companyId: string;
  /** The employee being edited. Left out, the form adds a new one. */
  employee?: Employee;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * One form for adding and editing an employee, so the two can never drift
 * apart. Editing shows the stored values, drops the "adding" eyebrow, titles
 * the form with the person's name, and adds the status field — a new hire is
 * always active, but someone already on the team goes on leave.
 */
export function EmployeeFormModal({ companyId, employee, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const isEditing = employee !== undefined;

  const [firstName, setFirstName] = useState(employee?.firstName ?? '');
  const [lastName, setLastName] = useState(employee?.lastName ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [role, setRole] = useState<CompanyRole>(employee?.role ?? 'EMPLOYEE');
  const [status, setStatus] = useState<EmployeeStatus>(employee?.status ?? 'ACTIVE');
  const [hireDate, setHireDate] = useState(() => employee?.hireDate ?? localToday());
  // Whole denars are shown without the ".00" the API stores them with.
  const [salary, setSalary] = useState(employee?.salary.replace(/\.00$/, '') ?? '');
  const [vacationDays, setVacationDays] = useState(
    String(employee?.vacationDaysRemaining ?? DEFAULT_VACATION_DAYS),
  );
  const [iban, setIban] = useState(employee ? groupIban(employee.iban) : '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Gross → net as the salary is typed, computed by the API from this year's
  // tax settings; the stored employee's own breakdown until the figure changes.
  const netPreview = useNetSalaryPreview(companyId, salary, employee?.pay ?? null);

  // Remaining days can never exceed the entitlement, which an existing
  // employee may have above the default.
  const maxVacationDays = employee?.vacationDaysTotal ?? DEFAULT_VACATION_DAYS;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    // Caught here so the message is in the user's language; the API applies
    // the same rules regardless.
    const normalizedIban = iban.replace(/[\s-]/g, '').toUpperCase();
    if (!MK_IBAN.test(normalizedIban)) {
      setError(t('employees.form.errors.iban'));
      return;
    }
    const salaryAmount = parseSalaryInput(salary);
    if (!salaryAmount) {
      setError(t('employees.form.errors.salary'));
      return;
    }

    const body: EmployeeInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role,
      salary: salaryAmount,
      hireDate,
      vacationDaysRemaining: Number(vacationDays),
      iban: normalizedIban,
      ...(isEditing ? { status } : {}),
    };

    setIsSaving(true);
    try {
      if (isEditing) {
        await api.patch(`${employeesPath(companyId)}/${employee.id}`, body);
      } else {
        await api.post(employeesPath(companyId), body);
      }
      onSaved();
    } catch (err) {
      setError(describeError(err, t));
      setIsSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="employee-form-title" wide>
      {!isEditing && <span className="label-caps modal-eyebrow">{t('employees.form.eyebrow')}</span>}
      <h2 id="employee-form-title" className="modal-title">
        {isEditing ? `${employee.firstName} ${employee.lastName}` : t('employees.form.title')}
      </h2>

      <form className="employee-form" onSubmit={handleSubmit}>
        {/* There is no upload endpoint yet, so the control is shown but honest
            about it rather than accepting a photo that would be thrown away. */}
        <div className="photo-slot">
          <span className="photo-slot-circle">
            <CameraIcon />
          </span>
          <button type="button" className="btn-quiet photo-slot-button" disabled aria-describedby="photo-soon">
            {t('employees.form.uploadPhoto')}
          </button>
          <span id="photo-soon" className="field-hint">
            {t('employees.form.photoSoon')}
          </span>
        </div>

        <div className="form-row">
          <label>
            {t('employees.form.firstName')}
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t('employees.form.firstNamePlaceholder')}
              autoComplete="off"
              maxLength={100}
              required
              autoFocus
            />
          </label>
          <label>
            {t('employees.form.lastName')}
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t('employees.form.lastNamePlaceholder')}
              autoComplete="off"
              maxLength={100}
              required
            />
          </label>
        </div>

        <label>
          {t('employees.form.email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('employees.form.emailPlaceholder')}
            autoComplete="off"
            required
          />
        </label>

        <div className="form-row">
          <label>
            {t('employees.form.phone')}
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('employees.form.phonePlaceholder')}
              autoComplete="off"
              pattern="\+?[\d\s\-\/\(\)]{6,20}"
              required
            />
          </label>
          <label>
            {t('employees.form.role')}
            <select value={role} onChange={(e) => setRole(e.target.value as CompanyRole)} required>
              {EMPLOYEE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {t(`employees.roles.${option}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label>
            {t('employees.form.hireDate')}
            <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} required />
          </label>
          <label>
            {t('employees.form.salary')}
            <span className="field-affix">
              <input
                inputMode="decimal"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="40000"
                autoComplete="off"
                required
              />
              <span className="field-affix-unit" aria-hidden="true">
                {t('employees.form.salaryUnit')}
              </span>
            </span>
          </label>
        </div>

        <SalaryBreakdownPanel preview={netPreview} />

        <div className="form-row">
          <label>
            {t('employees.form.vacationDays')}
            <span className="field-affix">
              <input
                type="number"
                min={0}
                max={maxVacationDays}
                step={1}
                value={vacationDays}
                onChange={(e) => setVacationDays(e.target.value)}
                required
              />
              <span className="field-affix-unit" aria-hidden="true">
                {t('employees.form.vacationUnit')}
              </span>
            </span>
          </label>
          {isEditing && (
            <label>
              {t('employees.form.status')}
              <select value={status} onChange={(e) => setStatus(e.target.value as EmployeeStatus)} required>
                {EMPLOYEE_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {t(`employees.statuses.${option}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label>
          {t('employees.form.iban')}
          <input
            className="input-mono"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder={t('employees.form.ibanPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={isSaving}>
            {t('employees.form.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving
              ? t('employees.form.saving')
              : t(isEditing ? 'employees.form.saveChanges' : 'employees.form.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function describeError(err: unknown, t: TFunction): string {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 409) return t('employees.form.errors.duplicateEmail');
    // Validation messages come from the API's DTO rules; show them as sent
    // rather than hiding which field was refused.
    const message = err.response?.data?.message;
    if (err.response?.status === 400 && Array.isArray(message)) return message.join(', ');
    if (err.response?.status === 400 && typeof message === 'string') return message;
  }
  return t('employees.form.errors.generic');
}
