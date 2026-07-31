# Budget-for-Picks Trading Design

**Date:** 2026-07-28 (revised after Opus review, 2026-07-31)
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

**Revision note:** the first draft of this spec was reviewed and found to wire the budget delta into
display only, leaving the actual bid-legality path and the live-auction screen unaffected by trades,
and to double-count draft capital in the dynamic-pick-valuation signal. This revision fixes both by
construction rather than patching around them — see "Budget Effect," "Bid Mutation Impact," and
"Dynamic Pick Valuation Integration" below.

## Goals

- Record a budget-for-picks trade as its own domain concept, not an `AuctionResult`.
- Support trading one or more individual round-level picks in a single trade, regardless of whether
  they were ever biddable in DraftOps's own auction.
- Support re-trading a pick a team already acquired by trade (multi-hop).
- Make a trade's budget delta binding everywhere budget legality and display are computed —
  `computeDraftTeamStats`, live bid legality, and the value-sheet operator budget tracker alike.
- Feed trade-acquired _and_ trade-divested picks into the existing dynamic-pick-valuation rebuild
  signal (`src/lib/dynamicPickValues.ts`) correctly in both directions, so a team's own accumulated
  draft capital — by auction or by trade — reads as a rebuilding signal, and giving that capital away
  removes it.
- Support edit/delete/restore of a logged trade, matching the existing bid audit pattern, without
  allowing a correction to silently corrupt a chained trade or an already-spent budget position.

## Non-goals

- Player-for-player or player-for-pick trades. This is budget-for-picks only, matching the roadmap
  item's scope.
- Trading a package as a bundle. Packages remain an auction-pool/bidding concept only
  (`futurePickAssetKind: 'package'`); trades always operate on individual rounds.
- A general first-class "assets" system with transfer history beyond what trading requires (no
  splitting arbitrary player assets, no ownership edits outside the trade flow).
- Changing dynamic pick valuation's rebuild-signal _weights_ or the rest of its formula
  (`SURPLUS_ADJUSTMENT_WEIGHT`, `REBUILD_SIGNAL_WEIGHT`, etc. are untouched). This spec does change
  where `futureCapital`'s _input value_ comes from — from an incremental, buy-side-only accumulation
  to a correct current-holdings snapshot — because the original definition cannot represent
  divestiture at all (see "Dynamic Pick Valuation Integration"); that is a correctness fix to an
  existing computation, not a new signal or a reweighting.
- Trading a pick backed by a legacy static `PKG`/`PICK` row (`isStaticFuturePickRow` in
  `futurePickAssets.ts` — a row with no `futurePickYear`/`futurePickRound`/`futurePickOriginHandle`
  metadata, from before the per-origin generator existed). Ownership resolution requires that
  metadata; a draft still carrying legacy rows cannot trade those specific picks. New drafts already
  exclude these rows (`excludeStaticFuturePickRows` in `actions.ts`).
