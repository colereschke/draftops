# Sleeper Roster Sync Auto-Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Sleeper roster-sync dialog's synthetic "Sleeper roster 1..N" blind-matching UI with real Sleeper roster/owner identities and an exact-handle auto-match, so most rosters map themselves and only genuinely ambiguous ones need a manual pick.

**Architecture:** A new pure function (`matchSleeperRostersToTeams`) joins Sleeper rosters/users/DraftOps teams into per-roster match candidates, honoring any already-saved mapping first and falling back to an exact case-insensitive `Team.handle` ↔ `SleeperUser.display_name` match. A new read-only server action (`previewSleeperRosterMatch`) exposes this to the client without persisting anything. The dialog's configuration view is rewired to fetch and render real candidates instead of a synthetic `1..teamCount` loop, and the league ID is threaded down from `draft.sleeperLeagueId` so it's no longer always blank.

**Tech Stack:** Next.js 16 App Router / React 'use client' components, TypeScript strict mode, Prisma 7, Jest + React Testing Library, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-15-sleeper-roster-sync-match-design.md`

## Global Constraints

- Exact case-insensitive handle match only — no fuzzy/similarity matching (spec: "Out of scope").
- Nothing is persisted by the sync/match fetch; `draft.sleeperLeagueId` + team mappings are still written together, atomically, only on "Save mapping and preview" (spec: "Scope and decisions").
- A saved `Team.sleeperRosterId` mapping that still corresponds to a roster in the current Sleeper response always wins over a coincidental handle match (spec: "Scope and decisions").
- Reconciliation (`reconcileSleeperRosters`, `logSleeperRosterCatchUp`) keys exclusively off `Team.sleeperRosterId` / `Player.sleeperId` — never off handles/display names. This plan does not touch that invariant.
- Single quotes, trailing commas, 2-space indent, 100-char width (Prettier); no explicit `any`; `interface` for object shapes; tests select by `data-testid`/`id` only.
- Do not use `npm`/`yarn` — this repo uses `pnpm`.

---

### Task 1: `matchSleeperRostersToTeams` pure matching function

**Files:**

- Modify: `src/lib/sleeper.ts`
- Test: `src/__tests__/sleeper-roster-match.test.ts` (create)

**Interfaces:**

- Consumes: existing `SleeperRoster`, `SleeperUser` types already exported from `src/lib/sleeper.ts`.
- Produces: `SleeperRosterCandidate` interface and `matchSleeperRostersToTeams(rosters, users, teams)` function, both newly exported from `@/lib/sleeper`, consumed by Task 2.

```ts
export interface SleeperRosterCandidate {
  sleeperRosterId: number;
  ownerDisplayName: string | null;
  ownerTeamName: string | null;
  suggestedTeamId: number | null;
  matchSource: 'existing' | 'handle' | 'none';
}

export function matchSleeperRostersToTeams(
  rosters: SleeperRoster[],
  users: SleeperUser[],
  teams: { id: number; handle: string; sleeperRosterId: number | null }[],
): SleeperRosterCandidate[];
```

- [ ] **Step 1: Write the failing test file**

Create `src/__tests__/sleeper-roster-match.test.ts`:

```ts
import { matchSleeperRostersToTeams } from '@/lib/sleeper';
import type { SleeperRoster, SleeperUser } from '@/lib/sleeper';

interface MatchTeamFixture {
  id: number;
  handle: string;
  sleeperRosterId: number | null;
}

const USERS: SleeperUser[] = [
  { user_id: '1', display_name: 'coreschke', metadata: { team_name: "Cole's Team" } },
  { user_id: '2', display_name: 'rival' },
];

describe('matchSleeperRostersToTeams — handle matching', () => {
  it('auto-matches a team whose handle exactly equals the roster owner display_name', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: '1' }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result).toEqual([
      {
        sleeperRosterId: 9,
        ownerDisplayName: 'coreschke',
        ownerTeamName: "Cole's Team",
        suggestedTeamId: 7,
        matchSource: 'handle',
      },
    ]);
  });

  it('matches case-insensitively', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: '1' }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'CoreSchke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result[0]).toMatchObject({ suggestedTeamId: 7, matchSource: 'handle' });
  });

  it('leaves a roster unmatched when no team handle equals the owner display_name', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: '2' }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result[0]).toEqual({
      sleeperRosterId: 9,
      ownerDisplayName: 'rival',
      ownerTeamName: null,
      suggestedTeamId: null,
      matchSource: 'none',
    });
  });

  it('leaves an orphan roster (no owner_id) unmatched with a null owner name', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: null }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result[0]).toEqual({
      sleeperRosterId: 9,
      ownerDisplayName: null,
      ownerTeamName: null,
      suggestedTeamId: null,
      matchSource: 'none',
    });
  });
});

describe('matchSleeperRostersToTeams — existing mapping precedence', () => {
  it('keeps a working saved mapping instead of moving it to a coincidental handle match', () => {
    // Team 7 is already mapped to roster 2. Roster 1's owner also happens to be named
    // 'coreschke' (e.g. a different manager renamed their Sleeper username later). Team 7 must
    // stay on roster 2; roster 1 must NOT steal it via the handle pass.
    const rosters: SleeperRoster[] = [
      { roster_id: 1, owner_id: '1' },
      { roster_id: 2, owner_id: '2' },
    ];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: 2 }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result).toEqual([
      {
        sleeperRosterId: 1,
        ownerDisplayName: 'coreschke',
        ownerTeamName: "Cole's Team",
        suggestedTeamId: null,
        matchSource: 'none',
      },
      {
        sleeperRosterId: 2,
        ownerDisplayName: 'rival',
        ownerTeamName: null,
        suggestedTeamId: 7,
        matchSource: 'existing',
      },
    ]);
  });

  it('ignores a saved sleeperRosterId that no longer exists in the current Sleeper response', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: '2' }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: 99 }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result[0]).toMatchObject({ suggestedTeamId: null, matchSource: 'none' });
  });
});

