# Projection-Aware VOR Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first projection-aware valuation path: Sleeper-linked ETR values, fantasy-point calculation from normalized projections, replacement-level/VOR calculation, and projection auction values stored separately from fallback values.

**Architecture:** Keep generated projection CSVs local and ignored, but persist the app-facing outputs on the per-draft `Player` rows. Use Python only for reproducible CSV identity mapping, and TypeScript for app valuation math. The existing fallback `budget` remains the active app value in this phase unless an explicit apply script writes projection values.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 strict mode, Prisma 7/Postgres, Jest, Python projection ETL scripts.

---

## Projection Storage Decision

Use **CSV-driven raw projections short-term, separate canonical projection data long-term, and
denormalized calculated outputs on `Player` for the first app integration.**

This means #5e should:

- Store `sleeperId` on the per-draft `Player` row because DraftOps needs a stable identity key for
  projection joins, roster sync, and custom rankings.
- Store calculated, draft-specific outputs on `Player`: `projectedPoints`, `replacementPoints`,
  `vor`, `projectionAuctionValue`, `fallbackAuctionValue`, `activeAuctionValue`, `valueSource`,
  and projection metadata.
- Keep raw projection stats in ignored generated CSVs for this phase. The ETL is reproducible, and
  raw stats are not yet user-editable app state.
- Avoid adding raw stat columns such as `passYds`, `rushTd`, or `receptions` to `Player`.

This deliberately chooses a bridge between roadmap options 2 and 3:

- It does **not** bloat `Player` with raw projection source data.
- It does persist the calculated app-facing values where the current UI and server components can
  read them cheaply.
- It leaves a clean long-term migration path to canonical tables like `ProjectionSource`,
  `PlayerProjection`, and `DraftProjectionValue` once multiple projection sources or source history
  matter.

Do not build the canonical projection tables in this PR unless the CSV-driven approach blocks
correctness. The first user value is getting projection-aware VOR into the app model without
turning one Mike Clay PDF into permanent schema shape.

## Rookie Projection Policy

Projection-aware valuation must be **additive, not punitive, for rookies**.

Rookies often have suppressed year-one projections because they are blocked, ramping into a role,
or simply not modeled aggressively by seasonal projection sources. Dynasty auction values already
carry much of their talent and long-term market value. Therefore:

- A low rookie projection should not reduce the active dynasty/fallback auction value.
- A strong rookie projection can raise or validate the projection-aware value.
- For rookies, `activeAuctionValue` should be at least `fallbackAuctionValue`.
- For non-rookies, projection values may be allowed to replace or blend with fallback values once
  the app intentionally opts into projection-active mode.

For this first #5e implementation, the app remains fallback-active by default. Store
`projectionAuctionValue` separately, initialize `activeAuctionValue = fallbackAuctionValue`, and
make the pure VOR helper capable of enforcing `max(fallbackAuctionValue, projectionAuctionValue)`
for rookie active values when projection-active behavior is enabled later.

---

## File Structure

**Create:**

- `src/lib/projectionScoring.ts` — raw projected stat scoring against `ScoringSettings`.
- `src/lib/projectionVor.ts` — replacement levels, VOR, and auction-dollar allocation.
- `src/__tests__/projectionScoring.test.ts` — point-scoring tests.
- `src/__tests__/projectionVor.test.ts` — replacement/VOR/value tests.
- `prisma/apply-projection-values.ts` — optional local script that reads generated CSVs and writes projection fields for one draft.
- `scripts/projections/draftops_projections/match_etr_values.py` — ETR rankings to Sleeper ID mapping.
- `scripts/projections/tests/test_match_etr_values.py` — matcher tests.

**Modify:**

- `prisma/schema.prisma` — add nullable projection/value-source fields to `Player`.
- `prisma/migrations/<timestamp>_player_projection_values/migration.sql` — additive migration.
- `src/types/index.ts` — add projection-aware value fields to `Player`.
- `src/app/draft/[draftId]/page.tsx`, `nominate/page.tsx`, `teams/page.tsx` — map new optional fields from DB to app `Player`.
- `prisma/seed-players.ts`, `prisma/sync-players.ts`, `src/lib/actions.ts` — initialize `fallbackAuctionValue`, `activeAuctionValue`, and `valueSource`.
- `scripts/projections/README.md` — document generated ETR mapping and app import command.

---

