import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAmount, useBankAccounts } from '../lib/useBankAccounts.ts';
import { AddBankAccountModal } from '../components/AddBankAccountModal.tsx';

export function BankAccountsPage() {
  const { t, i18n } = useTranslation();
  const { accounts, isLoading, reload } = useBankAccounts();
  const [isAdding, setIsAdding] = useState(false);

  return (
    <section>
      <div className="page-heading">
        <h1 className="page-title">{t('accounts.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => setIsAdding(true)}>
          {t('accounts.addCta')}
        </button>
      </div>

      {isLoading ? (
        <p className="dashboard-placeholder">{t('common.loading')}</p>
      ) : accounts.length === 0 ? (
        <p className="dashboard-placeholder">{t('accounts.empty')}</p>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('accounts.bankName')}</th>
                <th className="num">{t('accounts.iban')}</th>
                <th>{t('accounts.currency')}</th>
                <th className="num">{t('accounts.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.bankName}</td>
                  <td className="num">{account.iban}</td>
                  <td>{account.currency}</td>
                  <td className="num">{formatAmount(account.balance, i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdding && <AddBankAccountModal onClose={() => setIsAdding(false)} onCreated={() => void reload()} />}
    </section>
  );
}
