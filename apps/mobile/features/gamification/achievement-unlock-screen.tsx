import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { AchievementMedal } from '@/components/housegains/gamification/achievement-medal';
import { MOTION, timed, useMotionReduced } from '@/components/housegains/gamification/motion';
import { ParticleBurst } from '@/components/housegains/gamification/particles';
import { Button, Label, Screen } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import {
  achievementDescriptionKey,
  achievementEntry,
  achievementNameKey,
  amountKey,
  tierKey,
  UNKNOWN_ACHIEVEMENT_ICON,
} from './gamification-catalog';
import type { Celebration } from './types';

export type AchievementUnlockScreenProps = {
  celebration: Celebration;
  onContinue: () => void;
  testID?: string;
};

/**
 * The full-screen achievement unlock (at most one per app session). The medal scales up from 0.4 and
 * turns once, the tier ring draws in, confetti falls for 1.6 s and the button becomes active at 400 ms.
 * Reduced motion: the final card cross-fades in, with no spin and no confetti.
 */
export function AchievementUnlockScreen({
  celebration,
  onContinue,
  testID = 'housegains.gamification.unlock',
}: AchievementUnlockScreenProps) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const reduced = useMotionReduced();
  const [ready, setReady] = useState(false);
  const fade = useSharedValue(reduced ? 0 : 1);
  const achievementId = celebration.achievementId ?? '';
  const entry = achievementEntry(achievementId);
  const tier = celebration.tier ?? 'bronze';
  const name = t(achievementNameKey(achievementId));
  const tierName = t(tierKey(tier));
  const announcement = t('housegains.gamification.unlock.a11y', { name, tier: tierName });

  useEffect(() => {
    if (reduced) fade.value = timed(1, MOTION.fade);
    void AccessibilityInfo.announceForAccessibility(announcement);
    const timer = setTimeout(() => setReady(true), MOTION.unlockButtonDelay);
    return () => clearTimeout(timer);
  }, [announcement, fade, reduced]);

  const cardStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    // The overlay is modal for screen readers: focus stays on the unlock until Continue.
    <View accessibilityViewIsModal style={styles.overlay} testID={testID}>
      <Screen
        contentContainerStyle={{
          alignItems: 'center',
          flexGrow: 1,
          gap: tokens.spacing.lg,
          justifyContent: 'center',
          padding: tokens.spacing.xl,
        }}
        scrollable
      >
        <Animated.View
          style={[{ alignItems: 'center', gap: tokens.spacing.lg, width: '100%' }, cardStyle]}
        >
          <Label variant="eyebrow">{t('housegains.gamification.unlock.eyebrow')}</Label>
          <View style={styles.medalStage}>
            <AchievementMedal
              animate
              icon={entry?.icon ?? UNKNOWN_ACHIEVEMENT_ICON}
              size={168}
              testID={`${testID}.medal`}
              tier={tier}
            />
            <ParticleBurst
              count={18}
              distance={420}
              durationMs={MOTION.confetti}
              mode="fall"
              testID={`${testID}.confetti`}
            />
          </View>
          <Label accessibilityRole="header" style={{ textAlign: 'center' }} variant="title">
            {name}
          </Label>
          <View
            style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.xs }}
            testID={`${testID}.tier`}
          >
            <Ionicons color={tokens.primary} name="ribbon-outline" size={tokens.iconSize.md} />
            <Label>{t('housegains.gamification.tier.label', { tier: tierName })}</Label>
          </View>
          <Label style={{ textAlign: 'center' }} variant="caption">
            {t(achievementDescriptionKey(achievementId))}
          </Label>
          {celebration.amount !== undefined && celebration.amount > 0 ? (
            <Label testID={`${testID}.reward`} variant="heading">
              {t(amountKey(celebration.track), { amount: celebration.amount })}
            </Label>
          ) : null}
        </Animated.View>
        <Button
          disabled={!ready}
          onPress={onContinue}
          testID={`${testID}.continue`}
          title={t('housegains.gamification.unlock.continue')}
        />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  medalStage: { alignItems: 'center', height: 190, justifyContent: 'center', width: '100%' },
});
