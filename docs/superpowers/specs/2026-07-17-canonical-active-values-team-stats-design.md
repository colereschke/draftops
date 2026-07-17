# HARD-004 Canonical Active Values and Team Statistics Design

**Date:** 2026-07-17
**Workstream:** HARD-004

## Purpose

DraftOps currently derives active player values and team statistics differently across the value
sheet, team dossier, budget pressure board, and nomination helper. The differences affect roster
counts, buying power, player deltas, manager tendencies, threat scores, and nomination advice.

HARD-004 will create one canonical active-player pipeline and one canonical team-statistics
calculator. Every view will consume those boundaries instead of recreating part of the calculation.

## Goals

- Apply projection-backed values, fallback values, dynamic future-pick adjustments, and future-pick
  auction-mode filtering in one fixed pipeline.
- Compute spending, remaining budget, roster usage, buying power, package counts, average age, and
  roster-entry deltas in one pure function.
- Give the value sheet, teams page, budget page, nomination page, and nomination API identical value
  and team-stat semantics.
- Build player lookup maps once per calculation instead of searching the player array for every bid.
- Preserve a clean extension point for feature 10, budget-for-picks trading, without implementing a
  trade ledger in this workstream.

## Non-goals

- Changing projection-source activation semantics; HARD-006 owns explicit atomic activation.
- Adding budget trades, pick transfers, first-class pick ownership, trade-entry UI, or database
  tables for feature 10.
- Changing dynamic pick valuation formulas, projection formulas, nomination scoring formulas, or
  manager-tendency thresholds.
- Changing page presentation or sorting behavior.
- Adding or changing database schema.

## Canonical Policies

### Roster slots

Auction results at QB, RB, WR, and TE each consume one configured roster slot. PICK and PKG results
spend auction budget and remain visible as assets, but they do not consume roster slots. PICK and
PKG results also do not contribute to average roster age.

This is the same rule already enforced by bid legality in `src/lib/bidMutation.ts`. The canonical
statistics service will export the policy so legality and reporting can share one definition instead
of maintaining parallel position sets.

### Player identity

Roster-entry value and age lookup prefers `playerId`, which is the authoritative draft-scoped
identity. Results created before player IDs were required may fall back to exact player name. A
result with a present but unknown player ID does not silently bind to a same-named player.

### Active value

The active player pipeline applies transformations in this order:

1. Map database players through the current draft-value selection logic, using projection-backed
   `activeAuctionValue` where selectable and the stored player fallback otherwise.
2. Apply dynamic future-pick adjustments using the origin team's auction state.
3. Filter future-pick rows according to the immutable draft auction mode.

The value sheet may apply `computeSpreads` after this pipeline. Spreads and strategy tags are derived
display metadata, not part of active-value selection.

### Budget accounting and feature 10

Auction spend and budget transfers are distinct concepts. The statistics formula is:

```text
effective budget = starting budget + net budget delta
remaining budget = effective budget - auction spend
buying power = remaining budget - open roster slots
```

For HARD-004, every team's net budget delta defaults to zero. The pure calculator accepts the delta
as a separate optional input and includes a non-zero-delta test. A future transfer ledger can supply
the aggregated delta without representing a trade as an `AuctionResult` or changing roster counts.

Future-pick value remains anchored to `futurePickOriginHandle`. Current ownership is a separate
concern that feature 10 can model with first-class assets or a transfer ledger. Acquiring a pick must
not cause its dynamic value to be recomputed from the acquiring team's roster.

## Architecture

### Active draft players

Add `src/lib/activeDraftPlayers.ts` with a focused database service:

```ts
interface GetActiveDraftPlayersInput {
  draftId: number;
  startingLineup: StartingSlot[];
  futurePickAuctionMode: FuturePickAuctionMode;
  bids: ActiveValueBidInput[];
}

async function getActiveDraftPlayers(input: GetActiveDraftPlayersInput): Promise<Player[]>;
```

The service queries only the draft's `Player` and `DraftPlayerValue` rows. Callers pass bids they
already loaded with team handles, avoiding a second auction-result query on pages that also need
team data. Internally it composes the existing `mapPlayersWithDraftValues`,
`applyDynamicPickValues`, and `filterFuturePickAssetsForMode` functions in the canonical order.

The existing mapping and valuation helpers remain independently testable. Page modules stop
assembling the pipeline themselves.

### Draft team statistics

Replace both current `computeTeamStats` implementations with
`src/lib/computeDraftTeamStats.ts`:

