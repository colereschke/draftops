# HARD-017 Client Payloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound Sleeper identity search payloads, eliminate hidden/overlapping background work, and record reproducible value-sheet performance evidence without changing table semantics.

**Architecture:** Add a small authenticated rankings search route and replace the large server-to-client Sleeper list with debounced, cancellable row searches. Extract nomination polling into a focused hook that schedules only after a request settles, and make budget refresh visibility-aware. A Playwright-only diagnostic project records baseline and final RSC, DOM, and interaction data; Jest remains responsible for deterministic behavior.

**Tech Stack:** Next.js 16 App Router route handlers and Server Components, React 19 hooks/transitions, TypeScript 5, Prisma 7/PostgreSQL, Jest + React Testing Library, Playwright.

## Global Constraints

- Use `pnpm`; never run the performance command against development or production data.
- Keep `PlayerTable` as a semantic table. Do not apply `content-visibility` to `tr` elements and do not introduce virtualization without a new approved design.
- Sleeper search accepts only normalized 2–80-character queries and `QB`/`RB`/`WR`/`TE`, selects four public fields, orders deterministically, and returns at most eight records.
- Scheduled nomination and budget refreshes must not overlap and must not continue while `document.visibilityState === 'hidden'`.
- Preserve existing ranking-match authorization, auction semantics, and server-action ownership validation.
- Automated tests select through `data-testid` or `id`; browser performance measurement is diagnostic, while payload bounds and scheduler behavior are deterministic tests.
- Finish with `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and focused/full Jest suites before reporting success.

---

## File Structure

| File                                                                   | Responsibility                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/sleeperSearch.ts`                                             | Shared public result, accepted-position, validation, and route-response types.        |
| `src/app/api/rankings/sleeper-search/route.ts`                         | Authenticated, bounded Prisma search endpoint.                                        |
| `src/app/rankings/page.tsx`                                            | Select only ranking summary/unmatched fields; never serialize all Sleeper identities. |
| `src/components/RankingsUpload/ResolveUnmatchedList.tsx`               | Per-row debounce, abort, stale-response protection, and selection UI.                 |
| `src/components/NominationHelper/useNominationData.ts`                 | Visibility-aware, completion-scheduled nomination data loader.                        |
| `src/components/NominationHelper/NominationHelper.tsx`                 | Render state and mutations using the extracted loader.                                |
| `src/components/BudgetPressure/BudgetRefresher.tsx`                    | Visibility-aware refresh dispatch guarded by a React transition.                      |
| `e2e/performance.spec.ts`                                              | Isolated diagnostic fixture and 25-sample performance measurement.                    |
| `playwright.config.ts`, `package.json`, `docs/performance/hard-017.md` | Explicit diagnostic project, command, and committed measurement record.               |

### Task 1: Establish the reproducible performance baseline

**Files:**

