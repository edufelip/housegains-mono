# Motion, sound, and haptics

> **State today:** the app has no animation, sound, or haptics library in use beyond the `Button` pressed state. `react-native-reanimated` is installed but not used by screens, and no haptics package is installed. This document sets the rules for when that changes.

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

Do not loop or auto-play anything. Do not animate layout in a way that moves a control the user is about to tap.

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
