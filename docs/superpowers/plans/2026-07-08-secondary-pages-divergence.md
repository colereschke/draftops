# Secondary Pages Divergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diverge `/budget` (Live Threat board) and `/teams` (Manager Dossier board) so each answers a distinct question, wired together by a shared behavioral "tendency" engine.

**Architecture:** A new pure function `computeTendencies` derives per-manager, per-position buying behavior (lean, overpay/bargain appetite, aggression) from auction results + player values. `/teams` renders a grid of dossier cards from it; `/budget` renders a position-anchored threat ranking where `threat = maxBid × revealed appetite`. Both remain server components that fetch data and pass it to client components.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7 (Postgres), Jest + React Testing Library, Tailwind 4, shadcn/ui table primitives, lucide-react icons.

## Global Constraints

- Package manager is **pnpm** — never npm/yarn.
- Verification commands: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test` (or `make check`).
- TypeScript strict: no explicit `any` (use `unknown` + guard); prefer `interface` for object shapes, `type` only for unions/aliases.
- Prettier: single quotes, trailing commas, 2-space indent, 100-char width.
- Functional components only; explicit props `interface` per component; no inline prop type literals.
- Tests select by `data-testid`/`id`, not visible text or CSS classes; typed fixtures reuse `src/types` shapes.
- Tunable calibration constants live **only** in `src/lib/tendencies.constants.ts` (backend-only, never user-facing), mirroring `src/lib/valueAdjustment.constants.ts`.
- **Design philosophy (spec):** draft for value, not for need. No count-vs-target "needs" framing anywhere. Team Rosters card face shows **no** Spent/Remaining/Buying Power.
- Appetite vocabulary + colors are consistent across both pages: `overpays` → `var(--age-old)`, `thrifty` → `var(--age-young)`, `neutral` → muted, `no-read` → a muted dot.
- Reference spec: `docs/superpowers/specs/2026-07-08-secondary-pages-divergence-design.md`.

---

## File Structure

**Create:**

- `src/lib/tendencies.constants.ts` — tunable thresholds + appetite multipliers.
- `src/lib/tendencies.ts` — `computeTendencies` + exported `ManagerTendency`/`PositionTendency`/`Appetite`/`AppetitePos` types.
- `src/lib/threat.ts` — `maxBid`, `appetiteMultiplier`, `threatScore`.
- `src/components/RosterTracker/DossierCard.tsx` — one manager scouting card.
- `src/components/BudgetPressure/ThreatBoard.tsx` — position selector + ranked threat table.
- `src/__tests__/tendencies.test.ts`, `src/__tests__/threat.test.ts`, `src/__tests__/DossierCard.test.tsx`, `src/__tests__/ThreatBoard.test.tsx`.

**Modify:**

- `src/components/RosterTracker/RosterTracker.tsx` — card-grid shell (was metric strip + table).
- `src/components/RosterTracker/TeamRosterDetail.tsx` — group won players by position with subtotals.
- `src/app/draft/[draftId]/teams/page.tsx` — compute + pass tendencies.
- `src/components/BudgetPressure/BudgetPressureView.tsx` — host ThreatBoard + secondary market metrics.
- `src/app/draft/[draftId]/budget/page.tsx` — fetch players + nominated players, resolve live position, pass tendencies.
- `src/__tests__/RosterTracker.test.tsx` — updated props (tendencies).
- `src/components/RosterTracker/index.ts` — export unchanged; verify.
- `CLAUDE.md` — reflect new page jobs + files.

**Delete:**

- `src/components/RosterTracker/RosterTable.tsx` — money-column table absorbed by the card grid.

---

## Task 1: Tendency engine constants

**Files:**

- Create: `src/lib/tendencies.constants.ts`

**Interfaces:**

- Produces: named constants `MIN_BUYS_FOR_READ`, `OVERPAY_PCT`, `THRIFTY_PCT`, `LEAN_SHARE_THRESHOLD`, `MIN_SPEND_FOR_LEAN`, `AGG_PCT`, `MIN_BUYS_FOR_AGGRESSION`, `APPETITE_OVERPAY_MULT`, `APPETITE_THRIFTY_MULT`; type `AppetitePos = 'QB' | 'RB' | 'WR' | 'TE'`; const `APPETITE_POSITIONS`.

- [ ] **Step 1: Create the constants file**

```ts
// src/lib/tendencies.constants.ts
// Every value here is TUNABLE — calibrate after the first real draft.
// This is the only place tendency calibration lives. Never user-facing.

export type AppetitePos = 'QB' | 'RB' | 'WR' | 'TE';

export const APPETITE_POSITIONS: readonly AppetitePos[] = ['QB', 'RB', 'WR', 'TE'];

// Sample-size gate: below this many buys at a position, appetite is 'no-read'.
export const MIN_BUYS_FOR_READ = 2;

// Over/under value thresholds (fraction of value paid over) for per-position appetite.
export const OVERPAY_PCT = 0.08;
export const THRIFTY_PCT = -0.08;

// Lean: a position must exceed this share of total spend to be the team's lean.
export const LEAN_SHARE_THRESHOLD = 0.35;
// ...and the team must have spent at least this much, or lean is 'balanced'.
export const MIN_SPEND_FOR_LEAN = 100;

// Aggression: overall over% thresholds, gated by a minimum total buy count.
export const AGG_PCT = 0.05;
export const MIN_BUYS_FOR_AGGRESSION = 3;

// Threat multipliers applied to max-bid on the Budget Pressure board.
// neutral and no-read both map to 1.0 in appetiteMultiplier().
export const APPETITE_OVERPAY_MULT = 1.3;
export const APPETITE_THRIFTY_MULT = 0.7;
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/tendencies.constants.ts
git commit -m "feat: tendency engine calibration constants"
```

---

## Task 2: Tendency engine (`computeTendencies`)

**Files:**

- Create: `src/lib/tendencies.ts`
- Test: `src/__tests__/tendencies.test.ts`

**Interfaces:**

- Consumes: constants + `AppetitePos` from Task 1; `Player` from `@/types`.
- Produces:
  - `type Appetite = 'overpays' | 'neutral' | 'thrifty' | 'no-read'`
  - `interface PositionTendency { position: AppetitePos; buys: number; spend: number; valueSum: number; deltaSum: number; avgDelta: number | null; overPct: number | null; spendShare: number; appetite: Appetite }`
  - `interface ManagerTendency { teamId: number; handle: string; displayName: string | null; buys: number; totalSpend: number; totalValue: number; overallOverPct: number | null; topBuy: number; lean: AppetitePos | 'balanced'; aggression: 'aggressive' | 'neutral' | 'disciplined'; positions: Record<AppetitePos, PositionTendency> }`
  - `interface TendencyTeamInput { id: number; handle: string; displayName: string | null; results: { player: string; position: string; price: number }[] }`
  - `function computeTendencies(teams: TendencyTeamInput[], players: Pick<Player, 'player' | 'budget'>[]): ManagerTendency[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/tendencies.test.ts
import { computeTendencies, type TendencyTeamInput } from '@/lib/tendencies';
import type { Player } from '@/types';

const players: Pick<Player, 'player' | 'budget'>[] = [
  { player: 'QB1', budget: 100 },
  { player: 'QB2', budget: 100 },
  { player: 'RB1', budget: 100 },
  { player: 'RB2', budget: 100 },
  { player: 'RB3', budget: 100 },
  { player: 'WR1', budget: 100 },
  { player: 'TE1', budget: 100 },
];

const buy = (player: string, position: string, price: number) => ({ player, position, price });

const team = (over: Partial<TendencyTeamInput> = {}): TendencyTeamInput => ({
  id: 1,
  handle: 'rival_a',
  displayName: 'Rival A',
  results: [],
  ...over,
});

describe('computeTendencies — per-position appetite', () => {
  it('marks a position no-read below the sample threshold', () => {
    const [t] = computeTendencies([team({ results: [buy('QB1', 'QB', 200)] })], players);
    expect(t.positions.QB.buys).toBe(1);
    expect(t.positions.QB.appetite).toBe('no-read');
  });

  it('flags overpays when over% clears the threshold with enough buys', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('WR1', 'WR', 130), buy('WR2', 'WR', 130)] })],
      [...players, { player: 'WR2', budget: 100 }],
    );
    expect(t.positions.WR.buys).toBe(2);
    expect(t.positions.WR.overPct).toBeCloseTo(0.3);
    expect(t.positions.WR.appetite).toBe('overpays');
  });

  it('flags thrifty for consistent bargains', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('RB1', 'RB', 70), buy('RB2', 'RB', 70)] })],
      players,
    );
    expect(t.positions.RB.appetite).toBe('thrifty');
  });

  it('is neutral inside the band', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('RB1', 'RB', 100), buy('RB2', 'RB', 100)] })],
      players,
    );
    expect(t.positions.RB.appetite).toBe('neutral');
  });
});

