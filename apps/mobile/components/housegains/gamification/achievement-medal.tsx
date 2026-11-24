import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useAppearance, type AppearanceTokens } from '@/features/appearance';
import { tierPips } from '@/features/gamification/gamification-catalog';
import { MOTION, timed, useMotionReduced } from './motion';
import { ProgressRing } from './progress-ring';
import type { Tier } from '@/features/gamification/types';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Tier colors come from the theme: bronze = accent, silver = muted, gold = primary. */
export function tierColor(tier: Tier, tokens: AppearanceTokens): string {
  return tier === 'gold' ? tokens.primary : tier === 'silver' ? tokens.muted : tokens.accent;
}

export type AchievementMedalProps = {
  icon: IconName;
  /** Undefined draws the locked medal. */
  tier?: Tier;
  size: number;
  /** Unlock animation: scale from 0.4 with one 360° turn, ring draws in. Static with reduced motion. */
  animate?: boolean;
  /** Dimmed medal for an active badge that lapsed. */
  paused?: boolean;
  testID?: string;
};

/**
 * Medal for an achievement: icon in a disc, a tier ring and 1 to 3 pips (the tier is never color
 * alone). Decorative: the name and tier are always rendered as text by the caller.
 */
export function AchievementMedal({
  icon,
  tier,
  size,
  animate = false,
  paused = false,
  testID,
}: AchievementMedalProps) {
  const { tokens } = useAppearance();
  const reduced = useMotionReduced();
  const animated = animate && !reduced;
  const scale = useSharedValue(animated ? 0.4 : 1);
  const turn = useSharedValue(0);
  const ringColor = tier && !paused ? tierColor(tier, tokens) : tokens.muted;
  const strokeWidth = Math.max(4, Math.round(size / 14));

  useEffect(() => {
    if (!animated) return;
    scale.value = 0.4;
    turn.value = 0;
    scale.value = timed(1, MOTION.medal);
    turn.value = timed(1, MOTION.medal);
  }, [animated, scale, turn]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${turn.value * 360}deg` }],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.wrap}
      testID={testID}
    >
      <Animated.View style={style}>
        <ProgressRing
          color={ringColor}
          durationMs={animated ? MOTION.ring : 0}
          fraction={tier ? 1 : 0}
          size={size}
          strokeWidth={strokeWidth}
          trackColor={tokens.border}
        >
          <View
            style={{
              alignItems: 'center',
              backgroundColor: tokens.surface,
              borderRadius: size,
              height: size - strokeWidth * 3,
              justifyContent: 'center',
              width: size - strokeWidth * 3,
            }}
          >
            <Ionicons
              color={tier ? (paused ? tokens.muted : tokens.text) : tokens.muted}
              name={tier ? icon : 'lock-closed-outline'}
              size={Math.round(size * 0.42)}
            />
          </View>
        </ProgressRing>
      </Animated.View>
      {tier ? (
        <View style={[styles.pips, { gap: tokens.spacing.xxs, marginTop: tokens.spacing.xxs }]}>
          {Array.from({ length: tierPips(tier) }, (_, index) => (
            <View
              key={index}
              style={{
                backgroundColor: ringColor,
                borderColor: tokens.border,
                borderRadius: 4,
                borderWidth: StyleSheet.hairlineWidth,
                height: 8,
                width: 8,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  pips: { flexDirection: 'row' },
});
