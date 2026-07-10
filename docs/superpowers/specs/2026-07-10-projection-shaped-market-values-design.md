# Projection-Shaped Market Values Design

## Context

DraftOps already has two valuation layers:

- `src/lib/valueAdjustment.ts` adjusts baseline market values with broad league-setting
  multipliers for scoring, lineup scarcity, and starter concentration.
- `src/lib/projectionVor.ts` imports projections, scores them for a draft, computes replacement
  level and VOR, and stores `DraftPlayerValue` rows. Today the apply script keeps fallback values
  active by default.

The next valuation step should use projections for player-specific scoring nuance. A flat tight end
premium multiplier treats all TEs similarly, but TE premium should help high-reception and
first-down-profile players more than efficiency-driven players. Travis Kelce or Trey McBride should
gain more from TE premium settings than George Kittle if their projected stat mix supports that.

## Goal

Make projection-informed values the active auction target when projection data exists, while keeping
dynasty market value as the anchor. The engine should answer:

> What should this player be worth in this exact scoring environment, given both dynasty market
> value and projected stat shape?

## Non-Goals

- Do not build a UI toggle for active versus fallback values in this pass.
- Do not replace dynasty startup value with pure one-year redraft VOR.
- Do not store raw projection stats on `Player`.
- Do not require projections for DraftOps to work. Missing projection data must still fall back to
  the existing adjusted market values.

## Recommended Model

Use projection-shaped market value rather than pure projection VOR.

For each projected player:

1. Score their projected stats under baseline scoring.
2. Score the same stats under the draft's scoring settings.
3. Compute the player's scoring lift:

   ```text
   raw_lift = draft_scored_points / baseline_scored_points
   ```

4. Normalize that lift within a peer group so global position scoring changes do not blindly lift
   every player at the position by the same amount.
5. Convert the normalized lift into a capped market multiplier.
6. Apply that multiplier to the player's fallback market value.

The active value becomes:

```text
activeAuctionValue = round(fallbackAuctionValue * projectionMarketMultiplier)
```

This preserves the dynasty market structure while making scoring changes player-specific.

## Peer Normalization

Peer groups should be position-aware and market-aware:

- Position is required: QB, RB, WR, TE.
- Market bucket should be derived from fallback auction value within the position, not projection
  rank. This keeps comparisons tied to the dynasty market tier DraftOps is adjusting.

Initial buckets:

- Elite: top 20% of fallback value within position.
- Starter: next 30%.
- Depth: remaining projected players.

For each peer group, calculate the average `raw_lift`. A player's relative lift is:

```text
relative_lift = raw_lift / peer_group_average_raw_lift
```

This means a TE premium can still raise the TE position globally through the existing fallback
adjustment, while the projection layer decides which TEs deserve extra lift versus their TE peers.

## Multiplier Calibration

Use a conservative capped multiplier first:

```text
projectionMarketMultiplier = clamp(1 + ((relative_lift - 1) * sensitivity), floor, ceiling)
```

Initial constants:

- `sensitivity = 0.75`
- Standard band: `0.85` to `1.25`
- TE band: `0.80` to `1.35`
- QB band: `0.90` to `1.20`

The TE band is wider because TE premium and TE first-down bonuses are the clearest known use case.
The QB downside band is narrower because superflex market structure should not be overcorrected by
small passing-setting changes.

These constants should live in one calibration file near the valuation code and be covered by unit
tests with explicit examples.

## Rookie And Missing Data Policy

Rookies and projection misses need protection because year-one projections can understate dynasty
value.

- If a player has no projection row, keep the fallback market value active.
- If baseline projected points are zero or invalid, keep fallback active.
- For rookie players, do not let projection-shaped adjustment reduce active value below fallback.
- Strong rookie projections can raise active value above fallback.

This matches the existing projection VOR rookie policy while applying it to the new active target.

## Storage And Data Flow

Keep the existing separated projection storage model:

- `Player` stores market values and optional `sleeperId`.
- `PlayerProjection` stores normalized source stats keyed by Sleeper ID and projection source.
- `DraftPlayerValue` stores draft-specific scored points, VOR fields, fallback value, active value,
  and `valueSource`.

The apply script should continue to write projection stats and VOR fields, but it should set:

```text
activeAuctionValue = projection-shaped market value
valueSource = "projection_adjusted_market"
```

For fallback-only rows, use:

```text
activeAuctionValue = fallbackAuctionValue
valueSource = "fallback"
```

`mapPlayersWithDraftValues` already maps active values into the main `Player.budget`, `floor`, and
`ceiling`, so once the apply script writes active values, the value sheet will naturally expose them
as auction targets.

## API Shape

Add a focused valuation function in a new `src/lib/projectionMarketValue.ts` module:

```ts
calculateProjectionMarketValues({
  players,
  scoringSettings,
  baselineScoringSettings,
});
```

The function accepts scored baseline and draft points, plus the player metadata needed for peer
groups and rookie policy. Scoring calculation stays in `projectionScoring.ts`; market adjustment
stays in the new module.

The output includes:

- `activeAuctionValue`
- `fallbackAuctionValue`
- `baselineProjectedPoints`
- `projectedPoints`
- `rawScoringLift`
- `relativeScoringLift`
- `projectionMarketMultiplier`
- `valueSource`

The diagnostic fields can remain TypeScript-only at first. The persisted minimum is still
`DraftPlayerValue.activeAuctionValue` and `valueSource`.

## Testing

Add unit tests for:

- A TE premium raises a high-reception TE more than a lower-reception efficiency TE in the same
  market bucket.
- A position-wide scoring change does not give every player the same projection multiplier after
  peer normalization.
- Missing projections keep fallback value active.
- Invalid or zero baseline points keep fallback value active.
- Low rookie projections cannot reduce active value.
- Strong rookie projections can raise active value.
- Active values recalculate floor and ceiling through `mapPlayersWithDraftValues`.

Update apply-script tests so `DraftPlayerValue` writes use `projection_adjusted_market` when
projection-shaped values are available.

## Rollout

This is not currently an active production app, so projection-shaped values should become the active
auction target immediately after the projection apply script runs. Calibration can iterate in code
and tests before the next live use.

The app remains usable before projection import because player rows still carry fallback market
values and `mapPlayersWithDraftValues` already falls back when no draft value row exists.
