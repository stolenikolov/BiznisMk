import { useTranslation } from 'react-i18next';
import { formatAmount } from '../lib/money.ts';
import { formatRate, type NetSalaryPreview } from '../lib/payroll.ts';

/**
 * A salary from gross to net, line by line, the way a payslip prints it. The
 * figures are shown to the deni so every line visibly adds up.
 */
export function SalaryBreakdownPanel({ preview }: { preview: NetSalaryPreview }) {
  const { t, i18n } = useTranslation();

  if (preview.state === 'empty') return null;

  if (preview.state === 'missing-settings') {
    return (
      <section className="salary-breakdown" aria-live="polite">
        <span className="label-caps">{t('employees.pay.title')}</span>
        <p className="salary-breakdown-missing">{t('employees.pay.missing', { year: preview.year })}</p>
      </section>
    );
  }

  const { breakdown, isUpdating } = preview;
  const money = (amount: string) =>
    t('employees.amount', { amount: formatAmount(amount, i18n.language, 'MKD', { exact: true }) });
  // A deduction of nothing reads as 0,00, not −0,00.
  const minus = (amount: string) => (/^0*(\.0*)?$/.test(amount) ? money(amount) : `−${money(amount)}`);

  const lines = [
    { key: 'gross', label: t('employees.pay.gross'), value: money(breakdown.gross) },
    {
      key: 'contributions',
      label: t('employees.pay.contributions', { rate: formatRate(breakdown.contributionsRate, i18n.language) }),
      value: minus(breakdown.contributions),
    },
    {
      key: 'baseAfterContributions',
      label: t('employees.pay.baseAfterContributions'),
      value: money(breakdown.baseAfterContributions),
      subtotal: true,
    },
    { key: 'personalAllowance', label: t('employees.pay.personalAllowance'), value: minus(breakdown.personalAllowance) },
    { key: 'taxableBase', label: t('employees.pay.taxableBase'), value: money(breakdown.taxableBase), subtotal: true },
    {
      key: 'incomeTax',
      label: t('employees.pay.incomeTax', { rate: formatRate(breakdown.incomeTaxRate, i18n.language) }),
      value: minus(breakdown.incomeTax),
    },
  ];

  return (
    <section
      className={`salary-breakdown${isUpdating ? ' is-updating' : ''}`}
      aria-live="polite"
      aria-busy={isUpdating}
    >
      <div className="salary-breakdown-head">
        <span className="label-caps">{t('employees.pay.title')}</span>
        <span className="field-hint">{t('employees.pay.taxYear', { year: breakdown.taxYear })}</span>
      </div>
      <dl className="salary-breakdown-lines">
        {lines.map((line) => (
          <div key={line.key} className={`salary-breakdown-line${line.subtotal ? ' is-subtotal' : ''}`}>
            <dt>{line.label}</dt>
            <dd className="num">{line.value}</dd>
          </div>
        ))}
        <div className="salary-breakdown-line is-total">
          <dt>{t('employees.pay.net')}</dt>
          <dd className="num">{money(breakdown.net)}</dd>
        </div>
      </dl>
    </section>
  );
}
