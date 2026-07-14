# Sleeper Roster Catch-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a draft operator identify Sleeper-rostered players not yet logged in DraftOps and record any priced subset in one safe batch.

**Architecture:** Persist a Sleeper league ID on `Draft` and stable Sleeper roster IDs on `Team` so imported drafts scan immediately and legacy/manual drafts map once. Keep roster reconciliation as a pure server-side module; server actions own configuration, current-Sleeper verification, and transactional writes, while one dialog renders configuration and catch-up states from typed responses.

**Tech Stack:** Next.js 16 App Router, React/TypeScript, Prisma 7/PostgreSQL, Auth.js v5, Jest + React Testing Library, Base UI dialog, Tailwind CSS 4.

## Global Constraints

- Use `Player.sleeperId`, `Team.sleeperRosterId`, and `AuctionResult.playerId` exclusively for roster reconciliation; never use player/team display names as identity.
- Sync is on demand and additive only. Existing auction results are neither edited nor removed by Sleeper state.
- Prices are positive whole dollars. Blank rows are omitted from a batch and remain eligible later.
- Unrecognized Sleeper player IDs are reported but never create a player or block recognized rows.
- All mutations authenticate with `auth()`, scope through `getDraft(session.user.id, draftId)`, and revalidate `/draft/${draftId}`.
- Use typed props interfaces, `data-testid`/`id` test selectors, single quotes, trailing commas, 2-space indentation, and no explicit `any`.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and relevant Jest suites before each feature commit; finish with `make check`.

---

## File structure

| File                                                                               | Responsibility                                                                |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `prisma/schema.prisma` + migration                                                 | Persist Sleeper league/roster references and enforce player-result identity.  |
| `src/lib/sleeper.ts`                                                               | Represent Sleeper roster `players` and preserve roster IDs on league import.  |
| `src/lib/actions.ts`, `src/app/drafts/new/page.tsx`                                | Persist import metadata when creating a draft.                                |
| `src/lib/sleeperRosterSync.ts`                                                     | Pure roster reconciliation types and joins; no Prisma, auth, fetch, or React. |
| `src/lib/sleeper-roster-actions.ts`                                                | Authenticated configuration, preview, and transactional batch-write actions.  |
| `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx`                     | First-use mapping, preview, error, and partial-batch dialog states.           |
| `src/components/AuctionSheet/AuctionSheet.tsx`, `src/app/draft/[draftId]/page.tsx` | Expose the dialog on the value sheet and provide initial config state.        |
| `src/__tests__/*`                                                                  | Unit, action, form, and dialog coverage of the contracts above.               |

## Task 1: Persist Sleeper configuration and carry import metadata

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260714150000_sleeper_roster_sync/migration.sql`
- Modify: `src/lib/sleeper.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/app/drafts/new/page.tsx`
- Modify: `src/__tests__/sleeper-import.test.ts`
- Modify: `src/__tests__/createDraft.test.ts`
- Modify: `src/__tests__/drafts-new-form.test.tsx`

**Interfaces:**

- Produces `SleeperImportTeam { handle: string; displayName: string; sleeperRosterId: number }` and `SleeperImportResult.leagueId`.
- Extends draft creation input with `sleeperLeagueId?: string` and team input with `sleeperRosterId?: number`.
- Produces nullable `Draft.sleeperLeagueId` and `Team.sleeperRosterId`.

- [ ] **Step 1: Write failing import/form/action tests**

```ts
expect(result.teams[0]).toMatchObject({ sleeperRosterId: 1 });
expect(result.leagueId).toBe('1360707683916734464');

expect(mockCreateDraft).toHaveBeenCalledWith(
  expect.objectContaining({
    sleeperLeagueId: '1360707683916734464',
    teams: expect.arrayContaining([expect.objectContaining({ sleeperRosterId: 1 })]),
  }),
);
```

Add a `createDraft` unit test whose Prisma transaction mock asserts `draft.create({ data })` gets
`sleeperLeagueId` and each `team.create({ data })` gets the corresponding `sleeperRosterId`. Keep
the existing manual-draft fixture and assert those fields are `undefined` at the action boundary
and persist as `null`/omitted by Prisma.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test -- sleeper-import drafts-new-form createDraft`

Expected: failures because `leagueId`/`sleeperRosterId` are absent from `SleeperImportResult` and
`createDraft` data.

- [ ] **Step 3: Add schema and migration**

```prisma
model Draft {
  // existing fields
  sleeperLeagueId String?
}

model Team {
  // existing fields
  sleeperRosterId Int?

  @@unique([draftId, sleeperRosterId])
}

model AuctionResult {
  // existing fields
  @@unique([draftId, playerId])
}
```

