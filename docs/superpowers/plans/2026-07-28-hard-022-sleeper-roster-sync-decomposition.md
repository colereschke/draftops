# HARD-022 Sleeper Roster-Sync Dialog Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Sleeper roster catch-up dialog into focused state and rendering modules while preserving all application behavior.

**Architecture:** Move state, server-action orchestration, status timing, response-message mapping, and presentation-ready domain decisions into a `useSleeperRosterSyncState` hook. Render configuration and preview views in focused components that receive only data already prepared for display plus event handlers. Retain `SleeperRosterSyncDialog` as the dialog frame and current-view composition shell.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Jest 30, React Testing Library, Tailwind CSS 4.

## Global Constraints

- Strictly structural-only: do not change requests, payloads, state transitions, messages, dialog semantics, or visual behavior.
- Preserve all existing `data-testid` values, ids, labels, button states, and `MutationStatus` placement.
- Auto-sync only once from a non-empty saved `sleeperLeagueId`; typing an unsaved ID never invokes it.
- Keep response-code messages, one-team-per-roster enforcement, and conflict-reason-to-copy translation outside presentational components.
- Preserve 50 ms clear/re-set live-region announcement behavior and cleanup of both pending timers on unmount.
- Tests must use `data-testid` or id selectors and remain application-code focused; do not add isolated extraction tests.

---

## File structure

- Create: `src/components/SleeperRosterSync/sleeperRosterSyncTypes.ts` — shared dialog prop, view, hook-result, and display-model interfaces.
- Create: `src/components/SleeperRosterSync/useSleeperRosterSyncState.ts` — all state, effects, server-action orchestration, response messaging, and presentation-ready mapping/conflict values.
- Create: `src/components/SleeperRosterSync/SleeperRosterConfiguration.tsx` — configuration view rendering only.
- Create: `src/components/SleeperRosterSync/SleeperRosterPreview.tsx` — preview view rendering only.
- Modify: `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx` — replace monolith with dialog shell and composed views.
- Modify: `src/__tests__/SleeperRosterSyncDialog.test.tsx` — strengthen saved-ID auto-sync, unsaved-ID non-auto-sync, and pending-timer unmount characterization.

## Task 1: Strengthen behavior characterization at the new hook seams

**Files:**

- Modify: `src/__tests__/SleeperRosterSyncDialog.test.tsx`

**Interfaces:**

- Consumes: existing `SleeperRosterSyncDialog` public props and mocked Sleeper server actions.
- Produces: behavior constraints that later tasks must preserve.

- [ ] **Step 1: Add saved-ID exact-once auto-sync assertions**

In the existing saved-ID auto-sync test, wait for roster mapping rendering and then assert exactly one
matching request, rather than only a matching call argument:

```tsx
await waitFor(() =>
  expect(mockPreviewMatch).toHaveBeenCalledWith({ draftId: 4, leagueId: 'league-1' }),
);
await screen.findByTestId('sleeper-sync-roster-map-9');
expect(mockPreviewMatch).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Characterize that typed IDs do not auto-sync**

In the on-demand mapping test, type the ID, allow queued effects to settle, assert no request, click
Sync, and then assert exactly one request:

```tsx
await user.type(screen.getByTestId('sleeper-sync-league-id'), 'league-1');
await act(async () => {
  await Promise.resolve();
});
expect(mockPreviewMatch).not.toHaveBeenCalled();