## Task 1: Add Projection Fields to Player

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_player_projection_values/migration.sql`
- Modify: `src/types/index.ts`
- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/app/draft/[draftId]/nominate/page.tsx`
- Modify: `src/app/draft/[draftId]/teams/page.tsx`
- Modify: `src/lib/actions.ts`
- Modify: `prisma/seed-players.ts`
- Modify: `prisma/sync-players.ts`

- [ ] **Step 1: Write the failing type-level usage test**

Add this test to `src/__tests__/createDraft.test.ts` after the existing base-value test:

```ts
it('initializes fallback value metadata for seeded players', async () => {
  await createDraft(VALID_INPUT);

  const payload = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
    budget: number;
    fallbackAuctionValue: number;
    activeAuctionValue: number;
    valueSource: string;
    sleeperId?: string | null;
    projectionAuctionValue?: number | null;
  }>;

  expect(payload[0].fallbackAuctionValue).toBe(payload[0].budget);
  expect(payload[0].activeAuctionValue).toBe(payload[0].budget);
  expect(payload[0].valueSource).toBe('fallback');
  expect(payload[0].sleeperId ?? null).toBeNull();
  expect(payload[0].projectionAuctionValue ?? null).toBeNull();
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm jest createDraft -t "initializes fallback value metadata"
```

Expected: FAIL because `fallbackAuctionValue` and `valueSource` are not inserted yet.

- [ ] **Step 3: Add additive Prisma fields**

Add to `Player` in `prisma/schema.prisma`:

```prisma
sleeperId              String?
projectedPoints        Float?
replacementPoints      Float?
vor                    Float?
projectionAuctionValue Int?
fallbackAuctionValue   Int
activeAuctionValue     Int
valueSource            String  @default("fallback")
projectionSource       String?
projectionDate         DateTime?
projectionSeason       Int?
```

Create the migration with nullable projection fields and a backfill for existing players:

```sql
ALTER TABLE "Player" ADD COLUMN "sleeperId" TEXT;
ALTER TABLE "Player" ADD COLUMN "projectedPoints" DOUBLE PRECISION;
ALTER TABLE "Player" ADD COLUMN "replacementPoints" DOUBLE PRECISION;
ALTER TABLE "Player" ADD COLUMN "vor" DOUBLE PRECISION;
ALTER TABLE "Player" ADD COLUMN "projectionAuctionValue" INTEGER;
ALTER TABLE "Player" ADD COLUMN "fallbackAuctionValue" INTEGER;
ALTER TABLE "Player" ADD COLUMN "activeAuctionValue" INTEGER;
ALTER TABLE "Player" ADD COLUMN "valueSource" TEXT NOT NULL DEFAULT 'fallback';
ALTER TABLE "Player" ADD COLUMN "projectionSource" TEXT;
ALTER TABLE "Player" ADD COLUMN "projectionDate" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN "projectionSeason" INTEGER;

UPDATE "Player" SET "fallbackAuctionValue" = "budget", "activeAuctionValue" = "budget";

ALTER TABLE "Player" ALTER COLUMN "fallbackAuctionValue" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "activeAuctionValue" SET NOT NULL;
CREATE INDEX "Player_sleeperId_idx" ON "Player"("sleeperId");
```

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
pnpm prisma generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 5: Thread defaults through seed/create paths**

In every `Player` create payload in `src/lib/actions.ts`, `prisma/seed-players.ts`, and `prisma/sync-players.ts`, add:

```ts
sleeperId: null,
projectedPoints: null,
replacementPoints: null,
vor: null,
projectionAuctionValue: null,
fallbackAuctionValue: p.budget,
activeAuctionValue: p.budget,
valueSource: 'fallback',
projectionSource: null,
projectionDate: null,
projectionSeason: null,
```

- [ ] **Step 6: Expose optional fields in app Player type**

Extend `Player` in `src/types/index.ts`:

```ts
sleeperId?: string | null;
projectedPoints?: number | null;
replacementPoints?: number | null;
vor?: number | null;
projectionAuctionValue?: number | null;
fallbackAuctionValue?: number | null;
activeAuctionValue?: number | null;
valueSource?: 'fallback' | 'projection' | 'blend';
projectionSource?: string | null;
projectionDate?: Date | string | null;
projectionSeason?: number | null;
```

Map those fields in the three server pages that convert `dbPlayers` to `Player[]`.

- [ ] **Step 7: Verify green**

Run:

```bash
pnpm jest createDraft -t "initializes fallback value metadata"
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add prisma src prisma/seed-players.ts prisma/sync-players.ts
git commit -m "feat(values): add projection value fields"
```

---

## Task 2: Match ETR Dynasty Values to Sleeper IDs

**Files:**

- Create: `scripts/projections/draftops_projections/match_etr_values.py`
- Create: `scripts/projections/tests/test_match_etr_values.py`
- Modify: `scripts/projections/README.md`

- [ ] **Step 1: Write failing matcher tests**

Create `scripts/projections/tests/test_match_etr_values.py`:

```python
from draftops_projections.match_etr_values import match_etr_value_row
from draftops_projections.models import SleeperPlayer


def sleeper(**overrides: object) -> SleeperPlayer:
    data = {
        "sleeper_id": "1",
        "full_name": "Jayden Daniels",
        "first_name": "Jayden",
        "last_name": "Daniels",
        "search_full_name": "jayden daniels",
        "normalized_name": "jayden daniels",
        "team": "WAS",
        "position": "QB",
        "fantasy_positions": ("QB",),
        "age": 25.0,
        "years_exp": 2,
        "active": True,
        "status": "Active",
    }
    data.update(overrides)
    return SleeperPlayer(**data)


def test_matches_etr_wft_to_sleeper_was_alias() -> None:
    result = match_etr_value_row(
        {"Player": "Jayden Daniels", "Team": "WFT", "Position": "QB"},
        [sleeper()],
    )

    assert result.sleeper is not None
    assert result.sleeper.sleeper_id == "1"
    assert result.match_method == "normalized_name_team_position"


def test_uses_name_position_when_etr_team_is_blank() -> None:
    result = match_etr_value_row(
        {"Player": "Justin Fields", "Team": "—", "Position": "QB"},
        [sleeper(sleeper_id="2", full_name="Justin Fields", normalized_name="justin fields", team="NYJ")],
    )

    assert result.sleeper is not None
    assert result.sleeper.sleeper_id == "2"
    assert result.match_method == "normalized_name_position"


def test_ambiguous_name_position_match_stays_unmatched() -> None:
    result = match_etr_value_row(
        {"Player": "John Smith", "Team": "—", "Position": "WR"},
        [
            sleeper(sleeper_id="2", full_name="John Smith", normalized_name="john smith", position="WR"),
            sleeper(sleeper_id="3", full_name="John Smith", normalized_name="john smith", position="WR"),
        ],
    )

    assert result.sleeper is None
    assert result.notes == "ambiguous_match"
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
python3 -m pytest scripts/projections/tests/test_match_etr_values.py -q
```

Expected: FAIL because `match_etr_values.py` does not exist.

- [ ] **Step 3: Implement ETR matcher**

Create `scripts/projections/draftops_projections/match_etr_values.py`:

```python
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from draftops_projections.models import SleeperPlayer
from draftops_projections.normalize import normalize_name, normalize_position, normalize_team
from draftops_projections.sleeper import load_active_sleeper_players


@dataclass(frozen=True)
class EtrMatchResult:
    etr_name: str
    etr_team: str
    etr_position: str
    sleeper: SleeperPlayer | None
    match_method: str
    match_confidence: float
    notes: str


def match_etr_value_row(row: dict[str, str], sleeper_players: list[SleeperPlayer]) -> EtrMatchResult:
    name = row["Player"].strip()
    team = normalize_team(row.get("Team", ""))
    position = normalize_position(row.get("Position", ""))
    normalized_name = normalize_name(name)

    if position is None:
        return EtrMatchResult(name, team, "", None, "unsupported_position", 0, "unsupported_position")

    candidates = [
        p
        for p in sleeper_players
        if p.normalized_name == normalized_name and p.position == position and (team == "" or p.team == team)
    ]
    if len(candidates) == 1:
        method = "normalized_name_position" if team == "" else "normalized_name_team_position"
        confidence = 0.9 if team == "" else 0.98
        return EtrMatchResult(name, team, position, candidates[0], method, confidence, "")

    if len(candidates) > 1:
        return EtrMatchResult(name, team, position, None, "ambiguous_match", 0, "ambiguous_match")

    return EtrMatchResult(name, team, position, None, "no_match", 0, "no_match")


def generate_etr_match_csv(
    *,
    etr_csv: Path,
    sleeper_json: Path,
    output_csv: Path,
) -> list[EtrMatchResult]:
    sleeper_players = load_active_sleeper_players(sleeper_json)
    with etr_csv.open(newline="", encoding="utf-8-sig") as file:
        results = [match_etr_value_row(row, sleeper_players) for row in csv.DictReader(file)]

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "etr_name",
                "etr_team",
                "etr_position",
                "sleeper_id",
                "sleeper_name",
                "sleeper_team",
                "match_method",
                "match_confidence",
                "notes",
            ],
        )
        writer.writeheader()
        for result in results:
            writer.writerow(
                {
                    "etr_name": result.etr_name,
                    "etr_team": result.etr_team,
                    "etr_position": result.etr_position,
                    "sleeper_id": result.sleeper.sleeper_id if result.sleeper else "",
                    "sleeper_name": result.sleeper.full_name if result.sleeper else "",
                    "sleeper_team": result.sleeper.team if result.sleeper else "",
                    "match_method": result.match_method,
                    "match_confidence": result.match_confidence,
                    "notes": result.notes,
                }
            )
    return results
```