describe('matchSleeperRostersToTeams — no double-claiming', () => {
  it('claims a team for at most one roster even if its owner manages two rosters', () => {
    const rosters: SleeperRoster[] = [
      { roster_id: 1, owner_id: '1' },
      { roster_id: 3, owner_id: '1' },
    ];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    const matchedRows = result.filter((row) => row.suggestedTeamId !== null);
    expect(matchedRows).toHaveLength(1);
    expect(matchedRows[0].sleeperRosterId).toBe(1); // lower roster_id wins, stable ordering
    expect(result.find((row) => row.sleeperRosterId === 3)).toMatchObject({
      suggestedTeamId: null,
      matchSource: 'none',
    });
  });

  it('orders results by roster_id ascending regardless of input order', () => {
    const rosters: SleeperRoster[] = [
      { roster_id: 2, owner_id: '2' },
      { roster_id: 1, owner_id: '1' },
    ];
    const result = matchSleeperRostersToTeams(rosters, USERS, []);
    expect(result.map((row) => row.sleeperRosterId)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/__tests__/sleeper-roster-match.test.ts`
Expected: FAIL — `matchSleeperRostersToTeams` is not exported from `@/lib/sleeper`.

- [ ] **Step 3: Implement the function**

In `src/lib/sleeper.ts`, append the following after the closing brace of `mapSleeperLeague` (end of file):

```ts
export interface SleeperRosterCandidate {
  sleeperRosterId: number;
  ownerDisplayName: string | null;
  ownerTeamName: string | null;
  suggestedTeamId: number | null;
  matchSource: 'existing' | 'handle' | 'none';
}

export function matchSleeperRostersToTeams(
  rosters: SleeperRoster[],
  users: SleeperUser[],
  teams: { id: number; handle: string; sleeperRosterId: number | null }[],
): SleeperRosterCandidate[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const orderedRosters = [...rosters].sort((a, b) => a.roster_id - b.roster_id);
  const rosterIdSet = new Set(orderedRosters.map((r) => r.roster_id));

  const claimedTeamIds = new Set<number>();
  const claimedRosterIds = new Set<number>();
  const suggestionByRosterId = new Map<
    number,
    { teamId: number; matchSource: 'existing' | 'handle' }
  >();

  // Pass 1: honor an existing saved mapping if its roster is still present in this fetch.
  for (const team of teams) {
    if (
      team.sleeperRosterId !== null &&
      rosterIdSet.has(team.sleeperRosterId) &&
      !claimedRosterIds.has(team.sleeperRosterId)
    ) {
      suggestionByRosterId.set(team.sleeperRosterId, { teamId: team.id, matchSource: 'existing' });
      claimedTeamIds.add(team.id);
      claimedRosterIds.add(team.sleeperRosterId);
    }
  }

  // Pass 2: exact case-insensitive handle match among whatever's left unclaimed.
  for (const roster of orderedRosters) {
    if (claimedRosterIds.has(roster.roster_id)) continue;
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    if (!owner) continue;
    const match = teams.find(
      (team) =>
        !claimedTeamIds.has(team.id) &&
        team.handle.toLowerCase() === owner.display_name.toLowerCase(),
    );
    if (!match) continue;
    suggestionByRosterId.set(roster.roster_id, { teamId: match.id, matchSource: 'handle' });
    claimedTeamIds.add(match.id);
    claimedRosterIds.add(roster.roster_id);
  }

  return orderedRosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const suggestion = suggestionByRosterId.get(roster.roster_id);
    return {
      sleeperRosterId: roster.roster_id,
      ownerDisplayName: owner?.display_name ?? null,
      ownerTeamName: owner?.metadata?.team_name ?? null,
      suggestedTeamId: suggestion?.teamId ?? null,
      matchSource: suggestion?.matchSource ?? 'none',
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/__tests__/sleeper-roster-match.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sleeper.ts src/__tests__/sleeper-roster-match.test.ts
git commit -m "feat: add matchSleeperRostersToTeams for Sleeper roster auto-matching"
```

---

### Task 2: `previewSleeperRosterMatch` server action

**Files:**

- Modify: `src/lib/sleeper-roster-actions.ts`
- Test: Modify `src/__tests__/sleeper-roster-actions.test.ts`

**Interfaces:**

- Consumes: `matchSleeperRostersToTeams`, `SleeperRosterCandidate` from `@/lib/sleeper` (Task 1); `LeagueTeam` from `@/types`.
- Produces: `SleeperRosterMatchResponse` type and `previewSleeperRosterMatch(input: { draftId: number; leagueId: string }): Promise<SleeperRosterMatchResponse>`, both exported from `@/lib/sleeper-roster-actions`, consumed by Task 3.

```ts
export type SleeperRosterMatchResponse =
  | { ok: true; leagueName: string; rosters: SleeperRosterCandidate[]; teams: LeagueTeam[] }
  | { ok: false; code: 'not_found' | 'sleeper_error' | 'invalid_league_id' };
```

- [ ] **Step 1: Update the test file's mocks and imports, then add the failing tests**

In `src/__tests__/sleeper-roster-actions.test.ts`, change the import at the top of the file from:

```ts
import {
  logSleeperRosterCatchUp,
  previewSleeperRosterSync,
  saveSleeperRosterMapping,
} from '@/lib/sleeper-roster-actions';
```

to:

```ts
import {
  logSleeperRosterCatchUp,
  previewSleeperRosterMatch,
  previewSleeperRosterSync,
  saveSleeperRosterMapping,
} from '@/lib/sleeper-roster-actions';
```

Change the `jest.mock('@/lib/sleeper', ...)` block from:

```ts
jest.mock('@/lib/sleeper', () => ({
  fetchSleeperLeague: (...args: unknown[]) => mockFetchLeague(...args),
  fetchSleeperLeagueUsers: (...args: unknown[]) => mockFetchUsers(...args),
  fetchSleeperLeagueRosters: (...args: unknown[]) => mockFetchRosters(...args),
}));
```

to (preserve the real `matchSleeperRostersToTeams`/`mapSleeperLeague` exports — only the network fetchers are mocked):

```ts
jest.mock('@/lib/sleeper', () => ({
  ...jest.requireActual('@/lib/sleeper'),
  fetchSleeperLeague: (...args: unknown[]) => mockFetchLeague(...args),
  fetchSleeperLeagueUsers: (...args: unknown[]) => mockFetchUsers(...args),
  fetchSleeperLeagueRosters: (...args: unknown[]) => mockFetchRosters(...args),
}));
```

Then add this new `describe` block at the end of the file, inside (before the closing brace of) the existing `describe('Sleeper roster actions', ...)` block, as sibling `it`s alongside the existing ones:

```ts
it('returns not_found for previewSleeperRosterMatch when unauthenticated', async () => {
  mockAuth.mockResolvedValue(null);
  await expect(previewSleeperRosterMatch({ draftId: 4, leagueId: 'league-1' })).resolves.toEqual({
    ok: false,
    code: 'not_found',
  });
});

it('rejects a blank league ID for previewSleeperRosterMatch without calling Sleeper', async () => {
  await expect(previewSleeperRosterMatch({ draftId: 4, leagueId: '   ' })).resolves.toEqual({
    ok: false,
    code: 'invalid_league_id',
  });
  expect(mockFetchLeague).not.toHaveBeenCalled();
});

it('returns sleeper_error from previewSleeperRosterMatch when Sleeper cannot be reached', async () => {
  mockFetchLeague.mockRejectedValue(new Error('NOT_FOUND'));
  await expect(previewSleeperRosterMatch({ draftId: 4, leagueId: 'league-1' })).resolves.toEqual({
    ok: false,
    code: 'sleeper_error',
  });
});

it('rethrows an unexpected previewSleeperRosterMatch failure instead of masking it', async () => {
  mockFetchLeague.mockRejectedValue(new Error('DB connection lost'));
  await expect(previewSleeperRosterMatch({ draftId: 4, leagueId: 'league-1' })).rejects.toThrow(
    'DB connection lost',
  );
});

it('auto-matches by handle and returns the league name and team list', async () => {
  mockTeamFindMany.mockResolvedValue([
    { id: 7, sleeperRosterId: null, handle: 'cole', displayName: 'Cole' },
  ]);
  mockFetchLeague.mockResolvedValue({ name: 'Dynasty Warlords' });
  mockFetchUsers.mockResolvedValue([{ user_id: 'u1', display_name: 'cole' }]);
  mockFetchRosters.mockResolvedValue([{ roster_id: 9, owner_id: 'u1' }]);

  await expect(previewSleeperRosterMatch({ draftId: 4, leagueId: 'league-1' })).resolves.toEqual({
    ok: true,
    leagueName: 'Dynasty Warlords',
    rosters: [
      {
        sleeperRosterId: 9,
        ownerDisplayName: 'cole',
        ownerTeamName: null,
        suggestedTeamId: 7,
        matchSource: 'handle',
      },
    ],
    teams: [{ id: 7, handle: 'cole', displayName: 'Cole' }],
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm test -- src/__tests__/sleeper-roster-actions.test.ts`
Expected: the 5 new tests FAIL (`previewSleeperRosterMatch is not a function`); all pre-existing tests in this file still PASS (confirms the `jest.requireActual` mock change didn't break anything else).

- [ ] **Step 3: Implement `previewSleeperRosterMatch`**

In `src/lib/sleeper-roster-actions.ts`, change the import block from:

```ts
import {
  fetchSleeperLeague,
  fetchSleeperLeagueRosters,
  fetchSleeperLeagueUsers,
} from '@/lib/sleeper';
```

to:

```ts
import {
  fetchSleeperLeague,
  fetchSleeperLeagueRosters,
  fetchSleeperLeagueUsers,
  matchSleeperRostersToTeams,
} from '@/lib/sleeper';
import type { SleeperRosterCandidate } from '@/lib/sleeper';
import type { LeagueTeam } from '@/types';
```

Add this type next to the existing `SleeperRosterSyncResponse` type definition:

```ts
export type SleeperRosterMatchResponse =
  | { ok: true; leagueName: string; rosters: SleeperRosterCandidate[]; teams: LeagueTeam[] }
  | { ok: false; code: 'not_found' | 'sleeper_error' | 'invalid_league_id' };
```

Add this function immediately after `previewSleeperRosterSync` and before `saveSleeperRosterMapping`:

```ts
export async function previewSleeperRosterMatch(input: {
  draftId: number;
  leagueId: string;
}): Promise<SleeperRosterMatchResponse> {
  const draft = await requireOwnedDraft(input.draftId);
  if (!draft) return { ok: false, code: 'not_found' };
  const leagueId = input.leagueId.trim();
  if (!leagueId) return { ok: false, code: 'invalid_league_id' };

  let league: Awaited<ReturnType<typeof fetchSleeperLeague>>;
  let users: Awaited<ReturnType<typeof fetchSleeperLeagueUsers>>;
  let rosters: Awaited<ReturnType<typeof fetchSleeperLeagueRosters>>;
  try {
    [league, users, rosters] = await Promise.all([
      fetchSleeperLeague(leagueId),
      fetchSleeperLeagueUsers(leagueId),
      fetchSleeperLeagueRosters(leagueId),
    ]);
  } catch (error) {
    if (isSleeperError(error)) return { ok: false, code: 'sleeper_error' };
    throw error;
  }

  const teams = await prisma.team.findMany({
    where: { draftId: draft.id },
    select: { id: true, handle: true, displayName: true, sleeperRosterId: true },
  });

  return {
    ok: true,
    leagueName: league.name ?? '',
    rosters: matchSleeperRostersToTeams(rosters, users, teams),
    teams: teams.map((team) => ({
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
    })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- src/__tests__/sleeper-roster-actions.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sleeper-roster-actions.ts src/__tests__/sleeper-roster-actions.test.ts
git commit -m "feat: add previewSleeperRosterMatch server action"
```

---

### Task 3: Rewire the configuration view to use real roster candidates

**Files:**

- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx`
- Test: Modify `src/__tests__/SleeperRosterSyncDialog.test.tsx`

**Interfaces:**

- Consumes: `previewSleeperRosterMatch`, `SleeperRosterMatchResponse` from `@/lib/sleeper-roster-actions` (Task 2); `SleeperRosterCandidate` from `@/lib/sleeper` (Task 1).
- Produces: `SleeperRosterSyncDialog` gains a new optional prop `sleeperLeagueId?: string | null`; `AuctionSheetProps` gains the same field, threaded from `draft.sleeperLeagueId`.

This task changes three files together (page → AuctionSheet → dialog) in one commit because they form a single compile unit — see `[[feedback_sdd_cross_task_commit_coupling]]` in project memory: splitting a prop-threading change from the component that requires it fails the pre-commit `tsc --noEmit` gate for no benefit.

- [ ] **Step 1: Thread `sleeperLeagueId` through `page.tsx` and `AuctionSheet.tsx`**

In `src/app/draft/[draftId]/page.tsx`, change the `<AuctionSheet>` render block from:

```tsx
return (
  <AuctionSheet
    players={players}
    claimedBids={claimedBids}
    teams={teams as LeagueTeam[]}
    nominatedPlayers={nominatedEntries.flatMap((e) => (e.playerId === null ? [] : [e.playerId]))}
    draftId={draftId}
    ownerHandle={draft.ownerTeam?.handle ?? null}
    ownerBudget={draft.ownerTeam?.budget ?? 1000}
    scoringSettings={(draft.scoringSettings ?? DEFAULT_SCORING_SETTINGS) as ScoringSettings}
    sleeperSyncConfigured={sleeperSyncConfigured}
  />
);
```

to:

```tsx
return (
  <AuctionSheet
    players={players}
    claimedBids={claimedBids}
    teams={teams as LeagueTeam[]}
    nominatedPlayers={nominatedEntries.flatMap((e) => (e.playerId === null ? [] : [e.playerId]))}
    draftId={draftId}
    ownerHandle={draft.ownerTeam?.handle ?? null}
    ownerBudget={draft.ownerTeam?.budget ?? 1000}
    scoringSettings={(draft.scoringSettings ?? DEFAULT_SCORING_SETTINGS) as ScoringSettings}
    sleeperSyncConfigured={sleeperSyncConfigured}
    sleeperLeagueId={draft.sleeperLeagueId}
  />
);
```

In `src/components/AuctionSheet/AuctionSheet.tsx`, change the props interface and destructuring from:

```tsx
interface AuctionSheetProps {
  players: Player[];
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  nominatedPlayers: Array<number | string>;
  draftId: number;
  ownerHandle: string | null;
  ownerBudget: number;
  scoringSettings: ScoringSettings;
  sleeperSyncConfigured?: boolean;
}

export default function AuctionSheet({
  players,
  claimedBids,
  teams,
  nominatedPlayers,
  draftId,
  ownerHandle,
  ownerBudget,
  scoringSettings,
  sleeperSyncConfigured = false,
}: AuctionSheetProps) {
```

to:

```tsx
interface AuctionSheetProps {
  players: Player[];
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  nominatedPlayers: Array<number | string>;
  draftId: number;
  ownerHandle: string | null;
  ownerBudget: number;
  scoringSettings: ScoringSettings;
  sleeperSyncConfigured?: boolean;
  sleeperLeagueId?: string | null;
}

export default function AuctionSheet({
  players,
  claimedBids,
  teams,
  nominatedPlayers,
  draftId,
  ownerHandle,
  ownerBudget,
  scoringSettings,
  sleeperSyncConfigured = false,
  sleeperLeagueId = null,
}: AuctionSheetProps) {
```

And change the `<SleeperRosterSyncDialog>` render block from:

```tsx
{
  showSleeperSync && (
    <SleeperRosterSyncDialog
      draftId={draftId}
      teams={teams}
      initiallyConfigured={sleeperSyncConfigured}
      onClose={() => setShowSleeperSync(false)}
    />
  );
}
```

to:

```tsx
{
  showSleeperSync && (
    <SleeperRosterSyncDialog
      draftId={draftId}
      teams={teams}
      initiallyConfigured={sleeperSyncConfigured}
      sleeperLeagueId={sleeperLeagueId}
      onClose={() => setShowSleeperSync(false)}
    />
  );
}
```

- [ ] **Step 2: Rewrite `SleeperRosterSyncDialog.tsx`**

Replace the full contents of `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx` with:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeagueTeam } from '@/types';
import type { SleeperRosterCandidate } from '@/lib/sleeper';
import {
  logSleeperRosterCatchUp,
  previewSleeperRosterMatch,
  previewSleeperRosterSync,
  saveSleeperRosterMapping,
} from '@/lib/sleeper-roster-actions';
import type { SleeperRosterPreview } from '@/lib/sleeperRosterSync';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SleeperRosterSyncDialogProps {
  draftId: number;
  teams: LeagueTeam[];
  initiallyConfigured: boolean;
  sleeperLeagueId?: string | null;
  onClose: () => void;
}

type SyncView = 'loading' | 'configuration' | 'preview' | 'error';

function responseMessage(code: string): string {
  switch (code) {
    case 'mapping_required':
      return 'Sleeper roster mapping needs repair before this roster can be reconciled.';
    case 'configuration_required':
      return 'Add a Sleeper league ID and map each roster before continuing.';
    case 'sleeper_error':
      return 'Sleeper could not be reached. Try again in a moment.';
    case 'invalid_league_id':
      return 'Enter a Sleeper league ID.';
    case 'invalid_input':
      return 'Enter a whole-dollar price greater than zero.';
    case 'not_found':
      return 'This draft is no longer available.';
    default:
      return 'Unable to reconcile this roster. Please try again.';
  }
}

export default function SleeperRosterSyncDialog({
  draftId,
  teams,
  initiallyConfigured,
  sleeperLeagueId = null,
  onClose,
}: SleeperRosterSyncDialogProps) {
  const router = useRouter();
  const [view, setView] = useState<SyncView>(initiallyConfigured ? 'loading' : 'configuration');
  const [preview, setPreview] = useState<SleeperRosterPreview | null>(null);
  const [error, setError] = useState<string>('');
  const [leagueId, setLeagueId] = useState<string>(sleeperLeagueId ?? '');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [matchCandidates, setMatchCandidates] = useState<SleeperRosterCandidate[] | null>(null);
  const [matchTeams, setMatchTeams] = useState<LeagueTeam[]>(teams);
  const [teamMappings, setTeamMappings] = useState<Record<number, string>>({});
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [conflicts, setConflicts] = useState<Map<number, string>>(new Map());
  const autoSyncedRef = useRef(false);

  async function loadPreview() {
    setView('loading');
    setError('');
    try {
      const response = await previewSleeperRosterSync({ draftId });
      if (!response.ok) {
        setError(responseMessage(response.code));
        setView(
          response.code === 'configuration_required' || response.code === 'mapping_required'
            ? 'configuration'
            : 'error',
        );
        return;
      }
      setPreview(response.preview);
      setView('preview');
    } catch {
      setError('Unable to load the Sleeper roster preview. Please try again.');
      setView('error');
    }
  }

  useEffect(() => {
    if (!initiallyConfigured) return;
    async function fetchInitialPreview() {
      try {
        const response = await previewSleeperRosterSync({ draftId });
        if (!response.ok) {
          setError(responseMessage(response.code));
          setView(
            response.code === 'configuration_required' || response.code === 'mapping_required'
              ? 'configuration'
              : 'error',
          );
          return;
        }
        setPreview(response.preview);
        setView('preview');
      } catch {
        setError('Unable to load the Sleeper roster preview. Please try again.');
        setView('error');
      }
    }
    void fetchInitialPreview();
  }, [draftId, initiallyConfigured]);

  const syncLeague = useCallback(
    async (idOverride?: string) => {
      const targetLeagueId = (idOverride ?? leagueId).trim();
      if (!targetLeagueId) {
        setError(responseMessage('invalid_league_id'));
        return;
      }
      setIsSyncing(true);
      setError('');
      try {
        const response = await previewSleeperRosterMatch({ draftId, leagueId: targetLeagueId });
        if (!response.ok) {
          setError(responseMessage(response.code));
          setIsSyncing(false);
          return;
        }
        setMatchCandidates(response.rosters);
        setMatchTeams(response.teams);
        setTeamMappings((current) => {
          const next = { ...current };
          for (const candidate of response.rosters) {
            if (
              next[candidate.sleeperRosterId] === undefined &&
              candidate.suggestedTeamId !== null
            ) {
              next[candidate.sleeperRosterId] = String(candidate.suggestedTeamId);
            }
          }
          return next;
        });
        setIsSyncing(false);
      } catch {
        setError('Unable to sync with Sleeper. Please try again.');
        setIsSyncing(false);
      }
    },
    [draftId, leagueId],
  );

  // Auto-sync only from a league ID the draft already had saved (the `sleeperLeagueId` prop) —
  // never from the user still typing into the league ID field, which would fire on every
  // keystroke's first non-empty value.
  useEffect(() => {
    if (view !== 'configuration') return;
    if (autoSyncedRef.current) return;
    if (!sleeperLeagueId?.trim()) return;
    autoSyncedRef.current = true;
    void syncLeague(sleeperLeagueId);
  }, [view, sleeperLeagueId, syncLeague]);

  function updateMapping(rosterId: number, teamId: string) {
    setTeamMappings((current) => ({ ...current, [rosterId]: teamId }));
  }

  async function saveConfiguration() {
    if (!matchCandidates) {
      setError('Sync with Sleeper before saving a mapping.');
      return;
    }
    const mappings = matchCandidates.flatMap((candidate) => {
      const teamId = Number(teamMappings[candidate.sleeperRosterId]);
      return Number.isSafeInteger(teamId) && teamId > 0
        ? [{ teamId, sleeperRosterId: candidate.sleeperRosterId }]
        : [];
    });
    if (!leagueId.trim() || mappings.length !== matchCandidates.length) {
      setError('Enter a league ID and assign every Sleeper roster to one team.');
      return;
    }
    if (new Set(mappings.map((mapping) => mapping.teamId)).size !== mappings.length) {
      setError('Each draft team can only be mapped to one Sleeper roster.');
      return;
    }

    setView('loading');
    setError('');
    try {
      const response = await saveSleeperRosterMapping({
        draftId,
        leagueId: leagueId.trim(),
        mappings,
      });
      if (!response.ok) {
        setError(responseMessage(response.code));
        setView('configuration');
        return;
      }
      setPreview(response.preview);
      setView('preview');
    } catch {
      setError('Unable to save the Sleeper roster mapping. Please try again.');
      setView('configuration');
    }
  }

  async function submitCatchUp() {
    if (!preview) return;
    const entries = preview.actionable.flatMap((row) => {
      const rawPrice = prices[row.playerId]?.trim() ?? '';
      if (!rawPrice) return [];
      const price = Number(rawPrice);
      return Number.isInteger(price) && price > 0
        ? [{ playerId: row.playerId, teamId: row.teamId, price }]
        : [];
    });
    const hasInvalidPrice = preview.actionable.some((row) => {
      const rawPrice = prices[row.playerId]?.trim() ?? '';
      return rawPrice !== '' && (!Number.isInteger(Number(rawPrice)) || Number(rawPrice) <= 0);
    });
    if (hasInvalidPrice) {
      setError('Enter a whole-dollar price greater than zero for each filled row.');
      return;
    }
    if (entries.length === 0) {
      setError('Enter at least one price to import. Blank rows are left untouched.');
      return;
    }

    setError('');
    setConflicts(new Map());
    try {
      const response = await logSleeperRosterCatchUp({ draftId, entries });
      if (!response.ok) {
        setError(responseMessage(response.code));
        return;
      }
      setConflicts(
        new Map(response.conflicts.map((conflict) => [conflict.playerId, conflict.reason])),
      );
      router.refresh();
    } catch {
      setError('Unable to save the catch-up results. Please try again.');
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Sleeper roster catch-up</DialogTitle>
        {view === 'loading' && <p data-testid="sleeper-sync-loading">Loading Sleeper roster…</p>}

        {view === 'configuration' && (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Map each Sleeper roster before importing completed auctions.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="sleeper-sync-league-id">Sleeper league ID</Label>
              <div className="flex gap-2">
                <Input
                  id="sleeper-sync-league-id"
                  data-testid="sleeper-sync-league-id"
                  value={leagueId}
                  onChange={(event) => setLeagueId(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  data-testid="sleeper-sync-sync-button"
                  onClick={() => syncLeague()}
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Syncing…' : 'Sync league'}
                </Button>
              </div>
            </div>
            {matchCandidates?.map((candidate) => {
              const rosterId = candidate.sleeperRosterId;
              const label = candidate.ownerDisplayName
                ? candidate.ownerTeamName
                  ? `${candidate.ownerDisplayName} (${candidate.ownerTeamName})`
                  : candidate.ownerDisplayName
                : `Unclaimed roster ${rosterId}`;
              return (
                <div key={rosterId} className="space-y-1.5">
                  <Label htmlFor={`sleeper-sync-roster-map-${rosterId}`}>
                    {label}
                    {candidate.matchSource !== 'none' && (
                      <span
                        data-testid={`sleeper-sync-auto-matched-${rosterId}`}
                        className="ml-2 text-xs text-muted-foreground"
                      >
                        Auto-matched
                      </span>
                    )}
                  </Label>
                  <select
                    id={`sleeper-sync-roster-map-${rosterId}`}
                    data-testid={`sleeper-sync-roster-map-${rosterId}`}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={teamMappings[rosterId] ?? ''}
                    onChange={(event) => updateMapping(rosterId, event.target.value)}
                  >
                    <option value="">Select a draft team</option>
                    {matchTeams.map((team) => {
                      const selectedElsewhere = Object.entries(teamMappings).some(
                        ([mappedRosterId, mappedTeamId]) =>
                          Number(mappedRosterId) !== rosterId && mappedTeamId === String(team.id),
                      );
                      return (
                        <option
                          key={team.id}
                          value={team.id}
                          disabled={selectedElsewhere}
                          data-testid={`sleeper-sync-roster-option-${rosterId}-${team.id}`}
                        >
                          {team.displayName ?? team.handle}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
            {matchCandidates && (
              <Button data-testid="sleeper-sync-save-mapping" onClick={saveConfiguration}>
                Save mapping and preview
              </Button>
            )}
          </div>
        )}

        {view === 'preview' && preview && (
          <div className="space-y-4">
            {preview.actionable.map((row) => (
              <div
                key={row.playerId}
                data-testid={`sleeper-sync-player-${row.playerId}`}
                className="rounded-md border p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{row.playerName}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.position} · {row.nflTeam} · Target ${row.targetBudget}
                    </div>
                  </div>
                  <div
                    data-testid={`sleeper-sync-winner-${row.playerId}`}
                    className="text-right text-sm"
                  >
                    {row.teamDisplayName ?? row.teamHandle}
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  <Label htmlFor={`sleeper-sync-price-${row.playerId}`}>Winning price</Label>
                  <Input
                    id={`sleeper-sync-price-${row.playerId}`}
                    data-testid={`sleeper-sync-price-${row.playerId}`}
                    type="number"
                    min={1}
                    step={1}
                    value={prices[row.playerId] ?? ''}
                    onChange={(event) =>
                      setPrices((current) => ({ ...current, [row.playerId]: event.target.value }))
                    }
                  />
                </div>
                {conflicts.has(row.playerId) && (
                  <p
                    data-testid={`sleeper-sync-conflict-${row.playerId}`}
                    className="mt-2 text-sm text-destructive"
                  >
                    {conflicts.get(row.playerId) === 'already_logged'
                      ? 'Already reconciled.'
                      : 'Winner assignment changed in Sleeper.'}
                  </p>
                )}
              </div>
            ))}
            {preview.unresolved.map((row) => (
              <p
                key={`${row.sleeperRosterId}-${row.sleeperId}`}
                data-testid={`sleeper-sync-unresolved-sleeper-${row.sleeperId}`}
                className="text-sm text-muted-foreground"
              >
                Unresolved Sleeper player {row.sleeperId} on roster {row.sleeperRosterId}; it was
                not imported.
              </p>
            ))}
            {preview.diagnostics.alreadyLoggedCount > 0 && (
              <p
                data-testid="sleeper-sync-already-reconciled"
                className="text-sm text-muted-foreground"
              >
                {preview.diagnostics.alreadyLoggedCount} player
                {preview.diagnostics.alreadyLoggedCount === 1 ? '' : 's'} already reconciled.
              </p>
            )}
            {preview.actionable.length === 0 && (
              <p>No unlogged, resolvable Sleeper players remain.</p>
            )}
            <Button
              data-testid="sleeper-sync-submit"
              onClick={submitCatchUp}
              disabled={preview.actionable.length === 0}
            >
              Import entered prices
            </Button>
          </div>
        )}

        {view === 'error' && (
          <Button data-testid="sleeper-sync-retry" onClick={loadPreview}>
            Retry preview
          </Button>
        )}
        {error && (
          <p data-testid="sleeper-sync-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Update `SleeperRosterSyncDialog.test.tsx`**

In `src/__tests__/SleeperRosterSyncDialog.test.tsx`, change the mock declarations and `jest.mock` block from:

```tsx
const mockPreview = jest.fn();
const mockSaveMapping = jest.fn();
const mockLogCatchUp = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock('@/lib/sleeper-roster-actions', () => ({
  previewSleeperRosterSync: (...args: unknown[]) => mockPreview(...args),
  saveSleeperRosterMapping: (...args: unknown[]) => mockSaveMapping(...args),
  logSleeperRosterCatchUp: (...args: unknown[]) => mockLogCatchUp(...args),
}));
```

to:

```tsx
const mockPreview = jest.fn();
const mockPreviewMatch = jest.fn();
const mockSaveMapping = jest.fn();
const mockLogCatchUp = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock('@/lib/sleeper-roster-actions', () => ({
  previewSleeperRosterSync: (...args: unknown[]) => mockPreview(...args),
  previewSleeperRosterMatch: (...args: unknown[]) => mockPreviewMatch(...args),
  saveSleeperRosterMapping: (...args: unknown[]) => mockSaveMapping(...args),
  logSleeperRosterCatchUp: (...args: unknown[]) => mockLogCatchUp(...args),
}));
```

Add this fixture directly after the existing `PREVIEW` constant:

```tsx
const MATCH_RESPONSE = {
  ok: true as const,
  leagueName: 'Dynasty Warlords',
  rosters: [
    {
      sleeperRosterId: 9,
      ownerDisplayName: 'cole',
      ownerTeamName: null,
      suggestedTeamId: 7,
      matchSource: 'handle' as const,
    },
    {
      sleeperRosterId: 10,
      ownerDisplayName: 'rival',
      ownerTeamName: null,
      suggestedTeamId: null,
      matchSource: 'none' as const,
    },
  ],
  teams: TEAMS,
};
```

Change the `beforeEach` block from:

```tsx
beforeEach(() => {
  jest.clearAllMocks();
  mockPreview.mockResolvedValue({ ok: true, preview: PREVIEW });
  mockSaveMapping.mockResolvedValue({ ok: true, preview: PREVIEW });
  mockLogCatchUp.mockResolvedValue({ ok: true, createdPlayerIds: [3], conflicts: [] });
});
```

to:

```tsx
beforeEach(() => {
  jest.clearAllMocks();
  mockPreview.mockResolvedValue({ ok: true, preview: PREVIEW });
  mockPreviewMatch.mockResolvedValue(MATCH_RESPONSE);
  mockSaveMapping.mockResolvedValue({ ok: true, preview: PREVIEW });
  mockLogCatchUp.mockResolvedValue({ ok: true, createdPlayerIds: [3], conflicts: [] });
});
```

Replace this existing test:

```tsx
it('shows configuration when roster mappings are not configured', () => {
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={false}
      onClose={jest.fn()}
    />,
  );

  expect(screen.getByTestId('sleeper-sync-league-id')).toBeInTheDocument();
  expect(screen.getByTestId('sleeper-sync-team-map-1')).toBeInTheDocument();
});
```

with these three tests:

```tsx
it('shows the league ID entry with no roster rows until a sync completes', () => {
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={false}
      sleeperLeagueId={null}
      onClose={jest.fn()}
    />,
  );

  expect(screen.getByTestId('sleeper-sync-league-id')).toBeInTheDocument();
  expect(screen.getByTestId('sleeper-sync-sync-button')).toBeInTheDocument();
  expect(screen.queryByTestId('sleeper-sync-roster-map-9')).not.toBeInTheDocument();
  expect(mockPreviewMatch).not.toHaveBeenCalled();
});

it('auto-syncs and pre-fills auto-matched rosters when the league ID is already known', async () => {
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={false}
      sleeperLeagueId="league-1"
      onClose={jest.fn()}
    />,
  );

  await waitFor(() =>
    expect(mockPreviewMatch).toHaveBeenCalledWith({ draftId: 4, leagueId: 'league-1' }),
  );
  expect(await screen.findByTestId('sleeper-sync-roster-map-9')).toHaveValue('7');
  expect(screen.getByTestId('sleeper-sync-auto-matched-9')).toBeInTheDocument();
  expect(screen.getByTestId('sleeper-sync-roster-map-10')).toHaveValue('');
  expect(screen.queryByTestId('sleeper-sync-auto-matched-10')).not.toBeInTheDocument();
});

it('syncs on demand and lets the user override a suggested match before saving', async () => {
  const user = userEvent.setup();
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={false}
      sleeperLeagueId={null}
      onClose={jest.fn()}
    />,
  );

  await user.type(screen.getByTestId('sleeper-sync-league-id'), 'league-1');
  await user.click(screen.getByTestId('sleeper-sync-sync-button'));
  expect(await screen.findByTestId('sleeper-sync-roster-map-9')).toHaveValue('7');

  await user.selectOptions(screen.getByTestId('sleeper-sync-roster-map-10'), '8');
  await user.click(screen.getByTestId('sleeper-sync-save-mapping'));

  await waitFor(() =>
    expect(mockSaveMapping).toHaveBeenCalledWith({
      draftId: 4,
      leagueId: 'league-1',
      mappings: [
        { teamId: 7, sleeperRosterId: 9 },
        { teamId: 8, sleeperRosterId: 10 },
      ],
    }),
  );
});
```

Replace this existing test:

```tsx
it('disables a team already assigned to another Sleeper roster', async () => {
  const user = userEvent.setup();
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={false}
      onClose={jest.fn()}
    />,
  );

  await user.selectOptions(screen.getByTestId('sleeper-sync-team-map-1'), '7');
  expect(screen.getByTestId('sleeper-sync-team-option-2-7')).toBeDisabled();
});
```

with:

```tsx
it('disables a team already assigned to another Sleeper roster', async () => {
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={false}
      sleeperLeagueId="league-1"
      onClose={jest.fn()}
    />,
  );

  await screen.findByTestId('sleeper-sync-roster-map-9');
  // Roster 9 auto-matches to team 7 on load; team 7 must now be disabled on roster 10's list.
  expect(screen.getByTestId('sleeper-sync-roster-option-10-7')).toBeDisabled();
});
```

One more existing test does reach the configuration view and must be updated: `initiallyConfigured={true}` with a `mapping_required` response is exactly the "repair" path, which in production only happens when `draft.sleeperLeagueId` is already saved — so this test must now pass that as the `sleeperLeagueId` prop, which lets auto-sync populate real roster rows from the default `MATCH_RESPONSE` mock instead of asserting on the removed synthetic testid. Replace:

```tsx
it('routes a mapping_required preview response to the configuration view for repair', async () => {
  mockPreview.mockResolvedValueOnce({ ok: false, code: 'mapping_required' });
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={true}
      onClose={jest.fn()}
    />,
  );
  expect(await screen.findByTestId('sleeper-sync-error')).toHaveTextContent('mapping');
  expect(screen.getByTestId('sleeper-sync-league-id')).toBeInTheDocument();
  expect(screen.getByTestId('sleeper-sync-team-map-1')).toBeInTheDocument();
  expect(screen.queryByTestId('sleeper-sync-retry')).not.toBeInTheDocument();
});
```

with:

```tsx
it('routes a mapping_required preview response to the configuration view for repair', async () => {
  mockPreview.mockResolvedValueOnce({ ok: false, code: 'mapping_required' });
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={true}
      sleeperLeagueId="league-1"
      onClose={jest.fn()}
    />,
  );
  expect(await screen.findByTestId('sleeper-sync-error')).toHaveTextContent('mapping');
  expect(screen.getByTestId('sleeper-sync-league-id')).toBeInTheDocument();
  expect(await screen.findByTestId('sleeper-sync-roster-map-9')).toBeInTheDocument();
  expect(screen.queryByTestId('sleeper-sync-retry')).not.toBeInTheDocument();
});
```

Leave every other existing test in the file untouched — none of them reach the configuration view, so they're unaffected by these changes (`sleeperLeagueId` is optional and defaults to `null`).

- [ ] **Step 4: Run the test file to verify it passes**

Run: `pnpm test -- src/__tests__/SleeperRosterSyncDialog.test.tsx`
Expected: PASS (all tests, old and new — 12 tests total).

- [ ] **Step 5: Typecheck and lint the whole change**

Run: `pnpm tsc --noEmit`
Expected: no errors.

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/draft/\[draftId\]/page.tsx src/components/AuctionSheet/AuctionSheet.tsx src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx src/__tests__/SleeperRosterSyncDialog.test.tsx
git commit -m "feat: auto-match Sleeper rosters to teams in the sync configuration view"
```

---

### Task 4: Update `CLAUDE.md`

**Files:**

- Modify: `/home/colereschke/dev/projects/draftops/CLAUDE.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update the Sleeper roster catch-up (#9b) bullet under "What's Built"**

In `CLAUDE.md`, find the paragraph beginning `- **Sleeper roster catch-up (#9b)**` under `## What's Next` → wait, it is actually under `## What's Built`. Locate the sentence ending:

```
Sync is on-demand and additive only; it never edits or removes existing `AuctionResult` rows. Spec: `docs/superpowers/specs/2026-07-14-sleeper-roster-catchup-design.md`.
```

Replace it with:

```
Sync is on-demand and additive only; it never edits or removes existing `AuctionResult` rows. The configuration step auto-matches Sleeper rosters to DraftOps teams wherever a `Team.handle` exactly (case-insensitively) equals the roster owner's Sleeper `display_name` — `matchSleeperRostersToTeams` (`src/lib/sleeper.ts`) exposed via the read-only `previewSleeperRosterMatch` action; a roster/team pair with a working saved mapping is always kept over a coincidental handle match, and anything left over still requires a manual pick. The league ID field is pre-filled from `draft.sleeperLeagueId` (threaded through `AuctionSheet`) instead of always starting blank. Spec: `docs/superpowers/specs/2026-07-14-sleeper-roster-catchup-design.md`, `docs/superpowers/specs/2026-07-15-sleeper-roster-sync-match-design.md`.
```

- [ ] **Step 2: Run the full quality gate**

Run: `make check`
Expected: typecheck, lint, format check, and full test suite all pass.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe Sleeper roster sync auto-matching in CLAUDE.md"
```

---

## Self-Review Notes

- **Spec coverage:** Matching function (Task 1) ✓, server action (Task 2) ✓, league-ID pre-fill + auto-sync-on-open + manual sync button + auto-matched indicator + duplicate guard + save behavior (Task 3) ✓, out-of-scope items (fuzzy matching, persisting on sync, reconciliation changes, import wizard changes, co-owner auto-matching) — none implemented, consistent with spec ✓.
- **Placeholder scan:** No TBD/TODO; every step has literal, complete code.
- **Type consistency:** `SleeperRosterCandidate` (Task 1) is the same shape consumed by `SleeperRosterMatchResponse` (Task 2) and rendered in the dialog (Task 3) — `sleeperRosterId`, `ownerDisplayName`, `ownerTeamName`, `suggestedTeamId`, `matchSource` used identically across all three. `previewSleeperRosterMatch`'s `{ draftId, leagueId }` input shape matches every call site in Task 3.
