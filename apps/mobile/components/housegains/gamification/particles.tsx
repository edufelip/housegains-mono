import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useAppearance } from '@/features/appearance';
import { timed, useMotionReduced } from './motion';

export type ParticleBurstProps = {
  count: number;
  durationMs: number;
  /** `radial` bursts out from the center (toast); `fall` rains down (unlock confetti). */
  mode: 'radial' | 'fall';
  /** Distance in dp the particles travel. */
  distance: number;
  testID?: string;
};

type Spec = { angle: number; reach: number; size: number; round: boolean; tone: number };

function buildSpecs(count: number): Spec[] {
  // Deterministic so the burst looks the same every time and tests are stable.
  return Array.from({ length: count }, (_, index) => ({
    angle: (index / count) * Math.PI * 2 + (index % 2) * 0.25,
    reach: 0.55 + ((index * 7) % 5) * 0.1,
    size: 6 + ((index * 5) % 4) * 2,
    round: index % 2 === 0,
    tone: index % 3,
  }));
}

function Particle({
  spec,
  progress,
  mode,
  distance,
  color,
}: {
  spec: Spec;
  progress: SharedValue<number>;
  mode: 'radial' | 'fall';
  distance: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const x = Math.cos(spec.angle) * distance * spec.reach * t;
    const y =
      mode === 'radial'
        ? Math.sin(spec.angle) * distance * spec.reach * t
        : distance * (0.2 + spec.reach * 0.8) * t;
    return {
      opacity: t < 0.8 ? 1 : (1 - t) * 5,
      transform: [
        { translateX: mode === 'fall' ? x * 0.6 : x },
        { translateY: mode === 'fall' ? y - distance * 0.1 : y },
        { rotate: `${spec.angle * 57 * t}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.particle,
        {
          backgroundColor: color,
          borderRadius: spec.round ? spec.size : 2,
          height: spec.size,
          width: spec.size,
        },
        style,
      ]}
    />
  );
}

/**
 * A short particle burst. Decorative only (hidden from screen readers) and never rendered with
 * reduced motion: the result of the moment is always in text.
 */
export function ParticleBurst({ count, durationMs, mode, distance, testID }: ParticleBurstProps) {
  const { tokens } = useAppearance();
  const reduced = useMotionReduced();
  const progress = useSharedValue(0);
  const specs = useMemo(() => buildSpecs(count), [count]);
  const tones = [tokens.primary, tokens.accent, tokens.success];

  useEffect(() => {
    if (reduced) return;
    progress.value = 0;
    progress.value = timed(1, durationMs);
  }, [durationMs, progress, reduced]);

  if (reduced) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.layer}
      testID={testID}
    >
      {specs.map((spec, index) => (
        <Particle
          color={tones[spec.tone]}
          distance={distance}
          key={index}
          mode={mode}
          progress={progress}
          spec={spec}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
});