Create the migration with `pnpm prisma migrate dev --name sleeper_roster_sync`. Before accepting it,
inspect its SQL: it must add the two nullable columns and create the two unique indexes. If an
existing database has duplicate non-null `(draftId, playerId)` rows, resolve them deliberately
before applying the unique index; do not silently delete auction history in the migration.

- [ ] **Step 4: Preserve source roster IDs through import and creation**

```ts
export interface SleeperImportTeam {
  handle: string;
  displayName: string;
  sleeperRosterId: number;
}

export interface SleeperImportResult {
  leagueId: string;
  // existing fields
  teams: SleeperImportTeam[];
}

export function mapSleeperLeague(/* existing args */, leagueId: string): SleeperImportResult {
  // each ordered roster contributes sleeperRosterId: roster.roster_id
}
```

Pass `leagueId` from `importFromSleeper` into `mapSleeperLeague`. In `NewDraftPage`, extend
`TeamRow` with `sleeperRosterId?: number`, set it from imported teams, retain it through edits, and
submit `sleeperLeagueId: leagueId.trim()` only after a successful import. Clear the stored imported
metadata when the user changes the league ID after importing, so a stale ID can never pair with
old roster IDs. Extend `TeamInput` and persist both values in the existing `createDraft`
transaction.

- [ ] **Step 5: Run focused tests and Prisma generation**

Run: `pnpm prisma generate && pnpm test -- sleeper-import drafts-new-form createDraft && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma src/lib/sleeper.ts src/lib/actions.ts src/app/drafts/new/page.tsx src/__tests__
git commit -m "feat: persist Sleeper draft roster mapping"
```

## Task 2: Build and test pure roster reconciliation

**Files:**

- Modify: `src/lib/sleeper.ts`
- Create: `src/lib/sleeperRosterSync.ts`
- Create: `src/__tests__/sleeperRosterSync.test.ts`

**Interfaces:**

- Consumes `SleeperRoster[]`, `{ id, sleeperId, name, pos, nflTeam, budget }[]`,
  `{ id, sleeperRosterId, handle, displayName }[]`, and `Set<number>` of logged player IDs.
- Produces `reconcileSleeperRosters(input): SleeperRosterPreview`.

```ts
export interface SleeperRosterActionableRow {
  playerId: number;
  sleeperId: string;
  playerName: string;
  position: string;
  nflTeam: string;
  targetBudget: number;
  teamId: number;
  teamHandle: string;
  teamDisplayName: string | null;
  sleeperRosterId: number;
}

export interface SleeperRosterUnresolvedRow {
  sleeperId: string;
  sleeperRosterId: number;
}

export interface SleeperRosterDiagnostics {
  alreadyLoggedCount: number;
  unmappedRosterIds: number[];
  duplicateMappedRosterIds: number[];
}
```

- [ ] **Step 1: Write failing reconciliation tests**

```ts
const preview = reconcileSleeperRosters({
  rosters: [{ roster_id: 9, owner_id: 'u1', players: ['known', 'missing'] }],
  teams: [{ id: 7, sleeperRosterId: 9, handle: 'cole', displayName: 'Cole' }],
  players: [{ id: 3, sleeperId: 'known', name: 'A Player', pos: 'WR', nflTeam: 'ATL', budget: 42 }],
  loggedPlayerIds: new Set<number>(),
});

expect(preview.actionable).toEqual([
  expect.objectContaining({ playerId: 3, teamId: 7, sleeperRosterId: 9 }),
]);
expect(preview.unresolved).toEqual([{ sleeperId: 'missing', sleeperRosterId: 9 }]);

expect(reconcileSleeperRosters({ ...input, loggedPlayerIds: new Set([3]) }).actionable).toEqual([]);
```

Also cover `players: null`, unmapped rosters, duplicate mapped roster IDs, and players without a
`sleeperId`; assert they become diagnostics/unresolved and never actionable.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- sleeperRosterSync`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement narrow data-only types and reconciliation**

```ts
export interface SleeperRosterPreview {
  actionable: SleeperRosterActionableRow[];
  unresolved: SleeperRosterUnresolvedRow[];
  diagnostics: SleeperRosterDiagnostics;
}

export function reconcileSleeperRosters(input: ReconcileSleeperRostersInput): SleeperRosterPreview {
  const teamsByRosterId = new Map(
    input.teams.flatMap((team) =>
      team.sleeperRosterId === null ? [] : [[team.sleeperRosterId, team] as const],
    ),
  );
  const playersBySleeperId = new Map(
    input.players.flatMap((player) =>
      player.sleeperId ? [[player.sleeperId, player] as const] : [],
    ),
  );
  // iterate mapped roster players once; skip logged IDs; classify the rest
}
```

Extend `SleeperRoster` to include `players?: string[] | null`; retain compatibility with the
league-import fixtures that omit it. Do not import Prisma types or call Sleeper in this module.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test -- sleeperRosterSync sleeper-import && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sleeper.ts src/lib/sleeperRosterSync.ts src/__tests__/sleeperRosterSync.test.ts src/__tests__/sleeper-import.test.ts
git commit -m "feat: reconcile Sleeper roster gaps"
```

