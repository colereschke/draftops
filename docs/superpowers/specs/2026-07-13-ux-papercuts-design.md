# UX Papercuts — Design

## Context

Four independent UX/correctness issues Cole reported while using the app for a live slow auction, queued as a backlog and picked up together:

1. Numeric inputs on `/drafts/new` can't be cleanly edited (deleting toward an intermediate/empty state snaps back to a default value before the user finishes retyping).
2. The starting-lineup builder on `/drafts/new` doesn't regroup slots by position when a new one is added.
3. The value-sheet caption (`AuctionHeader.tsx`) is a hardcoded string that doesn't reflect the draft's actual scoring settings.
4. The Team Rosters page's per-position summary subtotals aren't consistently aligned across position groups.

These touch three unrelated areas of the app (`/drafts/new`, the value sheet, `/teams`) and share no code, so they're grouped as one spec but remain independently shippable.

## Non-goals

- No redesign of `/drafts/new`'s overall layout or the 890-line `page.tsx`'s structure beyond what's needed for items 1 and 2 — no unrelated decomposition of that file.
- No change to the `2QB rankings scaled 5×` portion of the value-sheet caption — it describes a fixed ETR-import scaling constant (`SCALE = 5` in `scaleRankingValue.ts`), not a per-draft setting, so it isn't wrong and stays static.
- No change to how `adjustPlayerValues` computes actual player values — item 3 only changes the descriptive caption text, not any valuation math.
- No generalization of the _other_ hardcoded league-summary line (`AuctionHeader.tsx:29`, "12-Team · Superflex · TE Premium · $1,000 Budget · 30-Man Rosters") — out of scope for this round.

## 1. Numeric input editing

**New file:** `src/lib/useNumericField.ts` (following the existing custom-hook convention — `src/lib/useMediaQuery.ts` already lives here, not in a separate `src/hooks/` directory)

A small hook that separates the input's _displayed_ string state from its _coerced_ numeric value:

```ts
interface UseNumericFieldOptions {
  float?: boolean; // parseFloat instead of parseInt; default false
}

interface UseNumericField {
  value: string; // bind to <input value={value}>
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; // bind to <input onChange={onChange}>
  numericValue: number; // the coerced number for use elsewhere (e.g. handleSubmit)
  setNumericValue: (n: number) => void; // imperative escape hatch (e.g. Sleeper import)
}

function useNumericField(initial: number, options?: UseNumericFieldOptions): UseNumericField;
```

Behavior: `value` starts as `String(initial)`. `onChange` always updates `value` to the raw input string (so `""`, `"-"`, `"1."` are all valid intermediate states — never coerced away mid-edit). `numericValue` is derived on every render: if `value` parses to a valid finite number, that's the value; otherwise `numericValue` falls back to `initial`. Consumers that need the live number (e.g. `updateScoring`, `handleSubmit`) read `numericValue`, not `value`.

**No min/max clamping.** An earlier draft of this hook clamped `numericValue` to a `[min, max]` range, but that creates a silent display/submit mismatch — the field shows what you typed while a different, clamped number gets submitted, with no visible feedback. The only field that previously had real range enforcement was team count (`handleTeamCountChange` explicitly clamped to `[2, 32]`), and it did so by immediately snapping the _displayed_ value — which is itself a version of the exact mid-typing snap-back bug this whole fix targets. So no field clamps at the hook level; native HTML `min`/`max` attributes stay as cosmetic browser hints only, unchanged from today. The one place this matters for correctness — the team-count-driven `teams` array resize, which would misbehave on a degenerate value like a negative count — gets its own local safety clamp scoped to just that computation (not fed back into the display), not a general hook feature.

This replaces the current pattern (`setState(parseInt(e.target.value, 10) || default)`) at all ~19 numeric call sites in `src/app/drafts/new/page.tsx`: team count, budget, roster size, the four target-roster position counts, and the twelve ScoringSettings fields. Each becomes `const teamCountField = useNumericField(12)`, etc. (`{ float: true }` for the scoring fields), with `value={teamCountField.value}` / `onChange={teamCountField.onChange}` on the `<input>`, and `teamCountField.numericValue` used wherever the old state variable was read (including in `handleSubmit`'s `createDraft` call).

Note: fields whose current logic does extra work beyond a plain number (team count, which also resizes the `teams` array) keep that logic, but trigger it from a `useEffect` watching `numericValue` — the hook itself has no side effects, it's purely the string/number split plus the `setNumericValue` escape hatch for programmatic updates like Sleeper import.

## 2. Starting-lineup slot ordering

`src/app/drafts/new/page.tsx`, `addSlot`/`updateSlot` (currently lines ~100-110):

```ts
const SLOT_ORDER: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];

function sortSlots(slots: StartingSlot[]): StartingSlot[] {
  return [...slots].sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));
}

function addSlot() {
  setStartingLineup((prev) => sortSlots([...prev, 'FLEX']));
}

function updateSlot(index: number, slot: StartingSlot) {
  setStartingLineup((prev) => sortSlots(prev.map((s, i) => (i === index ? slot : s))));
}
```

`Array.prototype.sort` is stable in all JS engines this project targets, so slots of the same position keep their relative order. `removeSlot` doesn't need sorting (removing an element can't create disorder).

