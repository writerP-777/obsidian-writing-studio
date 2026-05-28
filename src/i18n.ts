import i18next from 'i18next';
import type { TOptions } from 'i18next';
import { getLanguage } from 'obsidian';
import en from './i18n/en.json';
import zh from './i18n/zh.json';
import hi from './i18n/hi.json';
import es from './i18n/es.json';
import ar from './i18n/ar.json';
import fr from './i18n/fr.json';
import bn from './i18n/bn.json';
import ptBR from './i18n/pt-BR.json';
import ru from './i18n/ru.json';
import ja from './i18n/ja.json';
import de from './i18n/de.json';
import ko from './i18n/ko.json';

export function initI18n(): void {
  const lang = getLanguage();
  void i18next.init({
    lng: lang,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      zh: { translation: zh },
      hi: { translation: hi },
      es: { translation: es },
      ar: { translation: ar },
      fr: { translation: fr },
      bn: { translation: bn },
      'pt-BR': { translation: ptBR },
      ru: { translation: ru },
      ja: { translation: ja },
      de: { translation: de },
      ko: { translation: ko },
    },
    interpolation: { escapeValue: false },
  });
}

export function t(key: string, vars?: TOptions): string {
  return String(i18next.t(key, vars));
}
