import type { HouseGainsLocale } from '@/localization/housegains';

export type LegalPage = 'privacy' | 'terms';

const LEGAL_PATH: Record<HouseGainsLocale, string> = {
  'en-US': '',
  'pt-BR': '/pt-BR',
  'es-ES': '/es-ES',
  'fr-FR': '/fr-FR',
  'de-DE': '/de-DE',
  'it-IT': '/it-IT',
};

/** English lives at the root path; every other language has its own prefix (/pt-BR/privacy). */
export function legalUrl(locale: HouseGainsLocale, page: LegalPage): string {
  return `https://housegains.app${LEGAL_PATH[locale]}/${page}`;
}
