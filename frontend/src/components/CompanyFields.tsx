import { useTranslation } from 'react-i18next';
import { LEGAL_FORMS, type CompanyDraft, type LegalForm } from '../lib/companyDraft.ts';

/** The company's own fields, shared by registration and "Add business". */
export function CompanyFields({
  value,
  onChange,
  autoFocus = false,
}: {
  value: CompanyDraft;
  onChange: (next: CompanyDraft) => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof CompanyDraft>(key: K, next: CompanyDraft[K]) => onChange({ ...value, [key]: next });

  return (
    <>
      <div className="form-row">
        <label>
          {t('auth.register.companyName')}
          <input value={value.name} onChange={(e) => set('name', e.target.value)} required autoFocus={autoFocus} />
        </label>
        <label>
          {t('auth.register.legalForm')}
          <select value={value.legalForm} onChange={(e) => set('legalForm', e.target.value as LegalForm)} required>
            <option value="" disabled>
              {t('auth.register.legalFormPlaceholder')}
            </option>
            {LEGAL_FORMS.map((form) => (
              <option key={form} value={form}>
                {t(`legalForm.${form}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ЕМБС and ЕДБ are different identifiers and stay separate fields. */}
      <div className="form-row">
        <label>
          {t('auth.register.embs')}
          <input
            value={value.embs}
            onChange={(e) => set('embs', e.target.value)}
            inputMode="numeric"
            pattern="\d*"
            title={t('auth.register.digitsOnly')}
            required
          />
        </label>
        <label>
          {t('auth.register.edb')}
          <input
            value={value.edb}
            onChange={(e) => set('edb', e.target.value)}
            inputMode="numeric"
            pattern="\d*"
            title={t('auth.register.digitsOnly')}
            required
          />
        </label>
      </div>

      <label>
        {t('auth.register.registeredAddress')}
        <input value={value.registeredAddress} onChange={(e) => set('registeredAddress', e.target.value)} required />
      </label>

      <fieldset className="field-choice">
        <legend>{t('auth.register.isVatPayer')}</legend>
        <div className="choice-options">
          {[true, false].map((option) => (
            <label key={String(option)} className={value.isVatPayer === option ? 'is-selected' : ''}>
              <input
                type="radio"
                name="isVatPayer"
                checked={value.isVatPayer === option}
                onChange={() => set('isVatPayer', option)}
                required
              />
              {t(option ? 'common.yes' : 'common.no')}
            </label>
          ))}
        </div>
        <span className="field-hint">{t('auth.register.isVatPayerHint')}</span>
      </fieldset>
    </>
  );
}
