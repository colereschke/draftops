# HARD-022 Sleeper Roster-Sync Dialog Decomposition Design

## Goal

Decompose `SleeperRosterSyncDialog` into focused state and rendering modules without changing any
user-visible behavior, server-action call, state transition, accessibility behavior, or existing
test contract.

## Scope and constraints

- This is a structural-only HARD-022 refactor. It must not change application behavior.
- Keep all Sleeper domain logic and server actions outside presentational React components.
- Preserve all current test IDs, labels, button states, messages, and dialog semantics.
- Preserve auto-sync behavior exactly: only a saved `sleeperLeagueId` triggers it, only once when
  configuration appears, and it never runs from a user-entered league ID.
- Preserve status announcement timing. Repeated validation outcomes must still clear and then
  re-set the live-region message, while preview-loading errors retain their immediate state update
  to avoid racing a view transition.
- Keep the existing `SleeperRosterSyncDialog.test.tsx` suite focused on application behavior.
  Add tests only where a new module boundary needs a stable application-level contract; do not add
  superficial extraction tests.

## Module boundaries

`SleeperRosterSyncDialog.tsx` becomes a small dialog shell. It owns only the dialog frame,
`MutationStatus` placement, current-view selection, and the close callback.

`useSleeperRosterSyncState.ts` owns all dialog state and mutation orchestration:

- preview loading on mount and retry;
- transient error/success announcement timers and cleanup;
- mapping sync, suggestion prefill, duplicate-team validation, and mapping persistence;
- catch-up price validation, submission, conflict recording, and `router.refresh()`;
- the one-time saved-league auto-sync effect.

The hook returns the state and event handlers required by views. It does not render JSX. The
existing response-code-to-message mapping moves beside this state orchestration because it defines
the action failure contract.

`SleeperRosterConfiguration.tsx` renders the configuration view only: league ID entry, on-demand
sync, candidate-to-team mapping controls, precomputed selected-team disabled state, and mapping
save action. The hook or a pure mapper beside it retains the one-team-per-roster rule; the view
only renders the supplied disabled state and forwards events.

`SleeperRosterPreview.tsx` renders the preview view only: actionable winner rows and price inputs,
precomputed conflict display messages, unresolved-player notices, already-reconciled diagnostics,
empty state, and catch-up submission action. The hook or a pure mapper beside it translates
conflict reasons to display strings; position color lookup stays in this rendering component.

The loading paragraph and retry button remain simple shell branches; extracting them would not
create a meaningful responsibility boundary.

## Preserved data flow

On mount, configured drafts load the roster preview. Preview failures route to configuration only
for `configuration_required` and `mapping_required`; all other failures render the retry view.
Unconfigured drafts render configuration immediately. A saved league ID triggers exactly one
configuration auto-sync and pre-fills only previously unset suggested team mappings.

Configuration sync requests roster candidates and draft teams. Saving requires a trimmed league ID,
a complete one-to-one mapping, then replaces the preview from the successful mapping response.

Preview submission includes only filled prices, rejects invalid non-whole-dollar or non-positive
prices, requires at least one entry, records returned conflicts by player ID, announces the import
count, and refreshes the router after success.

## Testing and verification

Retain the existing dialog characterization suite and strengthen only its application-level seams
that protect the new hook boundary:

- Saved-ID auto-sync must assert exactly one `previewSleeperRosterMatch` call after effects and
  resulting transitions settle.
- Typing an unsaved league ID must assert no match request before the user clicks Sync, then assert
  exactly one request after that click.
- Fake-timer coverage must trigger pending error and success announcements, unmount the dialog,
  and prove neither timer causes a post-unmount update.

The resulting suite protects preview and submission, configuration and auto-sync, mapping override
and duplicate prevention, price validation, configuration-required recovery, diagnostics, action
failure messaging, repeated live announcements, timer cleanup, and conflict reporting. It does
not add isolated extraction tests.

Run the focused dialog suite during each task, then run `pnpm tsc --noEmit`, `pnpm lint`, and the
full `make check` before review. The full check must run outside the sandbox because
`localFonts.test.ts` invokes the `git` executable, which sandbox policy blocks.

## Non-goals

- No changes to Sleeper APIs, validation rules, request payloads, or server actions.
- No visual redesign, copy change, new dialog states, or altered loading behavior.
- No changes to auction reconciliation semantics or persistence.
