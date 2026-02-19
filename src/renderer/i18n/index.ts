import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';

export const supportedLanguages = [
  { code: 'auto', name: 'Auto (follow system)', nativeName: 'Auto (follow system)' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
];

// Map system locale to supported language
function getLanguageFromLocale(locale: string): string {
  // Handle special cases
  if (locale.startsWith('zh')) {
    // Check for Traditional Chinese
    if (locale === 'zh-TW' || locale === 'zh-HK' || locale === 'zh-MO') {
      return 'zh-TW';
    }
    return 'zh-CN';
  }

  const lang = locale.split('-')[0];

  // Check if we have direct support
  const supported = supportedLanguages.find(l => l.code === lang);
  if (supported) {
    return lang;
  }

  // Map similar locales
  const localeMap: Record<string, string> = {
    'ja': 'ja',
    'ko': 'ko',
    'es': 'es',
    'fr': 'fr',
    'de': 'de',
    'pt': 'pt',
    'ru': 'ru',
  };

  return localeMap[lang] || 'en';
}

const resources = {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
  ja: { translation: ja },
  ko: { translation: ko },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  ru: { translation: ru },
};

export async function initI18n(uiLanguage: string): Promise<typeof i18n> {
  let language = 'en';

  if (uiLanguage === 'auto') {
    try {
      const systemLocale = await window.api.app.getSystemLocale();
      language = getLanguageFromLocale(systemLocale);
    } catch {
      language = 'en';
    }
  } else if (supportedLanguages.find(l => l.code === uiLanguage)) {
    language = uiLanguage;
  }

  await i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: language,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
    });

  return i18n;
}

export function changeLanguage(language: string): Promise<void> {
  if (language === 'auto') {
    return window.api.app.getSystemLocale().then(locale => {
      const resolved = getLanguageFromLocale(locale);
      return i18n.changeLanguage(resolved);
    });
  }
  return i18n.changeLanguage(language);
}

export default i18n;
