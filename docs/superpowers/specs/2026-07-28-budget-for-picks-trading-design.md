# Budget-for-Picks Trading Design

**Date:** 2026-07-28
**Roadmap item:** #10

## Purpose

Some leagues let teams trade a slice of remaining auction budget for another team's future draft
picks mid-auction. DraftOps is single-operator: the owner logs a trade the same way they log a bid,
after it happens in the real league. The most common case is a pick that was never fought over in
DraftOps's own auction at all — either `futurePickAuctionMode: NONE`, where next-year picks are
never biddable, or a future year (e.g. 2028) that was never generated as a `Player` row. In both
cases the pick implicitly belongs to its origin team until traded; DraftOps currently has no way to
represent that ownership changing hands, or the budget that moved to make it happen.

Two prior specs deliberately deferred this: HARD-004 reserved a `budgetDeltaByTeamId` seam in
`computeDraftTeamStats` but left it always empty, and the dynamic-pick-valuation spec explicitly
ruled out "a full pick ownership or trade ledger" for that iteration. This spec is that ledger.

## Goals

- Record a budget-for-picks trade as its own domain concept, not an `AuctionResult`.
- Support trading one or more individual round-level picks in a single trade, regardless of whether
  they were ever biddable in DraftOps's own auction.
- Support re-trading a pick a team already acquired by trade (multi-hop).
- Feed the trade's budget delta into the existing `remaining`/`buyingPower`/threat-score pipeline.
- Feed trade-acquired picks into the existing dynamic-pick-valuation rebuild signal
  (`src/lib/dynamicPickValues.ts`), so acquiring extra draft capital by trade reads as a rebuilding
  signal the same way acquiring it by auction already does.
- Support edit/delete/restore of a logged trade, matching the existing bid audit pattern.

## Non-goals

- Player-for-player or player-for-pick trades. This is budget-for-picks only, matching the roadmap
  item's scope.
- Trading a package as a bundle. Packages remain an auction-pool/bidding concept only
  (`futurePickAssetKind: 'package'`); trades always operate on individual rounds.
- A general first-class "assets" system with transfer history beyond what trading requires (no
  splitting arbitrary player assets, no ownership edits outside the trade flow).
