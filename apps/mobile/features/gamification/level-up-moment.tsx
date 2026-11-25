import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  ReduceMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOTION, timed, useMotionReduced } from '@/components/housegains/gamification/motion';
import { ProgressRing } from '@/components/housegains/gamification/progress-ring';
import { Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { memberTitleKey, organizerTitleKeyForLevel } from './levels';
import type { Track } from './types';

export type LevelUpMomentProps = {
  level: number;
  /** `zelo` frames the moment as the house organizer's level-up, with the organizer title. */
  track?: Track;
  onDismiss: () => void;
  testID?: string;
};

/**
 * Level-up moment: the ring fills to 100 %, resets and the new number flips in (800 ms total).
 * Reduced motion: a static card with the new level. It stays 3 s either way and never blocks the screen.
 */
export function LevelUpMoment({
  level,
  track = 'ganhos',
  onDismiss,
  testID = 'housegains.gamification.level',
}: LevelUpMomentProps) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  const ring = useSharedValue(0);
  const flip = useSharedValue(1);
  const [shownLevel, setShownLevel] = useState(reduced ? level : Math.max(1, level - 1));
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const organizer = track === 'zelo';
  const title = organizer
    ? t(`housegains.gamification.organizer.rank.${organizerTitleKeyForLevel(level)}`)
    : t(`housegains.screens.dashboard.title.${memberTitleKey(level)}`);
  const headline = t('housegains.gamification.level.title', { level });
  const levelAnnouncement = t('housegains.gamification.level.announce', { level });
  const announcement = organizer
    ? `${t('housegains.gamification.organizer.title')}. ${levelAnnouncement}`
    : levelAnnouncement;

  useEffect(() => {
    void AccessibilityInfo.announceForAccessibility(announcement);
    let swap: ReturnType<typeof setTimeout> | undefined;
    if (reduced) {
      setShownLevel(level);
    } else {
      const half = MOTION.levelRing / 2;
      // Fill to 100 %, reset, then flip the new number in.
      ring.value = withSequence(
        timed(1, half),
        withTiming(0, { duration: 0, reduceMotion: ReduceMotion.System }),
      );
      flip.value = withSequence(
        withTiming(1, { duration: half, reduceMotion: ReduceMotion.System }),
        timed(0, half / 2),
        timed(1, half / 2),
      );
      swap = setTimeout(() => setShownLevel(level), half + half / 2);
    }
    const done = setTimeout(() => dismiss.current(), MOTION.toastHoldReduced);
    return () => {
      if (swap) clearTimeout(swap);
      clearTimeout(done);
    };
  }, [announcement, flip, level, reduced, ring]);

  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: flip.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.layer,
        { paddingHorizontal: tokens.layout.gutter, paddingTop: insets.top + tokens.spacing.xs },
      ]}
    >
      <Pressable
        accessibilityHint={t('housegains.gamification.toast.dismiss')}
        accessibilityLabel={announcement}
        accessibilityLiveRegion="polite"
        accessibilityRole="button"
        onPress={() => dismiss.current()}
        style={{
          alignItems: 'center',
          backgroundColor: tokens.surface,
          borderColor: tokens.border,
          borderRadius: tokens.radius,
          borderWidth: tokens.borderWidth,
          elevation: tokens.shadow.elevation,
          flexDirection: 'row',
          gap: tokens.spacing.md,
          maxWidth: tokens.layout.maxContentWidth,
          padding: tokens.spacing.md,
          shadowColor: tokens.shadow.color,
          shadowOffset: tokens.shadow.offset,
          shadowOpacity: tokens.shadow.opacity,
          shadowRadius: tokens.shadow.radius,
          width: '100%',
        }}
        testID={testID}
      >
        <ProgressRing
          color={tokens.primary}
          progress={ring}
          size={72}
          strokeWidth={7}
          trackColor={tokens.border}
        >
          <Animated.View style={numberStyle}>
            <Label testID={`${testID}.number`} variant="heading">
              {shownLevel}
            </Label>
          </Animated.View>
        </ProgressRing>
        <View style={{ flex: 1, gap: tokens.spacing.xxs }}>
          {organizer ? (
            <Label testID={`${testID}.organizer`} variant="caption">
              {t('housegains.gamification.organizer.title')}
            </Label>
          ) : null}
          <Label testID={`${testID}.title`} variant="heading">
            {headline}
          </Label>
          <Label variant="caption">{t('housegains.gamification.level.titleLine', { title })}</Label>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
});
