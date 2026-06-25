# Nomination Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Worktree note:** Before executing, set up an isolated git worktree via `superpowers:using-git-worktrees` to avoid conflicts with parallel feature branches.

**Goal:** Build a `/nominate` page that ranks available players by nomination pressure — a score combining rival buying power, position need, and player ceiling — so Cole can quickly identify which players to put up that will burn rival budgets.

**Architecture:** A pure `computeNominationScores()` utility in `src/lib/nominationScoring.ts` does all the math (easily testable in isolation). A `'use client'` NominationHelper component fetches from `/api/nomination-data` on mount and polls every 30 seconds — it owns the two-zone UI (watchlist sidebar + ranked targets list) and handles optimistic watchlist updates via POST/DELETE to `/api/watchlist`. The page at `src/app/nominate/page.tsx` is a thin RSC shell.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + SQLite, React, TypeScript 5 strict, Jest + React Testing Library

## Global Constraints

- pnpm only — never npm or yarn
- Single quotes, trailing commas, 2-space indent, 100-char line width (Prettier enforced on commit)
- No `any` types (ESLint warns); no unused vars (ESLint errors)
- All dynamic/computed styles stay as inline styles — Tailwind for layout utilities only
- Pre-commit hook runs lint-staged + `pnpm tsc --noEmit` — never skip with `--no-verify`
- `@/*` is an alias for `src/*`
- DB singleton is at `@/lib/db` — never instantiate PrismaClient directly
- Fonts: `var(--font-barlow)` for labels/headers, `var(--font-inter)` for body, `var(--font-mono)` for all numbers and dollar values
- 3px left border in position accent color on every player row (signature design element)
- Do NOT modify `src/app/layout.tsx`, `src/app/page.tsx`, or `src/types/index.ts` — parallel branches own those files

## Merge Notes (read before starting)

- The roster tracker branch adds `pkgCount` to `TeamStats` in `src/types/index.ts`. If that's merged before this branch, add `pkgCount: 0` to the team-stats mapping in `src/app/api/nomination-data/route.ts`.
- The budget pressure branch builds `NavBar` with nav links. Once merged, add a "Nominate" link pointing to `/nominate` in `src/components/NavBar/NavLinks.tsx`.
- The roster tracker branch extracts `POS_COLORS` to `src/lib/posColors.ts`. If that's merged before this branch, import `POS_COLORS` from `@/lib/posColors` instead of defining it locally in NominationHelper.

---

## File Map

| Action | Path                                                   | Responsibility                                                   |
| ------ | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Modify | `prisma/schema.prisma`                                 | Add `PlayerWatchlist` model                                      |
| Modify | `src/lib/teams.ts`                                     | Add `TARGET_ROSTER` constant                                     |
| Create | `src/lib/nominationScoring.ts`                         | Pure scoring function + `ScoredPlayer`/`RivalContribution` types |
| Create | `src/__tests__/nominationScoring.test.ts`              | Unit tests for scoring logic                                     |
| Create | `src/app/api/nomination-data/route.ts`                 | GET: returns teamStats, auctionResults, watchlist                |
| Create | `src/app/api/watchlist/route.ts`                       | POST/DELETE: watchlist CRUD                                      |
| Create | `src/components/NominationHelper/NominationHelper.tsx` | `'use client'` two-zone UI                                       |
| Create | `src/components/NominationHelper/index.ts`             | Re-export                                                        |
| Create | `src/app/nominate/page.tsx`                            | Thin RSC shell                                                   |

---

### Task 1: DB schema + TARGET_ROSTER constant

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `src/lib/teams.ts`

**Interfaces:**

- Produces: `PlayerWatchlist` Prisma model (consumed by Task 3); `TARGET_ROSTER` constant (consumed by Task 2)

- [ ] **Step 1: Add `PlayerWatchlist` model to schema**

Open `prisma/schema.prisma` and append this model at the end of the file (after the `AuctionResult` model):

