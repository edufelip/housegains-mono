# Documentation-First Agent Rules

## Core Contract
- Every single change to our application shall be validated according to the current documentation.
- Documentation shall be updated upon any change that happens in code.

## Mandatory Workflow For Any Change
1. Read the relevant docs before touching code.
2. Implement the change.
3. Validate behavior against existing docs.
4. Update documentation in the same change when behavior, UI, rules, requirements, or tests are impacted.
5. If docs and code conflict, resolve the conflict by updating docs and code until they match.

## Minimum Documentation Areas To Check
- `docs/functional-requirements/`
- `docs/use-cases/`
- `docs/acceptance-criteria/`
- `docs/business-rules/`
- `docs/test-cases/`
- `docs/screens/`

## Review Gate
- No task is complete if docs do not represent the final implemented behavior.

## New Session Start Checklist (Mandatory)
Before starting any implementation in a new session:
1. Read `docs/implementation/firebase-contract.md` (repository root) for the backend shape.
2. Read the relevant screen specs under `docs/screens/v2/`.
3. Read linked FR/UC/AC/BR/TC artifacts before writing code.

## Implementation Workflow Per Task
1. Pick one backlog item/screen scope.
2. Implement only behavior covered by docs or explicitly update docs first.
3. If using placeholders/stubs, record them in docs as temporary implementation state.
4. Run validation (tests/lint/typecheck as applicable).
5. Update docs in the same change.

## Documentation Update Rules
Whenever behavior changes, update all impacted artifacts:
- Functional requirements: `docs/functional-requirements/`
- Use cases: `docs/use-cases/`
- Acceptance criteria: `docs/acceptance-criteria/`
- Business rules: `docs/business-rules/`
- Test cases: `docs/test-cases/`
- Screen specs/copy: `docs/screens/v2/`

## Backend
- The backend is Firebase (Auth, Cloud Firestore, callable Cloud Functions, FCM), per
  `docs/implementation/firebase-contract.md` at the repository root.
- Read and write data only through the paths and callables in that contract. Change the
  contract first if the backend shape must change.

## Deferred Work Policy
- Track intentionally deferred work as a tracker issue, not as a doc in this repo.

## Localization Policy
- All user-facing strings must be documented and prepared for:
  - `en-US`
  - `pt-BR`
  - `es-ES`
- Source of truth:
  - `docs/screens/v2/localized-copy-table-v2.md`
- No user-facing copy literals are allowed in screen `TSX` files; use localization keys and locale bundles.
- Every new screen must ship with keys populated in all three bundles (`en-US`, `pt-BR`, `es-ES`) in the same change.

## Design System (UI work)
- All new or changed UI must be built from the design system in `docs/design-system/` (start at `README.md`). Visual direction for the three themes is `DESIGN.md`; values are in `features/appearance/tokens.ts`.
- Read tokens with `useAppearance().tokens`. No hex or `rgb()` colors, `fontFamily` strings, or numeric `fontSize` in `features/**` and `components/**` `.tsx` files; ESLint (`eslint.design-system.cjs`) fails CI on them.
- Reuse the component catalog (`docs/design-system/components.md`) before adding a component, and document any new shared component in the same change.
- Design loading, empty, error (with retry), partial, completed, and demo states; use `StatePanel`. Never convey meaning by color alone.
- Verify new UI in all three themes (Arcade, Sticker Pop, Soft Home) and at the largest text size.
- The design-system checklist in `docs/design-system/README.md` must pass before a UI task is complete. Files on the `LEGACY_FILES` list in `eslint.design-system.cjs` may only be removed, never added.
- If the design system and code disagree, fix one of them in the same change.

## Done Criteria For Any Session
A session is only complete when:
1. Code matches current docs.
2. Docs reflect final implemented behavior of that session.
3. Backlog traceability is updated when scope moved forward.
4. Deferred wiring/localization gaps are explicitly tracked (not implicit).
