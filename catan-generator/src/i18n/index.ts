import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import nb from './locales/nb.json';

export type AppLocale = 'en' | 'nb';

const STORAGE_KEY = 'hex-settlement-locale-v1';

export function readStoredLocale(): AppLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'en' || raw === 'nb') return raw;
  } catch {
    // ignore
  }
  return null;
}

export function persistLocale(locale: AppLocale): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

export function applyDocumentLang(locale: AppLocale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale === 'nb' ? 'nb' : 'en';
  document.title = locale === 'nb' ? 'Hex Settlement Coach' : 'Hex Settlement Coach';
}

const initial = readStoredLocale() ?? 'en';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    nb: { translation: nb },
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

applyDocumentLang(initial);

export async function setAppLocale(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  persistLocale(locale);
  applyDocumentLang(locale);
}

export default i18n;
