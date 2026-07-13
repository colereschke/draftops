# Dynamic Pick Valuation Design

## Purpose

DraftOps currently treats future pick packages as static `PKG` rows. That is too blunt for a live
startup auction because each manager's future picks should move as their roster takes shape. A weak
origin team should make its next-year picks more valuable; a strong origin team should make them
less valuable.

The first implementation should improve draft-day target prices without turning DraftOps into a
full trade ledger. Future picks remain auctionable valuation rows, but they gain enough metadata and
query-time logic to support origin-team-specific values and mutually exclusive auction modes.

## Chosen Approach

Use the existing `Player`-row auction model for now, but make future pick rows origin-team-specific
and mode-aware.

Add an immutable draft creation setting:

```ts
futurePickAuctionMode: 'packages' | 'individual' | 'none';
```

- `packages`: show one team-specific package/kicker row per origin team. Hide the component 1st,
  2nd, and 3rd rows from the auction UI and value-pool calculations.
- `individual`: show origin-team-specific 1st, 2nd, and 3rd rows. Hide package/kicker rows from the
  auction UI and value-pool calculations.
- `none`: hide all next-year future-pick assets from the auction UI and value-pool calculations.

The setting is selected during draft creation only. It is a league rule, not an in-draft toggle.

## Asset Shape

Seed next-year future pick assets per origin team instead of relying on generic rows like
`2027 1st Round Pick`.

Example rows:

- `chappy72 2027 1st`
- `chappy72 2027 2nd`
- `chappy72 2027 3rd`
- `chappy72 2027 Pick Package`

For the current kicker-package league, the package row can still display the kicker convention, but
the valuation model should key off the origin team handle. The UI must never expose both the package
and its three components as auctionable rows in the same draft mode.

## Dynamic Value Inputs

Dynamic value is based on the origin team's current roster, not the current holder of the pick asset.
This keeps "how valuable are chappy72's future picks?" separate from "who currently owns them?"

Signals:

1. **Auction surplus rate**
   - `surplus = SUM(activeAuctionValue) - SUM(pricePaid)`
   - `surplusRate = surplus / SUM(pricePaid)`
   - Positive surplus means the origin team is acquiring value efficiently, which lowers its future
     pick value. Negative surplus means the team is overpaying or building inefficiently, which raises
     its future pick value.

2. **Optimized starting lineup projected points**
   - Use the draft's exact `startingLineup` JSON.
   - Fixed slots consume matching positions.
   - `FLEX` can use `RB/WR/TE`.
   - `SUPER_FLEX` can use `QB/RB/WR/TE`.
   - Optimize by projected points. This captures non-standard leagues such as 2TE or extra-flex
     formats and avoids hardcoded lineup assumptions.

3. **Total player VOR**
   - Sum rostered player VOR for the origin team.
   - Exclude `PICK` and `PKG` rows from player VOR so future capital does not masquerade as current
     team strength.

4. **Future capital posture**
   - Track value/count/share of future-pick assets held by the origin team separately from player VOR.
   - Future capital is ambiguous on its own: it can indicate trade ammunition or a tanking posture.
   - Interpret it with the rest of the roster. Young rosters, low projected starters, low VOR, and
     low projected-point veterans with high base auction values should push toward "likely rebuilding"
     and raise that origin team's future pick values.

## Value Calculation

The calculator returns adjusted `budget`, `floor`, `ceiling`, and a small diagnostic payload for
future pick rows. It should not mutate seeded `Player` values.

Recommended shape:

```ts
adjustedValue = staticBaseline * (1 + compositeAdjustment);
```

The composite should be conservative at first. Each signal should be sample-gated and capped so one
early bargain or bad purchase cannot swing a future pick package too hard. Raw surplus dollars should
be shown for diagnostics, but the model should use surplus rate because it scales better across
different stages of the auction.

Strong origin-team signals lower its future pick values. Weak origin-team signals raise them.

## Data Flow

1. Draft creation records `futurePickAuctionMode`.
2. Draft player seeding creates next-year origin-team future assets.
3. Server page/API queries fetch:
   - draft settings
   - teams and auction results
   - players
   - `DraftPlayerValue` projection/VOR rows
4. A server-side dynamic pick valuation module computes adjusted values from current bids.
5. The auction sheet receives only rows allowed by `futurePickAuctionMode`.
6. `logBid`, `updateBid`, and `deleteBid` continue to revalidate draft routes so adjusted pick values
   update after each bid without persisting dynamic values into `Player.budget`.

## UI

The value sheet should show only the active future-pick representation for the draft mode:

- package rows in `packages`
- individual origin-team pick rows in `individual`
- no future-pick rows in `none`

Adjusted future-pick rows should show a directional indicator when their dynamic value differs from
baseline. The raw adjusted value and baseline should be available inline or by tooltip/popover. Value
pool totals must exclude hidden future-pick rows to avoid double-counting.

The teams page can expose supporting diagnostics such as surplus dollars, surplus rate, average age,
projected lineup points, total VOR, and future capital posture, but those diagnostics should stay
secondary to the auction workflow.

## Testing

Unit tests should cover:

- auction mode filtering so package and component rows are never both visible
- origin-team-specific pick value adjustment
- starting-lineup optimization against exact `Draft.startingLineup`
- future capital excluded from player VOR and interpreted as a separate posture signal
- conservative caps and sample gates for early-draft volatility
- route/page mapping that applies adjusted values without persisting them to `Player`

Existing player/auction tests should be updated where they assume generic 2027/2028 pick rows are
always visible.

## Non-Goals

- Do not build a full pick ownership or trade ledger in this iteration.
- Do not dynamically value two-years-out picks; the signal is too noisy.
- Do not persist dynamic values back into baseline `Player` rows after every bid.
- Do not allow `futurePickAuctionMode` to change mid-draft.

## Long-Term Extension

If DraftOps expands beyond live draft management, future picks can move into a first-class asset
system with origin team, current owner, component picks, package grouping, and transfer history. That
would better support trades, package splits, post-draft roster operations, and ownership edits. It is
intentionally out of scope for this valuation-focused iteration.