- [ ] **Step 4: Verify green**

Run:

```bash
python3 -m pytest scripts/projections/tests/test_match_etr_values.py -q
```

Expected: PASS.

- [ ] **Step 5: Add README command**

Document:

```bash
python3 -m draftops_projections.match_etr_values \
  --etr-csv existing_project_docs/auction-tool/src/Dynasty_Rankings.csv \
  --sleeper-json data/raw/sleeper_players.json \
  --output-csv data/generated/etr_sleeper_matches.csv
```

If using `python -m`, add a small `main()` parser to `match_etr_values.py` before documenting it.

- [ ] **Step 6: Commit**

```bash
git add scripts/projections
git commit -m "feat(projections): match ETR values to Sleeper IDs"
```

---

## Task 3: Projection Fantasy Points

**Files:**

- Create: `src/lib/projectionScoring.ts`
- Create: `src/__tests__/projectionScoring.test.ts`

- [ ] **Step 1: Write failing scoring tests**

Create `src/__tests__/projectionScoring.test.ts`:

```ts
import { calculateProjectedPoints, type ProjectionStats } from '@/lib/projectionScoring';
import { DEFAULT_SCORING_SETTINGS } from '@/types';

const qb: ProjectionStats = {
  sleeperId: '1',
  position: 'QB',
  games: 17,
  passYds: 4000,
  passTd: 30,
  passInt: 10,
  rushAtt: 80,
  rushYds: 400,
  rushTd: 4,
  targets: 0,
  receptions: 0,
  recYds: 0,
  recTd: 0,
};

it('scores passing, rushing, and turnovers for QBs', () => {
  expect(calculateProjectedPoints(qb, DEFAULT_SCORING_SETTINGS)).toBeCloseTo(324);
});

it('applies position-specific PPR for receiving stats', () => {
  const te: ProjectionStats = {
    ...qb,
    position: 'TE',
    passYds: 0,
    passTd: 0,
    passInt: 0,
    rushAtt: 0,
    rushYds: 0,
    rushTd: 0,
    targets: 120,
    receptions: 80,
    recYds: 900,
    recTd: 8,
  };

  expect(calculateProjectedPoints(te, { ...DEFAULT_SCORING_SETTINGS, pprTE: 2 })).toBeCloseTo(298);
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm jest projectionScoring
```

Expected: FAIL because `projectionScoring.ts` does not exist.

- [ ] **Step 3: Implement scoring**

Create `src/lib/projectionScoring.ts`:

```ts
import type { Position, ScoringSettings } from '@/types';

export interface ProjectionStats {
  sleeperId: string;
  position: Position;
  games: number;
  passYds: number;
  passTd: number;
  passInt: number;
  rushAtt: number;
  rushYds: number;
  rushTd: number;
  targets: number;
  receptions: number;
  recYds: number;
  recTd: number;
}

const RUSH_YDS_PER_POINT = 10;
const REC_YDS_PER_POINT = 10;
const RUSH_TD = 6;
const REC_TD = 6;

export function calculateProjectedPoints(
  projection: ProjectionStats,
  scoring: ScoringSettings,
): number {
  const ppr =
    projection.position === 'RB'
      ? scoring.pprRB
      : projection.position === 'WR'
        ? scoring.pprWR
        : projection.position === 'TE'
          ? scoring.pprTE
          : 0;

  return (
    projection.passYds / scoring.passYdsPerPoint +
    projection.passTd * scoring.passTD +
    projection.passInt * scoring.passInt +
    projection.rushAtt * scoring.rushAtt +
    projection.rushYds / RUSH_YDS_PER_POINT +
    projection.rushTd * RUSH_TD +
    projection.receptions * ppr +
    projection.recYds / REC_YDS_PER_POINT +
    projection.recTd * REC_TD
  );
}
```