## Task 3: Add authenticated configuration, preview, and batch actions

**Files:**

- Create: `src/lib/sleeper-roster-actions.ts`
- Create: `src/__tests__/sleeper-roster-actions.test.ts`
- Modify: `src/lib/actions.ts`

**Interfaces:**

- Consumes `saveSleeperRosterMapping({ draftId, leagueId, mappings })`,
  `previewSleeperRosterSync({ draftId })`, and `logSleeperRosterCatchUp({ draftId, entries })`.
- Produces typed success/error unions; no action throws expected user-facing Sleeper/configuration errors.

```ts
export interface SleeperRosterMappingInput {
  teamId: number;
  sleeperRosterId: number;
}

export interface SleeperRosterCatchUpEntry {
  playerId: number;
  teamId: number;
  price: number;
}

export type SleeperRosterSyncResponse =
  | { ok: true; preview: SleeperRosterPreview }
  | {
      ok: false;
      code: 'configuration_required' | 'mapping_required' | 'not_found' | 'sleeper_error';
    };

export type SleeperRosterCatchUpResponse =
  | { ok: false; code: 'invalid_input' }
  | {
      ok: true;
      createdPlayerIds: number[];
      conflicts: Array<{ playerId: number; reason: 'already_logged' | 'assignment_changed' }>;
    };
```

- [ ] **Step 1: Write failing action tests with Prisma and Sleeper mocks**

```ts
const result = await logSleeperRosterCatchUp({
  draftId: 4,
  entries: [{ playerId: 3, teamId: 7, price: 42 }],
});

expect(result).toEqual({
  ok: true,
  createdPlayerIds: [3],
  conflicts: [],
});
```

Add cases for unauthenticated/no-owned-draft, nonexistent team/player, duplicate mapping, a mapping
whose roster ID is missing from Sleeper, an existing result being excluded from preview, a player
moved to another current Sleeper roster after preview, nomination deletion, and unique-conflict
translation to `{ reason: 'already_logged' }`. Pass an entry with `price: 0` separately and assert
that the action returns `{ ok: false, code: 'invalid_input' }` without creating any results.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- sleeper-roster-actions`

Expected: FAIL because the actions module does not exist.

- [ ] **Step 3: Implement actions with server-owned validation**

```ts
'use server';

export async function previewSleeperRosterSync(input: {
  draftId: number;
}): Promise<SleeperRosterSyncResponse> {
  const draft = await requireOwnedDraft(input.draftId);
  if (!draft.sleeperLeagueId) return { ok: false, code: 'configuration_required' };
  const rosters = await fetchSleeperLeagueRosters(draft.sleeperLeagueId);
  return { ok: true, preview: reconcileSleeperRosters(/* current scoped DB rows */) };
}
```

`saveSleeperRosterMapping` fetches league/users/rosters first, verifies submitted roster IDs are
present, verifies every `teamId` belongs to the draft, rejects duplicate team or roster IDs, then
updates `Draft.sleeperLeagueId` and replaces all team mappings in one transaction. Replacing a
league ID clears old `sleeperRosterId` values before applying the new set.

`logSleeperRosterCatchUp` re-fetches current rosters in the transaction workflow, validates each
entry against the current mapped assignment, reloads logged results, creates only still-valid rows,
and `deleteMany`s matching nominations. Treat `P2002` on `(draftId, playerId)` as a per-entry
`already_logged` conflict. Do not call the existing single-row `logBid` in a loop; its independent
transactions permit partial state and unnecessary revalidation.

Refactor only shared, identity-safe bid-row construction from `logBid` into a private helper if
needed; preserve its current public signature and error behavior.

- [ ] **Step 4: Run action tests and quality checks**

Run: `pnpm test -- sleeper-roster-actions && pnpm typecheck && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sleeper-roster-actions.ts src/lib/actions.ts src/__tests__/sleeper-roster-actions.test.ts
git commit -m "feat: add safe Sleeper catch-up actions"
```

## Task 4: Build the catch-up dialog and connect it to the value sheet

**Files:**

- Create: `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx`
- Create: `src/__tests__/SleeperRosterSyncDialog.test.tsx`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/app/draft/[draftId]/page.tsx`

**Interfaces:**

- `SleeperRosterSyncDialogProps` consumes `draftId`, `teams: LeagueTeam[]`,
  `initiallyConfigured: boolean`, and `onClose(): void`.
- The dialog calls the typed server actions from Task 3; it owns only local form values and display
  state, not roster identity decisions.

- [ ] **Step 1: Write failing dialog tests**