- Changing dynamic pick valuation's pricing formula or weights.
- A `/teams` or `/budget` aggregate "total draft capital" column. This spec makes the underlying
  data queryable; a dedicated aggregate view is future work (#8a-adjacent), not required here.

## Data Model

Two new tables plus one audit table, following the existing `AuctionResult`/`BidAuditEvent`
conventions (composite `(id, draftId)` uniqueness, soft delete via `deletedAt`, JSON before/after
snapshots on the audit row):

Field names are `budgetTeamId`/`pickTeamId` rather than "paying/receiving," which is ambiguous about
receiving _what_ (both teams receive something). `Team` needs matching back-relations
(`tradesAsBudgetTeam`, `tradesAsPickTeam`) added alongside its existing `results` relation; omitted
below for brevity.

```prisma
model Trade {
  id           Int       @id @default(autoincrement())
  draftId      Int
  budgetTeamId Int       // sends budget, receives picks
  pickTeamId   Int       // sends picks, receives budget
  budgetAmount Int       // always > 0; a trade always moves at least one dollar and one pick
  notes        String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?
  draft        Draft     @relation(fields: [draftId], references: [id], onDelete: Restrict)
  budgetTeam   Team      @relation("TradeBudgetTeam", fields: [budgetTeamId, draftId], references: [id, draftId], onDelete: Restrict, onUpdate: Restrict)
  pickTeam     Team      @relation("TradePickTeam", fields: [pickTeamId, draftId], references: [id, draftId], onDelete: Restrict, onUpdate: Restrict)
  pickAssets   TradePickAsset[]
  auditEvents  TradeAuditEvent[]

  @@unique([id, draftId])
  @@index([draftId, deletedAt])
}

model TradePickAsset {
  id              Int   @id @default(autoincrement())
  tradeId         Int
  draftId         Int
  originTeamId    Int
  futurePickYear  Int
  futurePickRound Int   // 1, 2, or 3
  trade           Trade @relation(fields: [tradeId, draftId], references: [id, draftId], onDelete: Cascade, onUpdate: Restrict)
  originTeam      Team  @relation(fields: [originTeamId, draftId], references: [id, draftId], onDelete: Restrict, onUpdate: Restrict)

  @@unique([tradeId, originTeamId, futurePickYear, futurePickRound])
  @@index([draftId, originTeamId, futurePickYear, futurePickRound])
}

model TradeAuditEvent {
  id         Int               @id @default(autoincrement())
  draftId    Int
  tradeId    Int
  actorId    String
  type       BidAuditEventType // reuse CREATE/UPDATE/DELETE/RESTORE; SUPERSEDE unused here
  before     Json?
  after      Json?
  occurredAt DateTime          @default(now())
  draft      Draft             @relation(fields: [draftId], references: [id], onDelete: Restrict)
  trade      Trade             @relation(fields: [tradeId, draftId], references: [id, draftId], onDelete: Restrict)

  @@index([draftId, occurredAt, id])
  @@index([tradeId])
}
```

`TradePickAsset.originTeamId` references the same team whose `futurePickOriginHandle` the picks
already carry on generated `Player` rows — the origin never changes across trades, only the current
holder does. Origin is stored as a `Team` FK here (not a raw handle string like `Player` uses)
because `Trade` rows are transactional records that need referential integrity and efficient lookup
by origin, not denormalized valuation snapshots.

A pick can appear as a `TradePickAsset` on at most one _active_ `Trade` at a time — it can be named
by trade after trade over the draft's lifetime (multi-hop), but never by two simultaneously-active
trades. This is enforced by the `PICK_NOT_HELD` legality check at creation time, not by a database
constraint.

## Ownership Resolution

A pure function, `resolvePickHolder(draftId, originTeamId, year, round)`, is the single source of
truth for "who holds this pick right now":

1. Find the most recent non-deleted `Trade` (by `createdAt`) with a `TradePickAsset` matching
   `(originTeamId, year, round)`. If found, the holder is that trade's `pickTeamId`.
2. Else, find an `AuctionResult` for the matching `PKG` (whole package) or `PICK` (single round)
   `Player` row, not deleted. If found, the holder is that result's `teamId`.
3. Else, the holder is the origin team.

A batch variant, `resolveAllPickHolders(draftId)`, computes this for every `(originTeamId, year,
round)` combination that has ever appeared in a `Trade` or a `PKG`/`PICK` `AuctionResult` for the
draft, in one pass — needed for the dynamic-pick-valuation `futureCapital` extension below. Given
expected trade volumes (single digits per draft), this does not need to be incrementally
materialized; deriving it at read time is simpler and avoids a second place ownership can drift out
of sync with the trade/audit log.

**This is not sufficient on its own for the trade-entry picker.** It only covers combinations
DraftOps already has a row for. The scenario this feature exists for — a team's own future pick for
a year that was never generated (2028+) or a mode where next-year picks are never auctioned
(`NONE`) — has no row anywhere until the first time it's traded. So the picker is two categories:

1. **Known picks:** every `(team, round)` for the currently-generated future-pick year (the one
   `Player` rows already exist for, per `getNextFuturePickYear`) is a bounded, enumerable set —
   every team × 3 rounds, always resolvable via the 3-step algorithm above, regardless of
   `futurePickAuctionMode`. Shown as checkboxes.
2. **Off-book picks:** for any other year, DraftOps has no record until first referenced. The form
   offers a free-form "add a pick" row — origin team (defaults to the pick-side team, since a team
   trading away its own future capital is the common case, but any team may be picked), year
   (constrained to a year _after_ the currently-generated year, so this path can never shadow a pick
   that already has real `Player`-row provenance and should go through category 1 instead), and
   round (1–3). Submitting the trade creates its `TradePickAsset` as the first-ever reference to that
   pick; every subsequent trade of the same pick resolves it through the normal trade-log lookup
   (step 1) and no longer needs free-form entry.

**Package roll-up for display:** when a team holds all three rounds of an origin's year and none of
them arrived via a separate trade for that round alone, `/teams` may display it as "origin's YEAR
package" for readability. This is a presentation rule computed from the resolved per-round holders,
not a stored fact.

## Budget Effect

`computeDraftTeamStats` already accepts `budgetDeltaByTeamId?: ReadonlyMap<number, number>` and
computes `remaining = team.budget + delta - spent` (`src/lib/computeDraftTeamStats.ts:27,41`), but
no caller currently populates it. This spec:

- Adds a query that sums, per team, `-budgetAmount` for trades where the team is `budgetTeamId` and
  `+budgetAmount` for trades where the team is `pickTeamId` (non-deleted trades only), and passes
  the result as `budgetDeltaByTeamId` from every page/API that currently calls
  `computeDraftTeamStats`.
- Adds `netBudgetDelta: number` to the `TeamWithRoster` return shape, so `/teams` and `/budget` can
  render the delta explicitly (e.g. "Remaining $860 (−$80 from trades)") instead of only showing an
  unexplained change in `remaining`.

## Dynamic Pick Valuation Integration

`applyDynamicPickValues` (`src/lib/dynamicPickValues.ts`) currently builds `futureCapital` per
origin only from `PKG`/`PICK` `Player` rows appearing in the `bids` list (won at auction). This spec
extends `computeOriginSignals` to also add, per team, the baseline value of every pick currently
resolved to that team via `resolvePickHolder` that did **not** arrive through a `bids` row already
counted — using each pick's round-level baseline (`ROUND_BASELINES` in `futurePickAssets.ts`) scaled
the same way generated pick rows already are. This is an additive extension to an existing
computation, not a new signal; `REBUILD_SIGNAL_WEIGHT` and the rest of the formula are unchanged
(explicitly a non-goal to touch).

## Validation and Legality

New `DraftMutationCode` values, following the existing `bidMutation.ts` pattern
(`DraftMutationFailure`, `withActiveOwnedDraftMutation`):

- `TRADE_EXCEEDS_BUDGET` — the trade would take `budgetTeam.remaining` (computed with all _other_
  active trades and results already applied) below zero. Hard block, matching `BID_EXCEEDS_MAX`.
- `INVALID_INPUT` — reused: `budgetAmount` is not a positive integer, or no picks are selected.
  Every trade must move at least one dollar and at least one pick.
- `PICK_NOT_HELD` — a selected `(originTeamId, year, round)` does not currently resolve to
  `pickTeamId` via `resolvePickHolder`. Hard block; this also covers a would-be duplicate trade of
  the same pick submitted twice, or the same pick selected twice within one submission.
- `PICK_ALREADY_RETRADED` — returned when editing or deleting a trade whose `TradePickAsset` was
  named by a _later_ non-deleted trade. The user must remove the dependent trade first. This is the
  chaining hazard multi-hop ownership introduces: undoing an earlier hop while a later hop still
  depends on it would leave the later trade's `pickTeamId` claiming a pick it never legitimately
  received.
- `TEAM_NOT_FOUND` — reused from the existing bid mutation codes for an invalid `budgetTeamId`/
  `pickTeamId`, or `budgetTeamId === pickTeamId`.

All trade mutations run inside `withActiveOwnedDraftMutation` under the existing per-draft advisory
lock, so a trade and a concurrent bid can't race on the same team's budget.

## Edit / Delete / Restore

Matches `bidMutation.ts`'s pattern exactly, including the 30-minute restore window
(`RESTORE_WINDOW_EXPIRED`):

- **Edit** is scoped to `budgetAmount` and `notes` only. Changing which teams or which picks are
  involved requires delete + re-create, because those fields define the ownership-resolution chain
  and re-validating a partial change mid-edit (e.g. swapping one pick out of three) adds real
  complexity for a case that doesn't need it — a mis-entered team or pick set can be deleted and
  re-logged in two clicks.
- **Delete** soft-deletes (`deletedAt`), blocked by `PICK_ALREADY_RETRADED` if a later trade depends
  on it, same `TradeAuditEvent` (`type: 'DELETE'`) pattern as bids.
- **Restore** re-clears `deletedAt` within 30 minutes, re-validated against current legality
  (budget and `PICK_ALREADY_RETRADED` both re-checked at restore time, since state may have changed
  since the delete).

## UI

- **Entry point:** a "Log Trade" action on each team's dossier card on `/draft/[draftId]/teams`,
  pre-filling that team as one side of the trade (direction — paying or receiving — left for the
  operator to set, since either is possible from either card).
- **Form:** select the counterparty team; set budget amount and direction; then the two-category
  picker from Ownership Resolution — checkboxes for the pick-side team's held assets in the
  currently-generated year (package roll-up applied for display only), plus an "add a pick" row for
  any off-book future year. At least one pick (checked or freshly added) and a positive budget
  amount are required to submit.
- **History:** a trade ledger list on the same page (team names, amount, picks, timestamp) with
  edit/delete affordances, in the same spirit as the existing bid audit surfacing.
- `/teams` and `/budget` both pick up `netBudgetDelta` automatically through
  `computeDraftTeamStats`; no separate wiring needed beyond passing `budgetDeltaByTeamId` at each
  call site.

## Testing Strategy

- Unit: `resolvePickHolder`/`resolveAllPickHolders` covering untouched (origin default), single-hop,
  multi-hop, and auction-won-then-traded cases.
- Unit: picker category boundary — a round in the currently-generated year resolves via the known-
  picks path even with no `Trade` history; a round in any other year is absent until first traded,
  then resolves via the trade log on every subsequent lookup.
- Unit: `computeDraftTeamStats` with a populated `budgetDeltaByTeamId`, asserting `remaining` and
  the new `netBudgetDelta` field.
- Unit: `computeOriginSignals` extension, asserting a trade-acquired pick contributes to
  `futureCapital` exactly once (not double-counted if it also appears in a `bids` row from before
  the trade).
- Integration: trade mutation legality (`TRADE_EXCEEDS_BUDGET`, `PICK_NOT_HELD`,
  `PICK_ALREADY_RETRADED` on both delete and restore paths), against real Postgres.
- Integration: full create → edit (amount) → delete → restore lifecycle, asserting `TradeAuditEvent`
  rows match the bid-audit shape.

## Acceptance Criteria

- A trade for a pick that was never in the auction pool (`futurePickAuctionMode: NONE`, or a future
  year with no generated `Player` row) can be logged without first materializing an `AuctionResult`.
- A pick acquired by trade can be selected in a later trade to a third team.
- Both teams' `remaining`/`buyingPower`/threat scores reflect the trade immediately after logging.
- A team's accumulated trade-acquired draft capital measurably shifts `dynamicPickValues.ts`'s
  pricing of that team's own remaining pool picks (verified via the existing rebuild-signal test
  fixtures, extended with a trade-acquired case).
- Deleting a trade whose pick was re-traded is rejected with a clear, specific error rather than
  silently corrupting the later trade's implied ownership.
