import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useMatch, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { formatAmount } from '../lib/money.ts';
import { formatDate } from '../lib/dates.ts';
import {
  initials,
  LOW_VACATION_RATIO,
  useEmployees,
  vacationRatio,
  type Employee,
} from '../lib/useEmployees.ts';
import { EmployeeFormModal } from '../components/EmployeeFormModal.tsx';
import { EmployeeMessageModal } from '../components/EmployeeMessageModal.tsx';
import { useCompanySettings } from '../lib/settings.ts';
import { usePayrollRun, type PayrollRunStatus } from '../lib/usePayrollRun.ts';
import { useNotifications } from '../lib/useNotifications.ts';
import { PayPayrollModal } from '../components/PayPayrollModal.tsx';
import { MailIcon, PlusIcon, TeamIcon, WalletIcon } from '../components/icons.tsx';

/**
 * The team list. The employee form opens over it on its own URL —
 * /employees/new to add, /employees/:employeeId to see and edit someone — so
 * closing or saving always lands back on the list it was opened from.
 */
export function EmployeesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { employees, summary, isLoading, hasError, reload } = useEmployees(companyId);
  const isAdding = useMatch('/employees/new') !== null;
  const { employeeId } = useParams();
  const editing = employeeId ? employees.find((employee) => employee.id === employeeId) : undefined;
  const [isWriting, setIsWriting] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const payroll = usePayrollRun(companyId);
  const closeMessage = useCallback(() => setIsWriting(false), []);
  // Only for the message form, which names where replies go.
  const { settings } = useCompanySettings(isWriting ? companyId : undefined);

  const closeForm = useCallback(() => navigate('/employees'), [navigate]);
  const handleSaved = () => {
    void reload();
    // A new hire changes what a run would pay, and a departure can empty it.
    void payroll.reload();
    closeForm();
  };

  // A payroll run started anywhere — here, or approved at the bank by someone
  // else — reaches this browser as notifications about the money leaving. That
  // is the cue to re-read the run, which is what takes the button away without
  // anyone reloading the page.
  const { notifications } = useNotifications();
  const newestNotificationId = notifications[0]?.id;
  const reloadPayroll = payroll.reload;
  useEffect(() => {
    if (newestNotificationId) void reloadPayroll();
  }, [newestNotificationId, reloadPayroll]);

  const money = (amount: string) => t('employees.amount', { amount: formatAmount(amount, i18n.language) });

  const stats: { key: string; value: string; hint?: string }[] = [
    { key: 'total', value: String(summary.total) },
    summary.netPayrollThisMonth === null
      ? { key: 'netPayroll', value: '—', hint: t('employees.pay.missingShort', { year: summary.taxYear }) }
      : { key: 'netPayroll', value: money(summary.netPayrollThisMonth) },
    { key: 'absent', value: String(summary.absent) },
  ];

  // A stale or mistyped link to someone who is not on this company's team.
  if (employeeId && !isLoading && !hasError && !editing) {
    return <Navigate to="/employees" replace />;
  }

  return (
    <section className="employees">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('nav.employees')}</h1>
          <p className="page-subtitle">{t('employees.subtitle')}</p>
        </div>
        {companyId && (
          <div className="employees-actions">
            {/* Only while this period's salaries are actually owed: the moment
                the bank says they are paid, whoever paid them, this goes. */}
            {payroll.status?.canPay && (
              <button type="button" className="btn-primary" onClick={() => setIsPaying(true)}>
                <WalletIcon />
                {t('payroll.pay.cta')}
              </button>
            )}
            {employees.length > 0 && (
              <button type="button" className="btn-ghost" onClick={() => setIsWriting(true)}>
                <MailIcon />
                {t('employees.message.cta')}
              </button>
            )}
            <Link to="/employees/new" className="btn-primary">
              <PlusIcon />
              {t('employees.addCta')}
            </Link>
          </div>
        )}
      </header>

      {!companyId ? (
        <EmptyCard message={t('employees.noCompany')} />
      ) : isLoading ? (
        <p className="dashboard-placeholder">{t('common.loading')}</p>
      ) : hasError ? (
        <EmptyCard message={t('employees.loadError')} />
      ) : (
        <>
          <div className="stat-cards">
            {stats.map((stat) => (
              <div key={stat.key} className="card stat-card">
                <span className="label-caps">{t(`employees.stats.${stat.key}`)}</span>
                <span className="stat-card-figure">{stat.value}</span>
                {stat.hint && <span className="field-hint">{stat.hint}</span>}
              </div>
            ))}
          </div>

          {/* Where the button was, or would be: whether the month is settled. */}
          {employees.length > 0 && payroll.status && !payroll.status.canPay && (
            <PayrollNote status={payroll.status} />
          )}

          {employees.length === 0 ? (
            <EmptyCard
              message={t('employees.empty')}
              action={
                <Link to="/employees/new" className="btn-ghost">
                  {t('employees.addCta')}
                </Link>
              }
            />
          ) : (
            <div className="card employee-table-card">
              <div className="employee-table-scroll">
                <table className="table employee-table">
                  <thead>
                    <tr>
                      <th>{t('employees.columns.employee')}</th>
                      <th>{t('employees.columns.role')}</th>
                      <th>{t('employees.columns.vacation')}</th>
                      <th>{t('employees.columns.salary')}</th>
                      <th>{t('employees.columns.contact')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => (
                      <EmployeeRow
                        key={employee.id}
                        employee={employee}
                        salary={money(employee.salary)}
                        net={employee.pay ? money(employee.pay.net) : null}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {companyId && (isAdding || editing) && (
        <EmployeeFormModal
          // Keyed by who is being edited, so moving between two people's forms
          // starts from the right person's stored values.
          key={editing?.id ?? 'new'}
          companyId={companyId}
          employee={editing}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      {companyId && isWriting && (
        <EmployeeMessageModal
          companyId={companyId}
          employees={employees}
          replyTo={settings?.emailReplyTo ?? user?.email ?? ''}
          onClose={closeMessage}
        />
      )}

      {companyId && isPaying && payroll.status && (
        <PayPayrollModal
          status={payroll.status}
          preview={payroll.preview}
          confirm={payroll.confirm}
          onClose={() => setIsPaying(false)}
          onPaid={() => {
            void reload();
            void payroll.reload();
          }}
        />
      )}
    </section>
  );
}

/**
 * What the page says about this month's salaries when there is no button to
 * show: that they are paid, or what is in the way of paying them. Nothing at
 * all while the run is still loading, so the line does not flicker.
 */
function PayrollNote({ status }: { status: PayrollRunStatus }) {
  const { t } = useTranslation();

  if (status.paidAt) {
    return (
      <p className="payroll-note">
        {t('payroll.pay.paidOn', {
          period: status.period,
          date: formatDate(status.paidAt),
        })}
      </p>
    );
  }

  return status.blockedBy ? (
    <p className="payroll-note">{t(`payroll.pay.blocked.${status.blockedBy}`)}</p>
  ) : null;
}

function EmployeeRow({ employee, salary, net }: { employee: Employee; salary: string; net: string | null }) {
  const { t } = useTranslation();
  const fullName = `${employee.firstName} ${employee.lastName}`;
  const ratio = vacationRatio(employee);

  return (
    <tr>
      <td className="cell-person">
        <div className="employee-person">
          {employee.photoUrl ? (
            <img className="employee-avatar" src={employee.photoUrl} alt="" />
          ) : (
            <span className="employee-avatar" aria-hidden="true">
              {initials(employee)}
            </span>
          )}
          <div className="employee-name-stack">
            <span className="employee-name">{fullName}</span>
            {employee.status !== 'ACTIVE' && (
              <span className="badge badge-amber employee-status">
                {t(`employees.statuses.${employee.status}`)}
              </span>
            )}
          </div>
        </div>
      </td>

      <td className="cell-role">
        <span className="badge badge-outline">{t(`employees.roles.${employee.role}`)}</span>
      </td>

      <td className="cell-vacation">
        <div
          className={`vacation-meter${ratio < LOW_VACATION_RATIO ? ' is-low' : ''}`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={employee.vacationDaysTotal}
          aria-valuenow={employee.vacationDaysRemaining}
          aria-label={t('employees.vacationLabel', {
            remaining: employee.vacationDaysRemaining,
            total: employee.vacationDaysTotal,
          })}
        >
          <span className="vacation-meter-figure">
            {t('employees.vacationDays', {
              remaining: employee.vacationDaysRemaining,
              total: employee.vacationDaysTotal,
            })}
          </span>
          <span className="vacation-meter-track">
            <span className="vacation-meter-fill" style={{ width: `${ratio * 100}%` }} />
          </span>
        </div>
      </td>

      <td className="cell-pay">
        <div className="employee-pay">
          <span className="employee-salary">{salary}</span>
          {/* Both figures come from the API; the net one is null only while
              the tax year's settings are missing. */}
          <span className="employee-salary-net">{t('employees.pay.netShort', { amount: net ?? '—' })}</span>
        </div>
      </td>

      <td className="cell-contact">
        <div className="employee-contact">
          <a href={`tel:${employee.phone.replace(/[^\d+]/g, '')}`}>{employee.phone}</a>
          <a href={`mailto:${employee.email}`}>{employee.email}</a>
          {/* The full record, IBAN included, lives in the form rather than in
              the row. */}
          <Link
            to={`/employees/${employee.id}`}
            className="employee-more"
            aria-label={`${t('employees.moreInfo')}: ${fullName}`}
          >
            {t('employees.moreInfo')}
          </Link>
        </div>
      </td>
    </tr>
  );
}

function EmptyCard({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="card">
      <div className="empty-state">
        <span className="empty-state-icon">
          <TeamIcon />
        </span>
        <p>{message}</p>
        {action}
      </div>
    </div>
  );
}