## 3. Dynamic value-sheet caption

**Data flow:** `src/app/draft/[draftId]/page.tsx` already loads `draft.scoringSettings` (used elsewhere on that page). Thread it down: add a `scoringSettings: ScoringSettings` prop to `AuctionSheet` (`src/components/AuctionSheet/AuctionSheet.tsx`), passed through unchanged to a new `scoringSettings` prop on `AuctionHeader` (`src/components/AuctionSheet/AuctionHeader.tsx`).

**Caption logic**, in `AuctionHeader.tsx`:

```ts
function teCaptionClause(scoringSettings: ScoringSettings): string {
  const pprDelta = scoringSettings.pprTE - scoringSettings.pprWR;
  const fdDelta = scoringSettings.recFD + scoringSettings.teFDBonus;
  const parts: string[] = [];
  if (pprDelta !== 0) parts.push(`PPR${pprDelta > 0 ? '+' : ''}${pprDelta}`);
  if (fdDelta !== 0) parts.push(`1st Down${fdDelta > 0 ? '+' : ''}${fdDelta}`);
  return parts.length > 0 ? ` · TE ${parts.join(' / ')}` : '';
}
```

Rendered caption becomes:

```tsx
2QB rankings scaled 5×{teCaptionClause(scoringSettings)} · {totalPlayerCount} players + pick assets
```

For `DEFAULT_SCORING_SETTINGS` (`pprTE = pprWR = 1`, `recFD = teFDBonus = 0`), both deltas are `0`, so the TE clause disappears entirely — "2QB rankings scaled 5× · 267 players + pick assets". A draft with `pprTE: 2` and unchanged `pprWR: 1`, `recFD: 0.25`, `teFDBonus: 0` reproduces the original text: "TE PPR+1 / 1st Down+0.25".

## 4. Team Rosters summary alignment

`src/components/RosterTracker/TeamRosterDetail.tsx`, the group-header subtotal span (currently lines 38-46):

Wrap the subtotal + delta content in a fixed-width, right-aligned container, mirroring the existing per-row treatment already used for each player's price/delta columns two lines below (`min-w-11 text-right`, lines 60-68 and 69-85). The header line packs more content (`$134 (+$12)` vs a single `$45`), so use a wider minimum: `min-w-[80px] text-right` (Tailwind arbitrary value) on the wrapping span, keeping the existing `font-mono ... tabular-nums` classes. This makes every position group's subtotal block start at the same horizontal offset regardless of digit count, consistent with how the per-player rows already behave.

## 5. Default value-sheet sort, with SF rank tiebreak

`src/components/AuctionSheet/AuctionSheet.tsx`: the value sheet's `PlayerTable` defaults to `sortBy: 'sfRank', sortDir: 'asc'`. Sorting by `sfRank` pushes pick assets (`PICK`/`PKG` rows, which don't carry a meaningful ETR rank) to the bottom regardless of their actual value. Change the defaults to `sortBy: 'budget', sortDir: 'desc'` — `'budget'` is the `SortKey` backing the table's "Target" column (`PlayerTable.tsx:38`) — so the sheet opens sorted by target value, highest first, interleaving pick assets by value instead of stranding them at the bottom.

Additionally, the sort comparator currently returns `0` on a tie in the primary column, leaving tied rows in whatever order they happened to be in beforehand. Add `sfRank` ascending as the tiebreak for any primary-column tie (not just `budget` — a sensible fallback regardless of which column is sorted), so two players tied on target value show the better-ranked one first.

## Testing

- `useNumericField.test.ts` (new): covers empty-string intermediate state (doesn't coerce to default), partial decimal entry (`float: true`), min/max clamping on `numericValue`, and that `value` never gets forcibly overwritten mid-typing.
- `src/__tests__/drafts-new-form.test.tsx` (existing — extend): add cases verifying a numeric field can be cleared to empty and retyped without snapping back, and that adding a slot re-sorts the lineup into canonical order (e.g. add a slot, change it to `RB` via the select, assert the resulting `startingLineup` order).
- `src/__tests__/AuctionHeader.test.tsx` (existing — extend): parametrized cases for the TE caption — default settings (no clause), PPR-only premium, first-down-only premium, both.
- `src/__tests__/TeamRosterDetail.test.tsx` (existing): no new behavioral test needed for a pure CSS alignment fix — covered by visual/manual check, not unit tests. Confirm the existing tests in this file still pass unchanged (the fix only adds a width class, no markup/testid changes).
- `src/__tests__/AuctionSheet.claimed.test.tsx` (existing — extend; this is the only current `AuctionSheet` test file, its `renderSheet` helper is reused): assert the table renders sorted by `budget` descending by default, using a fixture where `sfRank` order and `budget` order diverge (a pick asset with a very high `sfRank` but mid-range `budget`) to prove the fix, not just coincidentally pass.
