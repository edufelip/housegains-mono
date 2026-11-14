import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { getThemeTokens, useAppearance, type ThemeId } from '@/features/appearance';
import { LANGUAGE_NAMES, SUPPORTED_LOCALES, type SupportedLocale } from '@/localization/core';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { Button, Label } from './ui';

export function LanguagePicker({
  testIDPrefix,
  themeId,
}: {
  testIDPrefix: string;
  themeId?: ThemeId;
}) {
  const appearance = useAppearance();
  const tokens = getThemeTokens(themeId ?? appearance.themeId);
  const { t, locale, setLocale } = useHouseGainsTranslation();
  const [busy, setBusy] = useState(false);
  const [retryLocale, setRetryLocale] = useState<SupportedLocale | null>(null);
  const select = async (next: SupportedLocale) => {
    if (busy) return;
    if (next === locale) {
      setRetryLocale(null);
      return;
    }
    setBusy(true);
    setRetryLocale(null);
    try {
      await setLocale(next);
    } catch {
      setRetryLocale(next);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Label themeId={themeId} variant="heading">
        {t('housegains.screens.settings.language')}
      </Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SUPPORTED_LOCALES.map((id) => (
          <Pressable
            key={id}
            testID={`${testIDPrefix}.${id}`}
            accessibilityRole="radio"
            accessibilityLabel={t('housegains.screens.settings.selectLanguage', {
              language: LANGUAGE_NAMES[id],
            })}
            accessibilityState={{ selected: locale === id, disabled: busy }}
            disabled={busy}
            onPress={() => void select(id)}
            style={{
              minHeight: 48,
              justifyContent: 'center',
              paddingHorizontal: 13,
              paddingVertical: 8,
              borderRadius: tokens.radius,
              borderWidth: tokens.borderWidth,
              borderColor: tokens.border,
              backgroundColor: locale === id ? tokens.primary : tokens.surface,
            }}
          >
            <Label
              themeId={themeId}
              style={{ fontWeight: '700', color: locale === id ? tokens.onPrimary : tokens.text }}
            >
              {LANGUAGE_NAMES[id]}
            </Label>
          </Pressable>
        ))}
      </View>
      {retryLocale ? (
        <View style={{ gap: 8 }}>
          <Label
            themeId={themeId}
            accessibilityLiveRegion="polite"
            style={{ color: tokens.danger }}
          >
            {t('housegains.screens.common.actionError')}
          </Label>
          <Button
            themeId={themeId}
            testID={`${testIDPrefix}.retry`}
            title={t('housegains.screens.common.retry')}
            disabled={busy}
            onPress={() => void select(retryLocale)}
          />
        </View>
      ) : null}
    </View>
  );
}
