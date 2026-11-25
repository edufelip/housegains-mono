import {
  accountDeDE,
  accountEnUS,
  accountEsES,
  accountFrFR,
  accountItIT,
  accountPtBR,
} from './account';
import authDeDE from './auth/de-DE';
import authEnUS from './auth/en-US';
import authEsES from './auth/es-ES';
import authFrFR from './auth/fr-FR';
import authItIT from './auth/it-IT';
import authPtBR from './auth/pt-BR';
import { deDE } from './de-DE';
import { enUS } from './en-US';
import { esES } from './es-ES';
import { frFR } from './fr-FR';
import {
  gamificationDeDE,
  gamificationEnUS,
  gamificationEsES,
  gamificationFrFR,
  gamificationItIT,
  gamificationPtBR,
} from './gamification';
import { itIT } from './it-IT';
import { ptBR } from './pt-BR';
import type { SupportedLocale } from '@/localization/core';

export type HouseGainsLocale = SupportedLocale;
export type HouseGainsTranslationDictionary = Record<string, string>;

export const HOUSEGAINS_DICTIONARIES: Record<HouseGainsLocale, HouseGainsTranslationDictionary> = {
  'en-US': { ...enUS, ...authEnUS, ...accountEnUS, ...gamificationEnUS },
  'pt-BR': { ...ptBR, ...authPtBR, ...accountPtBR, ...gamificationPtBR },
  'es-ES': { ...esES, ...authEsES, ...accountEsES, ...gamificationEsES },
  'fr-FR': { ...frFR, ...authFrFR, ...accountFrFR, ...gamificationFrFR },
  'de-DE': { ...deDE, ...authDeDE, ...accountDeDE, ...gamificationDeDE },
  'it-IT': { ...itIT, ...authItIT, ...accountItIT, ...gamificationItIT },
};

function humanizeKey(key: string): string {
  const words = key
    .replace(/^housegains\./, '')
    .replace(/[._-]+/g, ' ')
    .trim();
  return words.length > 0 ? `${words[0].toUpperCase()}${words.slice(1)}` : key;
}

export function translateHouseGains(
  locale: HouseGainsLocale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const template =
    HOUSEGAINS_DICTIONARIES[locale]?.[key] ??
    HOUSEGAINS_DICTIONARIES['en-US'][key] ??
    humanizeKey(key);
  if (!params) return template;
  return Object.entries(params).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template,
  );
}

export { enUS as houseGainsEnUS } from './en-US';
export { ptBR as houseGainsPtBR } from './pt-BR';
export { esES as houseGainsEsES } from './es-ES';

export { frFR as houseGainsFrFR, deDE as houseGainsDeDE, itIT as houseGainsItIT };
