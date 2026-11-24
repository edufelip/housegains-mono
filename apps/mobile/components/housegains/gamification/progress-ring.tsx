import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { timed } from './motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingProps = {
  size: number;
  strokeWidth: number;
  color: string;
  trackColor: string;
  /** Final fill, 0..1. Ignored when `progress` drives the ring. */
  fraction?: number;
  /** Sweep duration in ms; 0 draws the final fill at once. */
  durationMs?: number;
  /** An externally driven fill (for example the level-up sequence). */
  progress?: SharedValue<number>;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
};

/**
 * A circular progress ring in tokens passed by the caller. The meaning is always in text next to
 * it (the percent or the numbers), never in the ring alone.
 */
export function ProgressRing({
  size,
  strokeWidth,
  color,
  trackColor,
  fraction = 0,
  durationMs = 0,
  progress: external,
  children,
  testID,
  accessibilityLabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, fraction));
  const own = useSharedValue(durationMs > 0 ? 0 : clamped);
  const progress = external ?? own;

  useEffect(() => {
    if (external) return;
    own.value = durationMs > 0 ? timed(clamped, durationMs) : clamped;
  }, [clamped, durationMs, external, own]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      style={{ height: size, width: size }}
      testID={testID}
    >
      <Svg height={size} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          animatedProps={animatedProps}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          originX={size / 2}
          originY={size / 2}
          r={radius}
          rotation={-90}
          stroke={color}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