- [ ] **Step 4: Verify green and commit**

Run:

```bash
pnpm jest projectionScoring
pnpm tsc --noEmit
git add src/lib/projectionScoring.ts src/__tests__/projectionScoring.test.ts
git commit -m "feat(values): score normalized projections"
```

Expected: tests and typecheck pass.

---

## Task 4: Replacement Levels, VOR, and Auction Values

**Files:**

- Create: `src/lib/projectionVor.ts`
- Create: `src/__tests__/projectionVor.test.ts`

- [ ] **Step 1: Write failing VOR tests**

Create `src/__tests__/projectionVor.test.ts`:

```ts
import { calculateProjectionValues, type ProjectionValueInput } from '@/lib/projectionVor';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP, DEFAULT_TARGET_ROSTER } from '@/types';

const player = (
  sleeperId: string,
  position: 'QB' | 'RB' | 'WR' | 'TE',
  points: number,
  fallbackAuctionValue = 10,
  isRookie = false,
): ProjectionValueInput => ({
  sleeperId,
  name: `${position}${sleeperId}`,
  position,
  projectedPoints: points,
  fallbackAuctionValue,
  isRookie,
});

it('uses the Nth player at a position as replacement level', () => {
  const values = calculateProjectionValues({
    players: [player('1', 'QB', 300), player('2', 'QB', 250), player('3', 'QB', 200)],
    teamCount: 2,
    rosterSize: 3,
    budget: 10,
    startingLineup: ['QB'],
    targetRoster: { QB: 1 },
    scoringSettings: DEFAULT_SCORING_SETTINGS,
  });

  expect(values.find((p) => p.sleeperId === '1')?.replacementPoints).toBe(250);
  expect(values.find((p) => p.sleeperId === '1')?.vor).toBe(50);
});

it('allocates auction dollars only across positive VOR', () => {
  const values = calculateProjectionValues({
    players: [player('1', 'QB', 300), player('2', 'QB', 250), player('3', 'QB', 200)],
    teamCount: 2,
    rosterSize: 3,
    budget: 10,
    startingLineup: DEFAULT_STARTING_LINEUP,
    targetRoster: { QB: 1 },
    scoringSettings: DEFAULT_SCORING_SETTINGS,
  });

  expect(values.find((p) => p.sleeperId === '1')?.projectionAuctionValue).toBeGreaterThan(1);
  expect(values.find((p) => p.sleeperId === '3')?.projectionAuctionValue).toBe(1);
});

it('returns fallback-only rows when a player has no projection points', () => {
  const values = calculateProjectionValues({
    players: [{ ...player('1', 'QB', 0), projectedPoints: null }],
    teamCount: 12,
    rosterSize: 30,
    budget: 1000,
    startingLineup: DEFAULT_STARTING_LINEUP,
    targetRoster: DEFAULT_TARGET_ROSTER,
    scoringSettings: DEFAULT_SCORING_SETTINGS,
  });

  expect(values[0].projectionAuctionValue).toBeNull();
  expect(values[0].activeAuctionValue).toBe(values[0].fallbackAuctionValue);
  expect(values[0].vor).toBeNull();
});

it('does not let low rookie projections reduce active dynasty value', () => {
  const values = calculateProjectionValues({
    players: [
      player('1', 'WR', 40, 80, true),
      player('2', 'WR', 120, 20),
      player('3', 'WR', 100, 20),
    ],
    teamCount: 2,
    rosterSize: 3,
    budget: 10,
    startingLineup: ['WR'],
    targetRoster: { WR: 1 },
    scoringSettings: DEFAULT_SCORING_SETTINGS,
    activateProjectionValues: true,
  });

  const rookie = values.find((p) => p.sleeperId === '1')!;
  expect(rookie.projectionAuctionValue).toBe(1);
  expect(rookie.activeAuctionValue).toBe(80);
});

it('lets strong rookie projections raise active value when projection values are active', () => {
  const values = calculateProjectionValues({
    players: [
      player('1', 'WR', 180, 20, true),
      player('2', 'WR', 120, 20),
      player('3', 'WR', 100, 20),
    ],
    teamCount: 2,
    rosterSize: 3,
    budget: 10,
    startingLineup: ['WR'],
    targetRoster: { WR: 1 },
    scoringSettings: DEFAULT_SCORING_SETTINGS,
    activateProjectionValues: true,
  });

  const rookie = values.find((p) => p.sleeperId === '1')!;
  expect(rookie.projectionAuctionValue).toBeGreaterThan(rookie.fallbackAuctionValue);
  expect(rookie.activeAuctionValue).toBe(rookie.projectionAuctionValue);
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm jest projectionVor
```

