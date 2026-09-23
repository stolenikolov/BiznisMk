import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n/config.ts';

/** Each language under its own name, so it can be found whatever the app is showing now. */
const NATIVE_NAMES: Record<(typeof SUPPORTED_LANGUAGES)[number], string> = {
  mk: 'Македонски',
  en: 'English',
};

/**
 * The app's language. It applies as soon as it is picked — there is nothing
 * to save — and i18next keeps the choice in this browser.
 */
export function LanguageSettingsPage() {
  const { t, i18n } = useTranslation();

  return (
    <section className="card settings-card">
      <header className="settings-card-head">
        <h2>{t('settings.language.title')}</h2>
        <p>{t('settings.language.hint')}</p>
      </header>

      <div className="choice-options" role="radiogroup" aria-label={t('settings.language.title')}>
        {SUPPORTED_LANGUAGES.map((language) => {
          const isSelected = language === i18n.resolvedLanguage;
          return (
            <label key={language} className={isSelected ? 'is-selected' : ''} lang={language}>
              <input
                type="radio"
                name="language"
                checked={isSelected}
                onChange={() => void i18n.changeLanguage(language)}
              />
              {NATIVE_NAMES[language]}
            </label>
          );
        })}
      </div>
    </section>
  );
}
