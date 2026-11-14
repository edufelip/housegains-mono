import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LanguagePicker } from '@/components/housegains/language-picker';
import { ThemePreview } from '@/components/housegains/theme-preview';
import { Button, Label, Screen } from '@/components/housegains/ui';
import { getThemeTokens, useAppearance, type ThemeId } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';

type ThemePickerScreenProps = {
  onContinue: () => void;
};

const OPTIONS: ThemeId[] = ['arcade', 'sticker', 'soft'];

export default function ThemePickerScreen({ onContinue }: ThemePickerScreenProps) {
  const { t } = useHouseGainsTranslation();
  const {
    hydrated,
    selected,
    loadError,
    saveError,
    previewTheme,
    selectTheme,
    retryLoad,
    retrySave,
  } = useAppearance();
  const [choice, setChoice] = useState<ThemeId | null>(selected);
  const [busy, setBusy] = useState(false);
  const hasChosenRef = useRef(false);
  const tokens = getThemeTokens('soft');

  useEffect(() => {
    if (selected && !hasChosenRef.current) {
      setChoice(selected);
      previewTheme(selected);
    }
  }, [previewTheme, selected]);

  const handlePreview = (themeId: ThemeId) => {
    hasChosenRef.current = true;
    setChoice(themeId);
    previewTheme(themeId);
  };

  const handleContinue = async () => {
    if (!choice || busy) return;
    setBusy(true);
    try {
      await selectTheme(choice);
      onContinue();
    } catch {
      // The provider keeps the preview and exposes the retry state.
    } finally {
      setBusy(false);
    }
  };

  const handleRetrySave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await retrySave();
      onContinue();
    } catch {
      // The retry control stays visible while persistence is unavailable.
    } finally {
      setBusy(false);
    }
  };

  const handleRetryLoad = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await retryLoad();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      scrollable={false}
      style={{ backgroundColor: tokens.canvas }}
      testID="housegains.theme-picker"
    >
      <View style={styles.layout}>
        <View style={styles.heading}>
          <Label themeId="soft" variant="title">
            {t('housegains.appearance.title')}
          </Label>
          <Label themeId="soft" variant="body" style={styles.subtitle}>
            {t('housegains.appearance.subtitle')}
          </Label>
        </View>

        <ScrollView
          accessibilityLabel={t('housegains.appearance.preview_hint')}
          contentContainerStyle={styles.optionsList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LanguagePicker themeId="soft" testIDPrefix="housegains.onboarding.language" />
          {OPTIONS.map((themeId) => {
            const selectedOption = choice === themeId;
            const themeName = t(`housegains.theme.${themeId}.name`);
            const description = t(`housegains.theme.${themeId}.description`);
            const optionTokens = getThemeTokens(themeId);
            return (
              <Pressable
                key={themeId}
                accessibilityRole="radio"
                accessibilityLabel={t('housegains.appearance.select', { theme: themeName })}
                accessibilityHint={description}
                accessibilityState={{ selected: selectedOption, disabled: !hydrated }}
                disabled={!hydrated || busy}
                focusable
                onPress={() => handlePreview(themeId)}
                testID={`theme-option.${themeId}`}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: tokens.surface,
                    borderColor: selectedOption ? optionTokens.primary : tokens.border,
                    borderWidth: selectedOption ? 2.5 : 1,
                  },
                  pressed ? styles.optionPressed : null,
                ]}
              >
                <View style={styles.optionHeading}>
                  <View style={styles.optionCopy}>
                    <Label themeId="soft" variant="heading">
                      {themeName}
                    </Label>
                    <Label themeId="soft" variant="caption" style={styles.optionDescription}>
                      {description}
                    </Label>
                  </View>
                  <View
                    style={[
                      styles.selectionMark,
                      {
                        borderColor: selectedOption ? optionTokens.primary : tokens.border,
                        backgroundColor: selectedOption ? optionTokens.primary : 'transparent',
                      },
                    ]}
                  >
                    {selectedOption ? (
                      <Label
                        themeId={themeId}
                        variant="body"
                        style={[styles.selectionGlyph, { color: optionTokens.onPrimary }]}
                      >
                        ✓
                      </Label>
                    ) : null}
                  </View>
                </View>
                {selectedOption ? (
                  <Label themeId="soft" variant="caption" style={styles.selectedLabel}>
                    {t('housegains.appearance.selected')}
                  </Label>
                ) : null}
                <ThemePreview themeId={themeId} style={styles.preview} />
              </Pressable>
            );
          })}

          {loadError ? (
            <View style={[styles.message, { backgroundColor: '#FFF1F0', borderColor: '#B4233B' }]}>
              <Label
                themeId="soft"
                variant="body"
                style={{ color: '#8D1F31' }}
                testID="theme-picker.load-error"
              >
                {t('housegains.appearance.error.load')}
              </Label>
              <Button
                title={t('housegains.appearance.retry_load')}
                onPress={handleRetryLoad}
                disabled={busy}
                variant="outline"
                themeId="soft"
                testID="theme-picker.retry-load"
              />
            </View>
          ) : null}

          {saveError ? (
            <View style={[styles.message, { backgroundColor: '#FFF1F0', borderColor: '#B4233B' }]}>
              <Label
                themeId="soft"
                variant="body"
                style={{ color: '#8D1F31' }}
                testID="theme-picker.save-error"
              >
                {t('housegains.appearance.error.save')}
              </Label>
              <Button
                title={t('housegains.appearance.retry_save')}
                onPress={handleRetrySave}
                disabled={busy}
                variant="outline"
                themeId="soft"
                testID="theme-picker.retry-save"
              />
            </View>
          ) : null}
        </ScrollView>

        <Button
          title={busy ? t('housegains.appearance.saving') : t('housegains.appearance.continue')}
          onPress={handleContinue}
          disabled={!hydrated || !choice || busy}
          themeId="soft"
          testID="theme-picker.continue"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  layout: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 14,
  },
  heading: {
    gap: 7,
  },
  subtitle: {
    maxWidth: 520,
  },
  optionsList: {
    flexGrow: 1,
    gap: 12,
    paddingBottom: 12,
  },
  option: {
    padding: 10,
    borderRadius: 22,
    gap: 8,
  },
  optionPressed: {
    transform: [{ scale: 0.995 }],
  },
  optionHeading: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 3,
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  optionDescription: {
    lineHeight: 18,
  },
  selectionMark: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionGlyph: {
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
  },
  selectedLabel: {
    alignSelf: 'flex-end',
    marginTop: -6,
    marginBottom: -4,
    paddingHorizontal: 6,
  },
  preview: {
    height: 252,
    borderRadius: 18,
  },
  message: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
});