```tsx
render(
  <SleeperRosterSyncDialog
    draftId={4}
    teams={TEAMS}
    initiallyConfigured={true}
    onClose={jest.fn()}
  />,
);
await waitFor(() => expect(mockPreview).toHaveBeenCalledWith({ draftId: 4 }));
expect(screen.getByTestId('sleeper-sync-player-3')).toBeInTheDocument();
expect(screen.getByTestId('sleeper-sync-winner-3')).toHaveTextContent('Cole');

await user.type(screen.getByTestId('sleeper-sync-price-3'), '42');
await user.click(screen.getByTestId('sleeper-sync-submit'));
expect(mockLogCatchUp).toHaveBeenCalledWith({
  draftId: 4,
  entries: [{ playerId: 3, teamId: 7, price: 42 }],
});
```

Use the existing dialog mock pattern. Add separate tests for configuration-required state, duplicate
selection disabled/rejected, unresolved item rendering, blank rows omitted, invalid price inline
error, `already_reconciled`, and mapping-repair/Sleeper-error messages.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test -- SleeperRosterSyncDialog`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement focused dialog states**

```tsx
interface SleeperRosterSyncDialogProps {
  draftId: number;
  teams: LeagueTeam[];
  initiallyConfigured: boolean;
  onClose: () => void;
}

type SyncView = 'loading' | 'configuration' | 'preview' | 'error';
```

On mount, call preview when `initiallyConfigured`; otherwise render configuration. Configuration
has `data-testid="sleeper-sync-league-id"` and one select per Sleeper roster with IDs such as
`sleeper-sync-team-map-9`. Preview rows use stable player-ID test IDs, show their locked winner and
target, and use a number input with `min={1}`/`step={1}`. The submit handler filters blank inputs,
validates whole positive numbers client-side, and leaves blanks/conflicts in state after response.

Do not use optimistic auction-sheet state: after a successful batch action, call `router.refresh()`
so the authoritative server page updates claimed rows, budgets, and nominations together.

- [ ] **Step 4: Add the entry point and initial state**

In `DraftHomePage`, select `draft.sleeperLeagueId` and whether every participating team has a
unique roster mapping, then pass `sleeperSyncConfigured` and `teams` to `AuctionSheet`. Add a
`data-testid="open-sleeper-sync"` button near the existing value-sheet controls. `AuctionSheet`
controls dialog visibility and passes its existing `draftId`/team props through; it does not fetch
or implement reconciliation.

- [ ] **Step 5: Run UI tests and typecheck**

Run: `pnpm test -- SleeperRosterSyncDialog AuctionSheet drafts-new-form && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/SleeperRosterSync src/components/AuctionSheet/AuctionSheet.tsx 'src/app/draft/[draftId]/page.tsx' src/__tests__
git commit -m "feat: add Sleeper roster catch-up dialog"
```

## Task 5: Verify the complete feature and update project reference docs

**Files:**

- Modify: `ROADMAP.md`
- Modify: `AGENTS.md` only if its architecture section needs the new persisted fields/routes documented
- Modify: `docs/superpowers/specs/2026-07-14-sleeper-roster-catchup-design.md` only if implementation exposes a design discrepancy

**Interfaces:**

- Consumes the completed schema, action, reconciliation, and dialog contracts from Tasks 1–4.
- Produces a checked-off 9b roadmap and a verified end-to-end flow.

- [ ] **Step 1: Run focused end-to-end regression suite**

Run: `pnpm test -- sleeper-import sleeper-actions sleeperRosterSync sleeper-roster-actions SleeperRosterSyncDialog drafts-new-form AuctionSheet`

Expected: PASS with import persistence, existing-result exclusion, partial batch creation, and UI
state coverage all green.

- [ ] **Step 2: Run repository quality gate**

Run: `make check`

Expected: typecheck, lint, format check, and all Jest tests PASS.

- [ ] **Step 3: Manually verify the protected browser flow**

Run: `make dev`

Expected: development server starts at `http://localhost:3000`.

Using the browser verification workflow, sign in with a test account and confirm: imported draft
opens the preview directly; a manual draft saves a mapping before scanning; a recognized roster
player accepts a price and appears once on the value sheet; blank and unresolved rows do not write;
and the same player is absent from the next scan. Stop the dev server after verification.

- [ ] **Step 4: Update roadmap/documentation**

Mark 9b complete in `ROADMAP.md`; retain the future native-auction/polling note as out of scope.
Add `sleeperLeagueId`/`sleeperRosterId` to `AGENTS.md` only if its schema summary is kept current
with other persistence additions. Do not add generated screenshots, scratch data, or a separate
spec/plan copy.

- [ ] **Step 5: Commit verification documentation**

```bash
git add ROADMAP.md AGENTS.md docs/superpowers/specs/2026-07-14-sleeper-roster-catchup-design.md
git commit -m "docs: mark Sleeper catch-up complete"
```
