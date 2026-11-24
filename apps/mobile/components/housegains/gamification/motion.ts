import { useEffect, useState } from 'react';
import {
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

/**
 * Motion for the Ganhos & Zelo moments (docs/design-system/motion-and-haptics.md).
 * Every animation goes through `timed` / `springed`, which pass `reduceMotion: ReduceMotion.System`:
 * with the system setting on, Reanimated jumps straight to the end value. Components also read
 * `useReducedMotion()` to pick their static layout (no particles, no spin, no travel).
 */
export const MOTION = {
  toastSpringIn: 220,
  countUp: 500,
  particles: 700,
  toastHold: 2400,
  toastHoldReduced: 3000,
  confetti: 1600,
  medal: 600,
  ring: 500,
  unlockButtonDelay: 400,
  weekCellFill: 450,
  counterTick: 300,
  milestoneChipDelay: 250,
  levelRing: 800,
  walletCountUp: 600,
  rowStagger: 40,
  healthRing: 700,
  healthBars: 500,
  fade: 150,
} as const;

export function timed(to: number, durationMs: number) {
  return withTiming(to, {
    duration: durationMs,
    easing: Easing.out(Easing.cubic),
    reduceMotion: ReduceMotion.System,
  });
}

/** Spring used by the toast: damping 18, settles in about MOTION.toastSpringIn ms. */
export function springed(to: number) {
  return withSpring(to, {
    damping: 18,
    stiffness: 320,
    mass: 1,
    reduceMotion: ReduceMotion.System,
  });
}

/** True when the system asks for reduced motion. */
export function useMotionReduced(): boolean {
  return useReducedMotion();
}

/**
 * A number that counts from `from` to `to` over `durationMs`. With reduced motion (or no change)
 * it is the final number at once. The final number is always what text and screen readers get.
 */
export function useCountUp(from: number, to: number, durationMs: number): number {
  const reduced = useReducedMotion();
  const instant = reduced || durationMs <= 0 || from === to;
  const progress = useSharedValue(instant ? 1 : 0);
  const [value, setValue] = useState(instant ? to : from);

  useAnimatedReaction(
    () => Math.round(from + (to - from) * progress.value),
    (current, previous) => {
      if (current !== previous) runOnJS(setValue)(current);
    },
    [from, to],
  );

  useEffect(() => {
    if (instant) {
      progress.value = 1;
      setValue(to);
      return;
    }
    setValue(from);
    progress.value = 0;
    progress.value = timed(1, durationMs);
  }, [from, to, durationMs, instant, progress]);

  return value;
}
