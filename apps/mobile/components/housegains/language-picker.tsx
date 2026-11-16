import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  getThemeTokens,
  useAppearance,
  type AppearanceTokens,
  type ThemeId,
} from '@/features/appearance';
import { LANGUAGE_NAMES, SUPPORTED_LOCALES, type SupportedLocale } from '@/localization/core';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { Button, Label } from './ui';

export type LanguagePickerLayout = 'chips' | 'list';

export function LanguagePicker({
  testIDPrefix,
  themeId,
  tokens: tokensOverride,
  layout = 'chips',
}: {
  testIDPrefix: string;
  themeId?: ThemeId;
  tokens?: AppearanceTokens;
  layout?: LanguagePickerLayout;
}) {
  const appearance = useAppearance();
  const tokens = tokensOverride ?? (themeId ? getThemeTokens(themeId) : appearance.tokens);
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
  const isList = layout === 'list';
  return (
    <View style={{ gap: 10 }}>
      {isList ? null : (
        <Label tokens={tokensOverride} themeId={themeId} variant="heading">
          {t('housegains.screens.settings.language')}
        </Label>
      )}
      {isList ? (
        <View style={{ gap: 6 }}>
          {SUPPORTED_LOCALES.map((id) => {
            const selected = locale === id;
            const borderWidth = selected ? 2.5 : Math.max(1, tokens.borderWidth);
            return (
              <Pressable
                key={id}
                testID={`${testIDPrefix}.${id}`}
                accessibilityRole="radio"
                accessibilityLabel={t('housegains.screens.settings.selectLanguage', {
                  language: LANGUAGE_NAMES[id],
                })}
                accessibilityState={{ selected, disabled: busy }}
                disabled={busy}
                onPress={() => void select(id)}
                style={{
                  minHeight: 48,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 12,
                  borderRadius: Math.min(tokens.radius, 16),
                  borderWidth,
                  borderColor: selected ? tokens.primary : tokens.border,
                  backgroundColor: tokens.surface,
                }}
              >
                <Label
                  tokens={tokensOverride}
                  themeId={themeId}
                  style={{ fontWeight: selected ? '700' : '400' }}
                >
                  {LANGUAGE_NAMES[id]}
                </Label>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: Math.max(1, tokens.borderWidth),
                    borderColor: selected ? tokens.primary : tokens.border,
                    backgroundColor: selected ? tokens.primary : 'transparent',
                  }}
                >
                  {selected ? (
                    <Label
                      tokens={tokensOverride}
                      themeId={themeId}
                      variant="caption"
                      style={{ fontWeight: '700', color: tokens.onPrimary }}
                    >
                      ✓
                    </Label>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
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
                tokens={tokensOverride}
                themeId={themeId}
                style={{ fontWeight: '700', color: locale === id ? tokens.onPrimary : tokens.text }}
              >
                {LANGUAGE_NAMES[id]}
              </Label>
            </Pressable>
          ))}
        </View>
      )}
      {retryLocale ? (
        <View style={{ gap: 8 }}>
          <Label
            tokens={tokensOverride}
            themeId={themeId}
            accessibilityLiveRegion="polite"
            style={{ color: tokens.danger }}
          >
            {t('housegains.screens.common.actionError')}
          </Label>
          <Button
            tokens={tokensOverride}
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
