# Patterns

How components combine into screens. Follow these before inventing a layout.

## Screen anatomy

```
Screen (canvas, safe areas)
└─ content (padding: layout.gutter, gap: xl between sections)
   ├─ ScreenTitle        eyebrow (household name) · title · description
   ├─ Section            Label heading + content (cards, rows, chips)
   ├─ Section …
   └─ Primary action     one primary Button, at the end of the content or pinned above the dock
(Dock, for the five main tabs only)
```

- One headline: at most one `display` figure per screen (the XP total or score).
- Section order follows importance: status first, then what to do, then history.
- Primary action sits where the thumb reaches (bottom of content or pinned), and there is one.
- Main tab screens sit above a dock and have no back button. Everything else is a pushed screen with a back affordance and a clear title.

## States

Every screen or section that loads, can be empty, or can fail defines all of these. Use `StatePanel` ([components.md](components.md#statepanel)); never leave a blank area.

| State | When | Presentation | Action |
|---|---|---|---|
| **Loading** | First load, no data yet | `StatePanel kind="loading"` (or inline spinner for a refresh) | None; the user can leave |
| **Empty** | Loaded successfully, nothing there | `StatePanel kind="empty"` with a title that says what belongs here | Primary create or join action |
| **Error** | A read or write failed | `StatePanel kind="error"`: what failed and what is still safe | **Retry** (required) |
| **Partial** | Some data loaded, some failed (for example profile read failed but the session is valid) | Show what loaded; an inline error row for the missing part with retry | Retry the missing part |
| **Offline / unavailable** | Cross-device or network feature cannot run | `StatePanel kind="unavailable"` saying what is unavailable and why | Retry when it can work |
| **Demo / local** | Data is local or sample, not synced | `StatePanel kind="demo"` or a labeled note: say it is local and what does not sync | None or learn more |
| **Completed** | A chore, subtask, or goal is done | Completed row treatment plus text ("Done", the completion time) and the contributor | Undo only where the contract allows |

Rules: errors say what happened in plain language (no codes), keep the user's input, and never lose a saved choice. Success is shown where the user is looking (the row changes), not only in a toast. Anything auto-dismissing must also be readable by a screen reader and never be the only confirmation.

## Forms

- Each field is a `FormField` with a persistent label above it (placeholders are hints, not labels).
- Order fields top to bottom in the order they are needed. Mark optional fields as optional in the label, not required with a symbol.
- Use the right `keyboardType`, `autoComplete`, and `secureTextEntry` for the field.
- Validate on submit (and on blur for fields with a clear format). Show the error in a `Label` below the field in `danger` **with the message in text**; keep the user's input.
- One primary button for the form. Disable it while submitting and show progress; re-enable on failure. Keep Enter/Done wired to submit on the last field.
- Show field errors and the form-level error where the user is looking; focus moves to the first invalid field.
- Destructive or irreversible steps use a confirming sheet that names the exact consequence.

## Lists and rows

- A row is a `Card` (or a divider-separated group inside one). Leading icon or badge, a `body` title, a `caption` detail line, trailing status or action.
- The whole row is the touch target when it navigates. Inner actions are separate controls of at least 44 dp.
- Never truncate the only copy of important text; allow wrapping to two or three lines first, then truncate with an ellipsis and a way to read the full text.
- Group by what the user thinks in (due today, upcoming, done), with a `heading` per group.

## Assignees and attribution

- Show assignees as `MemberBadge` **plus the member's name as text**. Several assignees wrap in a chip row.
- An unassigned chore shows an explicit, labeled "Unassigned" state; it is never an empty gap.
- Completion shows who did it (contributor) and when. Bonus distribution is listed per member with its amount in text.
- Member colors identify people; the name is the identifier.

## XP, scores, and progress

- XP and scores are tabular `display` or `heading` numbers with a text unit ("XP"). A change (+10 XP) is stated in text, never only by an animation or color.
- Progress: a bar or ring **plus the value as text** ("12 of 20 XP", "60%"). The ring or bar is a visual aid; the text is the information. Expose it as `accessibilityRole="progressbar"` with `accessibilityValue` (`min`, `max`, `now`).
- Rank comparisons list members in order with their numbers; position is text ("1st"), not only a medal color.
- The ledger is the source of truth. Do not show numbers that are not derived from it.

## Bottom sheets and modals

- Use `Modal` with `transparent`, a `scrim` backdrop (`tokens.scrim`), and a `Card` panel. `onRequestClose` always closes (Android back).
- A visible close or cancel control (`ghost` `Button`) in addition to tapping the scrim.
- Focus starts in the sheet. The sheet has a `heading` title that names its purpose.
- A sheet has one `primary` action. Do not stack sheets.

## Navigation

- Five main tabs in a dock: Today, Feed, Add (raised, center), Ranks, Me. The dock is a `tablist`; each tab is `accessibilityRole="tab"` with `selected` state and a text label.
- Tab labels are localized and always visible; icons alone are not enough.
- Create actions elsewhere use a `primary` `Button` with text, not a floating icon.

## Appearance picker

The reference implementation of selecting among visual options:

- Three labeled previews of the same sample data (`ThemePreview`).
- Selection is shown by an outline **and** a text or icon indicator; `accessibilityState.selected` is set.
- Tapping a preview only previews; a separate **Continue** commits. Do not choose for the user on first run.
- On narrow phones every option remains reachable (scroll or paged carousel with position indicators).
- Show load and save errors with a retry; the preview stays when saving fails.

## Settings

Group related settings in `Card`s with a `heading`. Each row is a label, a `caption` explanation when needed, and one control. Changing appearance or language applies immediately and never changes chore data. Language and appearance are always reachable after onboarding.
