import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { MOTION, springed, timed, useCountUp, useMotionReduced } from './motion';
import { ParticleBurst } from './particles';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type GanhosToastProps = {
  title: string;
  /** Final amount. The visible number counts up to it; text and screen readers get the final value. */
  amount?: number;
  /** Formats the (counting) number, for example "+25 Gains". */
  formatAmount?: (amount: number) => string;
  /** Breakdown or badge detail under the amount. */
  detail?: string;
  /** Same copy as shown, announced to screen readers. */
  announcement: string;
  /** Spoken action of the toast (tap to dismiss). */
  dismissLabel: string;
  icon: IconName;
  onDismiss: () => void;
  testID?: string;
};

/**
 * Ganhos / Zelo earned toast. Slides down (spring), counts the amount up (500 ms) with a short
 * particle burst (700 ms), dismisses itself after 2.4 s and never blocks the list underneath.
 * Reduced motion: fades in, shows the final number, no particles, stays 3 s.
 */
export function GanhosToast({
  title,
  amount,
  formatAmount,
  detail,
  announcement,
  dismissLabel,
  icon,
  onDismiss,
  testID = 'housegains.gamification.toast',
}: GanhosToastProps) {
  const { tokens } = useAppearance();
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  const offset = useSharedValue(reduced ? 0 : -96);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const shown = useCountUp(0, amount ?? 0, MOTION.countUp);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (reduced) opacity.value = timed(1, MOTION.fade);
    else offset.value = springed(0);
    void AccessibilityInfo.announceForAccessibility(announcement);
    const exit = setTimeout(
      () => {
        opacity.value = timed(0, MOTION.fade);
      },
      (reduced ? MOTION.toastHoldReduced : MOTION.toastHold) - MOTION.fade,
    );
    const done = setTimeout(
      () => dismiss.current(),
      reduced ? MOTION.toastHoldReduced : MOTION.toastHold,
    );
    return () => {
      clearTimeout(exit);
      clearTimeout(done);
    };
  }, [announcement, offset, opacity, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: offset.value }],
  }));

  return (
    // The wrapper lets touches through, so the list below stays interactive while a toast shows.
    <View
      pointerEvents="box-none"
      style={[
        styles.layer,
        { paddingHorizontal: tokens.layout.gutter, paddingTop: insets.top + tokens.spacing.xs },
      ]}
    >
      <Animated.View style={[styles.toast, { maxWidth: tokens.layout.maxContentWidth }, style]}>
        <Pressable
          accessibilityHint={dismissLabel}
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
            gap: tokens.spacing.sm,
            minHeight: tokens.touchTarget.comfortable,
            padding: tokens.spacing.md,
            shadowColor: tokens.shadow.color,
            shadowOffset: tokens.shadow.offset,
            shadowOpacity: tokens.shadow.opacity,
            shadowRadius: tokens.shadow.radius,
          }}
          testID={testID}
        >
          <View style={styles.iconWrap}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: tokens.primary,
                borderRadius: tokens.radius,
                height: 44,
                justifyContent: 'center',
                width: 44,
              }}
            >
              <Ionicons color={tokens.onPrimary} name={icon} size={tokens.iconSize.md} />
            </View>
            <ParticleBurst
              count={12}
              distance={64}
              durationMs={MOTION.particles}
              mode="radial"
              testID={`${testID}.particles`}
            />
          </View>
          <View style={{ flex: 1, gap: tokens.spacing.xxs }}>
            <Label>{title}</Label>
            {amount !== undefined ? (
              <Label testID={`${testID}.amount`} variant="heading">
                {formatAmount ? formatAmount(shown) : String(shown)}
              </Label>
            ) : null}
            {detail ? (
              <Label testID={`${testID}.detail`} variant="caption">
                {detail}
              </Label>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  toast: { width: '100%' },
  iconWrap: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
});
