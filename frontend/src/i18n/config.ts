import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import mkCommon from './locales/mk/common.json';
import enCommon from './locales/en/common.json';

export const SUPPORTED_LANGUAGES = ['mk', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      mk: { common: mkCommon },
      en: { common: enCommon },
    },
    fallbackLng: 'mk',
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: 'common',
    ns: ['common'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Only ever restore an explicit choice made via the language switcher.
      // We deliberately don't auto-detect from the browser locale: this app
      // targets the North Macedonian market and should default to mk.
      order: ['localStorage'],
      caches: ['localStorage'],
    },
  });

export default i18n;