- A `/teams` or `/budget` aggregate "total draft capital" column. This spec makes the underlying
  data queryable; a dedicated aggregate view is future work (#8a-adjacent), not required here.

## Data Model

Two new tables plus one audit table, following the existing `AuctionResult`/`BidAuditEvent`
conventions (composite `(id, draftId)` uniqueness, soft delete via `deletedAt`, JSON before/after
snapshots on the audit row).

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
  trade           Trade @relation(fields: [tradeId, draftId], references: [id, draftId], onDelete: Restrict, onUpdate: Restrict)
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

`onDelete: Restrict` on `TradePickAsset.trade` (not `Cascade`): every other relation in this schema
uses `Restrict`, and it's moot in practice anyway since `Trade` is only ever soft-deleted, never hard
`DELETE`d.

`TradePickAsset.originTeamId` references the same team whose `futurePickOriginHandle` the picks
already carry on generated `Player` rows — the origin never changes across trades, only the current
holder does. Origin is stored as a `Team` FK here (not a raw handle string like `Player` uses)
because `Trade` rows are transactional records that need referential integrity and efficient lookup
by origin, not denormalized valuation snapshots.

A pick can appear as a `TradePickAsset` on at most one _active_ `Trade` at a time — it can be named
by trade after trade over the draft's lifetime (multi-hop), but never by two simultaneously-active
trades. This is enforced by the `PICK_NOT_HELD` legality check at creation time (see Validation), not
by a database constraint. The `@@unique` above only prevents the _same trade_ from listing the same
pick twice (see M1 fix in Validation).

## Ownership Resolution

New module `src/lib/pickOwnership.ts`. A pure-shaped but DB-bound function,
`resolvePickHolder(tx, draftId, originTeamId, year, round)`, is the single source of truth for "who
holds this pick right now":

1. Find the most recent non-deleted `Trade` (by `createdAt`) with a `TradePickAsset` matching
   `(originTeamId, year, round)`. If found, the holder is that trade's `pickTeamId`.
2. Else, find a non-deleted `AuctionResult` for the matching `PKG` (whole package) or `PICK` (single
   round) `Player` row. If found, the holder is that result's `teamId`.
3. Else, the holder is the origin team.

A batch variant, `resolveAllPickHolders(tx, draftId)`, computes this for every `(originTeamId, year,
round)` combination that has ever appeared in a `Trade` or a `PKG`/`PICK` `AuctionResult` for the
draft, in one pass. This scope — only _touched_ picks, never a team's own never-traded,
never-auctioned picks — is deliberate, not an oversight: it's exactly what "Dynamic Pick Valuation
Integration" below needs to stay behavior-compatible with the current (pre-trade) computation when no
trades exist, and untouched own-picks are handled separately for the trade-entry picker (category 1
below covers them directly from `Player` rows; they never need to go through this function).

Given expected trade volumes (single digits per draft), none of this needs to be incrementally
materialized; deriving it at read time inside the relevant transaction is simpler and avoids a second
place ownership can drift out of sync with the trade/audit log.

**Generated-year boundary.** Both this section's picker and the valuation integration need to know
which future-pick year currently has real `Player` rows. Use `max(Player.futurePickYear)` for the
draft (a direct query), not a recomputation of `getNextFuturePickYear(draft.createdAt)` — the stored
data is the ground truth, and querying it keeps the picker's two categories (below) provably
disjoint even if generation logic changes later.

**Trade-entry picker.** `resolveAllPickHolders` is not sufficient on its own for the trade-entry
picker — it only covers combinations DraftOps already has a row for. The scenario this feature
exists for — a team's own future pick for a year that was never generated (2028+), or a mode where
next-year picks are never auctioned (`NONE`) — has no row anywhere until the first time it's traded.
So the picker is two categories:

1. **Known picks:** every `(team, round)` for the currently-generated future-pick year (from
   `max(Player.futurePickYear)`) is a bounded, enumerable set — every team × 3 rounds, always
   resolvable via the 3-step algorithm above, regardless of `futurePickAuctionMode`. Shown as
   checkboxes.
2. **Off-book picks:** for any other year, DraftOps has no record until first referenced. The form
   offers a free-form "add a pick" row — origin team (defaults to the pick-side team, since a team
   trading away its own future capital is the common case, but any team may be picked), year
   (constrained to a year _after_ the currently-generated year, so this path can never shadow a pick
   that already has real `Player`-row provenance and should go through category 1 instead), and
   round (1–3). Submitting the trade creates its `TradePickAsset` as the first-ever reference to that
   pick; every subsequent trade of the same pick resolves it through the normal trade-log lookup
   (step 1) and no longer needs free-form entry.

**Package roll-up for display only:** `/teams` may display "origin's YEAR package" instead of three
separate lines when all three rounds currently resolve to the same holder _via the same acquisition
event_ — either one `PKG`-level `AuctionResult`, or all three still untouched at origin default. If
the three rounds happen to share a holder through independent events (three separate `individual`-
mode bids, or a trade that reassembled them one round at a time), they display as three separate
lines even though the holder matches, since there's no single event a "package" label would
accurately describe.

## Budget Effect

`computeDraftTeamStats` already accepts `budgetDeltaByTeamId?: ReadonlyMap<number, number>` and
computes `remaining = team.budget + delta - spent` (`src/lib/computeDraftTeamStats.ts:27,41`), but no
caller currently populates it, and — this is the part the first draft of this spec missed — that seam
only feeds _display_. Budget legality is enforced independently in `bidMutation.ts`, and the
live-auction screen (`/draft/[draftId]/page.tsx` → `AuctionSheet`) doesn't call
`computeDraftTeamStats` at all. A trade has to be visible in all three places, or it isn't real.

New shared module `src/lib/tradeBudget.ts`:

```ts
export async function getTradeBudgetDeltaByTeamId(
  tx: Prisma.TransactionClient,
  draftId: number,
): Promise<Map<number, number>>;
```

Sums, per team, `-budgetAmount` for trades where the team is `budgetTeamId` and `+budgetAmount` for
trades where the team is `pickTeamId`, over non-deleted `Trade` rows for the draft. This is the one
place the delta is computed; every consumer below calls it (or, for the trade-mutation transaction
itself, computes the same sum excluding the trade being edited/deleted — see Validation).

Three required call sites, all currently missing:

1. **`computeDraftTeamStats` callers** (`teams/page.tsx`, `budget/page.tsx`,
   `nomination-data/route.ts`) — pass the map as `budgetDeltaByTeamId`. `TeamWithRoster` gains an
   explicit `netBudgetDelta: number` field (not just folded silently into `remaining`), so `/teams`
   and `/budget` can render _why_ a number moved (e.g. "Remaining $860 (−$80 from trades)").
2. **`assertBidLegalInTransaction`** (`src/lib/bidMutation.ts:95-129`) — currently computes
   `team.budget - resultingSpend < requiredRosterDollars` from `team.budget` alone. Add the team's
   entry from `getTradeBudgetDeltaByTeamId` (fetched in the same `Promise.all` that already loads
   `team`/`existingResults`) and check `team.budget + netBudgetDelta - resultingSpend <
requiredRosterDollars`. Without this, a team that received trade budget stays capped at its
   pre-trade max, and a team that sent budget away can still bid past its real limit.
3. **`/draft/[draftId]/page.tsx` → `AuctionSheet`** — the operator's own budget tracker. `AuctionSheet`
   gains a new required prop `ownerBudgetDelta: number` (computed by the page via
   `getTradeBudgetDeltaByTeamId`, looked up for `draft.ownerTeamId`); `AuctionSheet.tsx:309` becomes
   `const remaining = ownerBudget + ownerBudgetDelta - mySpent`. `ownerBudget` keeps meaning the
   literal configured budget (so it's still labelable as such in the UI); the delta stays a visible,
   separate quantity, consistent with the "explainable, not silently shifted" bar above.

## Bid Mutation Impact

Ownership resolution's step 2 roots a pick's provenance in a `PKG`/`PICK` `AuctionResult` until a
trade supersedes it. Deleting that `AuctionResult` — or reassigning its `teamId` via
`updateBidRecord` — while a trade already depends on it would silently invalidate the trade's
premise: the trade asserted "this team held the pick," and if the win that gave them the pick is
undone, that assertion is no longer true, but nothing currently stops the trade from continuing to
claim it.

`bidMutation.ts` gains a new legality check, using `pickOwnership.ts`:

- New `DraftMutationCode`: `PICK_HAS_ACTIVE_TRADES`.
- `deleteBidRecord`, and `updateBidRecord` when it changes `teamId` on a `PKG`/`PICK` position: before
  proceeding, check whether any round covered by this result (all 3 for a `PKG` row, the specific one
  for a `PICK` row) has ever been named by a non-deleted `TradePickAsset`. If so, throw
  `PICK_HAS_ACTIVE_TRADES` — the operator must unwind the dependent trade(s) first, same pattern as
  `PICK_ALREADY_RETRADED` below. Price-only updates and restores are unaffected (restoring only adds
  provenance back, it never removes an assertion a trade depends on).

This is a genuine new cross-module dependency (`bidMutation.ts` importing from `pickOwnership.ts`)
and is called out explicitly here because it's easy for an implementation plan to miss — the trade
feature changes the legality of an _existing_, unrelated mutation path.

## Dynamic Pick Valuation Integration

**The naive version of this ("add trade-acquired capital to `futureCapital`") double-counts.**
`computeOriginSignals` (`dynamicPickValues.ts:83-96`) currently accumulates
`roster.futureCapital += player.baseBudget ?? player.budget` for each `PKG`/`PICK` a team _won_ in
the `bids` list — an incremental, buy-side-only tally. If a team wins a $109 package and later trades
one round away, an incremental "add to the acquirer" rule leaves the original $109 fully counted
against the divesting team forever, while also crediting the acquirer — the same capital counted
twice, league-wide. There is also no correct way to decompose a package's paid price into its rounds
after the fact (`ROUND_BASELINES` sums to 75+15+5=95, not the package baseline of 109), so any
attempt to subtract "this team's share" from the original win is arithmetically undefined.

**The correct fix replaces the accumulation with a snapshot**, and, as a side effect, resolves a
second problem: `computeOriginSignals` is synchronous and DB-free (reached from `activeDraftPlayers.
ts`'s `getActiveDraftPlayers`, which passes it only `players`/`bids`/`startingLineup`), but
`resolvePickHolder`/`resolveAllPickHolders` are DB-bound. The snapshot has to be computed once, async,
upstream, and passed down as plain data:

1. `getActiveDraftPlayers` (`src/lib/activeDraftPlayers.ts`) calls `resolveAllPickHolders(tx,
draftId)`, then converts each resolved `(originTeamId, year, round) → holderTeamId` entry into a
   dollar value and sums by holder: `futureCapitalByHandle: Map<string handle, number>`. The dollar
   value per entry is the _round's own market baseline_, not an allocated share of whatever was paid
   for it: if `year === max(Player.futurePickYear)` (the generated year), use that round's actual
   `PICK`-row `Player.budget` (already correctly scaled to the draft's economy); otherwise use
   `ROUND_BASELINES[round]` (now exported from `futurePickAssets.ts`) scaled the same way generated
   rows are (`getBudgetScale`). This sidesteps the package/round decomposition problem entirely —
   nothing is ever split, each round is valued on its own.
2. `applyDynamicPickValues` gains a required parameter `futureCapitalByHandle: ReadonlyMap<string,
number>`, threaded through from its caller in `getActiveDraftPlayers`.
3. Inside `computeOriginSignals`, delete the `roster.futureCapital += ...` line from the `bids` loop
   (the `continue` that excludes `PKG`/`PICK` from `playerRoster`/`value`/`vor` stays — only the
   futureCapital accumulation is removed). After the loop, for each origin already present in
   `rosterByOrigin` (i.e., an origin that has bought at least one real player — the pre-existing
   `playerCount >= MIN_BIDS` gate downstream already requires this before the signal matters at all,
   so no new origins need to be added here), set `signals.futureCapital =
futureCapitalByHandle.get(origin) ?? 0`.

This is behavior-preserving when no trades exist: pre-trade, `resolveAllPickHolders` only resolves
picks that appear in `bids` (step 2 of resolution, since nothing's been traded), which is exactly the
same set the old accumulation covered — so `futureCapital` computes identically to today for any
draft with zero trades. Once trades exist, it's simply correct in both directions: a divesting team's
snapshot no longer includes what it gave away (resolution now points elsewhere for that round), and
an acquiring team's snapshot includes what it received, whether by trade or by auction, with no
double-count possible because it's a fresh sum over current holders each time, not an accumulation of
history.

`REBUILD_SIGNAL_WEIGHT` and the rest of the formula are unchanged. The magnitude of the resulting
price shift (small, per the existing 0.08-weight/`weakRoster`-gated formula) should be re-verified
against updated test fixtures during implementation rather than asserted here — the fix makes the
_mechanism_ correct; it does not change how much the rebuild signal is allowed to move a price.

## Validation and Legality

New `DraftMutationCode` values, following the existing `bidMutation.ts` pattern
(`DraftMutationFailure`, `withActiveOwnedDraftMutation`). All checks below reuse the same "reserve
`max(0, rosterSize - rosterCount)` dollars" rule `assertBidLegalInTransaction` already enforces —
trades don't change roster counts, so `rosterCount` is just each team's current count.

- `TRADE_EXCEEDS_BUDGET` — creating or editing a trade would leave `budgetTeam`'s
  `budget + netBudgetDelta(excluding this trade, +/- the pending change) - spent` below
  `max(0, rosterSize - rosterCount)`. Same threshold as `BID_EXCEEDS_MAX`, not a bare zero check —
  the first draft of this spec got this wrong.
- `INVALID_INPUT` — reused: `budgetAmount` is not a positive integer, no picks are selected, or the
  same `(originTeamId, year, round)` appears more than once in the submitted pick list (checked in
  application code before the insert, not left to the `@@unique` constraint on `TradePickAsset` —
  that constraint is a backstop, not the primary error path, since a raw `P2002` has no
  `DraftMutationCode` mapping today, unlike `PLAYER_ALREADY_CLAIMED`'s explicit mapper in
  `bidMutation.ts`).
- `PICK_NOT_HELD` — a selected `(originTeamId, year, round)` does not currently resolve to
  `pickTeamId` via `resolvePickHolder`. Hard block.
- `PICK_ALREADY_RETRADED` — returned when editing or deleting a trade whose `TradePickAsset` was
  named by a _later_ non-deleted trade. The user must remove the dependent trade first.
- `PICK_HAS_ACTIVE_TRADES` — see Bid Mutation Impact; returned from `bidMutation.ts`, not
  `tradeMutation.ts`.
- `TEAM_NOT_FOUND` — reused from the existing bid mutation codes for an invalid `budgetTeamId`/
  `pickTeamId`, or `budgetTeamId === pickTeamId`.

All trade mutations run inside `withActiveOwnedDraftMutation` under the existing per-draft advisory
lock, so a trade and a concurrent bid can't race on the same team's budget.

## Edit / Delete / Restore

Matches `bidMutation.ts`'s pattern, including the 30-minute restore window
(`RESTORE_WINDOW_EXPIRED`), but a trade's budget delta is bidirectional — unlike a bid, where
deleting it can only ever _increase_ a team's remaining budget, deleting or editing a trade can make
_either_ side's remaining budget go down (the side that was receiving money loses it). Every mutation
below re-validates whichever side(s) can lose money as a result, against the same
`max(0, rosterSize - rosterCount)` reserve rule:

- **Create:** `budgetTeam` loses `budgetAmount` → check `budgetTeam` (`TRADE_EXCEEDS_BUDGET`).
- **Edit** is scoped to `budgetAmount` and `notes` only — changing which teams or which picks are
  involved requires delete + re-create, since those fields define the ownership-resolution chain and
  partial changes (e.g. swapping one pick of three) add real complexity for a case that doesn't need
  it. Any `budgetAmount` change re-validates **both** teams against the new amount
  (`TRADE_EXCEEDS_BUDGET` naming whichever side fails) rather than conditionally checking only the
  side that lost money — simpler to implement correctly than picking a direction.
- **Delete:** `budgetTeam` regains money (always safe); `pickTeam` loses the money it received →
  check `pickTeam` (`TRADE_EXCEEDS_BUDGET`). Also blocked by `PICK_ALREADY_RETRADED` if a later trade
  depends on any of this trade's picks. Soft-deletes (`deletedAt`), `TradeAuditEvent` (`type:
'DELETE'`).
- **Restore:** `pickTeam` regains money (safe, mirrors create for them); `budgetTeam` loses it again
  → re-run the same check as create (`TRADE_EXCEEDS_BUDGET`). Also re-checks `PICK_NOT_HELD` for
  every `TradePickAsset` on the trade — ownership may have shifted via other trades logged after this
  one was deleted, so a stale approval from delete-time isn't sufficient.

## UI

- **Entry point:** a "Log Trade" action on each team's dossier card on `/draft/[draftId]/teams`,
  pre-filling that team as one side of the trade (direction left for the operator to set, since
  either is possible from either card).
- **Form:** select the counterparty team; set budget amount and direction; then the two-category
  picker from Ownership Resolution — checkboxes for the pick-side team's held assets in the
  currently-generated year (package roll-up applied for display only), plus an "add a pick" row for
  any off-book future year. At least one pick (checked or freshly added) and a positive budget amount
  are required to submit.
- **History:** a trade ledger list on the same page (team names, amount, picks, timestamp) with
  edit/delete affordances, in the same spirit as the existing bid audit surfacing.
- **Revalidation:** logging, editing, deleting, or restoring a trade changes budget and ownership
  data consumed by `/teams`, `/budget`, the value sheet's operator budget tracker, and `BidModal`'s
  price-context panel. Every trade mutation triggers `router.refresh()` on success, matching the
  HARD-010 resilient-mutation convention already used for bids and nominations — none of these
  surfaces should show stale numbers after a trade.

## Testing Strategy

- Unit: `resolvePickHolder`/`resolveAllPickHolders` covering untouched (origin default), single-hop,
  multi-hop, and auction-won-then-traded cases.
- Unit: picker category boundary — a round in the currently-generated year resolves via the
  known-picks path even with no `Trade` history; a round in any other year is absent until first
  traded, then resolves via the trade log on every subsequent lookup.
- Unit: `computeDraftTeamStats` with a populated `budgetDeltaByTeamId`, asserting `remaining` and the
  new `netBudgetDelta` field.
- Unit: `computeOriginSignals` extension — a trade-acquired pick contributes to `futureCapital`
  exactly once; a trade-divested pick is removed from the divesting team's `futureCapital` and not
  double-counted anywhere; zero-trade behavior is bit-for-bit identical to the current
  implementation.
- Integration (real Postgres): `assertBidLegalInTransaction` respects a positive and a negative trade
  delta for the same team.
- Integration: the value-sheet page's `ownerBudget`/`ownerBudgetDelta` wiring reflects a logged trade
  for the owner's team.
- Integration: trade mutation legality — `TRADE_EXCEEDS_BUDGET` (create, edit, and restore paths),
  `PICK_NOT_HELD`, `PICK_ALREADY_RETRADED` (delete and restore), `INVALID_INPUT` for duplicate picks
  in one submission.
- Integration: `PICK_HAS_ACTIVE_TRADES` blocking a bid delete/reassign that a live trade depends on.
- Integration: full trade create → edit (amount) → delete → restore lifecycle, asserting
  `TradeAuditEvent` rows match the bid-audit shape, and that restore re-validates both
  `PICK_NOT_HELD` and `TRADE_EXCEEDS_BUDGET` against current (not delete-time) state.

## Acceptance Criteria

- A trade for a pick that was never in the auction pool (`futurePickAuctionMode: NONE`, or a future
  year with no generated `Player` row) can be logged without first materializing an `AuctionResult`.
- A pick acquired by trade can be selected in a later trade to a third team.
- Both teams' `remaining`/`buyingPower`/threat scores, and the operator's own live-auction budget
  tracker, reflect the trade immediately after logging — including at the point of blocking or
  allowing a _subsequent bid_ based on post-trade budget.
- A team's accumulated trade-acquired draft capital shifts `dynamicPickValues.ts`'s pricing of that
  team's own remaining pool picks in the same direction and mechanism as auction-acquired capital
  already does, and a team that trades its capital away sees that contribution removed, not retained.
- Deleting a trade whose pick was re-traded, or whose budget the other side already spent, is
  rejected with a clear, specific error rather than silently corrupting the later trade's implied
  ownership or driving a team's budget negative.
- Deleting or reassigning a `PKG`/`PICK` auction win that a live trade depends on is rejected rather
  than silently invalidating the trade's premise.
