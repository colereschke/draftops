# Value Spreads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an advisory "Spread" overlay to the value sheet — a position-relative percentile rank gap between projection value and dynasty value, plus an age-aware 2×2 archetype tag (WIN-NOW / BARGAIN / FUTURE / FADE) — without ever mutating auction values.

**Architecture:** A pure server-side function `computeSpreads(players)` annotates each `Player` with `spread`, `strategyTag`, and the two ranks. It's called in the draft page after values are mapped, so the client receives precomputed spreads and only handles sort/filter. A shared per-position `ageBand()` util backs both the tag logic and (retrofit) the existing age coloring. Spread is surfaced as a sortable column + archetype filter chips on the sheet, and a full label in the bid modal.

**Tech Stack:** Next.js 16 App Router (server components), TypeScript 5 strict, React 19, Tailwind 4, Jest + React Testing Library, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-14-value-spreads-design.md`

## Global Constraints

- **pnpm only** — never npm/yarn. Test command: `pnpm test <file>`.
- **TS strict, no explicit `any`.** Use `interface` for object shapes; `type` for unions/aliases.
- **Prettier:** single quotes, trailing commas, 2-space indent, 100-char width.
- **Pre-commit hook** runs `pnpm lint-staged` + `pnpm tsc --noEmit` — do NOT skip with `--no-verify`. Every commit must typecheck project-wide.
- **Never mutate auction values.** Spread is a read-only advisory overlay derived from existing value outputs.
- **Tests select by `data-testid`**, not visible text/role/class. Typed mock fixtures using `src/types` shapes.
- **Constants files are backend-only** — not imported by client components.
- **No author attribution** in commit messages.

---

### Task 1: Per-position age bands

**Files:**

- Create: `src/lib/ageBands.constants.ts`
- Create: `src/lib/ageBands.ts`
- Test: `src/__tests__/ageBands.test.ts`

**Interfaces:**

- Consumes: `Position` from `@/types`.
- Produces:
  - `type AgeBand = 'young' | 'prime' | 'aging' | 'old'`
  - `function ageBand(age: number | null, pos?: Position): AgeBand | null`

- [ ] **Step 1: Write the constants file**

Create `src/lib/ageBands.constants.ts`:

```ts
import type { Position } from '@/types';

// Three ascending boundaries per position: [youngMax, primeMax, agingMax].
// old = agingMax + 1 and up. TUNABLE (backend-only).
export const AGE_BANDS: Partial<Record<Position, readonly [number, number, number]>> = {
  QB: [25, 29, 32],
  RB: [23, 25, 27],
  WR: [24, 27, 29],
  TE: [24, 27, 29],
};

// Fallback when no position is supplied (e.g. a roster's average age).
// Matches the historical global bands: young ≤24 / prime 25-27 / aging 28-30 / old 31+.
export const GLOBAL_AGE_BANDS: readonly [number, number, number] = [24, 27, 30];
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/ageBands.test.ts`:

```ts
import { ageBand } from '@/lib/ageBands';

