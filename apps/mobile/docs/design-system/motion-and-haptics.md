# Motion, sound, and haptics

> **State today:** `react-native-reanimated` drives the Ganhos & Zelo moments (toast, achievement unlock, level-up, streak, wallet, organizer card) through `components/housegains/gamification/motion.ts`; the rest of the app uses only the `Button` pressed state. Haptics are out of scope: no haptics package is installed and none is used.

## Principles

- **Motion explains, it does not decorate.** Use it to show a state change (a chore completing, a sheet arriving), never to fill time.
- **Nothing depends on it.** Every result of an animation is also stated in text or shown in the final UI state. Sound and haptics are optional extras.
- **Respect reduced motion.** Check the system setting (`AccessibilityInfo.isReduceMotionEnabled()` and its change event, or Reanimated's `useReducedMotion`). With it on: no movement, scale, parallax, or looping; use an instant change or a short opacity fade (at most 150 ms).
- **Fast and calm.** Responses to a tap start within 100 ms.

## Durations and easing

| Use | Duration | Easing |
|---|---|---|
| Press feedback, toggles | 100 to 150 ms | ease-out |
| State change, row completes, chip selects | 150 to 250 ms | ease-out |
| Sheet or screen enter | 250 to 350 ms | ease-out; exit 20 percent shorter, ease-in |
| Count-up of a score | 400 to 700 ms, once | ease-out; skip with reduced motion |
| Celebration moments | 450 to 1600 ms, once, one at a time | See the gamification table below |

Do not loop or auto-play anything. Do not animate layout in a way that moves a control the user is about to tap.

## Gamification motion (Reanimated)

Every `withTiming` / `withSpring` passes `reduceMotion: ReduceMotion.System` (enforced by `features/gamification/motion-contract.test.ts`) and each component reads `useReducedMotion()` for its static layout. Every number is also in text, toasts call `AccessibilityInfo.announceForAccessibility` with the same copy, and a full-screen unlock appears at most once per app session.

| Moment | Normal motion | Reduced motion |
|---|---|---|
| Earned toast | Slides down with a spring (damping 18, about 220 ms), amount counts up in 500 ms, 10 to 14 particles for 700 ms, dismisses after 2.4 s, list stays interactive | Fades in (at most 150 ms), final number, no particles, dismisses after 3 s |
| Streak | Week cell fills in 450 ms, counter ticks in 300 ms, flame scales 1 → 1.25 → 1, milestone chip 250 ms later | Static, text "Semana garantida" |
| Achievement unlock | Medal scales from 0.4 and turns 360 degrees once (600 ms), tier ring draws in (500 ms), confetti for 1.6 s, button active at 400 ms | Cross-fade to the final card, no confetti or spin |
| Level-up | Ring fills to 100 %, resets, new number flips (800 ms) | Static card with the new number |
| Wallet open | Balance counts up from the last seen value (600 ms), rows stagger by 40 ms | Final values at once |
| Organizer card | Health ring sweeps to the rate (700 ms), bars grow (500 ms) | Final ring and bars at once |

## Existing behavior

`Button` pressed state is an instant opacity change (`stateOpacity.pressed`, 0.9) and a 0.985 scale. This is not animated and needs no reduced-motion path.

## Theme character

Motion carries each theme's personality only within the limits above: Arcade can be crisp and quick; Sticker Pop can use a small bounce on a sticker; Soft Home stays gentle with fades. All three have a reduced-motion path that is a plain state change.

## Sound and haptics

- Sound and haptics are off by default and never required to understand completion or XP.
- Adding either needs a settings toggle, a documented place for it here, and a dependency review (haptics are not installed today).
- Do not use haptics for errors the user can see; reserve them for completion confirmation if added.

## Checklist for new motion

- [ ] It explains a state change
- [ ] The final state is understandable without watching it
- [ ] Reduced motion produces an instant or fade-only version
- [ ] No looping and no content that moves while being read
- [ ] Tested in all three themes
