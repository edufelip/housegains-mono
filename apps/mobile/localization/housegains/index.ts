import { useCallback, useMemo } from 'react';
import { useLocale } from '@/localization/locale-context';
import { translateHouseGains, type HouseGainsLocale } from './catalog';

export function useHouseGainsTranslation() {
  const { activeLocale, setActiveLocale } = useLocale();
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translateHouseGains(activeLocale, key, params),
    [activeLocale],
  );
  const setLocale = useCallback(
    (locale: HouseGainsLocale) => setActiveLocale(locale),
    [setActiveLocale],
  );

  return useMemo(() => ({ t, locale: activeLocale, setLocale }), [t, activeLocale, setLocale]);
}

export { translateHouseGains } from './catalog';
export type { HouseGainsLocale, HouseGainsTranslationDictionary } from './catalog';
export {
  houseGainsEnUS,
  houseGainsPtBR,
  houseGainsEsES,
  houseGainsFrFR,
  houseGainsDeDE,
  houseGainsItIT,
} from './catalog';