```prisma
// Cole's personal watchlist — players he still wants to win; excluded from nomination suggestions
model PlayerWatchlist {
  id         Int      @id @default(autoincrement())
  playerName String   @unique
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 2: Run the migration**

```bash
pnpm prisma migrate dev --name add-player-watchlist
```

Expected output includes: `✔ Generated Prisma Client` and a new migration file in `prisma/migrations/`.

- [ ] **Step 3: Add `TARGET_ROSTER` to `src/lib/teams.ts`**

The file currently exports `LEAGUE_TEAMS` and `ROSTER_SIZE`. Add the import for `Position` and the new constant. The full file after edit:

```ts
import type { Position } from '@/types';

export const LEAGUE_TEAMS = [
  { handle: 'coreschke', displayName: 'Cole' },
  { handle: 'chappy72', displayName: null },
  { handle: 'DrFunk', displayName: null },
  { handle: 'Henrizzler87', displayName: null },
  { handle: 'CharlesChillFFB', displayName: null },
  { handle: 'moneymarkel2626', displayName: null },
  { handle: 'sam4bama', displayName: null },
  { handle: 'mattveksler', displayName: null },
  { handle: 'gaf2323', displayName: null },
  { handle: 'dark44', displayName: null },
  { handle: 'SlamminSam58', displayName: null },
  { handle: 'JHenny74', displayName: null },
] as const;

export const ROSTER_SIZE = 30;

// Per-position roster targets for a 30-man Superflex startup.
// PICK and PKG are intentionally absent — they don't have a positional need ratio.
// Tune these values without touching the scoring function.
export const TARGET_ROSTER: Partial<Record<Position, number>> = {
  QB: 4,
  RB: 9,
  WR: 11,
  TE: 3,
};
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/teams.ts
git commit -m "feat: add PlayerWatchlist model and TARGET_ROSTER constant"
```

---

### Task 2: Scoring utility (TDD)

**Files:**

- Create: `src/lib/nominationScoring.ts`
- Create: `src/__tests__/nominationScoring.test.ts`

**Interfaces:**

- Consumes: `Player`, `TeamStats`, `AuctionResultEntry` from `@/types`; `TARGET_ROSTER` from `@/lib/teams`
- Produces:

  ```ts
  export interface RivalContribution {
    handle: string;
    contribution: number;
    pct: number;
  }
  export interface ScoredPlayer {
    player: Player;
    nominationScore: number;
    rivalContributions: RivalContribution[];
  }
  export function computeNominationScores(
    players: Player[],
    teamStats: TeamStats[],
    auctionResults: AuctionResultEntry[],
    watchlist: string[],
    myHandle: string,
  ): ScoredPlayer[];
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/nominationScoring.test.ts`:

```ts
import { computeNominationScores } from '@/lib/nominationScoring';
import type { Player, TeamStats, AuctionResultEntry } from '@/types';

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  player: 'Test Player',
  team: 'TST',
  pos: 'WR',
  age: 25,
  sfRank: 50,
  budget: 50,
  ceiling: 58,
  floor: 44,
  notes: '',
  ...overrides,
});

const makeTeamStat = (overrides: Partial<TeamStats> = {}): TeamStats => ({
  id: 1,
  handle: 'rival1',
  displayName: null,
  budget: 1000,
  spent: 0,
  remaining: 1000,
  rosterCount: 0,
  rosterRemaining: 30,
  buyingPower: 970,
  ...overrides,
});

const makeResult = (overrides: Partial<AuctionResultEntry> = {}): AuctionResultEntry => ({
  id: 1,
  player: 'Won Player',
  position: 'WR',
  nflTeam: 'TST',
  price: 50,
  sfRank: null,
  teamId: 1,
  teamHandle: 'rival1',
  createdAt: new Date(),
  ...overrides,
});

