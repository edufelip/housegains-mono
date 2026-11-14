# Documentation-First Agent Rules

## Documentation scope and validation

Before implementation, read the documentation governing the affected behavior and inspect the relevant code and tests.

For a typo, formatting change, or internal refactor with unchanged behavior, inspect only the affected documentation and record when no documentation update is needed.

For changes to product behavior, domain terminology, deferred wiring, or backlog scope, read the relevant screen specifications, the Firebase contract, and linked requirements/tests. Update only the artifacts affected by the change.

If code and documentation disagree, establish the intended behavior from the request and authoritative decisions before changing either.

A task is complete when the affected documentation accurately represents the final behavior and the applicable validation has been performed.

## Implementation Workflow Per Task
1. Identify the requested scope; map it to a backlog item or screen when applicable.
2. Implement only behavior covered by docs or explicitly update docs first.
3. If using placeholders/stubs, record them in docs as temporary implementation state.
4. Run validation (tests/lint/typecheck as applicable).
5. Update affected docs when needed; otherwise record why no update is necessary.

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
  - `fr-FR`
  - `de-DE`
  - `it-IT`
- The five requested languages (Portuguese, Spanish, French, German, Italian) are mandatory; English remains supported. Active HouseGains strings must have complete key and placeholder parity across all six locales.
- Source of truth:
  - `docs/screens/v2/localized-copy-table-v2.md`
  - `docs/screens/housegains-localized-copy.md` (generated active-app table for all six languages)
- No user-facing copy literals are allowed in screen `TSX` files; use localization keys and locale bundles.
- Every new screen must ship with keys populated in all six bundles (`en-US`, `pt-BR`, `es-ES`, `fr-FR`, `de-DE`, `it-IT`) in the same change.

## Done Criteria For Any Session
A session is only complete when:
1. Code matches current docs.
2. Docs reflect final implemented behavior of that session.
3. Backlog traceability is updated when scope moved forward.
4. Deferred wiring/localization gaps are explicitly tracked (not implicit).