await user.click(screen.getByTestId('sleeper-sync-sync-button'));
await waitFor(() => expect(mockPreviewMatch).toHaveBeenCalledTimes(1));
```

- [ ] **Step 3: Characterize cleanup of pending status timers**

Add two fake-timer dialog tests: one for a pending validation-error announcement and one for a
pending successful-import announcement. In each case unmount before advancing 50 ms, advance the
timers inside `act`, and assert the shared live region is absent without a post-unmount update:

```tsx
jest.useFakeTimers();
const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
const { unmount } = render(
  <SleeperRosterSyncDialog
    draftId={4}
    teams={TEAMS}
    initiallyConfigured={true}
    onClose={jest.fn()}
  />,
);
await screen.findByTestId('sleeper-sync-price-3');
await user.type(screen.getByTestId('sleeper-sync-price-3'), '4.5');
await user.click(screen.getByTestId('sleeper-sync-submit'));
unmount();
act(() => jest.advanceTimersByTime(50));
expect(screen.queryByTestId('mutation-status')).not.toBeInTheDocument();
```

For the success case, enter `42` in the same rendered price input, click
`sleeper-sync-submit`, immediately unmount before the 50 ms success timer fires, and repeat the
final `act` and assertion above.

- [ ] **Step 4: Run focused characterization tests**

Run: `pnpm test -- SleeperRosterSyncDialog.test.tsx --runInBand`

Expected: all existing and strengthened application-behavior tests pass before any extraction.

- [ ] **Step 5: Commit the characterization update**

```bash
git add src/__tests__/SleeperRosterSyncDialog.test.tsx
git commit -m "test: characterize Sleeper sync dialog boundaries"
```

## Task 2: Extract shared contracts and state orchestration

**Files:**

- Create: `src/components/SleeperRosterSync/sleeperRosterSyncTypes.ts`
- Create: `src/components/SleeperRosterSync/useSleeperRosterSyncState.ts`
- Modify: `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx`
- Test: `src/__tests__/SleeperRosterSyncDialog.test.tsx`

**Interfaces:**

- Consumes: `SleeperRosterSyncDialogProps`, Sleeper action response types, `LeagueTeam`, `SleeperRosterPreview`, and `useRouter`.
- Produces: `useSleeperRosterSyncState(props): SleeperRosterSyncState`, including view/status state, prepared configuration rows, prepared preview rows, and all event callbacks consumed by Tasks 3 and 4.

- [ ] **Step 1: Define explicit shared interfaces**

Move the public props and `SyncView` contract into `sleeperRosterSyncTypes.ts`. Define display data
for configuration options and preview rows so renderers do not make domain decisions:

```ts
export interface SleeperRosterMappingOption {
  id: number;
  label: string;
  disabled: boolean;
}

export interface SleeperRosterPreviewRow {
  playerId: number;
  playerName: string;
  position: Position;
  nflTeam: string;
  targetBudget: number;
  teamHandle: string;
  price: string;
  conflictMessage: string | null;
}
```

- [ ] **Step 2: Move all orchestration into the hook without changing logic**

Transfer every `useState`, ref, callback, effect, action invocation, error/success message, and
validation branch from the dialog into `useSleeperRosterSyncState`. Keep the current dependencies,
the `queueMicrotask` auto-sync scheduling, and direct `setError` preview failures unchanged. Return
prepared option disabled state and conflict messages from the hook (or pure module-local mappers),
not computations in view components:

```ts
export function useSleeperRosterSyncState(
  props: SleeperRosterSyncDialogProps,
): SleeperRosterSyncState {
  return {
    view,
    error,
    successMessage,
    configuration,
    preview,
    loadPreview,
    syncLeague,
    saveConfiguration,
    submitCatchUp,
  };
}
```

- [ ] **Step 3: Temporarily render the hook result through the existing shell**

Keep the dialog JSX in `SleeperRosterSyncDialog.tsx` while reading values and handlers from the
hook. This makes the state extraction independently testable before moving rendered sections.

- [ ] **Step 4: Run the focused suite**

Run: `pnpm test -- SleeperRosterSyncDialog.test.tsx --runInBand`

Expected: all dialog characterization tests pass with unchanged behavior.

- [ ] **Step 5: Commit the state extraction**

```bash
git add src/components/SleeperRosterSync/sleeperRosterSyncTypes.ts \
  src/components/SleeperRosterSync/useSleeperRosterSyncState.ts \
  src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx
