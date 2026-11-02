import React, { createContext, useContext, useState } from 'react';
import enTranslations from './en/common.json';
import hiTranslations from './hi/common.json';
import knTranslations from './kn/common.json';

export type SupportedLanguage = 'en' | 'hi' | 'kn';

interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  getLocalizedSeverity: (severity: string) => string;
}

const translations: Record<SupportedLanguage, Record<string, any>> = {
  en: enTranslations,
  hi: hiTranslations,
  kn: knTranslations,
};

const I18nContext = createContext<I18nContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key: string) => key,
  getLocalizedSeverity: (s: string) => s,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem('preferred_language');
    if (saved === 'hi' || saved === 'kn' || saved === 'en') {
      return saved;
    }
    return 'en';
  });

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    localStorage.setItem('preferred_language', lang);
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let current: any = translations[language];

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        // Fallback to English
        let fallback: any = translations.en;
        for (const fbKey of keys) {
          if (fallback && typeof fallback === 'object' && fbKey in fallback) {
            fallback = fallback[fbKey];
          } else {
            return key;
          }
        }
        current = fallback;
        break;
      }
    }

    if (typeof current !== 'string') {
      return key;
    }

    let result = current;
    if (params) {
      Object.entries(params).forEach(([paramKey, val]) => {
        result = result.replace(new RegExp(`{${paramKey}}`, 'g'), String(val));
      });
    }

    return result;
  };

  const getLocalizedSeverity = (severity: string): string => {
    const upper = severity.toUpperCase();
    return t(`severity.${upper}`);
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, getLocalizedSeverity }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
