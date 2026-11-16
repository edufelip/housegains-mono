import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { LanguagePicker } from '@/components/housegains/language-picker';
import { PHONE_ASPECT, PhonePreview } from '@/components/housegains/phone-preview';
import { Button, Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import {
  isDarkColor,
  resolvePickerCopy,
  statusBarStyleFor,
} from '@/features/appearance/picker-config';
import { LANGUAGE_NAMES } from '@/localization/core';
import { useHouseGainsTranslation } from '@/localization/housegains';
import type { PickerStyle } from '@/features/appearance/picker-config-types';

type ThemePickerScreenProps = {
  onContinue: () => void;
};

/** Horizontal space taken by the Previous and Next buttons around the phone. */
const SIDE_CONTROL_SPACE = 54;

export default function ThemePickerScreen({ onContinue }: ThemePickerScreenProps) {
  const { hydrated, styles, loadError, saveError, previewTheme, selectTheme, retryLoad } =
    useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const insets = useSafeAreaInsets();

  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const pagerRef = useRef<ScrollView>(null);
  const [pagerWidth, setPagerWidth] = useState(0);
  const [sample, setSample] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  // Set synchronously so two taps before a re-render cannot start two saves.
  const busyRef = useRef(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Keep the page inside the list if the styles shrink.
  useEffect(() => {
    if (page <= styles.length - 1) return;
    const last = Math.max(0, styles.length - 1);
    pageRef.current = last;
    setPage(last);
  }, [page, styles.length]);

  const activeIndex = Math.min(page, Math.max(0, styles.length - 1));
  const sheetStyle = styles[activeIndex];

  // Only swiping and Previous/Next move the page. Each move previews that style; nothing saves here.
  const showPage = (index: number) => {
    pageRef.current = index;
    setPage(index);
    previewTheme(styles[index].id);
    AccessibilityInfo.announceForAccessibility(
      `${t('housegains.appearance.page_position', { index: index + 1, total: styles.length })}: ${resolvePickerCopy(styles[index].copy.name, locale, t)}`,
    );
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pagerWidth <= 0) return;
    const index = Math.min(
      styles.length - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.x / pagerWidth)),
    );
    if (index !== pageRef.current) showPage(index);
  };

  const goTo = (index: number) => {
    if (busy || index < 0 || index >= styles.length || index === pageRef.current) return;
    pagerRef.current?.scrollTo({ x: index * pagerWidth, y: 0, animated: !reduceMotion });
    showPage(index);
  };

  const runLocked = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // The only place that saves; Retry save uses it too, with the failed page's own style.
  // A failure keeps the user on this page.
  const choose = (id: string) =>
    runLocked(async () => {
      setFailedId(null);
      setSavingId(id);
      try {
        await selectTheme(id);
        onContinue();
      } catch {
        setFailedId(id);
      } finally {
        setSavingId(null);
      }
    });

  const reloadPreference = () => runLocked(() => retryLoad());

  const closeSheet = () => setSheetOpen(false);

  const handleSampleLayout = (w: number, h: number) => {
    setSample((current) => (current.w === w && current.h === h ? current : { w, h }));
  };

  const renderPage = (style: PickerStyle, index: number) => {
    const k = style.tokens;
    const isCurrent = index === activeIndex;
    const sticker = style.composition === 'sticker';
    const name = resolvePickerCopy(style.copy.name, locale, t);
    const description = resolvePickerCopy(style.copy.description, locale, t);
    const previous = index > 0 ? styles[index - 1] : null;
    const next = index < styles.length - 1 ? styles[index + 1] : null;
    const previousName = previous ? resolvePickerCopy(previous.copy.name, locale, t) : null;
    const nextName = next ? resolvePickerCopy(next.copy.name, locale, t) : null;
    const languageName = LANGUAGE_NAMES[locale].replace(' (Brasil)', '');
    const phoneHeight = Math.max(
      300,
      Math.min(sample.h, (sample.w - 2 * SIDE_CONTROL_SPACE) / PHONE_ASPECT, 560),
    );
    const dotColor = isDarkColor(k.canvas) ? '#30363D' : sticker ? '#8A8574' : k.border;
    const showSaveError = saveError && failedId === style.id;
    const retrying = showSaveError && !busy;
    const chooseTitle = retrying
      ? t('housegains.appearance.retry_save')
      : busy && savingId === style.id
        ? t('housegains.appearance.saving')
        : t('housegains.appearance.choose', { theme: name });

    const nameStyle: TextStyle =
      style.nameTreatment === 'accent'
        ? { fontFamily: k.typography.bold, fontSize: 36, lineHeight: 44, color: k.primary }
        : style.nameTreatment === 'sticker'
          ? { fontFamily: k.typography.bold, fontSize: 36, lineHeight: 44, color: k.text }
          : {
              fontFamily: style.headingFont === 'serif' ? k.typography.heading : k.typography.body,
              fontWeight: '400',
              fontSize: 36,
              lineHeight: 44,
              color: k.text,
            };

    const nameText = <Text style={nameStyle}>{name}</Text>;

    return (
      <SafeAreaView
        key={style.id}
        edges={['top', 'bottom']}
        testID={`theme-page.${style.id}`}
        accessibilityLabel={`${t('housegains.appearance.page_position', {
          index: index + 1,
          total: styles.length,
        })}: ${name}`}
        accessibilityElementsHidden={!isCurrent}
        importantForAccessibility={isCurrent ? 'auto' : 'no-hide-descendants'}
        style={[pickerStyles.page, { width: pagerWidth, backgroundColor: k.canvas }]}
      >
        <ScrollView
          style={pickerStyles.fill}
          contentContainerStyle={pickerStyles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={pickerStyles.topRow}>
            <Label
              tokens={k}
              variant="eyebrow"
              accessibilityRole="header"
              style={pickerStyles.eyebrow}
            >
              {t('housegains.appearance.title')}
            </Label>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('housegains.appearance.language_button', {
                language: languageName,
              })}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => setSheetOpen(true)}
              testID={`theme-picker.language.${style.id}`}
              style={[
                pickerStyles.languageButton,
                {
                  borderRadius: Math.min(k.radius, 22),
                  borderWidth: k.borderWidth,
                  borderColor: k.border,
                  backgroundColor: k.surface,
                },
                sticker ? pickerStyles.stickerShadow : null,
                busy ? pickerStyles.disabled : null,
              ]}
            >
              <GlobeIcon color={k.text} />
              <Label
                tokens={k}
                variant="caption"
                style={[pickerStyles.languageText, { color: k.text }]}
              >
                {languageName}
              </Label>
            </Pressable>
          </View>

          {style.nameTreatment === 'sticker' ? (
            <View
              style={[
                pickerStyles.stickerName,
                { backgroundColor: k.accent, borderColor: k.border, shadowColor: k.border },
              ]}
            >
              {nameText}
            </View>
          ) : (
            nameText
          )}

          <Label tokens={k} variant="body">
            {description}
          </Label>

          <View
            style={pickerStyles.sampleArea}
            onLayout={(event) =>
              handleSampleLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)
            }
          >
            <View style={pickerStyles.sampleRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  previousName
                    ? `${t('housegains.appearance.previous')}: ${previousName}`
                    : t('housegains.appearance.previous')
                }
                accessibilityState={{ disabled: !previous || busy }}
                disabled={!previous || busy}
                onPress={() => goTo(index - 1)}
                testID={`theme-picker.previous.${style.id}`}
                style={[
                  pickerStyles.arrow,
                  {
                    borderWidth: Math.max(1, k.borderWidth),
                    borderColor: k.border,
                    backgroundColor: k.surface,
                  },
                  !previous || busy ? pickerStyles.dimmed : null,
                ]}
              >
                <Text style={[pickerStyles.arrowGlyph, { color: k.text }]}>‹</Text>
              </Pressable>

              <View>
                <PhonePreview
                  styleId={style.id}
                  composition={style.composition}
                  tokens={k}
                  height={phoneHeight}
                  accessibilityLabel={`${t('housegains.appearance.preview_hint')}: ${name}`}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  nextName
                    ? `${t('housegains.appearance.next')}: ${nextName}`
                    : t('housegains.appearance.next')
                }
                accessibilityState={{ disabled: !next || busy }}
                disabled={!next || busy}
                onPress={() => goTo(index + 1)}
                testID={`theme-picker.next.${style.id}`}
                style={[
                  pickerStyles.arrow,
                  {
                    borderWidth: Math.max(1, k.borderWidth),
                    borderColor: k.border,
                    backgroundColor: k.surface,
                  },
                  !next || busy ? pickerStyles.dimmed : null,
                ]}
              >
                <Text style={[pickerStyles.arrowGlyph, { color: k.text }]}>›</Text>
              </Pressable>
            </View>
          </View>

          <Label tokens={k} variant="caption" style={pickerStyles.note}>
            {t('housegains.appearance.subtitle')}
          </Label>
        </ScrollView>

        <View
          style={[
            pickerStyles.bottom,
            { backgroundColor: k.canvas, borderTopColor: k.border, paddingBottom: 12 },
          ]}
        >
          <View
            style={pickerStyles.dots}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {styles.map((dot, dotIndex) => {
              const current = dotIndex === index;
              return (
                <View
                  key={dot.id}
                  style={[
                    pickerStyles.dot,
                    current ? pickerStyles.dotActive : null,
                    { backgroundColor: current ? k.primary : dotColor },
                  ]}
                />
              );
            })}
          </View>

          <ScrollView
            style={pickerStyles.bottomScroll}
            contentContainerStyle={pickerStyles.bottomContent}
          >
            <Label tokens={k} variant="caption" style={pickerStyles.centered}>
              {t('housegains.appearance.swipe_hint', { count: styles.length })}
            </Label>

            {loadError ? (
              <View
                testID="theme-picker.load-error"
                style={[
                  pickerStyles.banner,
                  {
                    backgroundColor: k.surface,
                    borderColor: style.composition === 'sticker' ? k.border : k.danger,
                    borderWidth: Math.max(1.5, k.borderWidth),
                  },
                ]}
              >
                <View style={pickerStyles.bannerRow}>
                  <ErrorBadge composition={style.composition} color={k.danger} />
                  <Label
                    tokens={k}
                    variant="body"
                    accessibilityLiveRegion="polite"
                    style={pickerStyles.bannerText}
                  >
                    {t('housegains.appearance.error.load')}
                  </Label>
                </View>
                <Button
                  tokens={k}
                  variant="outline"
                  title={t('housegains.appearance.retry_load')}
                  onPress={() => void reloadPreference()}
                  disabled={busy}
                  testID="theme-picker.retry-load"
                />
              </View>
            ) : null}

            {showSaveError ? (
              <View
                testID="theme-picker.save-error"
                style={[
                  pickerStyles.banner,
                  {
                    backgroundColor: k.surface,
                    borderColor: sticker ? k.border : k.danger,
                    borderWidth: Math.max(1.5, k.borderWidth),
                  },
                ]}
              >
                <View style={pickerStyles.bannerRow}>
                  <ErrorBadge composition={style.composition} color={k.danger} />
                  <Label
                    tokens={k}
                    variant="body"
                    accessibilityLiveRegion="polite"
                    style={pickerStyles.bannerText}
                  >
                    {t('housegains.appearance.error.save')}
                  </Label>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <Button
            tokens={k}
            testID={`theme-choose.${style.id}`}
            title={chooseTitle}
            onPress={() => void choose(style.id)}
            disabled={!hydrated || busy}
          />
        </View>
      </SafeAreaView>
    );
  };

  return (
    <View testID="housegains.theme-picker" style={pickerStyles.root}>
      {sheetStyle ? <StatusBar style={statusBarStyleFor(sheetStyle.tokens.canvas)} /> : null}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!busy && !sheetOpen}
        testID="theme-picker.pager"
        onLayout={(event) => setPagerWidth(event.nativeEvent.layout.width)}
        onMomentumScrollEnd={handleMomentumEnd}
        style={pickerStyles.pager}
      >
        {styles.map((style, index) => renderPage(style, index))}
      </ScrollView>

      <Modal
        transparent
        visible={sheetOpen}
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={closeSheet}
      >
        <View style={pickerStyles.sheetRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('housegains.appearance.language_done')}
            onPress={closeSheet}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,16,35,0.42)' }]}
          />
          <View
            testID="theme-picker.language-sheet"
            accessibilityViewIsModal
            style={[
              pickerStyles.sheet,
              {
                backgroundColor: sheetStyle.tokens.surface,
                paddingBottom: 18 + insets.bottom,
              },
              sheetStyle.composition === 'sticker'
                ? { borderWidth: 2.5, borderColor: '#111111' }
                : null,
            ]}
          >
            <View style={pickerStyles.sheetHeader}>
              <Label tokens={sheetStyle.tokens} variant="heading">
                {t('housegains.screens.settings.language')}
              </Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('housegains.appearance.language_done')}
                onPress={closeSheet}
                testID="theme-picker.language.done"
                style={pickerStyles.doneButton}
              >
                <Label
                  tokens={sheetStyle.tokens}
                  variant="body"
                  style={{ fontWeight: '700', color: sheetStyle.tokens.primary }}
                >
                  {t('housegains.appearance.language_done')}
                </Label>
              </Pressable>
            </View>
            <LanguagePicker
              layout="list"
              tokens={sheetStyle.tokens}
              testIDPrefix="housegains.onboarding.language"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function GlobeIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" color={color} accessibilityElementsHidden>
      <Circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <Path d="M1.5 8H14.5" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <Path
        d="M8 1.5C5.2 4.2 5.2 11.8 8 14.5C10.8 11.8 10.8 4.2 8 1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

