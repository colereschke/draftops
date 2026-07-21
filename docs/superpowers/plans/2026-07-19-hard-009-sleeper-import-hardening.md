# HARD-009 Sleeper Import Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sleeper imports and roster-sync calls authenticated, bounded, runtime-validated, and truthful about settings DraftOps excludes.

**Architecture:** Put league-ID validation, timeout/retry behavior, response schemas, and typed external failures in `src/lib/sleeper.ts`. Server actions consume that single boundary; the new-draft form displays non-blocking source warnings in its existing transient confirmation.

**Tech Stack:** Next.js server actions, TypeScript strict mode, Zod 4, Jest 30, React Testing Library.

## Global Constraints

- Authenticate draft import before validating input or contacting Sleeper.
- Accept only trimmed decimal league IDs of 5–25 characters; invalid IDs cause no fetch.
- Apply `AbortSignal.timeout(5_000)` to every request; attempt transient network, 429, and 5xx failures at most twice.
- Runtime-validate league, user, and roster payloads; do not use type assertions to cross the external boundary.
- Count only QB/RB/WR/TE/FLEX/SUPER_FLEX and BN toward auction settings. Exclude IR, taxi, K, defense/DST, IDP, and unknown slots.
- Omit unsupported scoring settings and warn only when an unsupported numeric setting is nonzero.
- Successful imports with excluded settings remain successful and show warnings only in the existing post-import confirmation.
- Use project formatting and `data-testid` selectors for UI tests.

---

## File Structure

- Modify `src/lib/sleeper.ts`: validated client, typed error codes, runtime schemas, retry policy, and truthful settings mapper.
- Modify `src/lib/sleeper-actions.ts`: authenticated import and actionable external failures.
- Modify `src/lib/sleeper-roster-actions.ts`: typed external failure mapping for roster sync.
- Modify `src/app/drafts/new/page.tsx`: multiple one-time import warnings.
- Create `src/__tests__/sleeper-client.test.ts`: direct client boundary coverage.
- Modify `src/__tests__/sleeper-import.test.ts`, `sleeper-actions.test.ts`, `sleeper-roster-actions.test.ts`, and `drafts-new-form.test.tsx`: mapper, action, and UI behavior.

## Task 1: Create a validated, bounded Sleeper client

**Files:**

- Create: `src/__tests__/sleeper-client.test.ts`
- Modify: `src/lib/sleeper.ts:1-73`

**Interfaces:**

- Produces `SleeperClientFailureCode = 'INVALID_LEAGUE_ID' | 'NOT_FOUND' | 'TIMEOUT' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'MALFORMED_RESPONSE'`.
- Produces `class SleeperClientError extends Error { readonly code: SleeperClientFailureCode }`.
- Produces `validateSleeperLeagueId(leagueId: string): string`.
- Keeps the three exported endpoint functions, but each resolves only validated domain objects or rejects with `SleeperClientError`.

- [ ] **Step 1: Write the failing client tests**

Create `src/__tests__/sleeper-client.test.ts`. Mock `global.fetch`, create a valid 19-digit ID and valid endpoint fixtures, and assert invalid IDs do not fetch, 404/429/503/rejected fetch/invalid JSON/malformed payloads classify correctly, and a 503 then valid response succeeds on its second call.

```ts
it('rejects invalid IDs before fetch', async () => {
  await expect(fetchSleeperLeague('league-id')).rejects.toMatchObject({
    code: 'INVALID_LEAGUE_ID',
  });
  expect(mockFetch).not.toHaveBeenCalled();
});

it('retries one transient response then returns parsed data', async () => {
  mockFetch
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(jsonResponse(VALID_LEAGUE));
  await expect(fetchSleeperLeague(VALID_ID)).resolves.toEqual(VALID_LEAGUE);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

it.each([
  [404, 'NOT_FOUND'],
  [429, 'RATE_LIMITED'],
  [503, 'UNAVAILABLE'],
])('classifies HTTP %i', async (status, code) => {
  mockFetch.mockResolvedValue(new Response(null, { status }));
  await expect(fetchSleeperLeague(VALID_ID)).rejects.toMatchObject({ code });
});
```

- [ ] **Step 2: Run the tests to establish the failing baseline**

Run: `pnpm test -- sleeper-client.test.ts`

Expected: FAIL because the typed client boundary does not exist.

- [ ] **Step 3: Implement the typed client boundary**

