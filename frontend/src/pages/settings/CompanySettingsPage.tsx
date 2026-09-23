import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsCard } from '../../components/SettingsCard.tsx';
import { LockIcon } from '../../components/icons.tsx';
import { OwnerSettings } from '../../layouts/SettingsLayout.tsx';
import {
  LEGAL_FORMS,
  VAT_RATES,
  type CompanySettings,
  type CompanySettingsPatch,
  type LegalForm,
} from '../../lib/settings.ts';
import { changedFields, orNull } from './fields.ts';

type Save = (patch: CompanySettingsPatch) => Promise<CompanySettings>;

/** The company as it appears on its documents: details, legal identity, VAT. */
export function CompanySettingsPage() {
  return (
    <OwnerSettings>
      {(settings, { save }) => (
        <>
          <CompanyDetailsCard settings={settings} save={save} />
          <RegistrationCard settings={settings} />
          <VatCard settings={settings} save={save} />
        </>
      )}
    </OwnerSettings>
  );
}

function CompanyDetailsCard({ settings, save }: { settings: CompanySettings; save: Save }) {
  const { t } = useTranslation();
  const [name, setName] = useState(settings.name);
  const [legalForm, setLegalForm] = useState<LegalForm>(settings.legalForm);
  const [address, setAddress] = useState(settings.registeredAddress);
  const [phone, setPhone] = useState(settings.phone ?? '');
  const [website, setWebsite] = useState(settings.website ?? '');

  const patch = changedFields(settings, {
    name: name.trim(),
    legalForm,
    registeredAddress: address.trim(),
    phone: orNull(phone),
    website: orNull(website),
  });

  return (
    <SettingsCard
      title={t('settings.company.detailsTitle')}
      description={t('settings.company.detailsHint')}
      isDirty={Object.keys(patch).length > 0}
      onSave={async () => {
        const saved = await save(patch);
        // The server writes "devshop.mk" as "https://devshop.mk".
        setWebsite(saved.website ?? '');
      }}
    >
      <div className="form-row">
        <label>
          {t('settings.company.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
        </label>
        <label>
          {t('settings.company.legalForm')}
          <select value={legalForm} onChange={(e) => setLegalForm(e.target.value as LegalForm)}>
            {LEGAL_FORMS.map((form) => (
              <option key={form} value={form}>
                {t(`legalForm.${form}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        {t('settings.company.address')}
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={255} required />
      </label>

      <div className="form-row">
        <label>
          {t('settings.company.phone')}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('settings.company.phonePlaceholder')}
            pattern="\+?[\d\s\-\/\(\)]{6,20}"
          />
        </label>
        <label>
          {t('settings.company.website')}
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder={t('settings.company.websitePlaceholder')}
            maxLength={255}
          />
        </label>
      </div>
    </SettingsCard>
  );
}

/** ЕМБС and ЕДБ: shown, never edited — they are on every invoice already issued. */
function RegistrationCard({ settings }: { settings: CompanySettings }) {
  const { t } = useTranslation();

  return (
    <section className="card settings-card">
      <header className="settings-card-head">
        <h2>{t('settings.company.registrationTitle')}</h2>
        <p>{t('settings.company.registrationHint')}</p>
      </header>
      <dl className="settings-readonly">
        <div>
          <dt>{t('settings.company.embs')}</dt>
          <dd className="num">
            {settings.embs}
            <LockIcon />
          </dd>
        </div>
        <div>
          <dt>{t('settings.company.edb')}</dt>
          <dd className="num">
            {settings.edb}
            <LockIcon />
          </dd>
        </div>
      </dl>
    </section>
  );
}

function VatCard({ settings, save }: { settings: CompanySettings; save: Save }) {
  const { t } = useTranslation();
  const [isVatPayer, setIsVatPayer] = useState(settings.isVatPayer);
  const [rate, setRate] = useState(settings.defaultVatRate);

  // The rate only means something for a VAT payer; turning VAT off leaves it as it was.
  const patch: CompanySettingsPatch = isVatPayer
    ? changedFields(settings, { isVatPayer, defaultVatRate: rate })
    : changedFields(settings, { isVatPayer });

  return (
    <SettingsCard
      title={t('settings.vat.title')}
      description={t('settings.vat.hint')}
      isDirty={Object.keys(patch).length > 0}
      onSave={async () => {
        await save(patch);
      }}
    >
      <fieldset className="field-choice">
        <legend>{t('settings.vat.isVatPayer')}</legend>
        <div className="choice-options">
          {[true, false].map((value) => (
            <label key={String(value)} className={isVatPayer === value ? 'is-selected' : ''}>
              <input
                type="radio"
                name="isVatPayer"
                checked={isVatPayer === value}
                onChange={() => setIsVatPayer(value)}
              />
              {t(value ? 'common.yes' : 'common.no')}
            </label>
          ))}
        </div>
      </fieldset>

      {isVatPayer && (
        <label>
          {t('settings.vat.defaultRate')}
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {VAT_RATES.map((option) => (
              <option key={option} value={option}>
                {t('settings.vat.rateOption', { rate: option })}
              </option>
            ))}
          </select>
          <span className="field-hint">{t('settings.vat.defaultRateHint')}</span>
        </label>
      )}
    </SettingsCard>
  );
}