git commit -m "refactor: extract Sleeper sync state"
```

## Task 3: Extract the configuration view

**Files:**

- Create: `src/components/SleeperRosterSync/SleeperRosterConfiguration.tsx`
- Modify: `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx`
- Test: `src/__tests__/SleeperRosterSyncDialog.test.tsx`

**Interfaces:**

- Consumes: configuration display model and callbacks from `useSleeperRosterSyncState`.
- Produces: `SleeperRosterConfiguration`, a JSX-only configuration section that preserves current selectors and DOM semantics.

- [ ] **Step 1: Define typed configuration props**

Use an explicit props interface that passes the existing visible state and handlers only:

```tsx
interface SleeperRosterConfigurationProps {
  leagueId: string;
  isSyncing: boolean;
  candidates: SleeperRosterConfigurationCandidate[] | null;
  onLeagueIdChange: (leagueId: string) => void;
  onSync: () => void;
  onMappingChange: (rosterId: number, teamId: string) => void;
  onSave: () => void;
}
```

- [ ] **Step 2: Move configuration JSX unchanged**

Move only the `view === 'configuration'` markup into the new component. Preserve every current
`id`, `data-testid`, option ordering, label construction, disabled value, button copy, and button
disabled state. Do not calculate duplicate-team disabling or auto-match display state in JSX; use
the supplied display model.

- [ ] **Step 3: Compose configuration from the dialog shell**

Replace the inline configuration branch with:

```tsx
{
  state.view === 'configuration' && <SleeperRosterConfiguration {...state.configuration} />;
}
```

- [ ] **Step 4: Run focused tests**

Run: `pnpm test -- SleeperRosterSyncDialog.test.tsx --runInBand`

Expected: configuration, auto-sync, mapping override, and duplicate-disable tests remain green.

- [ ] **Step 5: Commit the configuration extraction**

```bash
git add src/components/SleeperRosterSync/SleeperRosterConfiguration.tsx \
  src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx
git commit -m "refactor: extract Sleeper sync configuration"
```

## Task 4: Extract the preview view and complete the composition shell

**Files:**

- Create: `src/components/SleeperRosterSync/SleeperRosterPreview.tsx`
- Modify: `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx`
- Test: `src/__tests__/SleeperRosterSyncDialog.test.tsx`

**Interfaces:**

- Consumes: prepared preview display rows, diagnostics, and callbacks from `useSleeperRosterSyncState`.
- Produces: `SleeperRosterPreview`, a JSX-only preview section, and a small dialog shell.

- [ ] **Step 1: Define typed preview props**

Keep an explicit interface for prepared rows and callbacks:

```tsx
interface SleeperRosterPreviewProps {
  preview: SleeperRosterPreviewDisplay;
  onPriceChange: (playerId: number, price: string) => void;
  onSubmit: () => void;
}
```

- [ ] **Step 2: Move preview JSX unchanged**

Move only the current `view === 'preview'` markup. Preserve all test IDs, price input constraints,
position accent behavior, row ordering, empty state, pluralization, conflict copy, and disabled
submission behavior. Consume the hook-prepared conflict message rather than translating a conflict
reason in the renderer.

- [ ] **Step 3: Reduce the dialog to composition**

The final shell contains `Dialog`, `DialogContent`, `DialogTitle`, `MutationStatus`, loading,
configuration, preview, retry, and error branches. It calls the hook once and forwards `onClose`.
It contains no server-action calls, state setters, timer refs, effects, mapping checks, price
validation, or conflict-copy conditionals.

- [ ] **Step 4: Run focused tests and static checks**

Run:

```bash
pnpm test -- SleeperRosterSyncDialog.test.tsx --runInBand
pnpm tsc --noEmit
pnpm lint
```

Expected: all commands pass.

- [ ] **Step 5: Commit the preview and shell extraction**

```bash
git add src/components/SleeperRosterSync/SleeperRosterPreview.tsx \
  src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx
git commit -m "refactor: compose Sleeper sync dialog"
```

## Task 5: Full verification and review preparation

**Files:**

- Verify: `src/components/SleeperRosterSync/`
- Verify: `src/__tests__/SleeperRosterSyncDialog.test.tsx`

**Interfaces:**

- Consumes: complete extracted dialog implementation.
- Produces: verified, review-ready structural-only diff.

- [ ] **Step 1: Inspect the final diff for scope**

Run:

```bash
git diff worktree-hard-022-draft-form...HEAD -- src/components/SleeperRosterSync \
  src/__tests__/SleeperRosterSyncDialog.test.tsx
git status --short
```

Confirm only the Sleeper dialog decomposition, necessary behavior-characterization tests, and the
approved spec/plan documents are included.

- [ ] **Step 2: Run the full quality gate outside the sandbox**

Run: `make check`

Expected: typecheck, lint, formatting, and all unit tests pass. Use elevated execution because
`localFonts.test.ts` invokes `git`, which sandbox policy rejects.

- [ ] **Step 3: Request Sol final review**

Give the reviewer the stacked base SHA, final SHA, approved design, plan, test results, and the
strict structural-only constraint. Resolve all critical and important findings before PR creation.

- [ ] **Step 4: Commit any review fixes**

```bash
git add <reviewed-files>
git commit -m "test: preserve Sleeper sync dialog behavior"
```