function ErrorBadge({
  composition,
  color,
}: {
  composition: PickerStyle['composition'];
  color: string;
}) {
  const glyph =
    composition === 'sticker' ? '#141414' : composition === 'arcade' ? '#0D1117' : '#FFFFFF';
  return (
    <View style={[pickerStyles.badge, { backgroundColor: color }]}>
      <Text style={[pickerStyles.badgeGlyph, { color: glyph }]}>!</Text>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  languageButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  languageText: {
    fontWeight: '700',
  },
  stickerShadow: {
    shadowColor: '#111111',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  },
  stickerName: {
    alignSelf: 'flex-start',
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2.5,
    transform: [{ rotate: '-2deg' }],
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  },
  sampleArea: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
  },
  sampleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowGlyph: {
    fontSize: 20,
    lineHeight: 24,
  },
  dimmed: {
    opacity: 0.3,
  },
  disabled: {
    opacity: 0.52,
  },
  note: {
    textAlign: 'center',
  },
  bottom: {
    maxHeight: '62%',
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 10,
    borderTopWidth: 1,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 22,
  },
  bottomScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bottomContent: {
    gap: 10,
  },
  centered: {
    textAlign: 'center',
  },
  banner: {
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerText: {
    flex: 1,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeGlyph: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  doneButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
