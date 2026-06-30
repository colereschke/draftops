# League Settings & Player Table — Design Spec

**Date:** 2026-06-30
**Feature:** Roadmap #5a (model + form) collapsed with #7 (player table), Approach B
**Status:** Approved, ready for implementation planning

---

## What We're Building

Configurable league settings stored on `Draft`, a per-draft `Player` table replacing the static `players.ts` import in client components, and a fully updated draft creation form. The value-adjustment algorithm (tuning player budgets based on settings delta from baseline) is **intentionally deferred** to a follow-up PR (#5b) — it's the highest-risk piece and deserves its own focused review cycle.

## What's NOT In Scope

- Value adjustment algorithm — #5b
- Sleeper league import (auto-populate from league ID) — #5c (see ROADMAP.md)
- Replacing `LEAGUE_TEAMS`, `ROSTER_SIZE`, `TARGET_ROSTER` constants — #5b
- Custom rankings upload — blocked by this feature landing first

---

## Schema Changes

### New fields on `Draft`

All fields have DB-level defaults — migration is zero-downtime, no backfill needed for existing draft rows.

```prisma
teamCount       Int   @default(12)
rosterSize      Int   @default(30)
budget          Int   @default(1000)   // canonical per-team budget; seeds Team.budget at creation
startingLineup  Json?                  // StartingSlot[] — nullable; see TypeScript types
scoringSettings Json?                  // ScoringSettings — nullable; see TypeScript types
targetRoster    Json?                  // Partial<Record<Position, number>> — nullable
```

**JSON fields are nullable** because Prisma cannot express complex JSON defaults in the schema DSL — existing draft rows would otherwise have `null` after migration. Consumers must check for null and fall back to the ScoringSettings/StartingSlot/targetRoster defaults defined in `src/types/index.ts`. New drafts always send these values from the form, so null only occurs for pre-existing drafts before the PR B backfill runs.

The PR B backfill migration populates these fields for all existing drafts with the same defaults used by the form's `useState` initializers. Implemented as a custom TS script run via `prisma migrate dev` (not raw SQL) so it can import the typed defaults directly.

**`Draft.budget` vs `Team.budget`:** `Draft.budget` is the configured default set at creation and stored for reference. `Team.budget` remains the live value used in all spend/buying-power calculations — it's seeded from `Draft.budget` at team creation. No existing queries change.

**`startingLineup` defaults** to the vanilla 10-slot Superflex lineup: `["QB","RB","RB","WR","WR","TE","FLEX","FLEX","FLEX","SUPER_FLEX"]`. K slots are intentionally excluded — pick packages are a separate mechanism.

**`scoringSettings` defaults** represent standard full-PPR Superflex with no bonuses (see ScoringSettings type below).

**`targetRoster` defaults** to `{QB:4, RB:9, WR:11, TE:3}` (current hardcoded values in `teams.ts`).

### New `Player` model

```prisma
model Player {
  id      Int    @id @default(autoincrement())
  name    String
  nflTeam String
  pos     String
  age     Int?
  sfRank  Int
  budget  Int
  ceiling Int
  floor   Int
  notes   String @default("")
  draftId Int
  draft   Draft  @relation(fields: [draftId], references: [id])

  @@unique([name, draftId])
}
```

Fields mirror the existing `Player` TypeScript interface. `budget`, `ceiling`, and `floor` are seeded 1:1 from base ETR values at draft creation — the adjustment algorithm (#5b) will update them based on settings delta from baseline.

`players.ts` stays in the codebase as the server-only seed data source. It is no longer imported by any client component after this feature. It will be deleted when custom rankings upload (#7 / formerly in scope) lands.

---

## TypeScript Types (`src/types/index.ts`)

```typescript
export type StartingSlot = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'SUPER_FLEX';

export interface ScoringSettings {
  // Passing
  passYdsPerPoint: number; // pts per yard expressed as yards-per-point (default 25)
  passTD: number; // passing TD pts (default 4)
  passInt: number; // pts per INT, stored negative (default -2)

  // Rushing — position-agnostic; mobile QBs benefit proportionally
  rushAtt: number; // bonus per rush attempt (default 0)
  rushFD: number; // bonus per rushing 1st down (default 0)

  // Receiving — effective PPR per position
  pprRB: number; // pts per RB reception (default 1)
  pprWR: number; // pts per WR reception (default 1)
  pprTE: number; // pts per TE reception (default 1)

  // Receiving first down bonuses — base applies to all, position bonuses add on top
  recFD: number; // base per receiving 1st down, all positions (default 0)
  rbFDBonus: number; // extra per RB receiving 1st down (default 0)
  wrFDBonus: number; // extra per WR receiving 1st down (default 0)
  teFDBonus: number; // extra per TE receiving 1st down (default 0)
}
```

**Why these keys:** verified against the Sleeper `/league/<id>` API response for league `1360707683916734464`. When the Sleeper import spec (#5c) lands, the mapper is direct: `pprTE = sleeper.rec + (sleeper.bonus_rec_te ?? 0)`, `teFDBonus = sleeper.bonus_fd_te ?? 0`, etc. Rushing bonuses (`rushAtt`, `rushFD`) are position-agnostic in Sleeper's model — any position that rushes benefits, which naturally handles mobile QBs without per-position special-casing.

**Baseline for algorithm (#5b):** The base ETR values assume standard full-PPR Superflex with the vanilla 10-slot lineup above. The defaults in `ScoringSettings` represent that baseline. The algorithm will measure delta from these defaults to compute multipliers.

---

## Draft Creation Form (`src/app/drafts/new/page.tsx`)

### New state

```typescript
const [rosterSize, setRosterSize] = useState(30);
const [targetRoster, setTargetRoster] = useState({ QB: 4, RB: 9, WR: 11, TE: 3 });
const [startingLineup, setStartingLineup] = useState<StartingSlot[]>([
  'QB',
  'RB',
  'RB',
  'WR',
  'WR',
  'TE',
  'FLEX',
  'FLEX',
  'FLEX',
  'SUPER_FLEX',
]);
const [scoringSettings, setScoringSettings] = useState<ScoringSettings>({
  passYdsPerPoint: 25,
  passTD: 4,
  passInt: -2,
  rushAtt: 0,
  rushFD: 0,
  pprRB: 1,
  pprWR: 1,
  pprTE: 1,
  recFD: 0,
  rbFDBonus: 0,
  wrFDBonus: 0,
  teFDBonus: 0,
});
```

### New form sections (inserted between Draft Info and Teams)

**Section: Roster Settings**

- `rosterSize` — number input (min 10, max 60)
- Target roster — 4 compact number inputs in a row labeled QB / RB / WR / TE

**Section: Starting Lineup**

- Vertical list of slot rows; each row is a `<select>` with options QB / RB / WR / TE / FLEX / SUPER_FLEX, plus a remove button
- "Add slot" button appends a new FLEX slot
- Minimum 1 slot enforced; no K/kicker slots (pick packages are separate)
- Validation: must contain at least one QB or SUPER_FLEX (otherwise QB value is effectively zero)
- Display total slot count

**Section: Scoring**

_Passing group:_ `passYdsPerPoint` (number, step 5) · `passTD` (select: 4 / 6) · `passInt` (number, max 0)

_Rushing group:_ `rushAtt` (number, step 0.1) · `rushFD` (number, step 0.25)

_Receiving group:_ `pprRB` / `pprWR` (select: 0 / 0.5 / 1) · `pprTE` (select: 0 / 0.5 / 1 / 1.5 / 2)

_First down bonuses:_ `recFD` (number, step 0.25) then `rbFDBonus` / `wrFDBonus` / `teFDBonus` as a compact 4-column row labeled "All / RB / WR / TE"

### Updated `createDraft` action signature

```typescript
createDraft({
  name,
  budgetPerTeam: budget,
  rosterSize,
  targetRoster,
  startingLineup,
  scoringSettings,
  teams,
});
```

The action stores all settings on `Draft`, seeds `Team.budget` from `budgetPerTeam`, then seeds the `Player` table (see below).

---

## Player Seeding

After creating Draft + Teams inside the `createDraft` transaction, insert all base ETR players into `Player`:

```typescript
await tx.player.createMany({
  data: basePlayers.map((p) => ({
    name: p.player,
    nflTeam: p.team,
    pos: p.pos,
    age: p.age,
    sfRank: p.sfRank,
    budget: p.budget,
    ceiling: p.ceiling,
    floor: p.floor,
    notes: p.notes,
    draftId: draft.id,
  })),
});
```

**Backfill for existing drafts:** PR B includes a migration script that seeds `Player` rows for all existing drafts using the same base values. This ensures PR C's page wiring works uniformly — no draft is left with an empty player table.

**Algorithm placeholder:** The adjustment algorithm (#5b) will run after player seeding (or as a separate pass) and update `budget`, `ceiling`, and `floor` per player based on the draft's settings delta from baseline. The seeding step above is intentionally kept simple so #5b can slot in cleanly.

---

## Page Wiring

### Client components — remove static import, accept prop

`AuctionSheet.tsx` and `NominationHelper.tsx` both currently do `import { players } from '@/data/players'`. Both lose that import and gain `players: Player[]` in their props interface. No internal logic changes — they already treat `players` as a read-only array.

### Server components — query and pass down

**`/draft/[draftId]/page.tsx`** adds a player query to its existing `Promise.all`:

```typescript
prisma.player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } });
```

Maps DB rows to `Player[]` (field rename: `name` → `player`, `nflTeam` → `team`) and passes to `AuctionSheet`.

**`/draft/[draftId]/nominate/page.tsx`** currently passes only `draftId` to `NominationHelper` (which then fetches via `/api/nomination-data`). This page becomes a real server component that fetches players from DB and passes them as a prop, consistent with the value sheet pattern. The `/api/nomination-data` route continues to serve teamStats, auctionResults, watchlist, nominatedPlayers — only the player pool moves to a prop.

**`/draft/[draftId]/teams/page.tsx`** fetches players and passes to `computeTeamStats`.

### Library — add players parameter

`src/lib/computeTeamStats.ts` currently imports `players` for delta lookup. Becomes a parameter:

```typescript
export function computeTeamStats(results: ..., players: Player[]): TeamWithRoster[]
```

`src/lib/nominationScoring.ts` already takes `players` as a parameter — no change.

---

## PR Breakdown

| PR                     | Contents                                                                                                                  | App state after merge                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **A — Schema**         | Add 6 fields to `Draft` + `Player` model; Prisma migration                                                                | Form unchanged, no behavior change. All new Draft fields have DB defaults.     |
| **B — Form + Seeding** | Updated `NewDraftPage` UI; updated `createDraft` action; backfill migration for existing drafts                           | New drafts seed the `Player` table; existing drafts backfilled                 |
| **C — Page Wiring**    | `AuctionSheet` + `NominationHelper` accept `players` prop; server components query DB; `computeTeamStats` takes parameter | `players.ts` eliminated from all client imports; app reads player data from DB |

Each PR merges independently and leaves the app fully functional. The adjustment algorithm (#5b) slots in after PR C with no structural changes needed.
