---
name: HouseGains
description: Shared household chore coordination with transparent XP and three selectable visual compositions.
status: In progress
---

# Design direction

The HouseGains references are three complete visual compositions. Use the supplied screenshots as visual authority for those compositions and use the active implementation contract for behavior. Keep selection, XP, assignments, and data identical across styles. This specification documents intended design and does not claim that any variant is implemented.

## Arcade

- **Ground and surfaces:** near-black canvas #0D1117 with charcoal #161B22 surfaces.
- **Color:** electric lime #76FF03 is the primary action and active emphasis; text is high-contrast #F0F6FC with muted #8B949E.
- **Type:** compact bold sans headings and mono labels/score details.
- **Composition:** avatar, level/title, and streak in the header; large XP total and segmented progress; a compact rank comparison; dark quest rows with a lime active outline.
- **Navigation:** dark rounded dock and a lime central create action.
- **Bonus state:** distinguish completion bonus clearly with the reference's warm accent while keeping the exact available bonus and split sourced from the ledger.

## Sticker Pop

- **Ground and surfaces:** warm butter #FFFDF0 canvas; white cards with black 2.5px outlines and hard offset shadows.
- **Color:** blue #2563EB score panel, yellow #FBBF24 progress and create action, mint #10B981 completed state, coral #F87171 for danger.
- **Type and shape:** punchy bold type, chunky geometry, stickers and score pills. Do not sacrifice readable labels or touch targets for tilt or decoration.
- **Composition:** bold greeting, tilted yellow streak sticker, blue score panel, mint rank badge, strong yellow progress bar, mint completed chores.
- **Navigation:** white outlined dock with raised yellow create action.

## Soft Home

- **Ground and surfaces:** pale lavender/slate canvas #F8FAFC with white cards, dark plum text, airy spacing, and restrained dividers.
- **Color:** purple/lavender #6366F1 primary and checked state, sage #10B981, and peach #FDBA74 for supporting emphasis.
- **Type:** serif greeting and section headings with sans-serif body text. The serif hierarchy is part of this reference; do not silently substitute the app's sans family.
- **Composition:** white score card with a purple progress ring and goal, soft streak chip, pastel household score chips, and light task rows.
- **Navigation:** dark plum pill dock with a purple create action.

## Appearance picker

Show the styles as a horizontal pager of full-screen pages, one per style, in the order set by the style picker config (Sticker Pop, Arcade, Soft Home). Each page is drawn entirely in its own style and shows a mini phone sample built from the same sample chore and score data. Swiping, or the Previous and Next buttons, changes only the preview. Each page has one "Choose {style}" button; only that button stores the choice, and then the app continues. Show position with page dots and a "Swipe to compare" hint. Show selection with text or an icon as well as an outline or color. Do not choose a style for the user on first run: nothing is pre-selected. While saving, lock the pager and every button; a save failure shows an error on that page and changes its button to "Retry save"; a failed load of the stored choice shows "Try loading again" on every page. The language button opens a sheet styled like the current page.

Settings can switch styles after setup without repeating onboarding or changing chore data. Persist the selected appearance locally and wait for hydration before drawing the themed shell.

## Shared interaction and accessibility

- Use shared data and action logic; variant components may change composition, not domain behavior.
- Show assignment chips for multiple members and a clear unassigned state.
- Keep subtask completion, XP, completion time, contributor attribution, due state, and bonus distribution legible in every style.
- Provide visible loading, empty, error, retry, partial, completed, and unavailable/demo states.
- Preserve readable contrast, dynamic type, screen-reader labels, logical focus, and platform touch targets. Do not use color alone for status.
- Respect reduced motion. Sound or animation must never be necessary to understand completion or XP.
- Localize all user-facing copy for en-US, pt-BR, es-ES, fr-FR, de-DE, and it-IT; use localization keys instead of screen literals.