- Create: `e2e/performance.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Create: `docs/performance/hard-017.md`

**Interfaces:**

- Produces: `pnpm performance:hard-017`, which runs only the `performance` Playwright project.
- Produces: `docs/performance/hard-017.md` with browser/version, viewport, CPU rate, fixture counts, raw filter/sort samples, p75 values, RSC byte counts, and DOM counts.
- Consumes: the disposable `DATABASE_URL`, `E2E_TEST_USER_ID`, `e2e/db.ts`, and the authenticated storage state from `e2e/global-setup.ts`.

- [ ] **Step 1: Add the failing diagnostic test and project wiring**

  Add a Playwright project that cannot be selected by the regular smoke suite and a script that selects it explicitly:

  ```ts
  // playwright.config.ts
  {
    name: 'performance',
    testMatch: /performance\.spec\.ts/,
    use: { ...devices['Desktop Chrome'], storageState: './e2e/.auth/user.json' },
  }
  ```

  ```json
  // package.json
  "performance:hard-017": "playwright test --project=performance"
  ```

  In `e2e/performance.spec.ts`, create a draft owned by `E2E_TEST_USER_ID`, 12 teams, 267 players,
  a ranking set with one unmatched QB row, and at least eight matching `SleeperPlayer` rows in
  `test.beforeAll`. Delete exactly those records in `test.afterAll`. Use a `hard-017-${Date.now()}`
  prefix to ensure cleanup targets only this fixture.

- [ ] **Step 2: Run the new diagnostic test to verify it fails**

  Run: `pnpm performance:hard-017`

  Expected: FAIL because the benchmark has not yet recorded the RSC, DOM, search, and interaction
  measurements or written the required report.

- [ ] **Step 3: Implement the measurement harness**

  Use a Chromium CDP session to apply the 4x throttle, collect 25 samples, and compute p75 without
  adding a runtime dependency:

  ```ts
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  function percentile75(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length * 0.75) - 1];
  }
  ```

  Capture client-navigation responses whose `content-type` includes `text/x-component`; record
  `Buffer.byteLength(await response.text())`. Count `player-row-*` elements and descendants after
  navigation. For each filter/sort sample, mark before the click/type, wait for the expected
  `data-testid` state plus two `requestAnimationFrame` callbacks, then record elapsed time. Discard
  the first five samples and write the remaining raw values and p75 summary to the report.

- [ ] **Step 4: Run the diagnostic command and capture the baseline**

  Run: `pnpm performance:hard-017`

  Expected: PASS on the disposable database and create a baseline report that contains 20 filter and
  20 sort samples, route/search byte measurements, and row/DOM counts.

- [ ] **Step 5: Commit the measurement infrastructure and baseline report**

  ```bash
  git add playwright.config.ts package.json e2e/performance.spec.ts docs/performance/hard-017.md
  git commit -m "test: measure HARD-017 performance baseline"
  ```

### Task 2: Add the bounded Sleeper-search route

**Files:**

- Create: `src/lib/sleeperSearch.ts`
- Create: `src/app/api/rankings/sleeper-search/route.ts`
- Create: `src/__tests__/api/sleeperSearch.route.test.ts`

**Interfaces:**

- Produces: `SleeperSearchPosition = 'QB' | 'RB' | 'WR' | 'TE'`.
- Produces: `SleeperSearchResult` with `id`, `name`, `team`, and `pos`.
- Produces: `GET(request: NextRequest): Promise<NextResponse>` at `/api/rankings/sleeper-search`.
- Consumes: `auth()`, `prisma.sleeperPlayer.findMany`, and `normalizeName`.

- [ ] **Step 1: Write failing route tests**

  Mock the auth helper and only `prisma.sleeperPlayer.findMany`. Verify no query occurs for an absent
  session, punctuation-only/one-character/81-character normalized queries, and `PICK`. Verify the
  valid QB request has this exact query contract:

  ```ts
  expect(mockSleeperFindMany).toHaveBeenCalledWith({
    where: { normalizedName: { contains: 'josh' }, pos: 'QB' },
    select: { id: true, name: true, team: true, pos: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 8,
  });
  expect(await response.json()).toEqual({ results: EXPECTED_RESULTS });
  ```

  Add a database-rejection test that expects status 500 and `{ error: 'Unable to search players' }`.

- [ ] **Step 2: Run the route test to verify it fails**

  Run: `pnpm test src/__tests__/api/sleeperSearch.route.test.ts --runInBand`

  Expected: FAIL because the route and shared types do not exist.

- [ ] **Step 3: Implement shared types, validation, and the route**

  Keep the contract server-neutral and narrow:

  ```ts
  export const SLEEPER_SEARCH_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
  export type SleeperSearchPosition = (typeof SLEEPER_SEARCH_POSITIONS)[number];

  export interface SleeperSearchResult {
    id: string;
    name: string;
    team: string;
    pos: SleeperSearchPosition;
  }

  export interface SleeperSearchResponse {
    results: SleeperSearchResult[];
  }
  ```

  Normalize `searchParams.get('q') ?? ''`, validate the normalized length and exact position before
  Prisma access, return `{ error: 'Invalid search query' }` or `{ error: 'Invalid position' }` with
  400, and map Prisma's string `pos` to the validated position type only after the exact filter.

- [ ] **Step 4: Run the route tests to verify they pass**

  Run: `pnpm test src/__tests__/api/sleeperSearch.route.test.ts --runInBand`

  Expected: PASS, including the eight-result query cap and non-leaking error response.

- [ ] **Step 5: Commit the endpoint**

  ```bash
  git add src/lib/sleeperSearch.ts src/app/api/rankings/sleeper-search/route.ts src/__tests__/api/sleeperSearch.route.test.ts
  git commit -m "feat: add bounded Sleeper search"
  ```

### Task 3: Remove the all-Sleeper rankings payload and use cancellable row searches

**Files:**

- Modify: `src/app/rankings/page.tsx`
- Modify: `src/components/RankingsUpload/ResolveUnmatchedList.tsx`
- Modify: `src/__tests__/ResolveUnmatchedList.test.tsx`
- Create: `src/__tests__/rankings-page.test.tsx`

**Interfaces:**

- Consumes: `SleeperSearchResponse` from Task 2 and `resolveRankingMatch(rankingPlayerId, sleeperId)`.
- Produces: `ResolveUnmatchedList({ unmatchedPlayers })`; it no longer accepts `sleeperPlayers`.
- Produces: one request per settled row query: `/api/rankings/sleeper-search?q=<encoded>&position=<pos>`.

- [ ] **Step 1: Write failing page and component tests**

  Mock `prisma.userRankingSet.findUnique` and assert the rankings page uses `select` rather than
  `include: { players: true }`, and that `prisma.sleeperPlayer.findMany` is never called while
  rendering unmatched rows. Replace the current local-filter tests with fake-timer tests that assert:

  ```ts
  await user.type(screen.getByTestId('unmatched-search-1'), 'Josh');
  act(() => jest.advanceTimersByTime(249));
  expect(global.fetch).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/rankings/sleeper-search?q=Josh&position=QB',
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  ```

  Add cases for clearing a one-character query, aborting the previous controller when input changes
  or the row unmounts, ignoring a stale response, rendering a non-abort fetch failure, and selecting
  a returned result through the existing server action.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run: `pnpm test src/__tests__/ResolveUnmatchedList.test.tsx src/__tests__/rankings-page.test.tsx --runInBand`

  Expected: FAIL because the page still serializes `sleeperPlayers` and the component has no fetch
  scheduler.

- [ ] **Step 3: Implement the narrowed page query and row scheduler**

  The page selects only the ranking fields it renders (`name`, `team`, `pos`, `matchStatus`, and the
  existing summary/coverage fields) and passes `{ id, name, team, pos }` for unmatched rows. Each row
  uses a timeout ref, `AbortController` ref, and incrementing request ref. The essential cleanup is:

  ```ts
  return () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    controllerRef.current?.abort();
  };
  ```

  On a non-abort failure, set `error` to `Unable to search Sleeper players. Try again.` and clear
  results. Do not fetch for `PICK` rows or fewer than two normalized query characters.

- [ ] **Step 4: Run focused tests to verify they pass**

  Run: `pnpm test src/__tests__/ResolveUnmatchedList.test.tsx src/__tests__/rankings-page.test.tsx --runInBand`

  Expected: PASS with no full `SleeperPlayer` prop fixture required.

- [ ] **Step 5: Commit the rankings payload reduction**

  ```bash
  git add src/app/rankings/page.tsx src/components/RankingsUpload/ResolveUnmatchedList.tsx src/__tests__/ResolveUnmatchedList.test.tsx src/__tests__/rankings-page.test.tsx
  git commit -m "perf: search Sleeper identities on demand"
  ```

### Task 4: Make nomination polling visibility-aware and non-overlapping

**Files:**

- Create: `src/components/NominationHelper/useNominationData.ts`
- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Modify: `src/__tests__/NominationHelper.ui.test.tsx`
- Create: `src/__tests__/useNominationData.test.tsx`

**Interfaces:**

- Produces: `useNominationData({ draftId, onUnauthorized })` returning `{ data, error, refresh }`.
- `refresh({ supersede: true })` is reserved for mutation recovery; scheduled refreshes never
  supersede a request in flight.
- Consumes: `GET /api/draft/:draftId/nomination-data` and `document.visibilitychange`.

- [ ] **Step 1: Write failing scheduler tests**

  Use fake timers, controllable fetch promises, and a configurable `document.visibilityState`
  property. Assert an initial visible load, no second scheduled call while the first is unresolved,
  no timer dispatch while hidden, abort on hide/unmount, one immediate reload on visibility restore,
  silent abort behavior, and a mutation resync that aborts/replaces a polling request.

  ```ts
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(controllerAbortSpy).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(60_000));
  expect(global.fetch).toHaveBeenCalledTimes(1);
  ```

- [ ] **Step 2: Run the hook test to verify it fails**

  Run: `pnpm test src/__tests__/useNominationData.test.tsx --runInBand`

  Expected: FAIL because the hook does not exist and `NominationHelper` uses `setInterval` directly.

- [ ] **Step 3: Implement completion-scheduled polling and integrate it**

  Keep the domain data shape local to the hook and schedule only in a request `finally` block:

  ```ts
  function scheduleNext(): void {
    if (document.visibilityState !== 'visible' || timeoutRef.current) return;
    timeoutRef.current = setTimeout(() => void refresh(), 30_000);
  }
  ```

  Clear the timeout and abort the controller on hidden, unmount, and `draftId` change. In
  `NominationHelper`, replace `fetchData` state with the hook's `refresh({ supersede: true })` in
  failure recovery; keep optimistic mutation and onboarding behavior unchanged.

- [ ] **Step 4: Run hook and existing nomination tests to verify they pass**

  Run: `pnpm test src/__tests__/useNominationData.test.tsx src/__tests__/NominationHelper.ui.test.tsx src/__tests__/NominationHelper.onboarding.test.tsx --runInBand`

  Expected: PASS; existing failed-mutation recovery still performs one canonical resync.

- [ ] **Step 5: Commit nomination polling changes**

  ```bash
  git add src/components/NominationHelper/useNominationData.ts src/components/NominationHelper/NominationHelper.tsx src/__tests__/useNominationData.test.tsx src/__tests__/NominationHelper.ui.test.tsx
  git commit -m "perf: pause and serialize nomination polling"
  ```

### Task 5: Pause and guard budget refreshes

**Files:**

- Modify: `src/components/BudgetPressure/BudgetRefresher.tsx`
- Modify: `src/__tests__/BudgetRefresher.test.tsx`
- Modify: `src/__tests__/components/BudgetRefresher.test.tsx`

**Interfaces:**

- Produces: a single guarded `requestRefresh()` used by manual clicks, scheduled elapsed refreshes,
  and visibility restoration.
- Consumes: `useTransition`, `document.visibilitychange`, the existing `MutationStatus`, and
  `router.refresh()`.

- [ ] **Step 1: Write failing visibility and pending-state tests**

  Add tests that hide the document before the interval, advance more than one interval, and verify
  no refresh. Restore visibility and verify exactly one refresh/counter reset. Mock `useTransition`
  with a controllable pending state, invoke manual plus scheduled refresh paths, and verify only one
  `router.refresh()` call. Retain the existing delayed live-region re-announcement assertion.

- [ ] **Step 2: Run the focused budget tests to verify they fail**

  Run: `pnpm test src/__tests__/BudgetRefresher.test.tsx src/__tests__/components/BudgetRefresher.test.tsx --runInBand`

  Expected: FAIL because the current one-second interval refreshes hidden documents and has no
  transition guard.

- [ ] **Step 3: Implement guarded visible-only refresh dispatch**

  Use `useTransition` and an imperative ref so timer callbacks cannot observe a stale `isPending`:

  ```ts
  const [isRefreshing, startRefreshTransition] = useTransition();
  const refreshPendingRef = useRef(false);

  function requestRefresh(): void {
    if (document.visibilityState !== 'visible' || refreshPendingRef.current) return;
    refreshPendingRef.current = true;
    startRefreshTransition(() => routerRef.current.refresh());
  }
  ```

  Synchronize the ref when the transition settles, clear timers on hidden/unmount, and disable the
  button while a refresh is pending. Announce `Threat board refreshed.` only after dispatch as the
  existing live region does; do not claim network completion that `router.refresh()` does not expose.

- [ ] **Step 4: Run focused budget tests to verify they pass**

  Run: `pnpm test src/__tests__/BudgetRefresher.test.tsx src/__tests__/components/BudgetRefresher.test.tsx --runInBand`

  Expected: PASS, including manual refresh and live-region regressions.

- [ ] **Step 5: Commit the budget refresh change**

  ```bash
  git add src/components/BudgetPressure/BudgetRefresher.tsx src/__tests__/BudgetRefresher.test.tsx src/__tests__/components/BudgetRefresher.test.tsx
  git commit -m "perf: pause budget refreshes in hidden tabs"
  ```

### Task 6: Verify measurements, payload bounds, and the complete quality gate

**Files:**

- Modify: `docs/performance/hard-017.md`
- Modify: `docs/superpowers/specs/2026-07-21-hard-017-client-payloads-design.md` only if the report
  proves a design threshold cannot be met and a reviewed amendment is required.

**Interfaces:**

- Consumes: the `pnpm performance:hard-017` command from Task 1 and all passing deterministic tests.
- Produces: final baseline-versus-post-change measurements with explicit percentage deltas.

- [ ] **Step 1: Run the final performance diagnostic**

  Run: `pnpm performance:hard-017`

  Expected: PASS against a disposable database. The report contains 20 samples per interaction and
  shows p75 filter/sort at or below 200 ms, no more than 5% growth in value-sheet RSC/DOM metrics,
  and an eight-or-fewer-record search response.

- [ ] **Step 2: Run deterministic and full quality checks**

  Run:

  ```bash
  pnpm test --runInBand
  pnpm typecheck
  pnpm lint
  pnpm format:check
  ```

  Expected: all commands exit 0. Do not run the Playwright diagnostic against a non-disposable
  database.

- [ ] **Step 3: Commit final evidence**

  ```bash
  git add docs/performance/hard-017.md
  git commit -m "docs: record HARD-017 performance results"
  ```

- [ ] **Step 4: Review the final diff before handoff**

  Run: `git diff main...HEAD --check && git status --short --branch`

  Expected: no whitespace errors, a clean worktree, no generated browser/auth artifacts, and changes
  limited to HARD-017 implementation, tests, benchmark plumbing, and performance evidence.
