# HARD-022 Draft Form Decomposition

## Scope

This is the second staged HARD-022 PR. It refactors only the new-draft form at
`src/app/drafts/new/page.tsx` into focused state and rendering modules.

The work is strictly structural. It must not change functionality, copy, visual design, inline
styles, validation, server/API contracts, database behavior, URL behavior, accessibility
attributes, or existing stable test IDs.

## Architecture

The route page becomes a thin composition boundary. A single `useDraftFormState` hook owns all
existing form state and side effects, and focused section components render the present form
markup from explicit props.

### Form state and behavior

`useDraftFormState.ts` owns the current state, transitions, and callbacks:

- numeric form fields, team rows, player source, future-pick mode, starting lineup, and scoring;
- ranking-summary loading and its non-blocking error state;
- Sleeper import request, import success/error/warning state, and imported-league reset behavior;
- team-count synchronization, team editing, ownership selection, and lineup ordering;
- construction and validation of the `DraftInput` candidate;
- create-draft submission, typed error messages, navigation, and client error reporting.

The hook preserves current ordering and error behavior exactly. Team-count synchronization remains
the current synchronous render-time, clamped preserve-or-truncate behavior; it must not move to an
effect that could lag or overwrite imported teams. Lineup sorting remains limited to add/update
interactions: successful Sleeper imports preserve the received lineup order exactly. Successful
Sleeper imports populate all current fields, and failed import/creation paths retain their existing
inline recovery states.

### Types and pure helpers

`draftFormTypes.ts` holds the shared `TeamRow` and `ImportState` types. Default-team generation
and lineup ordering are pure helpers outside React state. This makes components depend on explicit
data and callbacks rather than page-local implementation details.

A colocated style module exports the present inline-style objects verbatim so extraction cannot
visually drift. Inert `data-testid` attributes may be added to team-row controls only where needed
to bring new or touched tests into the repository's stable-selector convention.

### Rendering sections

The existing markup moves unchanged into focused components:

- `DraftImportSection`
- `DraftSettingsSection`
- `PlayerSourceSection`
- `RosterSettingsSection`
- `StartingLineupSection`
- `ScoringSection`
- `FuturePicksSection`
- `TeamRosterSection`

Each section receives only the values and callbacks it renders. The page keeps the current main
landmark, title/cancel controls, error display, and submit controls while composing the sections.

## Data flow

The page calls `useDraftFormState` once and passes its explicit state/callback values to sections.
User input flows from a section to the hook. Import and submission effects run in the hook, then
update its state or navigate exactly as the page does today. The hook constructs `DraftInput` and
uses the existing `draftInputSchema` and `createDraft` action unchanged.

`DraftImportSection` remains outside the native `<form>`; its current position avoids changing
Enter-key submission and browser validation behavior. Ranking-summary warning rendering remains
independent of the presence of a ranking summary. The current separate import and create
`useTransition` instances remain separate, so their pending states do not disable one another.

## Error handling

No new messages or error types are introduced. Blank numeric fields, schema failures, typed draft
mutation results, Sleeper import failures, ranking-summary load failures, and client error-report
failures retain their current visible recovery behavior. Error reporting remains best-effort and
cannot prevent the draft-creation error UI from rendering.

## Testing

Tests remain application-focused:

- retain existing new-draft form tests unchanged wherever they already describe behavior;
- add a domain-consistent Sleeper import characterization that covers team count/rows, nonzero
  owner selection, all scoring fields, and preserved imported lineup order;
- add one exact submitted `DraftInput` payload assertion plus existing error recovery coverage;
- test the integrated page for those interactions, never hook internals, extracted component
  existence, prop forwarding, file layout, or incidental call counts.

Mocks are reset and defaulted in the root `beforeEach` so import/ranking/action assertions cannot
pass from calls made by earlier tests.

Run targeted Jest coverage during development, then `make check`. No schema or transaction test is
needed because this PR does not change persistence behavior.

## Non-goals

- No visual redesign, shadcn migration, style-token change, or copy change.
- No form validation or domain-policy change.
- No server-action, Sleeper service, ranking service, API, schema, or database change.
- No decomposition of projection application or the Sleeper roster-sync dialog.