describe('computeNominationScores', () => {
  it('excludes players already won at auction', () => {
    const player = makePlayer({ player: 'Already Won' });
    const result = makeResult({ player: 'Already Won' });
    const scores = computeNominationScores([player], [makeTeamStat()], [result], [], 'coreschke');
    expect(scores).toHaveLength(0);
  });

  it('excludes watchlisted players', () => {
    const player = makePlayer({ player: 'Want Him' });
    const scores = computeNominationScores(
      [player],
      [makeTeamStat()],
      [],
      ['Want Him'],
      'coreschke',
    );
    expect(scores).toHaveLength(0);
  });

  it('scores PICK position as 0', () => {
    const player = makePlayer({ player: 'Some Pick', pos: 'PICK', ceiling: 80 });
    const scores = computeNominationScores([player], [makeTeamStat()], [], [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('scores PKG position as 0', () => {
    const player = makePlayer({ player: 'Pick Package', pos: 'PKG', ceiling: 109 });
    const scores = computeNominationScores([player], [makeTeamStat()], [], [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('excludes myHandle team from rival demand', () => {
    const player = makePlayer({ player: 'Target', pos: 'WR' });
    const cole = makeTeamStat({ handle: 'coreschke', buyingPower: 900 });
    const scores = computeNominationScores([player], [cole], [], [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('excludes teams with non-positive buying power', () => {
    const player = makePlayer({ player: 'Target', pos: 'WR', ceiling: 50 });
    const broke = makeTeamStat({ handle: 'broke', buyingPower: 0 });
    const scores = computeNominationScores([player], [broke], [], [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('ranks higher ceiling player above lower ceiling player, all else equal', () => {
    const rival = makeTeamStat();
    const low = makePlayer({ player: 'Low Ceil', pos: 'WR', ceiling: 30 });
    const high = makePlayer({ player: 'High Ceil', pos: 'WR', ceiling: 80 });
    const scores = computeNominationScores([low, high], [rival], [], [], 'coreschke');
    expect(scores[0].player.player).toBe('High Ceil');
  });

  it('gives zero needRatio when team has met QB position target (4)', () => {
    const player = makePlayer({ player: 'QB5', pos: 'QB', ceiling: 50 });
    const rival = makeTeamStat({ id: 2, handle: 'rival1' });
    const wonQBs = [1, 2, 3, 4].map((n) =>
      makeResult({ id: n, player: `QB${n}`, position: 'QB', teamId: 2 }),
    );
    const scores = computeNominationScores([player], [rival], wonQBs, [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('computes partial needRatio correctly when team has some players at position', () => {
    // QB target = 4; team has 2 → needRatio = (4-2)/4 = 0.5
    const player = makePlayer({ player: 'Target QB', pos: 'QB', ceiling: 100 });
    const rival = makeTeamStat({ id: 3, handle: 'rival1', buyingPower: 400 });
    const wonQBs = [1, 2].map((n) =>
      makeResult({ id: n, player: `QB${n}`, position: 'QB', teamId: 3 }),
    );
    const scores = computeNominationScores([player], [rival], wonQBs, [], 'coreschke');
    // rivalDemand = 400 × 0.5 = 200; nominationScore = 200 × 100 = 20000
    expect(scores[0].nominationScore).toBe(20000);
  });

  it('returns results sorted by nominationScore descending', () => {
    const rival = makeTeamStat({ buyingPower: 500 });
    const low = makePlayer({ player: 'Low', pos: 'WR', ceiling: 20 });
    const mid = makePlayer({ player: 'Mid', pos: 'WR', ceiling: 50 });
    const high = makePlayer({ player: 'High', pos: 'WR', ceiling: 80 });
    const scores = computeNominationScores([low, high, mid], [rival], [], [], 'coreschke');
    expect(scores.map((s) => s.player.player)).toEqual(['High', 'Mid', 'Low']);
  });

  it('computes rivalContributions percentages correctly', () => {
    const player = makePlayer({ player: 'Target', pos: 'WR' });
    const rival1 = makeTeamStat({ id: 1, handle: 'rival1', buyingPower: 300 });
    const rival2 = makeTeamStat({ id: 2, handle: 'rival2', buyingPower: 700 });
    const scores = computeNominationScores([player], [rival1, rival2], [], [], 'coreschke');
    const contribs = scores[0].rivalContributions;
    const r2 = contribs.find((c) => c.handle === 'rival2');
    expect(r2?.pct).toBeCloseTo(70, 0);
  });

  it('filters rivalContributions to only teams that contribute > 0', () => {
    const player = makePlayer({ player: 'Target', pos: 'QB', ceiling: 50 });
    const rival1 = makeTeamStat({ id: 1, handle: 'rival1', buyingPower: 400 });
    // rival2 has met QB target — contributes 0
    const rival2 = makeTeamStat({ id: 2, handle: 'rival2', buyingPower: 500 });
    const wonQBs = [1, 2, 3, 4].map((n) =>
      makeResult({ id: n, player: `QB${n}`, position: 'QB', teamId: 2 }),
    );
    const scores = computeNominationScores([player], [rival1, rival2], wonQBs, [], 'coreschke');
    const handles = scores[0].rivalContributions.map((c) => c.handle);
    expect(handles).not.toContain('rival2');
    expect(handles).toContain('rival1');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test -- --testPathPattern=nominationScoring
```

Expected: all tests fail with `Cannot find module '@/lib/nominationScoring'`.

- [ ] **Step 3: Implement `src/lib/nominationScoring.ts`**

```ts
import type { Player, TeamStats, AuctionResultEntry } from '@/types';
import { TARGET_ROSTER } from '@/lib/teams';

export interface RivalContribution {
  handle: string;
  contribution: number;
  pct: number;
}

export interface ScoredPlayer {
  player: Player;
  nominationScore: number;
  rivalContributions: RivalContribution[];
}

export function computeNominationScores(
  players: Player[],
  teamStats: TeamStats[],
  auctionResults: AuctionResultEntry[],
  watchlist: string[],
  myHandle: string,
): ScoredPlayer[] {
  const wonPlayerNames = new Set(auctionResults.map((r) => r.player));
  const watchlistSet = new Set(watchlist);
  const rivals = teamStats.filter((t) => t.handle !== myHandle && t.buyingPower > 0);

  const teamPosCounts: Record<number, Partial<Record<string, number>>> = {};
  for (const result of auctionResults) {
    if (!teamPosCounts[result.teamId]) teamPosCounts[result.teamId] = {};
    const counts = teamPosCounts[result.teamId];
    counts[result.position] = (counts[result.position] ?? 0) + 1;
  }

  const available = players.filter(
    (p) => !wonPlayerNames.has(p.player) && !watchlistSet.has(p.player),
  );

  const scored: ScoredPlayer[] = available.map((player) => {
    const target = TARGET_ROSTER[player.pos];
    if (target === undefined) {
      return { player, nominationScore: 0, rivalContributions: [] };
    }

    const rivalContributions: RivalContribution[] = rivals.map((team) => {
      const countAtPos = teamPosCounts[team.id]?.[player.pos] ?? 0;
      const needRatio = Math.max(0, (target - countAtPos) / target);
      const contribution = team.buyingPower * needRatio;
      return { handle: team.handle, contribution, pct: 0 };
    });

    const rivalDemand = rivalContributions.reduce((sum, r) => sum + r.contribution, 0);
    const nominationScore = rivalDemand * player.ceiling;

    for (const r of rivalContributions) {
      r.pct = rivalDemand > 0 ? (r.contribution / rivalDemand) * 100 : 0;
    }

    return {
      player,
      nominationScore,
      rivalContributions: rivalContributions
        .filter((r) => r.contribution > 0)
        .sort((a, b) => b.contribution - a.contribution),
    };
  });

  return scored.sort((a, b) => b.nominationScore - a.nominationScore);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test -- --testPathPattern=nominationScoring
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nominationScoring.ts src/__tests__/nominationScoring.test.ts
git commit -m "feat: add nomination scoring utility with full test coverage"
```

---

### Task 3: API routes

**Files:**

- Create: `src/app/api/nomination-data/route.ts`
- Create: `src/app/api/watchlist/route.ts`

**Interfaces:**

- Consumes: `db` from `@/lib/db`; `ROSTER_SIZE` from `@/lib/teams`; `TeamStats`, `AuctionResultEntry` from `@/types`
- Produces:
  - `GET /api/nomination-data` → `{ teamStats: TeamStats[], auctionResults: AuctionResultEntry[], watchlist: string[] }`
  - `POST /api/watchlist` body `{ playerName: string }` → `{ playerName: string }`
  - `DELETE /api/watchlist` body `{ playerName: string }` → `{ ok: true }`

- [ ] **Step 1: Create `src/app/api/nomination-data/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ROSTER_SIZE } from '@/lib/teams';
import type { TeamStats, AuctionResultEntry } from '@/types';

export async function GET() {
  const teams = await db.team.findMany({ include: { results: true } });

  const teamStats: TeamStats[] = teams.map((team) => {
    const spent = team.results.reduce((sum, r) => sum + r.price, 0);
    const remaining = team.budget - spent;
    const rosterCount = team.results.length;
    const rosterRemaining = ROSTER_SIZE - rosterCount;
    const buyingPower = remaining - rosterRemaining;
    return {
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
      budget: team.budget,
      spent,
      remaining,
      rosterCount,
      rosterRemaining,
      buyingPower,
    };
  });

  const auctionResults: AuctionResultEntry[] = teams.flatMap((team) =>
    team.results.map((r) => ({
      id: r.id,
      player: r.player,
      position: r.position,
      nflTeam: r.nflTeam,
      price: r.price,
      sfRank: r.sfRank,
      teamId: team.id,
      teamHandle: team.handle,
      createdAt: r.createdAt,
    })),
  );

  const watchlistEntries = await db.playerWatchlist.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    teamStats,
    auctionResults,
    watchlist: watchlistEntries.map((e) => e.playerName),
  });
}
```

- [ ] **Step 2: Create `src/app/api/watchlist/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  const entry = await db.playerWatchlist.upsert({
    where: { playerName: body.playerName },
    create: { playerName: body.playerName },
    update: {},
  });
  return NextResponse.json({ playerName: entry.playerName });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  try {
    await db.playerWatchlist.delete({ where: { playerName: body.playerName } });
  } catch {
    // Already deleted — idempotent
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Start the dev server (`make dev`), then in a second terminal:

```bash
# Should return { teamStats: [...12 teams...], auctionResults: [], watchlist: [] }
curl http://localhost:3000/api/nomination-data | jq '.teamStats | length'
# Expected: 12

# Add a player to watchlist
curl -X POST http://localhost:3000/api/watchlist \
  -H 'Content-Type: application/json' \
  -d '{"playerName":"Drake Maye"}' | jq
# Expected: { "playerName": "Drake Maye" }

# Confirm it shows up
curl http://localhost:3000/api/nomination-data | jq '.watchlist'
# Expected: ["Drake Maye"]

# Remove it
curl -X DELETE http://localhost:3000/api/watchlist \
  -H 'Content-Type: application/json' \
  -d '{"playerName":"Drake Maye"}' | jq
# Expected: { "ok": true }
```

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/nomination-data/route.ts src/app/api/watchlist/route.ts
git commit -m "feat: add nomination-data and watchlist API routes"
```

---

### Task 4: NominationHelper component

**Files:**

- Create: `src/components/NominationHelper/NominationHelper.tsx`
- Create: `src/components/NominationHelper/index.ts`

**Interfaces:**

- Consumes: `computeNominationScores`, `ScoredPlayer`, `RivalContribution` from `@/lib/nominationScoring`; `players` from `@/data/players`; `Player`, `Position`, `TeamStats`, `AuctionResultEntry` from `@/types`
- Produces: `export default function NominationHelper()` — zero-prop client component

- [ ] **Step 1: Create `src/components/NominationHelper/NominationHelper.tsx`**

```tsx
'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Position, TeamStats, AuctionResultEntry } from '@/types';
import { players } from '@/data/players';
import { computeNominationScores, type ScoredPlayer } from '@/lib/nominationScoring';

const MY_HANDLE = 'coreschke';

const POS_COLORS: Record<Position, { accent: string; badge: string; badgeText: string }> = {
  QB: { accent: '#4f83e8', badge: '#e8f0fe', badgeText: '#1a2744' },
  RB: { accent: '#4caf6e', badge: '#e6f4ea', badgeText: '#1a3a22' },
  WR: { accent: '#e8a030', badge: '#fef3e2', badgeText: '#3a2008' },
  TE: { accent: '#c060d0', badge: '#f5e6f8', badgeText: '#3a0a3a' },
  PICK: { accent: '#40b0b0', badge: '#e0f5f5', badgeText: '#0a3030' },
  PKG: { accent: '#f0c040', badge: '#fdf5d0', badgeText: '#3a2a00' },
};

const POSITIONS: Array<'ALL' | Position> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

interface NomData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: string[];
}

export default function NominationHelper() {
  const [data, setData] = useState<NomData | null>(null);
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/nomination-data');
      if (res.ok) setData(await res.json());
    } catch {
      // silent — show stale data
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const wonNames = useMemo(() => new Set(data?.auctionResults.map((r) => r.player) ?? []), [data]);

  const watchlistSet = useMemo(() => new Set(data?.watchlist ?? []), [data]);

  const scored = useMemo<ScoredPlayer[]>(() => {
    if (!data) return [];
    return computeNominationScores(
      players,
      data.teamStats,
      data.auctionResults,
      data.watchlist,
      MY_HANDLE,
    );
  }, [data]);

  const filtered = useMemo(
    () => (posFilter === 'ALL' ? scored : scored.filter((s) => s.player.pos === posFilter)),
    [scored, posFilter],
  );

  const searchResults = useMemo(() => {
    if (!watchlistSearch.trim()) return [];
    const q = watchlistSearch.toLowerCase();
    return players
      .filter((p) => !wonNames.has(p.player) && !watchlistSet.has(p.player))
      .filter((p) => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .slice(0, 8);
  }, [watchlistSearch, wonNames, watchlistSet]);

  const addToWatchlist = async (playerName: string) => {
    setData((prev) => (prev ? { ...prev, watchlist: [...prev.watchlist, playerName] } : prev));
    setWatchlistSearch('');
    setShowDropdown(false);
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
  };

  const removeFromWatchlist = async (playerName: string) => {
    setData((prev) =>
      prev ? { ...prev, watchlist: prev.watchlist.filter((n) => n !== playerName) } : prev,
    );
    await fetch('/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
  };

  if (!data) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
          color: '#4a5168',
          fontFamily: 'var(--font-inter), sans-serif',
        }}
      >
        Loading nomination data...
      </div>
    );
  }

  const hasAuctionData = data.auctionResults.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        fontFamily: 'var(--font-inter), sans-serif',
        background: 'var(--bg-base, #0a0d14)',
        color: '#e8eaf0',
      }}
    >
      {/* Zone 1: Watchlist sidebar */}
      <div
        style={{
          width: 240,
          minWidth: 240,
          background: 'var(--bg-surface, #141824)',
          borderRight: '1px solid #1e2434',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            color: '#4a5168',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-barlow), sans-serif',
          }}
        >
          My Watchlist
        </div>

        {/* Search-to-add */}
        <div style={{ position: 'relative' }}>
          <input
            ref={searchRef}
            value={watchlistSearch}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setWatchlistSearch(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Add player I want..."
            style={{
              width: '100%',
              background: '#1a1f2e',
              border: '1px solid #2a3048',
              borderRadius: 5,
              padding: '6px 10px',
              color: '#e8eaf0',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {showDropdown && searchResults.length > 0 && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#1a1f2e',
                border: '1px solid #2a3048',
                borderRadius: 5,
                zIndex: 10,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {searchResults.map((p) => (
                <button
                  key={p.player}
                  onClick={() => addToWatchlist(p.player)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #2a3048',
                    color: '#e8eaf0',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2a3048')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600 }}>{p.player}</span>
                  <span
                    style={{
                      color: '#4a5168',
                      marginLeft: 6,
                      fontSize: 10,
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {p.pos} · ${p.budget}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Watchlist entries */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          {data.watchlist.length === 0 ? (
            <div style={{ fontSize: 11, color: '#4a5168', lineHeight: 1.5 }}>
              No players marked — add players you still want to win
            </div>
          ) : (
            data.watchlist.map((name) => {
              const p = players.find((pl) => pl.player === name);
              const accent = p ? POS_COLORS[p.pos].accent : '#4a5168';
              return (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 8px',
                    background: '#1a1f2e',
                    borderRadius: 5,
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#e8eaf0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {name}
                    </div>
                    {p && (
                      <div
                        style={{
                          fontSize: 10,
                          color: '#4a5168',
                          fontFamily: 'var(--font-mono), monospace',
                        }}
                      >
                        {p.pos} · ${p.budget}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeFromWatchlist(name)}
                    title="Remove from watchlist"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#4a5168',
                      cursor: 'pointer',
                      fontSize: 16,
                      lineHeight: 1,
                      padding: '0 2px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#e05050')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#4a5168')}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Zone 2: Nomination targets */}
      <div style={{ flex: 1, padding: '16px 20px 40px', overflowX: 'auto' }}>
        {/* Page header */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 3,
              color: '#4a5168',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
              marginBottom: 2,
            }}
          >
            Nomination Helper
          </div>
          <div style={{ fontSize: 12, color: '#4a5168' }}>
            Players ranked by how much nominating them will drain rival budgets
          </div>
        </div>

        {!hasAuctionData ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 300,
              color: '#4a5168',
              fontSize: 13,
            }}
          >
            No auction data yet — start logging bids to see nomination suggestions.
          </div>
        ) : (
          <>
            {/* Position filter */}
            <div
              style={{
                display: 'flex',
                gap: 3,
                flexWrap: 'wrap',
                marginBottom: 14,
                alignItems: 'center',
              }}
            >
              {POSITIONS.map((pos) => {
                const c = pos === 'ALL' ? null : POS_COLORS[pos];
                const active = posFilter === pos;
                return (
                  <button
                    key={pos}
                    onClick={() => setPosFilter(pos)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 5,
                      border: '1px solid',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      letterSpacing: 0.5,
                      fontFamily: 'var(--font-barlow), sans-serif',
                      borderColor: active ? (c?.accent ?? '#40b0b0') : '#2a3048',
                      background: active ? (c ? '#1a1f2e' : '#1a2a2a') : 'transparent',
                      color: active ? (c?.accent ?? '#40b0b0') : '#4a5168',
                    }}
                  >
                    {pos}
                  </button>
                );
              })}
              <div
                style={{ marginLeft: 'auto', fontSize: 11, color: '#4a5168', alignSelf: 'center' }}
              >
                {filtered.length} targets
              </div>
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a3048' }}>
                  {(
                    [
                      { label: '#', align: 'center' },
                      { label: 'Player', align: 'left' },
                      { label: 'Target / Ceil', align: 'center' },
                      { label: 'Score', align: 'center' },
                      { label: 'Rival Demand', align: 'left' },
                      { label: '', align: 'center' },
                    ] as const
                  ).map((col) => (
                    <th
                      key={col.label}
                      style={{
                        padding: '8px 10px',
                        textAlign: col.align,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 1,
                        color: '#4a5168',
                        textTransform: 'uppercase',
                        fontFamily: 'var(--font-barlow), sans-serif',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const { player, nominationScore, rivalContributions } = s;
                  const c = POS_COLORS[player.pos];
                  const isRookie = player.notes.toLowerCase().includes('rookie');
                  const topRivals = rivalContributions.slice(0, 4);
                  return (
                    <tr
                      key={player.player}
                      style={{
                        borderBottom: '1px solid #141824',
                        background: i % 2 === 0 ? 'transparent' : '#0a0c10',
                        borderLeft: `3px solid ${c.accent}`,
                      }}
                      onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) =>
                        (e.currentTarget.style.background = '#141824')
                      }
                      onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) =>
                        (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : '#0a0c10')
                      }
                    >
                      {/* Rank */}
                      <td
                        style={{
                          padding: '8px 10px',
                          textAlign: 'center',
                          fontSize: 11,
                          color: '#4a5168',
                          fontFamily: 'var(--font-mono), monospace',
                        }}
                      >
                        {i + 1}
                      </td>

                      {/* Player */}
                      <td style={{ padding: '8px 10px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf0' }}>
                            {player.player}
                          </span>
                          <span
                            style={{
                              display: 'inline-block',
                              background: c.badge,
                              color: c.badgeText,
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '2px 5px',
                              letterSpacing: 0.5,
                              fontFamily: 'var(--font-barlow), sans-serif',
                            }}
                          >
                            {player.pos}
                          </span>
                          {isRookie && (
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 700,
                                letterSpacing: 1,
                                background: '#3a2800',
                                color: '#e8a030',
                                borderRadius: 3,
                                padding: '1px 4px',
                                textTransform: 'uppercase',
                              }}
                            >
                              R
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Target / Ceiling */}
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: c.accent,
                            fontFamily: 'var(--font-mono), monospace',
                          }}
                        >
                          ${player.budget}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: '#4a5168',
                            fontFamily: 'var(--font-mono), monospace',
                          }}
                        >
                          {' '}
                          / ${player.ceiling}
                        </span>
                      </td>

                      {/* Nomination score */}
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#e8a030',
                            fontFamily: 'var(--font-mono), monospace',
                          }}
                        >
                          {Math.round(nominationScore).toLocaleString()}
                        </span>
                      </td>

                      {/* Rival demand bar */}
                      <td style={{ padding: '8px 14px', minWidth: 200 }}>
                        {topRivals.length === 0 ? (
                          <span style={{ fontSize: 10, color: '#2a3048' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {topRivals.map((r) => (
                              <div
                                key={r.handle}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                              >
                                <div
                                  style={{
                                    width: 70,
                                    fontSize: 9,
                                    color: '#8892a4',
                                    textAlign: 'right',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    fontFamily: 'var(--font-mono), monospace',
                                  }}
                                >
                                  {r.handle}
                                </div>
                                <div
                                  style={{
                                    flex: 1,
                                    height: 4,
                                    background: '#1a1f2e',
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${r.pct}%`,
                                      height: '100%',
                                      background: '#4f83e8',
                                      borderRadius: 2,
                                    }}
                                  />
                                </div>
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: '#4a5168',
                                    fontFamily: 'var(--font-mono), monospace',
                                    width: 28,
                                  }}
                                >
                                  {Math.round(r.pct)}%
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Watch button */}
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button
                          onClick={() => addToWatchlist(player.player)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 4,
                            border: '1px solid #2a3048',
                            background: 'transparent',
                            color: '#4caf6e',
                            fontSize: 10,
                            cursor: 'pointer',
                            fontWeight: 600,
                            letterSpacing: 0.5,
                            fontFamily: 'var(--font-barlow), sans-serif',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#4caf6e')}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2a3048')}
                        >
                          Watch
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: 40, textAlign: 'center', color: '#4a5168', fontSize: 12 }}
                    >
                      No nomination targets found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/NominationHelper/index.ts`**

```ts
export { default } from './NominationHelper';
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/NominationHelper/
git commit -m "feat: add NominationHelper component with watchlist sidebar and scored targets"
```

---

### Task 5: Route page

**Files:**

- Create: `src/app/nominate/page.tsx`

**Interfaces:**

- Consumes: `NominationHelper` from `@/components/NominationHelper`
- Produces: Next.js route at `/nominate`

- [ ] **Step 1: Create `src/app/nominate/page.tsx`**

```tsx
import NominationHelper from '@/components/NominationHelper';

export const metadata = {
  title: 'Nominate — DraftOps',
};

export default function NominatePage() {
  return <NominationHelper />;
}
```

- [ ] **Step 2: Run the dev server and verify the page loads**

```bash
make dev
```

Open `http://localhost:3000/nominate` in a browser. Verify:

- Page renders without errors
- Watchlist sidebar shows "No players marked" empty state
- Main content shows either the empty-state message (if no auction results) or the scored player table
- Searching in the watchlist input shows player suggestions
- Clicking "Watch" on a row moves it to the sidebar
- The "×" button removes from the sidebar

Stop the dev server when done.

- [ ] **Step 3: Run the full quality gate**

```bash
make check
```

Expected: typecheck, lint, format, and tests all pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/nominate/page.tsx
git commit -m "feat: add /nominate route for nomination helper"
```