Expected: FAIL because `projectionVor.ts` does not exist.

- [ ] **Step 3: Implement VOR**

Create `src/lib/projectionVor.ts`:

```ts
import type { Position, ScoringSettings, StartingSlot } from '@/types';

type VorPosition = 'QB' | 'RB' | 'WR' | 'TE';

export interface ProjectionValueInput {
  sleeperId: string;
  name: string;
  position: VorPosition;
  projectedPoints: number | null;
  fallbackAuctionValue: number;
  isRookie?: boolean;
}

export interface ProjectionValueOutput extends ProjectionValueInput {
  replacementPoints: number | null;
  vor: number | null;
  projectionAuctionValue: number | null;
  activeAuctionValue: number;
}

export interface ProjectionValueSettings {
  players: ProjectionValueInput[];
  teamCount: number;
  rosterSize: number;
  budget: number;
  startingLineup: StartingSlot[];
  targetRoster: Partial<Record<Position, number>>;
  scoringSettings: ScoringSettings;
  activateProjectionValues?: boolean;
}

export function calculateProjectionValues(
  settings: ProjectionValueSettings,
): ProjectionValueOutput[] {
  const projected = settings.players.filter((p) => p.projectedPoints !== null);
  const replacementByPosition = computeReplacementPoints(projected, settings);
  const withVor = settings.players.map((player) => {
    if (player.projectedPoints === null) {
      return {
        ...player,
        replacementPoints: null,
        vor: null,
        projectionAuctionValue: null,
        activeAuctionValue: player.fallbackAuctionValue,
      };
    }
    const replacement = replacementByPosition[player.position] ?? 0;
    const vor = Math.max(0, player.projectedPoints - replacement);
    return {
      ...player,
      replacementPoints: replacement,
      vor,
      projectionAuctionValue: null,
      activeAuctionValue: player.fallbackAuctionValue,
    };
  });

  const positiveVor = withVor.reduce((sum, p) => sum + (p.vor ?? 0), 0);
  const totalBudget = settings.teamCount * settings.budget;
  const reservedMinimum = settings.teamCount * settings.rosterSize;
  const allocatable = Math.max(0, totalBudget - reservedMinimum);

  return withVor.map((player) => {
    if (player.vor === null) return player;
    const projectionAuctionValue =
      player.vor > 0 && positiveVor > 0
        ? Math.max(1, Math.round((player.vor / positiveVor) * allocatable))
        : 1;
    const activeAuctionValue = computeActiveAuctionValue({
      fallbackAuctionValue: player.fallbackAuctionValue,
      projectionAuctionValue,
      isRookie: player.isRookie ?? false,
      activateProjectionValues: settings.activateProjectionValues ?? false,
    });
    return { ...player, projectionAuctionValue, activeAuctionValue };
  });
}

interface ActiveValueInput {
  fallbackAuctionValue: number;
  projectionAuctionValue: number;
  isRookie: boolean;
  activateProjectionValues: boolean;
}

function computeActiveAuctionValue(input: ActiveValueInput): number {
  if (!input.activateProjectionValues) return input.fallbackAuctionValue;
  if (input.isRookie) {
    return Math.max(input.fallbackAuctionValue, input.projectionAuctionValue);
  }
  return input.projectionAuctionValue;
}

function computeReplacementPoints(
  players: ProjectionValueInput[],
  settings: ProjectionValueSettings,
): Partial<Record<VorPosition, number>> {
  const result: Partial<Record<VorPosition, number>> = {};
  for (const position of ['QB', 'RB', 'WR', 'TE'] as const) {
    const target = Math.max(1, settings.targetRoster[position] ?? 1);
    const replacementIndex = Math.max(0, Math.ceil(settings.teamCount * target) - 1);
    const sorted = players
      .filter((player) => player.position === position && player.projectedPoints !== null)
      .sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0));
    result[position] = sorted[Math.min(replacementIndex, sorted.length - 1)]?.projectedPoints ?? 0;
  }
  return result;
}
```