```ts
interface ComputeDraftTeamStatsInput {
  teams: DraftTeamStatsInput[];
  players: Player[];
  rosterSize: number;
  budgetDeltaByTeamId?: ReadonlyMap<number, number>;
}

function computeDraftTeamStats(input: ComputeDraftTeamStatsInput): TeamWithRoster[];
```

The function is pure and preserves input team order. A view that needs buying-power ordering applies
that ordering after calculation.

At the start of each call, it builds maps by player ID and exact player name. It then calculates:

- `spent` from all auction results, including PICK and PKG;
- `remaining` from starting budget, optional net budget delta, and auction spend;
- `rosterCount` from QB/RB/WR/TE results only;
- `rosterRemaining` from configured roster size and canonical roster count;
- `buyingPower` from remaining budget minus roster slots still requiring one dollar;
- `pkgCount` from PKG results;
- `avgAge` from matched QB/RB/WR/TE players with known ages;
- roster entries and `delta` from the same canonical active player value map.

`TeamWithRoster[]` structurally satisfies consumers that only require `TeamStats[]`. The duplicate
`src/lib/budget.ts` module will be removed.

### Shared roster policy

Move the skill-position roster rule into a small exported policy in the canonical statistics module
or a dedicated `rosterPolicy.ts` if sharing it would otherwise create an import cycle. Bid legality
and team-stat calculation will call the same `countsTowardRoster(position)` predicate.

## Consumer Data Flow

### Value sheet

The draft home page loads bids and passes them to `getActiveDraftPlayers`. It applies value spreads
to the returned players and renders the auction sheet. No page-local projection, dynamic-pick, or
auction-mode pipeline remains.

### Teams page

The teams page loads teams with results, obtains canonical active players, calculates canonical team
statistics, and feeds both the team statistics and active players into existing tendency logic.
Roster-entry deltas and tendency values therefore use the same active targets as the value sheet.

### Budget page

The budget page replaces its minimal fallback-only player query and duplicate statistics helper
with canonical active players and canonical team statistics. Threat and tendency calculations use
those outputs. The page retains its own buying-power presentation ordering.

### Nomination page and API

The nomination page receives canonical active players. The nomination-data API loads the same
active players and canonical team statistics before returning its refresh payload. This removes the
API's current behavior of counting PICK and PKG results as roster slots. Nomination demand and rival
buying power use the same values and roster policy as the other views.

## Error Handling

- Authentication and draft ownership remain at the existing page and route boundaries.
- Database failures in the active-player service propagate to existing Next.js page error handling
  or API error handling; they are not converted into empty player lists.
- Missing draft-value rows remain a supported fallback case through `mapPlayersWithDraftValues`.
- Legacy auction results without a resolvable player produce a null delta and do not contribute to
  average age. Their price still contributes to spending.
- Unexpected position strings spend budget but do not consume a roster slot. This is defensive for
  legacy data; mutations continue to derive position from a valid draft player.

## Testing Strategy

Implementation follows test-driven development.

1. Add a canonical mixed fixture containing QB, RB, WR, TE, PICK, and PKG results. Assert spending,
   roster count, remaining slots, package count, and buying power from one calculation.
2. Assert a non-zero budget delta changes effective remaining budget and buying power without
   changing auction spend or roster count.
3. Test ID-first lookup, legacy name fallback, unknown IDs, active-value delta, known-age averaging,
   and PICK/PKG age exclusion.
4. Test the active-player service with projection-backed and fallback rows, a dynamically adjusted
   future pick, and each relevant auction-mode filtering path.
5. Extend the nomination API test to prove PICK/PKG results spend budget without consuming slots and
   that canonical values feed its returned statistics.
6. Add consumer wiring tests, using module mocks where appropriate, proving the value sheet, teams,
   budget, and nomination paths request `getActiveDraftPlayers` rather than rebuilding the pipeline.
7. Remove the duplicate budget tests after their behavior is represented in the canonical suite.
8. Run focused tests during red/green cycles, followed by `make check` for typecheck, lint, format,
   and the full Jest suite.

## Acceptance Criteria

- One shared fixture produces the same team statistics for every consuming route and view.
- QB/RB/WR/TE count as roster slots; PICK/PKG spend budget but do not count as roster slots or age
  inputs.
- Projection, fallback, dynamic future-pick, and auction-mode value selection are identical on the
  value sheet, teams page, budget page, and nomination page/API.
- Deltas, tendencies, threat calculations, and nomination scoring receive canonical active values.
- The two duplicate team-statistics implementations are replaced by one pure calculator.
- The calculator supports a separate zero-default net budget delta, preserving compatibility with
  feature 10 without adding trade persistence or UI.
- Existing behavior outside this workstream remains covered and `make check` passes.