Import `z` in `src/lib/sleeper.ts`; add `SLEEPER_REQUEST_TIMEOUT_MS = 5_000` and `SLEEPER_MAX_ATTEMPTS = 2`. Define schemas for only required endpoint fields: named league, positive integer roster count, string slots and numeric scoring map; users with nonempty IDs/names and optional team name; and rosters with positive IDs, nullable owner, and optional string arrays.

```ts
export class SleeperClientError extends Error {
  constructor(readonly code: SleeperClientFailureCode) {
    super(code);
    this.name = 'SleeperClientError';
  }
}

export function validateSleeperLeagueId(leagueId: string): string {
  const normalized = leagueId.trim();
  if (!/^\d{5,25}$/.test(normalized)) {
    throw new SleeperClientError('INVALID_LEAGUE_ID');
  }
  return normalized;
}

async function requestSleeper<T>(leagueId: string, path: string, schema: z.ZodType<T>): Promise<T> {
  const normalizedLeagueId = validateSleeperLeagueId(leagueId);
  let lastCode: SleeperClientFailureCode = 'UNAVAILABLE';
  for (let attempt = 1; attempt <= SLEEPER_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${SLEEPER_BASE}/league/${normalizedLeagueId}${path}`, {
        signal: AbortSignal.timeout(SLEEPER_REQUEST_TIMEOUT_MS),
      });
      if (response.status === 404) throw new SleeperClientError('NOT_FOUND');
      if (response.status === 429) lastCode = 'RATE_LIMITED';
      else if (!response.ok) lastCode = 'UNAVAILABLE';
      else {
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          throw new SleeperClientError('MALFORMED_RESPONSE');
        }
        const parsed = schema.safeParse(data);
        if (!parsed.success) throw new SleeperClientError('MALFORMED_RESPONSE');
        return parsed.data;
      }
    } catch (error) {
      if (error instanceof SleeperClientError) throw error;
      lastCode =
        error instanceof DOMException && error.name === 'TimeoutError' ? 'TIMEOUT' : 'UNAVAILABLE';
    }
  }
  throw new SleeperClientError(lastCode);
}
```

Make 429 and 5xx continue while an attempt remains. Convert rejected `.json()` calls to `MALFORMED_RESPONSE`, and wrap the endpoint-specific schemas through `requestSleeper` for `''`, `'/users'`, and `'/rosters'`.

- [ ] **Step 4: Verify the bounded client**

Run: `pnpm test -- sleeper-client.test.ts && pnpm typecheck`

Expected: PASS. Extend the test to inspect the fetch options and assert `signal` is an `AbortSignal`.

- [ ] **Step 5: Commit the client boundary**

```bash
git add src/lib/sleeper.ts src/__tests__/sleeper-client.test.ts
git commit -m "feat: harden Sleeper client boundary"
```

## Task 2: Translate settings without silently changing league truth

**Files:**

- Modify: `src/lib/sleeper.ts:23-145`
- Modify: `src/__tests__/sleeper-import.test.ts:1-175`

**Interfaces:**

- Consumes validated `SleeperLeague`, `SleeperUser[]`, and `SleeperRoster[]`.
- Extends `SleeperImportResult` with `warnings: string[]`.

- [ ] **Step 1: Write failing mapper tests**

Replace the assertion that all `roster_positions` contribute to roster size. Add a league with QB, SUPER_FLEX, BN, IR, TAXI, K, DEF, DL, and WEIRD slots and a nonzero `idp_tkl` score. Assert the auction roster size is 3, the lineup has QB and SUPER_FLEX only, and warning text names excluded slots and `idp_tkl`.

```ts
expect(result.rosterSize).toBe(3);
expect(result.startingLineup).toEqual(['QB', 'SUPER_FLEX']);
expect(result.warnings.join(' ')).toMatch(/IR.*TAXI.*K.*DEF.*DL.*WEIRD/i);
expect(result.warnings.join(' ')).toMatch(/idp_tkl/i);
```

- [ ] **Step 2: Run mapper tests to confirm failure**

Run: `pnpm test -- sleeper-import.test.ts`

Expected: FAIL because the mapper counts all slots and returns no warnings.

- [ ] **Step 3: Add explicit supported-slot and scoring-key sets**

```ts
const BENCH_SLOT = 'BN';
const SUPPORTED_ROSTER_SLOTS = new Set([...VALID_SLOTS, BENCH_SLOT]);
const SUPPORTED_SCORING_KEYS = new Set([
  'pass_yd',
  'pass_td',
  'pass_int',
  'rush_att',
  'rush_fd',
  'rec',
  'bonus_rec_rb',
  'bonus_rec_wr',
  'bonus_rec_te',
  'rec_fd',
  'bonus_fd_rb',
  'bonus_fd_wr',
  'bonus_fd_te',
]);
```

Map only `VALID_SLOTS` to `startingLineup`; calculate `rosterSize` using `SUPPORTED_ROSTER_SLOTS`. Deduplicate unsupported slot values and add one warning when present. Add another warning for nonzero unknown numeric scoring keys. Include `warnings` in the successful result while preserving existing PPR, owner, and team mapping behavior.

- [ ] **Step 4: Verify translation**

Run: `pnpm test -- sleeper-import.test.ts sleeper-client.test.ts sleeperMatch.test.ts sleeperNormalize.test.ts`

Expected: PASS. Supported imports retain their current mapping, while ignored settings do not affect auction configuration.

- [ ] **Step 5: Commit truthful settings translation**

```bash
git add src/lib/sleeper.ts src/__tests__/sleeper-import.test.ts
git commit -m "feat: warn on unsupported Sleeper settings"
```

## Task 3: Authenticate draft imports and show actionable outcomes

**Files:**

- Modify: `src/lib/sleeper-actions.ts:1-29`
- Modify: `src/__tests__/sleeper-actions.test.ts:1-100`
- Modify: `src/app/drafts/new/page.tsx:33-202`
- Modify: `src/__tests__/drafts-new-form.test.tsx`

**Interfaces:**

- Consumes `auth()`, `SleeperClientError`, and `SleeperImportResult.warnings`.
- Retains `ImportResponse = { ok: true; data: SleeperImportResult } | { ok: false; error: string }`.
- Changes page success state from a nullable warning to `warnings: string[]`.

- [ ] **Step 1: Write failing server-action and form tests**

Mock `@/auth` in `sleeper-actions.test.ts`. Verify a null session returns `'Sign in to import a Sleeper league.'` and no mocked endpoint runs. Add table tests mapping each `SleeperClientError` code to an actionable message. In `drafts-new-form.test.tsx`, mock a successful import with two source warnings plus an unmatched owner name and verify `data-testid="sleeper-import-warning"` contains all three strings.

```ts
it('rejects anonymous imports before contacting Sleeper', async () => {
  mockAuth.mockResolvedValue(null);
  await expect(importFromSleeper(VALID_ID)).resolves.toEqual({
    ok: false,
    error: 'Sign in to import a Sleeper league.',
  });
  expect(mockFetchLeague).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the action and form tests to confirm failure**

Run: `pnpm test -- sleeper-actions.test.ts drafts-new-form.test.tsx`

Expected: FAIL because import is unauthenticated and the page stores one nullable warning.

- [ ] **Step 3: Implement auth-first outcome mapping and warning composition**

At the top of `importFromSleeper`, call `auth()`; return the sign-in message if `session?.user.id` is absent. Catch `SleeperClientError` with an exhaustive `Record<SleeperClientFailureCode, string>`:

```ts
const SLEEPER_IMPORT_MESSAGES: Record<SleeperClientFailureCode, string> = {
  INVALID_LEAGUE_ID: 'Enter a valid Sleeper league ID.',
  NOT_FOUND: 'League not found. Check your Sleeper league ID.',
  TIMEOUT: 'Sleeper timed out. Try again in a moment.',
  RATE_LIMITED: 'Sleeper is rate-limiting requests. Try again shortly.',
  MALFORMED_RESPONSE: 'Sleeper returned unexpected league data. Try again later.',
  UNAVAILABLE: 'Sleeper is unavailable — try again.',
};
```

Keep a generic message only for unexpected internal exceptions. In the page, merge `data.warnings` with the existing owner mismatch message into a string array, set that array in `ImportState`, and render its elements joined in the existing warning paragraph. Never apply returned fields when `result.ok` is false.

- [ ] **Step 4: Verify auth and UI behavior**

Run: `pnpm test -- sleeper-actions.test.ts drafts-new-form.test.tsx && pnpm typecheck && pnpm lint`

Expected: PASS. Anonymous requests do not leave the server action, typed service failures have distinct copy, and source warnings are transient.

- [ ] **Step 5: Commit secure import behavior**

```bash
git add src/lib/sleeper-actions.ts src/app/drafts/new/page.tsx src/__tests__/sleeper-actions.test.ts src/__tests__/drafts-new-form.test.tsx
git commit -m "feat: secure Sleeper draft imports"
```

## Task 4: Apply typed client failures to roster sync

**Files:**

- Modify: `src/lib/sleeper-roster-actions.ts:56-224`
- Modify: `src/__tests__/sleeper-roster-actions.test.ts:1-450`
- Modify: `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx` only if its current error switch lacks new codes.

**Interfaces:**

- Consumes `SleeperClientError` and `validateSleeperLeagueId` from Task 1.
- Preserves current ownership-first behavior and response unions; adds `'timeout'`, `'rate_limited'`, and `'malformed_response'` to the relevant roster response unions, retaining `'sleeper_error'` for unavailable and not-found external service states.

- [ ] **Step 1: Write failing sync outcome tests**

Use `new SleeperClientError(code)` in roster-action tests. Verify unauthenticated actions still make no external call. For `previewSleeperRosterMatch`, assert invalid ID returns `invalid_league_id` before endpoint calls and that TIMEOUT, RATE_LIMITED, MALFORMED_RESPONSE, and UNAVAILABLE return the distinct expected action codes.

```ts
it.each([
  ['TIMEOUT', 'timeout'],
  ['RATE_LIMITED', 'rate_limited'],
  ['MALFORMED_RESPONSE', 'malformed_response'],
  ['UNAVAILABLE', 'sleeper_error'],
])('maps %s safely', async (clientCode, code) => {
  mockFetchLeague.mockRejectedValue(new SleeperClientError(clientCode));
  await expect(previewSleeperRosterMatch({ draftId: 4, leagueId: VALID_ID })).resolves.toEqual({
    ok: false,
    code,
  });
});
```

- [ ] **Step 2: Run sync tests to confirm failure**

Run: `pnpm test -- sleeper-roster-actions.test.ts`

Expected: FAIL because production code checks old string messages and collapses client outcomes.

- [ ] **Step 3: Replace string matching with typed response mapping**

Delete `isSleeperError`. After `requireOwnedDraft` succeeds, call `validateSleeperLeagueId` before every request sequence. Add narrow local mapper functions for each response union so TypeScript does not admit invalid codes:

```ts
function sleeperSyncFailure(error: unknown): SleeperRosterSyncResponse | null {
  if (!(error instanceof SleeperClientError)) return null;
  switch (error.code) {
    case 'INVALID_LEAGUE_ID':
      return { ok: false, code: 'invalid_league_id' };
    case 'TIMEOUT':
      return { ok: false, code: 'timeout' };
    case 'RATE_LIMITED':
      return { ok: false, code: 'rate_limited' };
    case 'MALFORMED_RESPONSE':
      return { ok: false, code: 'malformed_response' };
    default:
      return { ok: false, code: 'sleeper_error' };
  }
}
```

Use equivalent narrow mappers for match and catch-up unions; rethrow only unexpected errors. Update the dialog's visible error copy for every new returned code if needed.

- [ ] **Step 4: Verify sync behavior**

Run: `pnpm test -- sleeper-roster-actions.test.ts sleeper-roster-match.test.ts sleeperRosterSync.test.ts && pnpm test`

Expected: PASS. Normal sync flows retain their behavior, while malformed and transient external states are actionable.

- [ ] **Step 5: Commit roster-sync hardening**

```bash
git add src/lib/sleeper-roster-actions.ts src/__tests__/sleeper-roster-actions.test.ts src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx
git commit -m "feat: classify Sleeper roster sync failures"
```

## Task 5: Verify final scope and quality

**Files:**

- Verify only; do not add source files unless a check exposes a concrete defect.

- [ ] **Step 1: Run the complete quality gate**

Run: `make check`

Expected: exit code 0 with TypeScript, ESLint, Prettier, and all Jest suites passing.

- [ ] **Step 2: Inspect final scope**

Run: `git status --short && git diff main...HEAD --check && git diff --stat main...HEAD`

Expected: no unexpected files or whitespace errors; no Prisma schema or migration changes.

- [ ] **Step 3: Correct only check-proven defects**

If a quality check fails, first add a focused regression test, then apply the smallest correction, rerun `make check`, and commit the affected source and test with an exact message. Do not add a cosmetic cleanup commit.

## Self-Review

- Spec coverage: Task 1 covers preflight validation, timeout, retry, HTTP distinctions, and payload validation. Task 2 covers truthful slot/scoring translation and non-blocking warnings. Task 3 covers authentication and new-draft outcomes. Task 4 reuses the same typed boundary in roster sync. Task 5 verifies the entire result.
- Placeholder scan: each implementation and test action has concrete interfaces, commands, expected outcomes, and code examples.
- Type consistency: all tasks share `SleeperClientError`, `SleeperClientFailureCode`, `SleeperImportResult.warnings`, and the existing action response contracts.
