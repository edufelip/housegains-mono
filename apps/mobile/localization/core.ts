import { enUS, type TranslationKey } from './en-US';
import { esES } from './es-ES';
import { getDeviceLocale } from './get-device-locale';
import { ptBR } from './pt-BR';

export type { TranslationKey };

export const SUPPORTED_LOCALES = ['en-US', 'pt-BR', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

type TranslationDictionary = Record<TranslationKey, string>;

const DICTIONARIES: Record<SupportedLocale, TranslationDictionary> = {
  'en-US': enUS,
  'pt-BR': ptBR,
  'es-ES': esES,
  // Archived fitness routes use their original dictionaries; the active HouseGains
  // catalog supplies complete translations for every supported language.
  'fr-FR': enUS,
  'de-DE': enUS,
  'it-IT': enUS,
};

export function resolveLocale(rawLocale?: string): SupportedLocale {
  const normalized = (rawLocale ?? '').trim().replaceAll('_', '-');

  // Safety check for initialization order in circular dependencies
  if (!DICTIONARIES) {
    return 'en-US';
  }

  if (normalized in DICTIONARIES) {
    return normalized as SupportedLocale;
  }

  const lower = normalized.toLowerCase();
  if (lower.startsWith('pt')) {
    return 'pt-BR';
  }

  if (lower.startsWith('es')) {
    return 'es-ES';
  }

  if (lower.startsWith('fr')) return 'fr-FR';
  if (lower.startsWith('de')) return 'de-DE';
  if (lower.startsWith('it')) return 'it-IT';
  return 'en-US';
}

export { getDeviceLocale };

export function t(
  locale: SupportedLocale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES['en-US'];
  const template = dict[key] ?? DICTIONARIES['en-US'][key] ?? key;

  if (!params) {
    return template;
  }

  return Object.entries(params).reduce((acc, [paramKey, value]) => {
    return acc.replaceAll(`{${paramKey}}`, String(value));
  }, template);
}

export type TranslationBinding = {
  locale: SupportedLocale;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

export function buildTranslationBinding(
  locale: SupportedLocale,
  previous?: TranslationBinding | null,
): TranslationBinding {
  if (previous && previous.locale === locale) {
    return previous;
  }

  return {
    locale,
    t: (key: TranslationKey, params?: Record<string, string | number>) => t(locale, key, params),
  };
}

/** Native language names remain recognizable after an accidental language change. */
export const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  'en-US': 'English',
  'pt-BR': 'Português (Brasil)',
  'es-ES': 'Español',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
  'it-IT': 'Italiano',
};
