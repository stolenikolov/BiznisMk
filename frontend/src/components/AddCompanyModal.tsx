import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useAuth } from '../auth/useAuth.ts';
import { Modal } from './Modal.tsx';
import { CompanyFields } from './CompanyFields.tsx';
import { EMPTY_COMPANY, companyErrorMessage, type CompanyDraft } from '../lib/companyDraft.ts';

/**
 * Another business on the same login. The signed-in user becomes its
 * director, and the session moves straight into it — the server does that as
 * part of creating it — so this lands on the new company's overview.
 */
export function AddCompanyModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanyDraft>(EMPTY_COMPANY);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await api.post('/companies', company);
      await refetch();
      navigate('/dashboard');
    } catch (err) {
      setError(companyErrorMessage(t, err));
      setIsSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="add-company-title" wide>
      <span className="label-caps modal-eyebrow">{t('companies.add.eyebrow')}</span>
      <h2 id="add-company-title" className="modal-title">
        {t('companies.add.title')}
      </h2>
      <p className="modal-note">{t('companies.add.hint', { email: user?.email ?? '' })}</p>

      <form onSubmit={handleSubmit}>
        <CompanyFields value={company} onChange={setCompany} autoFocus />

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={isSaving}>
            {t('companies.add.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? t('companies.add.saving') : t('companies.add.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