describe('computeTendencies — baselines and activity', () => {
  it('counts off-list buys toward spend but not toward delta/appetite', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('QB1', 'QB', 100), buy('Nobody', 'QB', 500)] })],
      players,
    );
    expect(t.positions.QB.buys).toBe(2);
    expect(t.positions.QB.spend).toBe(600);
    expect(t.positions.QB.valueSum).toBe(100); // only QB1 matched
    expect(t.positions.QB.deltaSum).toBe(0); // 100 - 100
    expect(t.totalSpend).toBe(600);
    expect(t.topBuy).toBe(500);
  });

  it('excludes PICK/PKG from per-position appetite but counts activity', () => {
    const [t] = computeTendencies(
      [team({ results: [buy('Matt Gay', 'PKG', 112), buy('QB1', 'QB', 100)] })],
      players,
    );
    expect(t.buys).toBe(2);
    expect(t.totalSpend).toBe(212);
    // PKG has no appetite bucket; only QB tracked
    expect(t.positions.QB.buys).toBe(1);
  });
});

describe('computeTendencies — lean and aggression', () => {
  it('names a lean when one position dominates spend past the threshold', () => {
    const [t] = computeTendencies(
      [
        team({
          results: [buy('WR1', 'WR', 400), buy('RB1', 'RB', 60), buy('TE1', 'TE', 40)],
        }),
      ],
      players,
    );
    expect(t.lean).toBe('WR');
  });

  it('stays balanced when spend is spread out', () => {
    const [t] = computeTendencies(
      [
        team({
          results: [buy('WR1', 'WR', 100), buy('RB1', 'RB', 100), buy('QB1', 'QB', 100)],
        }),
      ],
      players,
    );
    expect(t.lean).toBe('balanced');
  });

  it('calls a habitual overpayer aggressive once past the buy gate', () => {
    const [t] = computeTendencies(
      [
        team({
          results: [buy('QB1', 'QB', 120), buy('RB1', 'RB', 120), buy('WR1', 'WR', 120)],
        }),
      ],
      players,
    );
    expect(t.overallOverPct).toBeCloseTo(0.2);
    expect(t.aggression).toBe('aggressive');
  });

  it('cold start: empty results → balanced/neutral/no-read', () => {
    const [t] = computeTendencies([team({ results: [] })], players);
    expect(t.lean).toBe('balanced');
    expect(t.aggression).toBe('neutral');
    expect(t.positions.WR.appetite).toBe('no-read');
    expect(t.overallOverPct).toBeNull();
    expect(t.topBuy).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/tendencies.test.ts`
Expected: FAIL with "Cannot find module '@/lib/tendencies'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/tendencies.ts
import type { Player } from '@/types';
import {
  APPETITE_POSITIONS,
  MIN_BUYS_FOR_READ,
  OVERPAY_PCT,
  THRIFTY_PCT,
  LEAN_SHARE_THRESHOLD,
  MIN_SPEND_FOR_LEAN,
  AGG_PCT,
  MIN_BUYS_FOR_AGGRESSION,
  type AppetitePos,
} from './tendencies.constants';

export type Appetite = 'overpays' | 'neutral' | 'thrifty' | 'no-read';

// Re-export so consumers can pull the position type from one module (@/lib/tendencies)
// alongside the tendency types, rather than reaching into the constants file.
export type { AppetitePos } from './tendencies.constants';

export interface PositionTendency {
  position: AppetitePos;
  buys: number;
  spend: number;
  valueSum: number;
  deltaSum: number;
  avgDelta: number | null;
  overPct: number | null;
  spendShare: number;
  appetite: Appetite;
}

export interface ManagerTendency {
  teamId: number;
  handle: string;
  displayName: string | null;
  buys: number;
  totalSpend: number;
  totalValue: number;
  overallOverPct: number | null;
  topBuy: number;
  lean: AppetitePos | 'balanced';
  aggression: 'aggressive' | 'neutral' | 'disciplined';
  positions: Record<AppetitePos, PositionTendency>;
}

export interface TendencyTeamInput {
  id: number;
  handle: string;
  displayName: string | null;
  results: { player: string; position: string; price: number }[];
}

function isAppetitePos(pos: string): pos is AppetitePos {
  return (APPETITE_POSITIONS as readonly string[]).includes(pos);
}

function classifyAppetite(buys: number, overPct: number | null): Appetite {
  if (buys < MIN_BUYS_FOR_READ) return 'no-read';
  if (overPct === null) return 'neutral';
  if (overPct > OVERPAY_PCT) return 'overpays';
  if (overPct < THRIFTY_PCT) return 'thrifty';
  return 'neutral';
}

export function computeTendencies(
  teams: TendencyTeamInput[],
  players: Pick<Player, 'player' | 'budget'>[],
): ManagerTendency[] {
  const valueByName = new Map(players.map((p) => [p.player, p.budget]));

  return teams.map((team) => {
    const acc: Record<
      AppetitePos,
      { buys: number; spend: number; valueSum: number; deltaSum: number; matchedBuys: number }
    > = {
      QB: { buys: 0, spend: 0, valueSum: 0, deltaSum: 0, matchedBuys: 0 },
      RB: { buys: 0, spend: 0, valueSum: 0, deltaSum: 0, matchedBuys: 0 },
      WR: { buys: 0, spend: 0, valueSum: 0, deltaSum: 0, matchedBuys: 0 },
      TE: { buys: 0, spend: 0, valueSum: 0, deltaSum: 0, matchedBuys: 0 },
    };

    let totalSpend = 0;
    let totalValue = 0;
    let totalDelta = 0;
    let totalBuys = 0;
    let topBuy = 0;

    for (const r of team.results) {
      totalSpend += r.price;
      totalBuys += 1;
      if (r.price > topBuy) topBuy = r.price;
      if (!isAppetitePos(r.position)) continue;
      const a = acc[r.position];
      a.buys += 1;
      a.spend += r.price;
      const val = valueByName.get(r.player);
      if (val != null) {
        a.matchedBuys += 1;
        a.valueSum += val;
        a.deltaSum += r.price - val;
        totalValue += val;
        totalDelta += r.price - val;
      }
    }

    const positions = {} as Record<AppetitePos, PositionTendency>;
    for (const pos of APPETITE_POSITIONS) {
      const a = acc[pos];
      const overPct = a.valueSum > 0 ? a.deltaSum / a.valueSum : null;
      positions[pos] = {
        position: pos,
        buys: a.buys,
        spend: a.spend,
        valueSum: a.valueSum,
        deltaSum: a.deltaSum,
        avgDelta: a.matchedBuys > 0 ? a.deltaSum / a.matchedBuys : null,
        overPct,
        spendShare: totalSpend > 0 ? a.spend / totalSpend : 0,
        appetite: classifyAppetite(a.buys, overPct),
      };
    }

    const overallOverPct = totalValue > 0 ? totalDelta / totalValue : null;

    let lean: AppetitePos | 'balanced' = 'balanced';
    if (totalSpend >= MIN_SPEND_FOR_LEAN) {
      let best: AppetitePos | null = null;
      let bestShare = 0;
      for (const pos of APPETITE_POSITIONS) {
        if (positions[pos].spendShare > bestShare) {
          bestShare = positions[pos].spendShare;
          best = pos;
        }
      }
      if (best && bestShare > LEAN_SHARE_THRESHOLD) lean = best;
    }

    let aggression: ManagerTendency['aggression'] = 'neutral';
    if (totalBuys >= MIN_BUYS_FOR_AGGRESSION && overallOverPct !== null) {
      if (overallOverPct > AGG_PCT) aggression = 'aggressive';
      else if (overallOverPct < -AGG_PCT) aggression = 'disciplined';
    }

    return {
      teamId: team.id,
      handle: team.handle,
      displayName: team.displayName,
      buys: totalBuys,
      totalSpend,
      totalValue,
      overallOverPct,
      topBuy,
      lean,
      aggression,
      positions,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/tendencies.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tendencies.ts src/__tests__/tendencies.test.ts
git commit -m "feat: computeTendencies behavioral engine"
```

---

## Task 3: Threat helpers (`maxBid`, `appetiteMultiplier`, `threatScore`)

**Files:**

- Create: `src/lib/threat.ts`
- Test: `src/__tests__/threat.test.ts`

**Interfaces:**

- Consumes: `APPETITE_OVERPAY_MULT`, `APPETITE_THRIFTY_MULT` from Task 1; `Appetite` from Task 2.
- Produces:
  - `function maxBid(team: { buyingPower: number; rosterRemaining: number }): number`
  - `function appetiteMultiplier(appetite: Appetite): number`
  - `function threatScore(team: { buyingPower: number; rosterRemaining: number }, appetite: Appetite): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/threat.test.ts
import { maxBid, appetiteMultiplier, threatScore } from '@/lib/threat';

describe('maxBid', () => {
  it('is buyingPower + 1 when slots remain', () => {
    expect(maxBid({ buyingPower: 660, rosterRemaining: 28 })).toBe(661);
  });
  it('is 0 when no roster slots remain', () => {
    expect(maxBid({ buyingPower: 300, rosterRemaining: 0 })).toBe(0);
  });
  it('clamps negative buying power to 0', () => {
    expect(maxBid({ buyingPower: -5, rosterRemaining: 3 })).toBe(0);
  });
});

describe('appetiteMultiplier', () => {
  it('lifts overpays, cuts thrifty, leaves neutral and no-read at 1.0', () => {
    expect(appetiteMultiplier('overpays')).toBeGreaterThan(1);
    expect(appetiteMultiplier('thrifty')).toBeLessThan(1);
    expect(appetiteMultiplier('neutral')).toBe(1);
    expect(appetiteMultiplier('no-read')).toBe(1);
  });
});

describe('threatScore', () => {
  it('early draft (no-read) ranks purely by max-bid', () => {
    const a = threatScore({ buyingPower: 340, rosterRemaining: 20 }, 'no-read');
    const b = threatScore({ buyingPower: 312, rosterRemaining: 20 }, 'no-read');
    expect(a).toBeGreaterThan(b);
  });
  it('a WR-addict outranks a flusher who is WR-thrifty', () => {
    const addict = threatScore({ buyingPower: 312, rosterRemaining: 20 }, 'overpays');
    const flusher = threatScore({ buyingPower: 340, rosterRemaining: 20 }, 'thrifty');
    expect(addict).toBeGreaterThan(flusher);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/threat.test.ts`
Expected: FAIL with "Cannot find module '@/lib/threat'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/threat.ts
import { APPETITE_OVERPAY_MULT, APPETITE_THRIFTY_MULT } from './tendencies.constants';
import type { Appetite } from './tendencies';

export function maxBid(team: { buyingPower: number; rosterRemaining: number }): number {
  if (team.rosterRemaining <= 0) return 0;
  return Math.max(0, team.buyingPower + 1);
}

export function appetiteMultiplier(appetite: Appetite): number {
  if (appetite === 'overpays') return APPETITE_OVERPAY_MULT;
  if (appetite === 'thrifty') return APPETITE_THRIFTY_MULT;
  return 1;
}

export function threatScore(
  team: { buyingPower: number; rosterRemaining: number },
  appetite: Appetite,
): number {
  return maxBid(team) * appetiteMultiplier(appetite);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/threat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/threat.ts src/__tests__/threat.test.ts
git commit -m "feat: threat scoring helpers"
```

---

## Task 4: Dossier card component

**Files:**

- Create: `src/components/RosterTracker/DossierCard.tsx`
- Test: `src/__tests__/DossierCard.test.tsx`

**Interfaces:**

- Consumes: `ManagerTendency`, `Appetite`, `AppetitePos` from Task 2 / Task 1; `TeamWithRoster` from `@/types`; existing `TeamRosterDetail` (updated in Task 5).
- Produces: `interface DossierCardProps { team: TeamWithRoster; tendency: ManagerTendency; isOwner: boolean; isExpanded: boolean; onToggle: (id: number) => void }`; default export `DossierCard`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/DossierCard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DossierCard from '@/components/RosterTracker/DossierCard';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';

const tendency = (over: Partial<ManagerTendency> = {}): ManagerTendency => ({
  teamId: 1,
  handle: 'rival_a',
  displayName: 'Rival A',
  buys: 6,
  totalSpend: 610,
  totalValue: 570,
  overallOverPct: 0.07,
  topBuy: 95,
  lean: 'WR',
  aggression: 'aggressive',
  positions: {
    QB: {
      position: 'QB',
      buys: 4,
      spend: 410,
      valueSum: 358,
      deltaSum: 52,
      avgDelta: 13,
      overPct: 0.145,
      spendShare: 0.67,
      appetite: 'overpays',
    },
    RB: {
      position: 'RB',
      buys: 3,
      spend: 80,
      valueSum: 110,
      deltaSum: -30,
      avgDelta: -10,
      overPct: -0.27,
      spendShare: 0.13,
      appetite: 'thrifty',
    },
    WR: {
      position: 'WR',
      buys: 5,
      spend: 100,
      valueSum: 100,
      deltaSum: 0,
      avgDelta: 0,
      overPct: 0,
      spendShare: 0.16,
      appetite: 'neutral',
    },
    TE: {
      position: 'TE',
      buys: 1,
      spend: 20,
      valueSum: 20,
      deltaSum: 0,
      avgDelta: 0,
      overPct: 0,
      spendShare: 0.03,
      appetite: 'no-read',
    },
  },
  ...over,
});

const team = (over: Partial<TeamWithRoster> = {}): TeamWithRoster => ({
  id: 1,
  handle: 'rival_a',
  displayName: 'Rival A',
  budget: 1000,
  spent: 610,
  remaining: 390,
  rosterCount: 6,
  rosterRemaining: 24,
  buyingPower: 366,
  pkgCount: 0,
  results: [],
  ...over,
});

const noop = () => {};

describe('DossierCard', () => {
  it('shows lean, aggression, and an appetite chip per position', () => {
    render(
      <DossierCard
        team={team()}
        tendency={tendency()}
        isOwner={false}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.getByTestId('dossier-lean-1')).toHaveTextContent('WR');
    expect(screen.getByTestId('dossier-aggression-1')).toHaveTextContent(/aggressive/i);
    expect(screen.getByTestId('dossier-chip-QB-1')).toBeInTheDocument();
    expect(screen.getByTestId('dossier-chip-TE-1')).toBeInTheDocument();
  });

  it('hides the habit line when every position is no-read/neutral', () => {
    const flat = tendency({
      lean: 'balanced',
      positions: {
        QB: {
          position: 'QB',
          buys: 1,
          spend: 100,
          valueSum: 100,
          deltaSum: 0,
          avgDelta: null,
          overPct: null,
          spendShare: 0.5,
          appetite: 'no-read',
        },
        RB: {
          position: 'RB',
          buys: 0,
          spend: 0,
          valueSum: 0,
          deltaSum: 0,
          avgDelta: null,
          overPct: null,
          spendShare: 0,
          appetite: 'no-read',
        },
        WR: {
          position: 'WR',
          buys: 0,
          spend: 0,
          valueSum: 0,
          deltaSum: 0,
          avgDelta: null,
          overPct: null,
          spendShare: 0,
          appetite: 'no-read',
        },
        TE: {
          position: 'TE',
          buys: 0,
          spend: 0,
          valueSum: 0,
          deltaSum: 0,
          avgDelta: null,
          overPct: null,
          spendShare: 0,
          appetite: 'no-read',
        },
      },
    });
    render(
      <DossierCard
        team={team()}
        tendency={flat}
        isOwner={false}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.queryByTestId('dossier-habit-1')).not.toBeInTheDocument();
  });

  it('does not show buying power / remaining on the face', () => {
    render(
      <DossierCard
        team={team()}
        tendency={tendency()}
        isOwner={false}
        isExpanded={false}
        onToggle={noop}
      />,
    );
    expect(screen.queryByText(/\$366/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$390/)).not.toBeInTheDocument();
  });

  it('calls onToggle when the expander is clicked', async () => {
    const onToggle = jest.fn();
    render(
      <DossierCard
        team={team()}
        tendency={tendency()}
        isOwner={false}
        isExpanded={false}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByTestId('dossier-expand-1'));
    expect(onToggle).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/DossierCard.test.tsx`
Expected: FAIL with "Cannot find module '@/components/RosterTracker/DossierCard'".

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/RosterTracker/DossierCard.tsx
'use client';

import { ChevronRight } from 'lucide-react';
import type { TeamWithRoster } from '@/types';
import type { Appetite, AppetitePos, ManagerTendency } from '@/lib/tendencies';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';
import { cn } from '@/lib/utils';
import TeamRosterDetail from './TeamRosterDetail';

export interface DossierCardProps {
  team: TeamWithRoster;
  tendency: ManagerTendency;
  isOwner: boolean;
  isExpanded: boolean;
  onToggle: (id: number) => void;
}

const AGGRESSION_LABEL: Record<ManagerTendency['aggression'], string> = {
  aggressive: 'Aggressive',
  neutral: 'Neutral',
  disciplined: 'Disciplined',
};

const AGGRESSION_COLOR: Record<ManagerTendency['aggression'], string | undefined> = {
  aggressive: 'var(--age-old)',
  neutral: undefined,
  disciplined: 'var(--age-young)',
};

function appetiteColor(appetite: Appetite): string | undefined {
  if (appetite === 'overpays') return 'var(--age-old)';
  if (appetite === 'thrifty') return 'var(--age-young)';
  return undefined;
}

function leanLabel(lean: ManagerTendency['lean']): string {
  return lean === 'balanced' ? 'Balanced' : `${lean}-heavy`;
}

// Strongest habit = the position with a non-neutral, non-no-read appetite and the
// largest |overPct|. Used for the one-line headline; omitted when nothing qualifies.
function strongestHabit(
  tendency: ManagerTendency,
): { pos: AppetitePos; appetite: Appetite } | null {
  let best: { pos: AppetitePos; appetite: Appetite; mag: number } | null = null;
  for (const pos of APPETITE_POSITIONS) {
    const p = tendency.positions[pos];
    if ((p.appetite === 'overpays' || p.appetite === 'thrifty') && p.overPct !== null) {
      const mag = Math.abs(p.overPct);
      if (!best || mag > best.mag) best = { pos, appetite: p.appetite, mag };
    }
  }
  return best ? { pos: best.pos, appetite: best.appetite } : null;
}

export default function DossierCard({
  team,
  tendency,
  isOwner,
  isExpanded,
  onToggle,
}: DossierCardProps) {
  const habit = strongestHabit(tendency);
  const overPctLabel =
    tendency.overallOverPct === null
      ? null
      : `${tendency.overallOverPct > 0 ? '+' : ''}${Math.round(tendency.overallOverPct * 100)}% vs value`;

  return (
    <div
      className="rounded-lg border border-border-subtle bg-card"
      style={{ borderLeft: `3px solid ${isOwner ? 'var(--primary)' : 'var(--border)'}` }}
      data-testid={`dossier-card-${team.id}`}
    >
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span
              className={cn('text-[14px]', isOwner ? 'font-bold' : 'font-semibold text-foreground')}
              style={isOwner ? { color: 'var(--primary)' } : undefined}
            >
              {team.handle}
            </span>
            {team.displayName && (
              <span className="ml-1.5 text-[11px] text-muted-foreground">{team.displayName}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onToggle(team.id)}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} roster for ${team.handle}`}
            data-testid={`dossier-expand-${team.id}`}
            className="inline-flex cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronRight
              className={cn(
                'size-4 text-muted-foreground transition-transform duration-150',
                isExpanded && 'rotate-90',
              )}
            />
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span data-testid={`dossier-lean-${team.id}`} className="font-medium text-secondary-fg">
            {leanLabel(tendency.lean)}
          </span>
          {habit && (
            <span data-testid={`dossier-habit-${team.id}`} className="text-muted-foreground">
              · {habit.appetite === 'overpays' ? 'overpays' : 'bargains'} {habit.pos}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2 text-[12px]">
          <span
            data-testid={`dossier-aggression-${team.id}`}
            className="font-label text-[11px] tracking-wide uppercase"
            style={{ color: AGGRESSION_COLOR[tendency.aggression] }}
          >
            {AGGRESSION_LABEL[tendency.aggression]}
          </span>
          {overPctLabel && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {overPctLabel}
            </span>
          )}
        </div>

        <div className="mt-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          {tendency.buys} buys · ${tendency.totalSpend} · top ${tendency.topBuy}
        </div>

        <div className="mt-2 flex gap-1.5">
          {APPETITE_POSITIONS.map((pos) => {
            const p = tendency.positions[pos];
            const color = appetiteColor(p.appetite);
            return (
              <span
                key={pos}
                data-testid={`dossier-chip-${pos}-${team.id}`}
                title={`${pos}: ${p.appetite} (${p.buys} buys)`}
                className="font-label inline-flex items-center gap-1 rounded border border-border-subtle bg-background px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                style={{ color }}
              >
                {pos}
                <span aria-hidden>{p.appetite === 'no-read' ? '·' : '●'}</span>
              </span>
            );
          })}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border-subtle border-l-[3px] border-l-primary bg-background px-4 pt-2.5 pb-3.5">
          <TeamRosterDetail results={team.results} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/DossierCard.test.tsx`
Expected: PASS. (If TeamRosterDetail's grouped version from Task 5 is not yet present, the current TeamRosterDetail still renders `results` fine — the card test does not assert grouping.)

- [ ] **Step 5: Commit**

```bash
git add src/components/RosterTracker/DossierCard.tsx src/__tests__/DossierCard.test.tsx
git commit -m "feat: manager dossier card"
```

---

## Task 5: Group roster detail by position

**Files:**

- Modify: `src/components/RosterTracker/TeamRosterDetail.tsx`

**Interfaces:**

- Consumes: `RosterEntry`, `Position` from `@/types`; `POS_COLORS` from `@/lib/posColors`.
- Produces: unchanged export signature `TeamRosterDetail({ results }: { results: RosterEntry[] })` — internal rendering now grouped by position with a per-group subtotal.

- [ ] **Step 1: Rewrite the component to group by position**

```tsx
// src/components/RosterTracker/TeamRosterDetail.tsx
import type { RosterEntry, Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';

interface TeamRosterDetailProps {
  results: RosterEntry[];
}

const GROUP_ORDER: Position[] = ['QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

export default function TeamRosterDetail({ results }: TeamRosterDetailProps) {
  if (results.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No players won yet.</div>;
  }

  const groups = GROUP_ORDER.map((pos) => ({
    pos,
    entries: results.filter((r) => (r.position as Position) === pos),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((group) => {
        const c = POS_COLORS[group.pos] ?? POS_COLORS.PICK;
        const subtotal = group.entries.reduce((s, r) => s + r.price, 0);
        const deltaTotal = group.entries.reduce((s, r) => s + (r.delta ?? 0), 0);
        return (
          <div key={group.pos} data-testid={`roster-group-${group.pos}`}>
            <div className="mb-1 flex items-center justify-between">
              <span
                className="font-label rounded text-center text-[9px] font-bold tracking-wide"
                style={{ background: c.badge, color: c.badgeText, padding: '2px 6px' }}
              >
                {group.pos}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                ${subtotal}
                {deltaTotal !== 0 && (
                  <span style={{ color: deltaTotal > 0 ? 'var(--age-old)' : 'var(--age-young)' }}>
                    {' '}
                    ({deltaTotal > 0 ? '+' : '-'}${Math.abs(deltaTotal)})
                  </span>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {group.entries.map((result) => {
                const { delta } = result;
                return (
                  <div
                    key={result.id}
                    className="flex items-center gap-2.5 rounded-r border border-l-0 border-border-subtle bg-card px-2 py-[5px]"
                    style={{ borderLeft: `3px solid ${c.accent}` }}
                  >
                    <span className="flex-1 text-[13px] font-semibold text-foreground">
                      {result.player}
                    </span>
                    <span className="min-w-[30px] text-[11px] text-muted-foreground">
                      {result.nflTeam}
                    </span>
                    <span
                      className="min-w-11 text-right font-mono text-[13px] font-bold tabular-nums"
                      style={{ color: c.accent }}
                    >
                      ${result.price}
                    </span>
                    {delta !== null && delta !== 0 && (
                      <span
                        className="min-w-11 text-right font-mono text-[11px] tabular-nums"
                        style={{ color: delta > 0 ? 'var(--age-old)' : 'var(--age-young)' }}
                      >
                        {delta > 0 ? `+$${delta}` : `-$${Math.abs(delta)}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify existing detail behavior still typechecks and the card test still passes**

Run: `pnpm tsc --noEmit && pnpm test src/__tests__/DossierCard.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/RosterTracker/TeamRosterDetail.tsx
git commit -m "feat: group roster drawer by position with subtotals"
```

---

## Task 6: RosterTracker card-grid shell + teams page wiring

**Files:**

- Modify: `src/components/RosterTracker/RosterTracker.tsx`
- Delete: `src/components/RosterTracker/RosterTable.tsx`
- Modify: `src/app/draft/[draftId]/teams/page.tsx`
- Modify: `src/__tests__/RosterTracker.test.tsx`

**Interfaces:**

- Consumes: `DossierCard` (Task 4); `computeTendencies`, `ManagerTendency` (Task 2); `TeamWithRoster` from `@/types`.
- Produces: `interface RosterTrackerProps { teams: TeamWithRoster[]; tendencies: ManagerTendency[]; ownerHandle: string | null }`.

- [ ] **Step 1: Update the existing RosterTracker test for the new props/shape**

```tsx
// src/__tests__/RosterTracker.test.tsx  (replace file contents)
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RosterTracker from '@/components/RosterTracker/RosterTracker';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';

const makeTeam = (over: Partial<TeamWithRoster> = {}): TeamWithRoster => ({
  id: 1,
  handle: 'coreschke',
  displayName: 'Cole',
  budget: 1000,
  spent: 312,
  remaining: 688,
  rosterCount: 2,
  rosterRemaining: 28,
  buyingPower: 660,
  pkgCount: 1,
  results: [
    {
      id: 1,
      player: 'Patrick Mahomes',
      position: 'QB',
      nflTeam: 'KC',
      price: 200,
      sfRank: 1,
      teamId: 1,
      teamHandle: 'coreschke',
      delta: null,
    },
    {
      id: 2,
      player: 'Matt Gay',
      position: 'PKG',
      nflTeam: 'MIN',
      price: 112,
      sfRank: null,
      teamId: 1,
      teamHandle: 'coreschke',
      delta: null,
    },
  ],
  ...over,
});

const makeTendency = (over: Partial<ManagerTendency> = {}): ManagerTendency => ({
  teamId: 1,
  handle: 'coreschke',
  displayName: 'Cole',
  buys: 2,
  totalSpend: 312,
  totalValue: 300,
  overallOverPct: 0.04,
  topBuy: 200,
  lean: 'balanced',
  aggression: 'neutral',
  positions: {
    QB: {
      position: 'QB',
      buys: 1,
      spend: 200,
      valueSum: 200,
      deltaSum: 0,
      avgDelta: 0,
      overPct: 0,
      spendShare: 0.64,
      appetite: 'no-read',
    },
    RB: {
      position: 'RB',
      buys: 0,
      spend: 0,
      valueSum: 0,
      deltaSum: 0,
      avgDelta: null,
      overPct: null,
      spendShare: 0,
      appetite: 'no-read',
    },
    WR: {
      position: 'WR',
      buys: 0,
      spend: 0,
      valueSum: 0,
      deltaSum: 0,
      avgDelta: null,
      overPct: null,
      spendShare: 0,
      appetite: 'no-read',
    },
    TE: {
      position: 'TE',
      buys: 0,
      spend: 0,
      valueSum: 0,
      deltaSum: 0,
      avgDelta: null,
      overPct: null,
      spendShare: 0,
      appetite: 'no-read',
    },
  },
  ...over,
});

describe('RosterTracker', () => {
  it('renders a dossier card per team and pins the owner first', () => {
    const teams = [makeTeam({ id: 2, handle: 'rival_b', displayName: 'B' }), makeTeam()];
    const tendencies = [makeTendency({ teamId: 2, handle: 'rival_b' }), makeTendency()];
    render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle="coreschke" />);
    const cards = screen.getAllByTestId(/^dossier-card-/);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('data-testid', 'dossier-card-1'); // owner pinned first
  });

  it('expands a card to reveal the grouped roster drawer', async () => {
    render(
      <RosterTracker teams={[makeTeam()]} tendencies={[makeTendency()]} ownerHandle="coreschke" />,
    );
    await userEvent.click(screen.getByTestId('dossier-expand-1'));
    expect(screen.getByTestId('roster-group-QB')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/RosterTracker.test.tsx`
Expected: FAIL (RosterTracker still expects old props / renders a table, no `dossier-card-*` testids).

- [ ] **Step 3: Rewrite RosterTracker as the card-grid shell**

```tsx
// src/components/RosterTracker/RosterTracker.tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import type { TeamWithRoster } from '@/types';
import type { ManagerTendency } from '@/lib/tendencies';
import DossierCard from './DossierCard';

interface RosterTrackerProps {
  teams: TeamWithRoster[];
  tendencies: ManagerTendency[];
  ownerHandle: string | null;
}

type CardSort = 'activity' | 'aggression' | 'lean';

const AGGRESSION_RANK: Record<ManagerTendency['aggression'], number> = {
  aggressive: 2,
  neutral: 1,
  disciplined: 0,
};

export default function RosterTracker({ teams, tendencies, ownerHandle }: RosterTrackerProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<CardSort>('activity');

  const tendencyById = useMemo(() => new Map(tendencies.map((t) => [t.teamId, t])), [tendencies]);

  const toggle = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const ordered = useMemo(() => {
    const withTendency = teams
      .map((team) => ({ team, tendency: tendencyById.get(team.id) }))
      .filter((x): x is { team: TeamWithRoster; tendency: ManagerTendency } => x.tendency != null);

    const isOwner = (t: TeamWithRoster) => ownerHandle !== null && t.handle === ownerHandle;

    return [...withTendency].sort((a, b) => {
      // Owner always first.
      if (isOwner(a.team) !== isOwner(b.team)) return isOwner(a.team) ? -1 : 1;
      if (sortBy === 'aggression') {
        return AGGRESSION_RANK[b.tendency.aggression] - AGGRESSION_RANK[a.tendency.aggression];
      }
      if (sortBy === 'lean') {
        return a.tendency.lean.localeCompare(b.tendency.lean);
      }
      return b.tendency.totalSpend - a.tendency.totalSpend; // activity
    });
  }, [teams, tendencyById, sortBy, ownerHandle]);

  const totalTeams = teams.length;
  const activeManagers = tendencies.filter((t) => t.buys > 0).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-background px-5 py-4">
        <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
          <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
            {totalTeams}-Team · Superflex · Manager Scouting
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-label m-0 text-2xl leading-none font-bold tracking-tight text-foreground">
                Team Rosters
              </h1>
              <div className="mt-1.5 text-[11px] text-secondary-fg">
                How each manager buys — lean, appetite, and discipline. {activeManagers} active.
              </div>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-label tracking-wide uppercase">Sort</span>
              <select
                data-testid="dossier-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as CardSort)}
                className="rounded border border-border-subtle bg-background px-2 py-1 text-[12px] text-foreground"
              >
                <option value="activity">Activity</option>
                <option value="aggression">Aggression</option>
                <option value="lean">Lean</option>
              </select>
            </label>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 px-5 pt-3 pb-10 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map(({ team, tendency }) => (
          <DossierCard
            key={team.id}
            team={team}
            tendency={tendency}
            isOwner={ownerHandle !== null && team.handle === ownerHandle}
            isExpanded={expanded.has(team.id)}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Delete the obsolete table component**

```bash
git rm src/components/RosterTracker/RosterTable.tsx
```

- [ ] **Step 5: Wire the teams page to compute + pass tendencies**

Modify `src/app/draft/[draftId]/teams/page.tsx`. Add the import and compute tendencies from the already-fetched `rawTeams` + `players`, then pass to `RosterTracker`.

Add near the other imports:

```ts
import { computeTendencies } from '@/lib/tendencies';
```

Replace the `return (...)` block with:

```tsx
const tendencies = computeTendencies(rawTeams, players);

return (
  <RosterTracker
    teams={computeTeamStats(rawTeams, players, draft.rosterSize)}
    tendencies={tendencies}
    ownerHandle={draft.ownerTeam?.handle ?? null}
  />
);
```

(`rawTeams` rows already include `{ id, handle, displayName, results: [{ player, position, price }] }` from the existing `include: { results: true }`, which satisfies `TendencyTeamInput`. `players` already has `player`/`budget`.)

- [ ] **Step 6: Run the roster tests + typecheck**

Run: `pnpm test src/__tests__/RosterTracker.test.tsx && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/RosterTracker/RosterTracker.tsx src/app/draft/[draftId]/teams/page.tsx src/__tests__/RosterTracker.test.tsx
git commit -m "feat: Team Rosters -> manager dossier grid"
```

---

## Task 7: Threat board component

**Files:**

- Create: `src/components/BudgetPressure/ThreatBoard.tsx`
- Test: `src/__tests__/ThreatBoard.test.tsx`

**Interfaces:**

- Consumes: `threatScore`, `maxBid` (Task 3); `appetiteMultiplier` indirectly; `ManagerTendency`, `Appetite`, `AppetitePos` (Task 2/1); `TeamStats` from `@/types`.
- Produces: `interface ThreatBoardProps { teams: TeamStats[]; tendencies: ManagerTendency[]; livePosition: AppetitePos | null; liveName: string | null; ownerHandle: string | null }`; default export `ThreatBoard`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/ThreatBoard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThreatBoard from '@/components/BudgetPressure/ThreatBoard';
import type { TeamStats } from '@/types';
import type { ManagerTendency, Appetite, AppetitePos } from '@/lib/tendencies';

const stats = (id: number, handle: string, buyingPower: number): TeamStats => ({
  id,
  handle,
  displayName: handle,
  budget: 1000,
  spent: 0,
  remaining: buyingPower + 20,
  rosterCount: 5,
  rosterRemaining: 20,
  buyingPower,
  pkgCount: 0,
});

const pos = (position: AppetitePos, appetite: Appetite) => ({
  position,
  buys: appetite === 'no-read' ? 0 : 3,
  spend: 0,
  valueSum: 0,
  deltaSum: 0,
  avgDelta: null,
  overPct: null,
  spendShare: 0,
  appetite,
});

const tend = (teamId: number, handle: string, wr: Appetite): ManagerTendency => ({
  teamId,
  handle,
  displayName: handle,
  buys: 5,
  totalSpend: 500,
  totalValue: 480,
  overallOverPct: 0.04,
  topBuy: 120,
  lean: 'balanced',
  aggression: 'neutral',
  positions: {
    QB: pos('QB', 'neutral'),
    RB: pos('RB', 'neutral'),
    WR: pos('WR', wr),
    TE: pos('TE', 'neutral'),
  },
});

const teams = [stats(1, 'rival_a', 312), stats(2, 'rival_b', 340), stats(3, 'you', 190)];
const tendencies = [
  tend(1, 'rival_a', 'overpays'),
  tend(2, 'rival_b', 'thrifty'),
  tend(3, 'you', 'neutral'),
];

describe('ThreatBoard', () => {
  it('auto-selects the live nomination position', () => {
    render(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="you"
      />,
    );
    expect(screen.getByTestId('threat-pos-WR')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('threat-live-chip')).toHaveTextContent('Puka Nacua');
  });

  it('ranks a WR-overpayer above a flush WR-thrifty rival', () => {
    render(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="you"
      />,
    );
    const rows = screen.getAllByTestId(/^threat-row-/);
    expect(rows[0]).toHaveAttribute('data-testid', 'threat-row-rival_a');
  });

  it('honors a manual override and keeps it after a simulated refresh', async () => {
    const { rerender } = render(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="you"
      />,
    );
    await userEvent.click(screen.getByTestId('threat-pos-QB'));
    expect(screen.getByTestId('threat-pos-QB')).toHaveAttribute('aria-pressed', 'true');
    // Simulate the 20s refresh handing down a new live position:
    rerender(
      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition="RB"
        liveName="Bijan"
        ownerHandle="you"
      />,
    );
    expect(screen.getByTestId('threat-pos-QB')).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/__tests__/ThreatBoard.test.tsx`
Expected: FAIL with "Cannot find module '@/components/BudgetPressure/ThreatBoard'".

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/BudgetPressure/ThreatBoard.tsx
'use client';

import { useState, useMemo } from 'react';
import type { TeamStats } from '@/types';
import type { Appetite, AppetitePos, ManagerTendency } from '@/lib/tendencies';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';
import { maxBid, threatScore } from '@/lib/threat';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

export interface ThreatBoardProps {
  teams: TeamStats[];
  tendencies: ManagerTendency[];
  livePosition: AppetitePos | null;
  liveName: string | null;
  ownerHandle: string | null;
}

const APPETITE_LABEL: Record<Appetite, string> = {
  overpays: 'overpays',
  thrifty: 'thrifty',
  neutral: 'neutral',
  'no-read': '—',
};

function appetiteColor(appetite: Appetite): string | undefined {
  if (appetite === 'overpays') return 'var(--age-old)';
  if (appetite === 'thrifty') return 'var(--age-young)';
  return undefined;
}

export default function ThreatBoard({
  teams,
  tendencies,
  livePosition,
  liveName,
  ownerHandle,
}: ThreatBoardProps) {
  // overridePos wins when set; otherwise follow the live nomination; fall back to QB.
  // Deriving (rather than syncing via effect) means a 20s refresh updating
  // livePosition never stomps a manual override.
  const [overridePos, setOverridePos] = useState<AppetitePos | null>(null);
  const selectedPos: AppetitePos = overridePos ?? livePosition ?? 'QB';

  const ranked = useMemo(() => {
    return teams
      .map((team) => {
        const tendency = tendencies.find((t) => t.teamId === team.id);
        const appetite: Appetite = tendency ? tendency.positions[selectedPos].appetite : 'no-read';
        return {
          team,
          appetite,
          bid: maxBid(team),
          threat: threatScore(team, appetite),
        };
      })
      .sort((a, b) => b.threat - a.threat);
  }, [teams, tendencies, selectedPos]);

  const maxThreat = Math.max(...ranked.map((r) => r.threat), 1);

  return (
    <div className="overflow-x-auto px-5 pb-10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Threat position">
          {APPETITE_POSITIONS.map((pos) => {
            const active = pos === selectedPos;
            return (
              <button
                key={pos}
                type="button"
                data-testid={`threat-pos-${pos}`}
                aria-pressed={active}
                onClick={() => setOverridePos(pos)}
                className={cn(
                  'font-label cursor-pointer rounded border px-3 py-1 text-[12px] font-semibold tracking-wide uppercase',
                  active
                    ? 'border-primary bg-accent text-foreground'
                    : 'border-border-subtle bg-background text-muted-foreground',
                )}
              >
                {pos}
              </button>
            );
          })}
        </div>
        {liveName && livePosition && (
          <span
            data-testid="threat-live-chip"
            className="font-label rounded border border-border-subtle bg-card px-2 py-1 text-[11px] tracking-wide text-secondary-fg uppercase"
          >
            {liveName} up · {livePosition}
          </span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {['#', 'Team', 'Max Bid', 'Appetite', 'Threat'].map((col) => (
              <TableHead
                key={col}
                className="font-label border-none py-2 text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                style={{ textAlign: col === 'Team' || col === 'Threat' ? 'left' : 'center' }}
              >
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranked.map((row, i) => {
            const isOwner = ownerHandle !== null && row.team.handle === ownerHandle;
            const width = maxThreat > 0 ? Math.max(0, (row.threat / maxThreat) * 100) : 0;
            return (
              <TableRow
                key={row.team.id}
                data-testid={`threat-row-${row.team.handle}`}
                className={cn(
                  'border-b-border-subtle hover:bg-transparent',
                  isOwner ? 'bg-accent' : i % 2 !== 0 ? 'bg-muted/20' : undefined,
                )}
                style={{ borderLeft: `3px solid ${isOwner ? 'var(--primary)' : 'var(--border)'}` }}
              >
                <TableCell className="text-center font-mono text-[11px] text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell className="text-left">
                  <span
                    className={cn(
                      'text-[13px]',
                      isOwner ? 'font-bold text-foreground' : 'font-medium text-secondary-fg',
                    )}
                  >
                    {row.team.displayName ?? row.team.handle}
                  </span>
                </TableCell>
                <TableCell className="text-center font-mono text-[13px] text-foreground tabular-nums">
                  ${row.bid}
                </TableCell>
                <TableCell
                  className="font-label text-center text-[11px] tracking-wide uppercase"
                  style={{ color: appetiteColor(row.appetite) }}
                >
                  {APPETITE_LABEL[row.appetite]}
                </TableCell>
                <TableCell className="min-w-[180px]">
                  <div className="flex items-center gap-2.5">
                    <span className="min-w-[48px] font-mono text-[13px] font-bold tabular-nums">
                      {Math.round(row.threat)}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${width}%`, background: 'var(--primary)', opacity: 0.75 }}
                      />
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/__tests__/ThreatBoard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: PASS (no unused-var errors).

- [ ] **Step 6: Commit**

```bash
git add src/components/BudgetPressure/ThreatBoard.tsx src/__tests__/ThreatBoard.test.tsx
git commit -m "feat: live threat board"
```

---

## Task 8: Budget Pressure view + page wiring

**Files:**

- Modify: `src/components/BudgetPressure/BudgetPressureView.tsx`
- Modify: `src/app/draft/[draftId]/budget/page.tsx`

**Interfaces:**

- Consumes: `ThreatBoard` (Task 7); `computeTendencies` (Task 2); `TeamStats` from `@/types`; existing `BudgetRefresher`.
- Produces: `interface BudgetPressureViewProps { teams: TeamStats[]; tendencies: ManagerTendency[]; livePosition: AppetitePos | null; liveName: string | null; ownerHandle: string | null }`.

- [ ] **Step 1: Rewrite BudgetPressureView to host ThreatBoard + secondary market metrics**

```tsx
// src/components/BudgetPressure/BudgetPressureView.tsx
import type { TeamStats } from '@/types';
import type { ManagerTendency, AppetitePos } from '@/lib/tendencies';
import BudgetRefresher from './BudgetRefresher';
import ThreatBoard from './ThreatBoard';

interface BudgetPressureViewProps {
  teams: TeamStats[];
  tendencies: ManagerTendency[];
  livePosition: AppetitePos | null;
  liveName: string | null;
  ownerHandle: string | null;
}

export default function BudgetPressureView({
  teams,
  tendencies,
  livePosition,
  liveName,
  ownerHandle,
}: BudgetPressureViewProps) {
  const roomLiquidity = teams.reduce((sum, team) => sum + team.buyingPower, 0);
  const lowPowerCount = teams.filter((team) => team.buyingPower < 50).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-background px-5 py-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
          <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
            <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
              {teams.length}-Team · Superflex · $1,000 Budget · Live Threat
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-label m-0 text-2xl leading-none font-bold tracking-tight text-foreground">
                  Budget Pressure
                </h1>
                <div className="mt-1.5 text-[11px] text-secondary-fg">
                  Who can strike on the position up now — max bid weighted by revealed appetite.
                </div>
              </div>
              <BudgetRefresher intervalMs={20000} />
            </div>
          </section>

          <section className="grid min-w-full grid-cols-2 gap-2 xl:min-w-[360px]">
            <PressureMetric label="Room Liquidity" value={`$${roomLiquidity}`} />
            <PressureMetric label="Low Power" value={`${lowPowerCount} teams`} detail="Under $50" />
          </section>
        </div>
      </div>

      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition={livePosition}
        liveName={liveName}
        ownerHandle={ownerHandle}
      />
    </div>
  );
}

interface PressureMetricProps {
  label: string;
  value: number | string;
  detail?: string;
}

function PressureMetric({ label, value, detail }: PressureMetricProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-card px-3 py-3">
      <div className="font-label text-[10px] tracking-[1.7px] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-foreground tabular-nums">{value}</div>
      {detail && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the budget page to fetch players + nominated players and resolve the live position**

```tsx
// src/app/draft/[draftId]/budget/page.tsx
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { computeTeamStats } from '@/lib/budget';
import { computeTendencies } from '@/lib/tendencies';
import type { AppetitePos } from '@/lib/tendencies.constants';
import BudgetPressureView from '@/components/BudgetPressure';

export const dynamic = 'force-dynamic';

const APPETITE_SET = new Set<string>(['QB', 'RB', 'WR', 'TE']);

export default async function BudgetPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [teams, dbPlayers, nominated] = await Promise.all([
    prisma.team.findMany({ where: { draftId }, include: { results: true } }),
    prisma.player.findMany({ where: { draftId }, select: { name: true, pos: true, budget: true } }),
    prisma.nominatedPlayer.findMany({ where: { draftId }, orderBy: { createdAt: 'desc' } }),
  ]);

  const players = dbPlayers.map((p) => ({ player: p.name, budget: p.budget }));
  const posByName = new Map(dbPlayers.map((p) => [p.name, p.pos]));

  // Most recently nominated player whose position is one of the four board positions.
  let livePosition: AppetitePos | null = null;
  let liveName: string | null = null;
  for (const n of nominated) {
    const pos = posByName.get(n.playerName);
    if (pos && APPETITE_SET.has(pos)) {
      livePosition = pos as AppetitePos;
      liveName = n.playerName;
      break;
    }
  }

  const tendencies = computeTendencies(teams, players);

  return (
    <BudgetPressureView
      teams={computeTeamStats(teams, draft.rosterSize)}
      tendencies={tendencies}
      livePosition={livePosition}
      liveName={liveName}
      ownerHandle={draft.ownerTeam?.handle ?? null}
    />
  );
}
```

- [ ] **Step 3: Replace the orphaned BudgetPressureView test**

The existing `src/__tests__/components/BudgetPressureView.test.tsx` renders the old two-prop signature (`teams`, `ownerHandle`) and asserts on removed testids (`bp-1`, `row-coreschke`, `$800`, buying-power colors). It will fail typecheck (missing required props) and its assertions are obsolete. Replace the whole file:

```tsx
// src/__tests__/components/BudgetPressureView.test.tsx  (replace file contents)
import { render, screen } from '@testing-library/react';
import BudgetPressureView from '@/components/BudgetPressure/BudgetPressureView';
import type { TeamStats } from '@/types';
import type { ManagerTendency, Appetite, AppetitePos } from '@/lib/tendencies';

const stats = (id: number, handle: string, buyingPower: number): TeamStats => ({
  id,
  handle,
  displayName: handle,
  budget: 1000,
  spent: 0,
  remaining: buyingPower + 20,
  rosterCount: 5,
  rosterRemaining: 20,
  buyingPower,
  pkgCount: 0,
});

const posT = (position: AppetitePos, appetite: Appetite) => ({
  position,
  buys: 3,
  spend: 0,
  valueSum: 0,
  deltaSum: 0,
  avgDelta: null,
  overPct: null,
  spendShare: 0,
  appetite,
});

const tend = (teamId: number, handle: string): ManagerTendency => ({
  teamId,
  handle,
  displayName: handle,
  buys: 5,
  totalSpend: 500,
  totalValue: 480,
  overallOverPct: 0.04,
  topBuy: 120,
  lean: 'balanced',
  aggression: 'neutral',
  positions: {
    QB: posT('QB', 'neutral'),
    RB: posT('RB', 'neutral'),
    WR: posT('WR', 'neutral'),
    TE: posT('TE', 'neutral'),
  },
});

const teams: TeamStats[] = [stats(1, 'coreschke', 660), stats(2, 'rival_b', 40)];
const tendencies = [tend(1, 'coreschke'), tend(2, 'rival_b')];

describe('BudgetPressureView', () => {
  it('renders secondary market metrics and the threat board', () => {
    render(
      <BudgetPressureView
        teams={teams}
        tendencies={tendencies}
        livePosition="WR"
        liveName="Puka Nacua"
        ownerHandle="coreschke"
      />,
    );
    // Room Liquidity = 660 + 40 = 700; Low Power = 1 team under $50.
    expect(screen.getByText('$700')).toBeInTheDocument();
    expect(screen.getByText('1 teams')).toBeInTheDocument();
    // ThreatBoard is mounted with a row per team.
    expect(screen.getByTestId('threat-row-coreschke')).toBeInTheDocument();
    expect(screen.getByTestId('threat-row-rival_b')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Typecheck + run budget-related tests**

Run: `pnpm tsc --noEmit && pnpm test src/__tests__/ThreatBoard.test.tsx src/__tests__/components/BudgetPressureView.test.tsx`
Expected: PASS. (`prisma.nominatedPlayer` and `player.select` match the schema in `prisma/schema.prisma`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/BudgetPressure/BudgetPressureView.tsx src/app/draft/[draftId]/budget/page.tsx src/__tests__/components/BudgetPressureView.test.tsx
git commit -m "feat: Budget Pressure -> live threat board wiring"
```

---

## Task 9: Full quality gate + docs

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the full gate**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: all PASS. If any BudgetPressure/RosterTracker test references the removed `RosterTable`, old props, or removed testids, update it to the new shape (search: `grep -rn "RosterTable\|Most Dangerous\|Your Rank\|bp-[0-9]\|row-coreschke" src/__tests__`). Note: `src/__tests__/components/BudgetPressureView.test.tsx` is already rewritten in Task 8 — confirm it passes here.

- [ ] **Step 2: Update CLAUDE.md**

In `src/components` structure notes, change the descriptions:

- `BudgetPressure/` → "Live threat board — position selector + threat ranking (maxBid × revealed appetite) + 20s refresh"
- `RosterTracker/` → "Manager dossier grid — per-team scouting cards (lean/appetite/aggression), expandable grouped roster drawer"

In Key Library Files, add:

- `src/lib/tendencies.ts` — `computeTendencies` behavioral engine (per-manager lean/appetite/aggression); constants in `tendencies.constants.ts`
- `src/lib/threat.ts` — `maxBid`, `appetiteMultiplier`, `threatScore` for the Budget Pressure board

In the Pages & Routes table, update `/budget` and `/teams` purpose text to match the new jobs (threat board / manager dossier).

In "What's Built", update the `/budget` and `/teams` bullets to describe the diverged pages.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for diverged secondary pages"
```

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `make dev`, open `/draft/<id>/teams` and `/draft/<id>/budget`. Confirm: dossier cards render + expand to grouped drawers; threat board auto-selects a live nomination position and honors manual override; no console errors. Kill the dev server when done.

---

## Self-Review

**Spec coverage:**

- Tendency engine (keystone) → Tasks 1–2. `no-read` sample gate lives only in `classifyAppetite` (engine). ✓
- Team Rosters dossier board (cards, lean/aggression/appetite chips, no money on face, grouped drawer, sort control) → Tasks 4–6. ✓
- Budget Pressure threat board (position selector, live auto-select + override across refresh, `maxBid × appetite`, cold-start ×1.0, Room Liquidity + Low Power kept, Most Dangerous/Your Rank dropped) → Tasks 3, 7, 8. ✓
- Data flow (server fetch → engine → client; budget adds players + NominatedPlayer) → Tasks 6, 8. ✓
- Testing (engine unit, threat helper, dossier component, threat board component) → Tasks 2, 3, 4, 7. ✓
- Acceptance criteria (no needs framing; consistent appetite vocab/colors; gate passes) → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `ManagerTendency`/`PositionTendency`/`Appetite`/`AppetitePos`/`TendencyTeamInput` defined in Task 2/1 and used verbatim in Tasks 3–8. `computeTendencies(teams, players)` signature matches its call sites (teams page passes `rawTeams`+`players`; budget page passes `teams`+`{player,budget}[]`). `maxBid`/`threatScore`/`appetiteMultiplier` signatures consistent across Tasks 3, 7. ThreatBoard `livePosition: AppetitePos | null` matches the page's resolved value. ✓

One consistency note: the ThreatBoard `ranked` map looks up tendencies via `tendencies.find(t => t.teamId === team.id)`, matching `ManagerTendency.teamId` (there is no `id` field on `ManagerTendency`).

## Opus Pre-Execution Review — Applied Fixes

A critical Opus review ran against the real codebase before execution. Two CRITICAL issues were found and fixed inline:

1. **`AppetitePos` re-export (C1):** four consumers import `AppetitePos` from `@/lib/tendencies`, but Task 2 only imported it internally. Task 2 now re-exports it (`export type { AppetitePos } from './tendencies.constants'`).
2. **Orphaned `BudgetPressureView.test.tsx` (C2):** the existing test at `src/__tests__/components/BudgetPressureView.test.tsx` used the old two-prop signature and removed testids (`bp-1`, `row-coreschke`) — a guaranteed `tsc`/test failure. Task 8 Step 3 now rewrites it for the new props + ThreatBoard delegation, and the Task 9 grep was widened (`bp-[0-9]`, `row-coreschke`) so an orphaned test can't slip through again.

All other API usage, Prisma calls, tendency/threat math, and the derive-not-effect override design were verified correct by the review.