- [ ] **Step 4: Verify green and commit**

Run:

```bash
pnpm jest projectionVor
pnpm tsc --noEmit
git add src/lib/projectionVor.ts src/__tests__/projectionVor.test.ts
git commit -m "feat(values): calculate projection VOR auction values"
```

Expected: tests and typecheck pass.

---

## Task 5: Apply Projection Values to a Draft

**Files:**

- Create: `prisma/apply-projection-values.ts`
- Test: `src/__tests__/projectionApply.test.ts`

- [ ] **Step 1: Write failing unit tests for row joining**

Create a pure helper inside `prisma/apply-projection-values.ts` and test it from `src/__tests__/projectionApply.test.ts`:

```ts
import { joinPlayersToProjectionRows } from '../../prisma/apply-projection-values';

it('joins players to projection rows by sleeperId', () => {
  const joined = joinPlayersToProjectionRows(
    [{ id: 1, name: 'A', pos: 'QB', sleeperId: '10', budget: 20 }],
    [{ sleeperId: '10', position: 'QB', projectedPoints: 300 }],
  );

  expect(joined).toEqual([
    {
      playerId: 1,
      sleeperId: '10',
      position: 'QB',
      projectedPoints: 300,
      fallbackAuctionValue: 20,
    },
  ]);
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm jest projectionApply
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement helper and script**

Implement:

- CSV readers for `data/generated/master_projections.csv` and `data/generated/etr_sleeper_matches.csv`.
- `joinPlayersToProjectionRows(players, projections)` by `sleeperId`.
- A CLI that accepts `--draft-id`, loads draft settings and players, calculates projection values, and updates only matched players:

```ts
await tx.player.update({
  where: { id: row.playerId },
  data: {
    projectedPoints: row.projectedPoints,
    replacementPoints: value.replacementPoints,
    vor: value.vor,
    projectionAuctionValue: value.projectionAuctionValue,
    fallbackAuctionValue: player.budget,
    activeAuctionValue: value.activeAuctionValue,
    valueSource: 'fallback',
    projectionSource: 'mike_clay',
    projectionSeason: 2026,
  },
});
```

Do not overwrite `budget` in this phase. The app remains fallback-active while projection values are exposed in DB.

- [ ] **Step 4: Verify script tests**

Run:

```bash
pnpm jest projectionApply
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/apply-projection-values.ts src/__tests__/projectionApply.test.ts
git commit -m "feat(values): apply projection values to draft players"
```

---

## Task 6: Final Verification and Docs

**Files:**

- Modify: `scripts/projections/README.md`
- Modify: `CLAUDE.md`
- Optionally modify: `ROADMAP.md` if this branch includes the roadmap update.

- [ ] **Step 1: Document the workflow**

Add:

```bash
python3 scripts/projections/generate_master_csv.py
python3 -m draftops_projections.match_etr_values \
  --etr-csv existing_project_docs/auction-tool/src/Dynasty_Rankings.csv \
  --sleeper-json data/raw/sleeper_players.json \
  --output-csv data/generated/etr_sleeper_matches.csv
pnpm tsx prisma/apply-projection-values.ts --draft-id <id>
```

Explain that `data/generated/` remains ignored and must be regenerated locally or in a controlled import job.

- [ ] **Step 2: Run full verification**

Run:

```bash
python3 -m pytest scripts/projections/tests -q
pnpm tsc --noEmit
pnpm lint
pnpm test
```

Expected:

- Python projection tests pass.
- TypeScript passes.
- ESLint has 0 errors. Existing warnings are acceptable only if unchanged.
- Jest passes.

- [ ] **Step 3: Commit docs**

```bash
git add scripts/projections/README.md CLAUDE.md ROADMAP.md
git commit -m "docs(values): document projection-aware value workflow"
```

---

## Self-Review

- Covers #5e MVP: projected fantasy points, replacement points, VOR, projection auction values, fallback coexistence, and value-source metadata.
- Covers the user-specified Sleeper ID need for ETR dynasty values using `existing_project_docs/auction-tool/src/Dynasty_Rankings.csv`.
- Keeps generated CSVs ignored, matching current ETL policy.
- Does not add UI switching/blending yet; this phase stores projection values separately and leaves fallback active.
- Uses TDD for every production-code task.