describe('ageBand', () => {
  it('returns null for unknown age', () => {
    expect(ageBand(null)).toBeNull();
    expect(ageBand(null, 'RB')).toBeNull();
  });

  it('uses per-position cutoffs — a 28yo RB is old, a 28yo QB is prime', () => {
    expect(ageBand(28, 'RB')).toBe('old');
    expect(ageBand(28, 'QB')).toBe('prime');
  });

  it('applies QB old threshold at 33', () => {
    expect(ageBand(32, 'QB')).toBe('aging');
    expect(ageBand(33, 'QB')).toBe('old');
  });

  it('bands WR/TE identically', () => {
    expect(ageBand(24, 'WR')).toBe('young');
    expect(ageBand(30, 'TE')).toBe('old');
  });

  it('falls back to global bands with no position', () => {
    expect(ageBand(24)).toBe('young');
    expect(ageBand(27)).toBe('prime');
    expect(ageBand(30)).toBe('aging');
    expect(ageBand(31)).toBe('old');
  });

  it('falls back to global bands for positions without cutoffs (PICK/PKG)', () => {
    expect(ageBand(30, 'PICK')).toBe('aging');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/__tests__/ageBands.test.ts`
Expected: FAIL — cannot find module `@/lib/ageBands`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/ageBands.ts`:

```ts
import type { Position } from '@/types';
import { AGE_BANDS, GLOBAL_AGE_BANDS } from './ageBands.constants';

export type AgeBand = 'young' | 'prime' | 'aging' | 'old';

export function ageBand(age: number | null, pos?: Position): AgeBand | null {
  if (age === null) return null;
  const cutoffs = (pos && AGE_BANDS[pos]) || GLOBAL_AGE_BANDS;
  const [youngMax, primeMax, agingMax] = cutoffs;
  if (age <= youngMax) return 'young';
  if (age <= primeMax) return 'prime';
  if (age <= agingMax) return 'aging';
  return 'old';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/__tests__/ageBands.test.ts`
Expected: PASS (all 6).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ageBands.ts src/lib/ageBands.constants.ts src/__tests__/ageBands.test.ts
git commit -m "feat: add per-position age bands util"
```

---

### Task 2: Retrofit ageColor onto shared age bands

**Files:**

- Modify: `src/lib/ageColor.ts` (full rewrite)
- Modify: `src/components/AuctionSheet/PlayerTable.tsx:216` (pass position)
- Modify: `src/__tests__/ageColor.test.ts` (add position-aware cases)
- Test: `src/__tests__/ageColor.test.ts`

**Interfaces:**

- Consumes: `ageBand`, `AgeBand` from `@/lib/ageBands`; `Position` from `@/types`.
- Produces: `function ageColor(age: number | null, pos?: Position): string` (signature widened; existing position-less calls unchanged).

Note: `DossierFace.tsx:129` calls `ageColor(team.avgAge)` with no position — it keeps working via the global fallback, no edit needed.

- [ ] **Step 1: Rewrite ageColor to consume ageBand**

Replace the entire contents of `src/lib/ageColor.ts`:

```ts
import type { Position } from '@/types';
import { ageBand, type AgeBand } from './ageBands';

const AGE_BAND_COLOR: Record<AgeBand, string> = {
  young: 'var(--age-young)',
  prime: 'var(--age-prime)',
  aging: 'var(--age-aging)',
  old: 'var(--age-old)',
};

export function ageColor(age: number | null, pos?: Position): string {
  const band = ageBand(age, pos);
  if (band === null) return 'var(--text-muted)';
  return AGE_BAND_COLOR[band];
}
```

- [ ] **Step 2: Add position-aware test cases**

Append to `src/__tests__/ageColor.test.ts` (inside the existing `describe`, before its closing `});`):

```ts
it('colors by per-position bands when a position is given', () => {
  // 28yo RB is old (red); 28yo QB is prime.
  expect(ageColor(28, 'RB')).toBe('var(--age-old)');
  expect(ageColor(28, 'QB')).toBe('var(--age-prime)');
});

it('keeps global bands when no position is given', () => {
  expect(ageColor(28)).toBe('var(--age-aging)');
});
```

- [ ] **Step 3: Run the ageColor tests to verify pass**

Run: `pnpm test src/__tests__/ageColor.test.ts`
Expected: PASS — the original position-less tests (null/24/25/27/28/30/31/40) still hold via the global fallback, plus the 2 new position-aware cases.

- [ ] **Step 4: Pass position from PlayerTable**

In `src/components/AuctionSheet/PlayerTable.tsx`, the age cell (currently line ~216) reads:

```tsx
                  style={{ color: claim ? undefined : ageColor(p.age) }}
```

Change to:

```tsx
                  style={{ color: claim ? undefined : ageColor(p.age, p.pos) }}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors (the `DossierFace` call still matches the widened optional signature).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ageColor.ts src/components/AuctionSheet/PlayerTable.tsx src/__tests__/ageColor.test.ts
git commit -m "feat: color player ages by per-position bands"
```

---

### Task 3: Spread engine + types

**Files:**

- Modify: `src/types/index.ts` (add `StrategyTag` union + `Player` fields)
- Create: `src/lib/valueSpread.constants.ts`
- Create: `src/lib/valueSpread.ts`
- Test: `src/__tests__/valueSpread.test.ts`

**Interfaces:**

- Consumes: `Player`, `Position`, `StrategyTag` from `@/types`; `ageBand` from `@/lib/ageBands`; `SPREAD_GATE` from `@/lib/valueSpread.constants`.
- Produces:
  - `type StrategyTag = 'WIN-NOW' | 'BARGAIN' | 'FUTURE' | 'FADE'` (in `@/types`)
  - `Player` gains optional `spread`, `strategyTag`, `spreadDynRank`, `spreadProjRank`
  - `function computeSpreads(players: Player[]): Player[]`
  - `function strategyTagReason(tag: StrategyTag): string`

- [ ] **Step 1: Add types**

In `src/types/index.ts`, immediately after the `Position` type declaration (line 1), add:

```ts
export type StrategyTag = 'WIN-NOW' | 'BARGAIN' | 'FUTURE' | 'FADE';
```

Then inside the `Player` interface, after the `vor?: number | null;` line, add:

```ts
  spread?: number | null;
  strategyTag?: StrategyTag | null;
  spreadDynRank?: number | null;
  spreadProjRank?: number | null;
```

- [ ] **Step 2: Add the gate constant**

Create `src/lib/valueSpread.constants.ts`:

```ts
// Minimum |spread| (percentile points) required to fire an archetype tag.
// TUNABLE (backend-only).
export const SPREAD_GATE = 15;
```

- [ ] **Step 3: Write the failing test**

Create `src/__tests__/valueSpread.test.ts`:

```ts
import { computeSpreads, strategyTagReason } from '@/lib/valueSpread';
import type { Player } from '@/types';

// Minimal typed factory — only the fields computeSpreads reads matter.
function mkPlayer(overrides: Partial<Player>): Player {
  return {
    player: 'X',
    team: 'FA',
    pos: 'RB',
    age: 26,
    sfRank: 1,
    budget: 50,
    ceiling: 58,
    floor: 44,
    notes: '',
    baseBudget: 50,
    projectionAuctionValue: 50,
    vor: 10,
    ...overrides,
  };
}

// A common set of N RBs where dynasty order and projection order differ.
function rbSet(): Player[] {
  // Four RBs. Dynasty ranks by baseBudget desc; projection ranks by projectionAuctionValue desc.
  return [
    mkPlayer({ player: 'A', age: 29, baseBudget: 100, projectionAuctionValue: 40, vor: 20 }),
    mkPlayer({ player: 'B', age: 22, baseBudget: 80, projectionAuctionValue: 30, vor: 15 }),
    mkPlayer({ player: 'C', age: 22, baseBudget: 30, projectionAuctionValue: 90, vor: 40 }),
    mkPlayer({ player: 'D', age: 29, baseBudget: 20, projectionAuctionValue: 70, vor: 30 }),
  ];
}

describe('computeSpreads', () => {
  it('computes a signed percentile rank gap (positive = underpriced)', () => {
    const out = computeSpreads(rbSet());
    const c = out.find((p) => p.player === 'C')!;
    // C: dynRank 4 (lowest dyn value), projRank 1 (highest proj). N=4.
    // spread = round((4 - 1) / 3 * 100) = 100.
    expect(c.spread).toBe(100);
    const a = out.find((p) => p.player === 'A')!;
    // A: dynRank 1, projRank 4. spread = round((1 - 4)/3*100) = -100.
    expect(a.spread).toBe(-100);
  });

  it('tags older + underpriced as WIN-NOW and older + overpriced as FADE', () => {
    const out = computeSpreads(rbSet());
    expect(out.find((p) => p.player === 'D')!.strategyTag).toBe('WIN-NOW'); // age 29, spread +
    expect(out.find((p) => p.player === 'A')!.strategyTag).toBe('FADE'); // age 29, spread -
  });

  it('tags younger + underpriced as BARGAIN and younger + overpriced as FUTURE', () => {
    const out = computeSpreads(rbSet());
    expect(out.find((p) => p.player === 'C')!.strategyTag).toBe('BARGAIN'); // age 22, spread +
    expect(out.find((p) => p.player === 'B')!.strategyTag).toBe('FUTURE'); // age 22, spread -
  });

  it('shows a spread number but no tag for prime-age players', () => {
    // Two prime RBs with a rank gap; prime => no tag.
    const players = [
      mkPlayer({ player: 'P1', age: 26, baseBudget: 90, projectionAuctionValue: 10, vor: 5 }),
      mkPlayer({ player: 'P2', age: 26, baseBudget: 10, projectionAuctionValue: 90, vor: 40 }),
    ];
    const out = computeSpreads(players);
    expect(out.find((p) => p.player === 'P2')!.spread).toBe(100);
    expect(out.find((p) => p.player === 'P2')!.strategyTag).toBeNull();
  });

  it('fires no tag below the gate', () => {
    // Three RBs, adjacent ranks => small gaps under the 15pt gate.
    const players = [
      mkPlayer({ player: 'G1', age: 29, baseBudget: 90, projectionAuctionValue: 90, vor: 40 }),
      mkPlayer({ player: 'G2', age: 29, baseBudget: 80, projectionAuctionValue: 80, vor: 30 }),
      mkPlayer({ player: 'G3', age: 29, baseBudget: 70, projectionAuctionValue: 70, vor: 20 }),
    ];
    const out = computeSpreads(players);
    // Identical orderings => spread 0 for all => no tags.
    expect(out.every((p) => p.spread === 0)).toBe(true);
    expect(out.every((p) => p.strategyTag === null)).toBe(true);
  });

  it('no-reads below-replacement, no-projection, and non-skill players', () => {
    const players = [
      mkPlayer({ player: 'BelowRepl', vor: 0, projectionAuctionValue: 1 }),
      mkPlayer({ player: 'NoProj', vor: null, projectionAuctionValue: null }),
      mkPlayer({ player: 'Pkg', pos: 'PKG', vor: null, projectionAuctionValue: null }),
    ];
    const out = computeSpreads(players);
    for (const p of out) {
      expect(p.spread).toBeNull();
      expect(p.strategyTag).toBeNull();
    }
  });

  it('ranks position-relative (a single-member position gets spread 0)', () => {
    const players = [
      mkPlayer({
        player: 'OnlyTE',
        pos: 'TE',
        age: 24,
        baseBudget: 50,
        projectionAuctionValue: 90,
        vor: 30,
      }),
      mkPlayer({ player: 'RB1', pos: 'RB', baseBudget: 60, projectionAuctionValue: 60, vor: 20 }),
      mkPlayer({ player: 'RB2', pos: 'RB', baseBudget: 40, projectionAuctionValue: 40, vor: 10 }),
    ];
    const out = computeSpreads(players);
    // Single TE => N=1 => spread 0, no tag.
    expect(out.find((p) => p.player === 'OnlyTE')!.spread).toBe(0);
    expect(out.find((p) => p.player === 'OnlyTE')!.strategyTag).toBeNull();
  });

  it('exposes dynRank and projRank for the modal', () => {
    const out = computeSpreads(rbSet());
    const c = out.find((p) => p.player === 'C')!;
    expect(c.spreadDynRank).toBe(4);
    expect(c.spreadProjRank).toBe(1);
  });
});

describe('strategyTagReason', () => {
  it('returns a distinct sentence per tag', () => {
    const reasons = (['WIN-NOW', 'BARGAIN', 'FUTURE', 'FADE'] as const).map(strategyTagReason);
    expect(new Set(reasons).size).toBe(4);
    reasons.forEach((r) => expect(r.length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test src/__tests__/valueSpread.test.ts`
Expected: FAIL — cannot find module `@/lib/valueSpread`.

- [ ] **Step 5: Write the implementation**

Create `src/lib/valueSpread.ts`:

```ts
import type { Player, Position, StrategyTag } from '@/types';
import { ageBand } from './ageBands';
import { SPREAD_GATE } from './valueSpread.constants';

const SPREAD_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

interface SpreadAnnotation {
  spread: number;
  strategyTag: StrategyTag | null;
  dynRank: number;
  projRank: number;
}

function dynastyValue(p: Player): number {
  return p.baseBudget ?? p.budget;
}

function projectionValue(p: Player): number {
  return p.projectionAuctionValue ?? 0;
}

function isInCommonSet(p: Player, pos: Position): boolean {
  return p.pos === pos && p.vor != null && p.vor > 0;
}

function tagFor(spread: number, p: Player): StrategyTag | null {
  if (Math.abs(spread) < SPREAD_GATE) return null;
  const band = ageBand(p.age, p.pos);
  if (band === 'young') return spread > 0 ? 'BARGAIN' : 'FUTURE';
  if (band === 'old') return spread > 0 ? 'WIN-NOW' : 'FADE';
  return null;
}

export function computeSpreads(players: Player[]): Player[] {
  const annotations = new Map<Player, SpreadAnnotation>();

  for (const pos of SPREAD_POSITIONS) {
    const common = players.filter((p) => isInCommonSet(p, pos));
    const n = common.length;

    const dynRankOf = new Map<Player, number>();
    [...common]
      .sort((a, b) => dynastyValue(b) - dynastyValue(a))
      .forEach((p, i) => dynRankOf.set(p, i + 1));

    const projRankOf = new Map<Player, number>();
    [...common]
      .sort((a, b) => projectionValue(b) - projectionValue(a))
      .forEach((p, i) => projRankOf.set(p, i + 1));

    for (const p of common) {
      const dynRank = dynRankOf.get(p)!;
      const projRank = projRankOf.get(p)!;
      const spread = n > 1 ? Math.round(((dynRank - projRank) / (n - 1)) * 100) : 0;
      annotations.set(p, { spread, strategyTag: tagFor(spread, p), dynRank, projRank });
    }
  }

  return players.map((p) => {
    const a = annotations.get(p);
    if (!a) {
      return { ...p, spread: null, strategyTag: null, spreadDynRank: null, spreadProjRank: null };
    }
    return {
      ...p,
      spread: a.spread,
      strategyTag: a.strategyTag,
      spreadDynRank: a.dynRank,
      spreadProjRank: a.projRank,
    };
  });
}

export function strategyTagReason(tag: StrategyTag): string {
  switch (tag) {
    case 'WIN-NOW':
      return 'Projection ranks him well above the market; older — a win-now buy the market discounts.';
    case 'BARGAIN':
      return 'Projection ranks him above the market; young and cheap — the market hasn’t caught up.';
    case 'FUTURE':
      return 'Market ranks him above his production; a young upside premium — a rebuild asset.';
    case 'FADE':
      return 'Market ranks him above his production; older and overpriced — fade.';
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test src/__tests__/valueSpread.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/lib/valueSpread.ts src/lib/valueSpread.constants.ts src/__tests__/valueSpread.test.ts
git commit -m "feat: add value spread engine and archetype tags"
```

---

### Task 4: Spread column, sort, and page wiring

**Files:**

- Modify: `src/app/draft/[draftId]/page.tsx` (call `computeSpreads`)
- Modify: `src/components/AuctionSheet/PlayerTable.tsx` (Spread column + header)
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx` (spread-aware sort branch)
- Test: `src/__tests__/PlayerTable.spread.test.tsx`

**Interfaces:**

- Consumes: `computeSpreads` from `@/lib/valueSpread`; `Player.spread` / `Player.strategyTag`.
- Produces: `'spread'` becomes a valid `SortKey`; each rendered row has a `data-testid="spread-<sfRank>"` cell.

- [ ] **Step 1: Wire computeSpreads into the draft page**

In `src/app/draft/[draftId]/page.tsx`, add the import near the other `@/lib` imports (after the `applyDynamicPickValues` import on line 9):

```ts
import { computeSpreads } from '@/lib/valueSpread';
```

Then change the `players` assignment (lines 83-86) from:

```ts
const players = filterFuturePickAssetsForMode(
  dynamicPlayers,
  fromPrismaFuturePickMode(draft.futurePickAuctionMode),
);
```

to:

```ts
const players = computeSpreads(
  filterFuturePickAssetsForMode(
    dynamicPlayers,
    fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  ),
);
```

- [ ] **Step 2: Write the failing component test**

Create `src/__tests__/PlayerTable.spread.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import PlayerTable from '@/components/AuctionSheet/PlayerTable';
import type { Player, ClaimedBid } from '@/types';

function mkPlayer(overrides: Partial<Player>): Player {
  return {
    player: 'X',
    team: 'FA',
    pos: 'RB',
    age: 26,
    sfRank: 1,
    budget: 50,
    ceiling: 58,
    floor: 44,
    notes: '',
    baseBudget: 50,
    spread: null,
    strategyTag: null,
    ...overrides,
  };
}

const NOOP = () => {};

function renderTable(players: Player[]) {
  return render(
    <PlayerTable
      players={players}
      showNotes={false}
      hasClaims={false}
      claimMap={new Map<string, ClaimedBid>()}
      nominatedSet={new Set<string>()}
      sortBy="budget"
      sortDir="desc"
      onSort={NOOP}
      onRowClick={NOOP}
    />,
  );
}

describe('PlayerTable spread column', () => {
  it('renders a signed spread value', () => {
    renderTable([mkPlayer({ sfRank: 3, spread: 42 })]);
    expect(screen.getByTestId('spread-3')).toHaveTextContent('+42');
  });

  it('renders a dash for no-read players', () => {
    renderTable([mkPlayer({ sfRank: 7, spread: null })]);
    expect(screen.getByTestId('spread-7')).toHaveTextContent('—');
  });

  it('renders negative spreads with a minus sign', () => {
    renderTable([mkPlayer({ sfRank: 9, spread: -30 })]);
    expect(screen.getByTestId('spread-9')).toHaveTextContent('-30');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/__tests__/PlayerTable.spread.test.tsx`
Expected: FAIL — no element with `data-testid="spread-3"`.

- [ ] **Step 4: Add the Spread header column**

In `src/components/AuctionSheet/PlayerTable.tsx`, add to the `SORT_COLUMNS` array (after the `ceiling` entry):

```ts
  { key: 'spread', label: 'Spread' },
```

- [ ] **Step 5: Add a spread color helper + the body cell**

In `src/components/AuctionSheet/PlayerTable.tsx`, add this helper above the `PlayerTable` component (after the `SortIcon` function):

```tsx
function spreadColor(spread: number | null | undefined): string {
  if (spread == null || spread === 0) return 'var(--text-muted)';
  return spread > 0 ? 'var(--age-young)' : 'var(--age-old)';
}

function formatSpread(spread: number | null | undefined): string {
  if (spread == null) return '—';
  return spread > 0 ? `+${spread}` : String(spread);
}
```

Then, in the body, add a new `<TableCell>` immediately after the Ceiling cell (the cell that renders `${p.ceiling}`) and before the `{showNotes && (...)}` block:

```tsx
<TableCell
  data-testid={`spread-${p.sfRank}`}
  className={cn('text-center font-mono text-xs tabular-nums', claim && 'text-muted-foreground')}
  style={{ color: claim ? undefined : spreadColor(p.spread) }}
>
  {formatSpread(p.spread)}
</TableCell>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test src/__tests__/PlayerTable.spread.test.tsx`
Expected: PASS (all 3).

- [ ] **Step 7: Add a spread-aware sort branch in AuctionSheet**

In `src/components/AuctionSheet/AuctionSheet.tsx`, replace the `filtered` memo (lines 192-214) with a version that sorts spread with nulls always last:

```tsx
const filtered = useMemo<Player[]>(() => {
  let data = [...players];
  if (posFilter !== 'ALL') data = data.filter((p) => p.pos === posFilter);
  if (availableOnly) data = data.filter((p) => !claimMap.has(p.player));
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(
      (p) => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q),
    );
  }
  if (sortBy === 'spread') {
    data.sort((a, b) => {
      const aV = a.spread ?? null;
      const bV = b.spread ?? null;
      if (aV === null && bV === null) return a.sfRank - b.sfRank;
      if (aV === null) return 1; // nulls always last
      if (bV === null) return -1;
      if (aV !== bV) return sortDir === 'asc' ? aV - bV : bV - aV;
      return a.sfRank - b.sfRank;
    });
    return data;
  }
  data.sort((a, b) => {
    let aV: string | number | null = a[sortBy] as string | number | null;
    let bV: string | number | null = b[sortBy] as string | number | null;
    if (aV === null || aV === undefined) aV = 9999;
    if (bV === null || bV === undefined) bV = 9999;
    if (typeof aV === 'string') aV = aV.toLowerCase();
    if (typeof bV === 'string') bV = bV.toLowerCase();
    if (aV < bV) return sortDir === 'asc' ? -1 : 1;
    if (aV > bV) return sortDir === 'asc' ? 1 : -1;
    return a.sfRank - b.sfRank;
  });
  return data;
}, [posFilter, search, availableOnly, claimMap, sortBy, sortDir, players]);
```

- [ ] **Step 8: Typecheck + full test run**

Run: `pnpm tsc --noEmit && pnpm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/draft/[draftId]/page.tsx src/components/AuctionSheet/PlayerTable.tsx src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/PlayerTable.spread.test.tsx
git commit -m "feat: surface sortable spread column on the value sheet"
```

---

### Task 5: Archetype filter chips

**Files:**

- Modify: `src/components/AuctionSheet/FilterControls.tsx` (chips + prop)
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx` (filter state + apply)
- Test: `src/__tests__/FilterControls.strategy.test.tsx`

**Interfaces:**

- Consumes: `StrategyTag` from `@/types`.
- Produces:
  - `type StrategyFilter = StrategyTag | 'ALL'` (exported from `FilterControls`)
  - `FilterControls` gains props `strategyFilter`, `onStrategyFilterChange`, `showStrategyFilter`.

- [ ] **Step 1: Write the failing component test**

Create `src/__tests__/FilterControls.strategy.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import FilterControls from '@/components/AuctionSheet/FilterControls';

const BASE_PROPS = {
  posFilter: 'ALL' as const,
  onPosFilterChange: () => {},
  search: '',
  onSearchChange: () => {},
  showNotes: false,
  onShowNotesChange: () => {},
  availableOnly: false,
  onAvailableOnlyChange: () => {},
  resultCount: 10,
  strategyFilter: 'ALL' as const,
};

describe('FilterControls archetype chips', () => {
  it('renders chips when showStrategyFilter is true', () => {
    render(<FilterControls {...BASE_PROPS} showStrategyFilter onStrategyFilterChange={() => {}} />);
    expect(screen.getByTestId('strategy-chip-WIN-NOW')).toBeInTheDocument();
    expect(screen.getByTestId('strategy-chip-FADE')).toBeInTheDocument();
  });

  it('hides chips when showStrategyFilter is false', () => {
    render(
      <FilterControls
        {...BASE_PROPS}
        showStrategyFilter={false}
        onStrategyFilterChange={() => {}}
      />,
    );
    expect(screen.queryByTestId('strategy-chip-WIN-NOW')).not.toBeInTheDocument();
  });

  it('fires onStrategyFilterChange when a chip is clicked', () => {
    const onChange = jest.fn();
    render(<FilterControls {...BASE_PROPS} showStrategyFilter onStrategyFilterChange={onChange} />);
    fireEvent.click(screen.getByTestId('strategy-chip-WIN-NOW'));
    expect(onChange).toHaveBeenCalledWith('WIN-NOW');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/FilterControls.strategy.test.tsx`
Expected: FAIL — type error / no `strategy-chip-*` testids.

- [ ] **Step 3: Add chips to FilterControls**

In `src/components/AuctionSheet/FilterControls.tsx`:

Add to the imports at the top:

```ts
import type { Position, StrategyTag } from '@/types';
```

(replace the existing `import type { Position } from '@/types';`)

Add the filter type and label map after the `PositionFilter` type (line 9):

```ts
export type StrategyFilter = StrategyTag | 'ALL';

const STRATEGY_CHIPS: Array<{ value: StrategyFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'WIN-NOW', label: 'Win-now' },
  { value: 'BARGAIN', label: 'Bargain' },
  { value: 'FUTURE', label: 'Future' },
  { value: 'FADE', label: 'Fade' },
];
```

Add to `FilterControlsProps`:

```ts
  strategyFilter: StrategyFilter;
  onStrategyFilterChange: (value: StrategyFilter) => void;
  showStrategyFilter?: boolean;
```

Add to the destructured params:

```ts
  strategyFilter,
  onStrategyFilterChange,
  showStrategyFilter = false,
```

Then, inside the top filter `<div>` (after the `<div className="font-mono ...">{resultCount} players shown</div>` block, still inside the same flex container), add the chip row:

```tsx
{
  showStrategyFilter && (
    <ToggleGroup
      value={[strategyFilter]}
      onValueChange={(vals) =>
        onStrategyFilterChange((vals[0] as StrategyFilter | undefined) ?? 'ALL')
      }
      className="w-full flex-wrap gap-[3px] md:w-auto"
    >
      {STRATEGY_CHIPS.map((chip) => (
        <ToggleGroupItem
          key={chip.value}
          value={chip.value}
          data-testid={`strategy-chip-${chip.value}`}
          className="font-label h-8 rounded-md border border-border bg-background px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground hover:bg-accent hover:text-foreground data-[state=on]:border-[var(--pos-pick)] data-[state=on]:text-[var(--pos-pick)]"
        >
          {chip.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/FilterControls.strategy.test.tsx`
Expected: PASS (all 3).

- [ ] **Step 5: Wire filter state into AuctionSheet**

In `src/components/AuctionSheet/AuctionSheet.tsx`:

Update the FilterControls import (line 9) to also pull the filter type:

```ts
import FilterControls, { type PositionFilter, type StrategyFilter } from './FilterControls';
```

Add state near the other filter state (after line 38's `posFilter`):

```tsx
const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('ALL');
```

Add a `hasStrategyTags` memo (after the `futurePickYear` memo, ~line 73):

```tsx
const hasStrategyTags = useMemo(() => players.some((p) => p.strategyTag != null), [players]);
```

In the `filtered` memo, add the strategy filter right after the `availableOnly` filter line and add `strategyFilter` to the dependency array:

```tsx
if (strategyFilter !== 'ALL') data = data.filter((p) => p.strategyTag === strategyFilter);
```

Dependency array becomes:

```tsx
  }, [posFilter, search, availableOnly, strategyFilter, claimMap, sortBy, sortDir, players]);
```

Then pass the new props to `<FilterControls>` (add inside its JSX, alongside the existing props):

```tsx
strategyFilter = { strategyFilter };
onStrategyFilterChange = { setStrategyFilter };
showStrategyFilter = { hasStrategyTags };
```

- [ ] **Step 6: Typecheck + full test run**

Run: `pnpm tsc --noEmit && pnpm test`
Expected: clean typecheck; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/AuctionSheet/FilterControls.tsx src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/FilterControls.strategy.test.tsx
git commit -m "feat: add archetype filter chips to the value sheet"
```

---

### Task 6: Bid modal spread + archetype label

**Files:**

- Modify: `src/components/BidModal/BidModal.tsx`
- Test: `src/__tests__/BidModal.spread.test.tsx`

**Interfaces:**

- Consumes: `strategyTagReason` from `@/lib/valueSpread`; `Player.spread` / `strategyTag` / `spreadDynRank` / `spreadProjRank`.
- Produces: `data-testid="bid-spread"` and `data-testid="bid-strategy-tag"` regions in the modal.

- [ ] **Step 1: Write the failing component test**

Create `src/__tests__/BidModal.spread.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import BidModal from '@/components/BidModal/BidModal';
import type { Player, LeagueTeam } from '@/types';

const TEAMS: LeagueTeam[] = [{ id: 1, handle: 'alice', displayName: 'Alice' }];

function mkPlayer(overrides: Partial<Player>): Player {
  return {
    player: 'Josh Jacobs',
    team: 'GB',
    pos: 'RB',
    age: 28,
    sfRank: 12,
    budget: 60,
    ceiling: 69,
    floor: 52,
    notes: '',
    baseBudget: 60,
    projectionAuctionValue: 84,
    vor: 30,
    spread: null,
    strategyTag: null,
    spreadDynRank: null,
    spreadProjRank: null,
    ...overrides,
  };
}

function renderModal(player: Player) {
  return render(<BidModal player={player} teams={TEAMS} onClose={() => {}} onSubmit={() => {}} />);
}

describe('BidModal spread block', () => {
  it('shows the spread and ranks when present', () => {
    renderModal(mkPlayer({ spread: 42, spreadDynRank: 24, spreadProjRank: 12 }));
    const block = screen.getByTestId('bid-spread');
    expect(block).toHaveTextContent('#24');
    expect(block).toHaveTextContent('#12');
    expect(block).toHaveTextContent('+42');
  });

  it('shows the archetype label + reason when a tag fires', () => {
    renderModal(
      mkPlayer({ spread: 42, spreadDynRank: 24, spreadProjRank: 12, strategyTag: 'WIN-NOW' }),
    );
    expect(screen.getByTestId('bid-strategy-tag')).toHaveTextContent('WIN-NOW');
  });

  it('omits the spread block entirely for no-read players', () => {
    renderModal(mkPlayer({ spread: null, strategyTag: null }));
    expect(screen.queryByTestId('bid-spread')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/BidModal.spread.test.tsx`
Expected: FAIL — no `data-testid="bid-spread"`.

- [ ] **Step 3: Add the spread block to BidModal**

In `src/components/BidModal/BidModal.tsx`, add the import near the top:

```ts
import { strategyTagReason } from '@/lib/valueSpread';
```

Add a formatter helper above the component (near where `hasProjectionContext` is derived, but at module scope — place it just after the imports):

```ts
function formatSpread(spread: number): string {
  return spread > 0 ? `+${spread}` : String(spread);
}
```

Then, inside the JSX, immediately after the closing `)}` of the existing `hasProjectionContext` price-context block (after line ~129's grid closes), add:

```tsx
{
  player.spread != null && (
    <div
      data-testid="bid-spread"
      className="rounded-md border border-border-subtle bg-card/45 p-2.5"
    >
      <div className="font-label mb-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        Spread
      </div>
      <div className="font-mono text-xs tabular-nums text-secondary-fg">
        Dynasty #{player.spreadDynRank} · Proj #{player.spreadProjRank} ·{' '}
        <span
          style={{
            color:
              player.spread > 0
                ? 'var(--age-young)'
                : player.spread < 0
                  ? 'var(--age-old)'
                  : 'var(--text-muted)',
          }}
        >
          {formatSpread(player.spread)}
        </span>
      </div>
      {player.strategyTag && (
        <div data-testid="bid-strategy-tag" className="mt-2 flex items-start gap-2">
          <span
            className="font-label rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase"
            style={{ background: 'var(--pos-pick)', color: 'var(--bg-base)' }}
          >
            {player.strategyTag}
          </span>
          <span className="text-[11px] leading-tight text-muted-foreground">
            {strategyTagReason(player.strategyTag)}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/BidModal.spread.test.tsx`
Expected: PASS (all 3).

- [ ] **Step 5: Full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: clean typecheck, no lint errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/BidModal/BidModal.tsx src/__tests__/BidModal.spread.test.tsx
git commit -m "feat: show spread and archetype label in the bid modal"
```

---

## Post-implementation

- [ ] Update `CLAUDE.md` — add a "Value Spreads" entry to **What's Built** (the spread engine `src/lib/valueSpread.ts`, `src/lib/ageBands.ts` shared age bands, the sheet column + chips, the bid-modal label), and note `valueSpread.constants.ts` / `ageBands.constants.ts` as backend-only tunables. Add `src/lib/valueSpread.ts` and `src/lib/ageBands.ts` to the Key Library Files list.
- [ ] Run `make check` (full gate) before opening the PR.
