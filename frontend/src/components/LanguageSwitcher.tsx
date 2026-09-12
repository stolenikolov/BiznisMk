import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/config.ts';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const handleChange = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
  };

  return (
    <div className="language-switcher" role="group" aria-label="Language">
      {SUPPORTED_LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          className={language === i18n.resolvedLanguage ? 'active' : ''}
          onClick={() => handleChange(language)}
        >
          {i18n.t(`language.${language}`)}
        </button>
      ))}
    </div>
  );
}
