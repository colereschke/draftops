# HARD-016: Make Configuration Labels Truthful — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded "12-team, Superflex, TE Premium, $1,000, 30-man" copy in `AuctionHeader`,
`BudgetPressureView`, `RosterTracker`, and the root metadata with labels derived from each draft's
actual stored settings.

**Architecture:** Add a small pure-function module (`src/lib/describeDraftSettings.ts`) that derives
the two facts that need real logic — lineup format (`Superflex` / `1QB` / `2QB`) and whether TE
Premium scoring is actually active. Each affected component gains optional props (defaulted to the
`Draft` schema's own defaults: 12 teams, $1,000, 30-man, Superflex) for team count, budget, roster
size, and starting lineup, and composes its caption from those props instead of literal strings. The
three server-component pages that already fetch `Draft` settings thread the real values down.

**Tech Stack:** Next.js 16 App Router (server components), React 19 client components, TypeScript
strict mode, Jest + React Testing Library.

## Global Constraints

- Single quotes, trailing commas, 2-space indent, 100-char line width (Prettier) — run `pnpm format`
  if unsure.
- No explicit `any`; no unused vars/imports.
- Every new/changed prop needs an explicit `interface`, no inline type literals.
- Select test elements by `data-testid`/`getByText` on stable copy — avoid brittle selectors.
- `pnpm tsc --noEmit` and `pnpm lint` must pass before considering any task done.
- Existing tests must keep passing unmodified wherever the new props are optional with backward-
  compatible defaults — do not touch call sites that don't need to change.
- No author attribution, no `Co-Authored-By`, in any commit.

---

## File Structure

| File                                                   | Responsibility                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `src/lib/describeDraftSettings.ts` (new)               | Pure functions: `formatLineupFormat`, `hasTePremium`.                             |
| `src/__tests__/describeDraftSettings.test.ts` (new)    | Unit tests for the two pure functions.                                            |
| `src/components/AuctionSheet/AuctionHeader.tsx`        | Composes the value-sheet settings caption.                                        |
| `src/__tests__/AuctionHeader.test.tsx`                 | Add caption-truthfulness assertions.                                              |
| `src/components/BudgetPressure/BudgetPressureView.tsx` | Composes the budget-page settings caption.                                        |
| `src/__tests__/components/BudgetPressureView.test.tsx` | Add caption-truthfulness assertions.                                              |
| `src/components/RosterTracker/RosterTracker.tsx`       | Composes the teams-page settings caption.                                         |
| `src/__tests__/RosterTracker.test.tsx`                 | Add caption-truthfulness assertion.                                               |
| `src/components/AuctionSheet/AuctionSheet.tsx`         | Threads new optional props through to `AuctionHeader`.                            |
| `src/__tests__/AuctionSheet.claimed.test.tsx`          | Add a prop-threading assertion via the existing `renderSheet` helper.             |
| `src/app/draft/[draftId]/page.tsx`                     | Passes real `teamCount`/`budget`/`rosterSize`/`startingLineup` to `AuctionSheet`. |
| `src/app/draft/[draftId]/budget/page.tsx`              | Passes real `budget`/`startingLineup` to `BudgetPressureView`.                    |
| `src/app/draft/[draftId]/teams/page.tsx`               | Passes real `startingLineup` to `RosterTracker`.                                  |
| `src/app/layout.tsx`                                   | Generic global metadata description (no baked-in league settings).                |

---

### Task 1: Shared draft-settings label derivation

**Files:**

- Create: `src/lib/describeDraftSettings.ts`
- Test: `src/__tests__/describeDraftSettings.test.ts`

**Interfaces:**

- Produces: `formatLineupFormat(startingLineup: StartingSlot[]): string` — returns `'Superflex'` if
  the lineup contains a `SUPER_FLEX` slot, otherwise `` `${qbSlotCount}QB` `` (minimum 1).
- Produces: `hasTePremium(scoringSettings: ScoringSettings): boolean` — true when `pprTE > pprWR` or
  `teFDBonus > wrFDBonus`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/describeDraftSettings.test.ts
import { formatLineupFormat, hasTePremium } from '@/lib/describeDraftSettings';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP, type StartingSlot } from '@/types';

describe('formatLineupFormat', () => {
  it('returns Superflex when the lineup includes a SUPER_FLEX slot', () => {
    expect(formatLineupFormat(DEFAULT_STARTING_LINEUP)).toBe('Superflex');
  });

  it('returns 1QB for a single-QB lineup with no superflex slot', () => {
    const lineup: StartingSlot[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
    expect(formatLineupFormat(lineup)).toBe('1QB');
  });

  it('returns 2QB for a two-QB lineup with no superflex slot', () => {
    const lineup: StartingSlot[] = ['QB', 'QB', 'RB', 'RB', 'WR', 'WR', 'TE'];
    expect(formatLineupFormat(lineup)).toBe('2QB');
  });
});

describe('hasTePremium', () => {
  it('is false for default scoring settings', () => {
    expect(hasTePremium(DEFAULT_SCORING_SETTINGS)).toBe(false);
  });

  it('is true when pprTE exceeds pprWR', () => {
    expect(hasTePremium({ ...DEFAULT_SCORING_SETTINGS, pprTE: 1.5 })).toBe(true);
  });

  it('is true when teFDBonus exceeds wrFDBonus', () => {
    expect(hasTePremium({ ...DEFAULT_SCORING_SETTINGS, teFDBonus: 0.25 })).toBe(true);
  });

  it('is false when TE and WR receiving settings are identical but both non-zero', () => {
    expect(hasTePremium({ ...DEFAULT_SCORING_SETTINGS, pprTE: 1.5, pprWR: 1.5 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest describeDraftSettings --no-coverage`
Expected: FAIL — `Cannot find module '@/lib/describeDraftSettings'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/describeDraftSettings.ts
import type { ScoringSettings, StartingSlot } from '@/types';

export function formatLineupFormat(startingLineup: StartingSlot[]): string {
  if (startingLineup.includes('SUPER_FLEX')) return 'Superflex';
  const qbSlots = startingLineup.filter((slot) => slot === 'QB').length;
  return `${Math.max(qbSlots, 1)}QB`;
}

export function hasTePremium(scoringSettings: ScoringSettings): boolean {
  return (
    scoringSettings.pprTE > scoringSettings.pprWR ||
    scoringSettings.teFDBonus > scoringSettings.wrFDBonus
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest describeDraftSettings --no-coverage`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/describeDraftSettings.ts src/__tests__/describeDraftSettings.test.ts
git commit -m "HARD-016: add shared draft-settings label derivation"
```

---

### Task 2: Truthful value-sheet header caption

**Files:**

- Modify: `src/components/AuctionSheet/AuctionHeader.tsx`
- Test: `src/__tests__/AuctionHeader.test.tsx`

**Interfaces:**

- Consumes: `formatLineupFormat`, `hasTePremium` from `@/lib/describeDraftSettings` (Task 1).
- Produces: `AuctionHeaderProps` gains `teamCount?: number` (default `12`), `budget?: number`
  (default `1000`), `rosterSize?: number` (default `30`), `startingLineup?: StartingSlot[]` (default
  `DEFAULT_STARTING_LINEUP`).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/AuctionHeader.test.tsx` (new `describe` block, after the existing "AuctionHeader
— TE caption" block):

```tsx
describe('AuctionHeader — settings caption', () => {
  it('defaults to the standard 12-team Superflex $1,000/30-man caption with no TE Premium segment', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
      />,
    );
    expect(
      screen.getByText('12-Team · Superflex · $1,000 Budget · 30-Man Rosters'),
    ).toBeInTheDocument();
  });

  it('reflects a 1QB, $200-budget, 10-team, 20-man draft truthfully', () => {
    render(
      <AuctionHeader
        ownerBudget={200}
        mySpent={0}
        remaining={200}
        posStats={POS_STATS}
        grandTotal={200}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
        teamCount={10}
        budget={200}
        rosterSize={20}
        startingLineup={['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX']}
      />,
    );
    expect(screen.getByText('10-Team · 1QB · $200 Budget · 20-Man Rosters')).toBeInTheDocument();
  });

  it('adds a TE Premium segment only when scoring settings actually grant one', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS, pprTE: 1.5 }}
      />,
    );
    expect(
      screen.getByText('12-Team · Superflex · TE Premium · $1,000 Budget · 30-Man Rosters'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest AuctionHeader --no-coverage`
Expected: FAIL — the first assertion doesn't match the still-hardcoded caption text (no `1QB`/`$200`
support yet; the "default" case string also fails today because the current caption always includes
the literal `TE Premium` segment even for default scoring settings).

- [ ] **Step 3: Write minimal implementation**

Replace the top of `src/components/AuctionSheet/AuctionHeader.tsx`:

```tsx
import type { ScoringSettings, StartingSlot } from '@/types';
import { DEFAULT_STARTING_LINEUP } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { formatLineupFormat, hasTePremium } from '@/lib/describeDraftSettings';

function teCaptionClause(scoringSettings: ScoringSettings): string {
  const pprDelta = scoringSettings.pprTE - scoringSettings.pprWR;
  const fdDelta = scoringSettings.teFDBonus - scoringSettings.wrFDBonus;
  const parts: string[] = [];
  if (pprDelta !== 0) parts.push(`PPR${pprDelta > 0 ? '+' : ''}${pprDelta}`);
  if (fdDelta !== 0) parts.push(`1st Down${fdDelta > 0 ? '+' : ''}${fdDelta}`);
  return parts.length > 0 ? ` · TE ${parts.join(' / ')}` : '';
}

interface AuctionHeaderProps {
  ownerBudget: number;
  mySpent: number;
  remaining: number;
  posStats: Record<'QB' | 'RB' | 'WR' | 'TE', { count: number; total: number }>;
  grandTotal: number;
  totalPlayerCount: number;
  scoringSettings: ScoringSettings;
  teamCount?: number;
  budget?: number;
  rosterSize?: number;
  startingLineup?: StartingSlot[];
}

const MARKET_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

export default function AuctionHeader({
  ownerBudget,
  mySpent,
  remaining,
  posStats,
  grandTotal,
  totalPlayerCount,
  scoringSettings,
  teamCount = 12,
  budget = 1000,
  rosterSize = 30,
  startingLineup = DEFAULT_STARTING_LINEUP,
}: AuctionHeaderProps) {
  const safeGrandTotal = grandTotal || 1;
  const settingsCaption = [
    `${teamCount}-Team`,
    formatLineupFormat(startingLineup),
    ...(hasTePremium(scoringSettings) ? ['TE Premium'] : []),
    `$${budget.toLocaleString()} Budget`,
    `${rosterSize}-Man Rosters`,
  ].join(' · ');
```

Then replace the hardcoded caption `<div>` (previously the literal
`12-Team · Superflex · TE Premium · $1,000 Budget · 30-Man Rosters` text) with:

```tsx
<div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
  {settingsCaption}
</div>
```

Leave the rest of the component (the `h1`, the `2QB rankings scaled 5×...` subtitle, `MetricCard`,
open-value-mix section) unchanged. The `2QB` in that subtitle is intentionally left alone: it
describes the fixed FantasyCalc source-data methodology (`src/data/players.ts`'s 2QB Auction column),
not the draft's own lineup format, so it is not in scope for this ticket even though it can look odd
next to a truthful `1QB`/`Superflex` caption above it for a non-Superflex draft.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest AuctionHeader --no-coverage`
Expected: PASS — all `AuctionHeader` tests (existing + 3 new) pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/AuctionHeader.tsx src/__tests__/AuctionHeader.test.tsx
git commit -m "HARD-016: derive the value-sheet settings caption from real draft settings"
```

---

### Task 3: Truthful budget-page caption

**Files:**

- Modify: `src/components/BudgetPressure/BudgetPressureView.tsx`
- Test: `src/__tests__/components/BudgetPressureView.test.tsx`

**Interfaces:**

- Consumes: `formatLineupFormat` from `@/lib/describeDraftSettings` (Task 1).
- Produces: `BudgetPressureViewProps` gains `budget?: number` (default `1000`),
  `startingLineup?: StartingSlot[]` (default `DEFAULT_STARTING_LINEUP`).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/components/BudgetPressureView.test.tsx`:

```tsx
it('reflects a non-default budget and lineup format truthfully', () => {
  render(
    <BudgetPressureView
      teams={teams}
      tendencies={tendencies}
      livePosition="WR"
      liveName="Puka Nacua"
      ownerHandle="coreschke"
      budget={200}
      startingLineup={['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX']}
    />,
  );
  expect(screen.getByText('2-Team · 1QB · $200 Budget · Live Threat')).toBeInTheDocument();
});
```

(`teams` in this test file has 2 entries, so the existing default-props test's caption reads
`2-Team · Superflex · $1,000 Budget · Live Threat` — add that as the first new test too, replacing
implicit knowledge with an explicit assertion:)

```tsx
it('defaults to Superflex and the $1,000 budget caption when settings are not provided', () => {
  render(
    <BudgetPressureView
      teams={teams}
      tendencies={tendencies}
      livePosition="WR"
      liveName="Puka Nacua"
      ownerHandle="coreschke"
    />,
  );
  expect(screen.getByText('2-Team · Superflex · $1,000 Budget · Live Threat')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest BudgetPressureView --no-coverage`
Expected: FAIL — `budget`/`startingLineup` props don't exist yet and the caption is still the literal
hardcoded string, so the `1QB`/`$200` case fails (the default-caption case happens to already read
correctly today only because `Superflex` and `$1,000` are coincidentally still hardcoded — but there's
no `budget`/`startingLineup` prop on the type yet, so TypeScript will fail this test file).

- [ ] **Step 3: Write minimal implementation**

In `src/components/BudgetPressure/BudgetPressureView.tsx`:

```tsx
import type { TeamStats, StartingSlot } from '@/types';
import { DEFAULT_STARTING_LINEUP } from '@/types';
import type { ManagerTendency, AppetitePos } from '@/lib/tendencies';
import { formatLineupFormat } from '@/lib/describeDraftSettings';
import BudgetRefresher from './BudgetRefresher';
import ThreatBoard from './ThreatBoard';

interface BudgetPressureViewProps {
  teams: TeamStats[];
  tendencies: ManagerTendency[];
  livePosition: AppetitePos | null;
  liveName: string | null;
  ownerHandle: string | null;
  budget?: number;
  startingLineup?: StartingSlot[];
}

export default function BudgetPressureView({
  teams,
  tendencies,
  livePosition,
  liveName,
  ownerHandle,
  budget = 1000,
  startingLineup = DEFAULT_STARTING_LINEUP,
}: BudgetPressureViewProps) {
  const roomLiquidity = teams.reduce((sum, team) => sum + team.buyingPower, 0);
  const lowPowerCount = teams.filter((team) => team.buyingPower < 50).length;
  const settingsCaption = [
    `${teams.length}-Team`,
    formatLineupFormat(startingLineup),
    `$${budget.toLocaleString()} Budget`,
    'Live Threat',
  ].join(' · ');
```

Then replace the hardcoded caption `<div>` with:

```tsx
<div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
  {settingsCaption}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest BudgetPressureView --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BudgetPressure/BudgetPressureView.tsx src/__tests__/components/BudgetPressureView.test.tsx
git commit -m "HARD-016: derive the budget-page settings caption from real draft settings"
```

---

### Task 4: Truthful teams-page caption

**Files:**

- Modify: `src/components/RosterTracker/RosterTracker.tsx`
- Test: `src/__tests__/RosterTracker.test.tsx`

**Interfaces:**

- Consumes: `formatLineupFormat` from `@/lib/describeDraftSettings` (Task 1).
- Produces: `RosterTrackerProps` gains `startingLineup?: StartingSlot[]` (default
  `DEFAULT_STARTING_LINEUP`).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/RosterTracker.test.tsx` (top-level `describe('RosterTracker', ...)` block, after
the existing "pins the owner first" test):

```tsx
it('reflects the lineup format truthfully instead of a hardcoded Superflex label', () => {
  render(
    <RosterTracker
      teams={[makeTeam()]}
      tendencies={[makeTendency()]}
      ownerHandle="coreschke"
      startingLineup={['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX']}
    />,
  );
  expect(screen.getByText('1-Team · 1QB · Manager Scouting')).toBeInTheDocument();
});

it('defaults to Superflex when no starting lineup is provided', () => {
  render(
    <RosterTracker teams={[makeTeam()]} tendencies={[makeTendency()]} ownerHandle="coreschke" />,
  );
  expect(screen.getByText('1-Team · Superflex · Manager Scouting')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest RosterTracker --no-coverage`
Expected: FAIL — `startingLineup` is not an assignable prop on `RosterTrackerProps` yet
(TypeScript error surfaced through `ts-jest`/Next's Jest transform).

- [ ] **Step 3: Write minimal implementation**

In `src/components/RosterTracker/RosterTracker.tsx`, update the imports and props:

```tsx
import type { TeamWithRoster, StartingSlot } from '@/types';
import { DEFAULT_STARTING_LINEUP } from '@/types';
import type { AppetitePos, ManagerTendency } from '@/lib/tendencies';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';
import { POS_COLORS } from '@/lib/posColors';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { formatLineupFormat } from '@/lib/describeDraftSettings';
import DossierCard from './DossierCard';
import TeamDetailPane from './TeamDetailPane';

interface RosterTrackerProps {
  teams: TeamWithRoster[];
  tendencies: ManagerTendency[];
  ownerHandle: string | null;
  startingLineup?: StartingSlot[];
}
```

Update the function signature:

```tsx
export default function RosterTracker({
  teams,
  tendencies,
  ownerHandle,
  startingLineup = DEFAULT_STARTING_LINEUP,
}: RosterTrackerProps) {
```

Replace the hardcoded caption line:

```tsx
<div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
  {totalTeams}-Team · {formatLineupFormat(startingLineup)} · Manager Scouting
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest RosterTracker --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/RosterTracker/RosterTracker.tsx src/__tests__/RosterTracker.test.tsx
git commit -m "HARD-016: derive the teams-page settings caption from real draft settings"
```

---

### Task 5: Thread settings props through `AuctionSheet`

**Files:**

- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Test: `src/__tests__/AuctionSheet.claimed.test.tsx`

**Interfaces:**

- Consumes: `AuctionHeaderProps`'s new optional fields (Task 2).
- Produces: `AuctionSheetProps` gains `teamCount?: number`, `budget?: number`, `rosterSize?: number`,
  `startingLineup?: StartingSlot[]` (same defaults as Task 2), forwarded to `AuctionHeader`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/AuctionSheet.claimed.test.tsx` (new test in the existing
`describe('AuctionSheet with claimed bids', ...)` block, using the existing `renderSheet` helper):

```tsx
it('threads league settings through to the header caption', () => {
  renderSheet({
    teamCount: 8,
    budget: 200,
    rosterSize: 16,
    startingLineup: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'],
  });

  expect(screen.getByText('8-Team · 1QB · $200 Budget · 16-Man Rosters')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest AuctionSheet.claimed --no-coverage`
Expected: FAIL — `teamCount`/`budget`/`rosterSize`/`startingLineup` aren't valid `AuctionSheet` props
yet (TypeScript error via the `React.ComponentProps<typeof AuctionSheet>` overrides type).

- [ ] **Step 3: Write minimal implementation**

In `src/components/AuctionSheet/AuctionSheet.tsx`, update the top-of-file import and props:

```tsx
import type {
  Player,
  Position,
  ClaimedBid,
  LeagueTeam,
  ScoringSettings,
  StartingSlot,
} from '@/types';
import { DEFAULT_STARTING_LINEUP } from '@/types';
```

```tsx
interface AuctionSheetProps {
  players: Player[];
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  nominatedPlayers: Array<number | string>;
  draftId: number;
  ownerHandle: string | null;
  ownerBudget: number;
  scoringSettings: ScoringSettings;
  teamCount?: number;
  budget?: number;
  rosterSize?: number;
  startingLineup?: StartingSlot[];
  sleeperSyncConfigured?: boolean;
  sleeperLeagueId?: string | null;
  isReadOnly?: boolean;
}
```

```tsx
export default function AuctionSheet({
  players,
  claimedBids,
  teams,
  nominatedPlayers,
  draftId,
  ownerHandle,
  ownerBudget,
  scoringSettings,
  teamCount = 12,
  budget = 1000,
  rosterSize = 30,
  startingLineup = DEFAULT_STARTING_LINEUP,
  sleeperSyncConfigured = false,
  sleeperLeagueId = null,
  isReadOnly = false,
}: AuctionSheetProps) {
```

Then update the `<AuctionHeader ... />` call (around line 354) to forward the new props:

```tsx
<AuctionHeader
  ownerBudget={ownerBudget}
  mySpent={mySpent}
  remaining={remaining}
  posStats={posStats}
  grandTotal={grandTotal}
  totalPlayerCount={totalPlayerCount}
  scoringSettings={scoringSettings}
  teamCount={teamCount}
  budget={budget}
  rosterSize={rosterSize}
  startingLineup={startingLineup}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest AuctionSheet.claimed --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/AuctionSheet.claimed.test.tsx
git commit -m "HARD-016: thread real draft settings from AuctionSheet to its header"
```

---

### Task 6: Pass real draft settings from the three server pages

**Files:**

- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/app/draft/[draftId]/budget/page.tsx`
- Modify: `src/app/draft/[draftId]/teams/page.tsx`

**Interfaces:**

- Consumes: `AuctionSheetProps.teamCount/budget/rosterSize/startingLineup` (Task 5),
  `BudgetPressureViewProps.budget/startingLineup` (Task 3), `RosterTrackerProps.startingLineup`
  (Task 4).
- Produces: nothing new — this task only wires existing `Draft` fields (`draft.teamCount`,
  `draft.budget`, `draft.rosterSize`, `draft.startingLineup`) already returned by `getDraft` into the
  props added above.

This task changes only server components that fetch from a real Postgres database, so there is no
practical unit test — TypeScript strictness on the prop types is the compile-time check, and Step 2
(dev-server smoke check) is the runtime check. Do not skip Step 2.

- [ ] **Step 1: Update `src/app/draft/[draftId]/page.tsx`**

Extract the `startingLineup` local variable (used in two places) and pass the new props to
`<AuctionSheet>`:

```tsx
const startingLineup = (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[];

const activePlayers = await getActiveDraftPlayers({
  draftId,
  bids: rawBids.map((bid) => ({
    player: bid.player,
    price: bid.price,
    teamHandle: bid.team.handle,
  })),
  startingLineup,
  futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
});
```

(Replaces the previous inline `startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as
StartingSlot[],` line — keep everything else in the `getActiveDraftPlayers` call as-is.)

Then update the `<AuctionSheet ... />` call to add the four new props:

```tsx
<AuctionSheet
  players={players}
  claimedBids={claimedBids}
  teams={teams as LeagueTeam[]}
  nominatedPlayers={nominatedEntries.map((entry) => entry.playerId)}
  draftId={draftId}
  ownerHandle={draft.ownerTeam?.handle ?? null}
  ownerBudget={draft.ownerTeam?.budget ?? 1000}
  scoringSettings={(draft.scoringSettings ?? DEFAULT_SCORING_SETTINGS) as ScoringSettings}
  teamCount={draft.teamCount}
  budget={draft.budget}
  rosterSize={draft.rosterSize}
  startingLineup={startingLineup}
  sleeperSyncConfigured={sleeperSyncConfigured}
  sleeperLeagueId={draft.sleeperLeagueId}
  isReadOnly={draft.status === 'COMPLETE'}
/>
```

- [ ] **Step 2: Update `src/app/draft/[draftId]/budget/page.tsx`**

Extract the `startingLineup` local variable and pass `budget`/`startingLineup` to
`<BudgetPressureView>`:

```tsx
const startingLineup = (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[];

const players = await getActiveDraftPlayers({
  draftId,
  bids,
  startingLineup,
  futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
});
```

```tsx
return (
  <BudgetPressureView
    teams={teamStats}
    tendencies={tendencies}
    livePosition={live?.position ?? null}
    liveName={live?.name ?? null}
    ownerHandle={draft.ownerTeam?.handle ?? null}
    budget={draft.budget}
    startingLineup={startingLineup}
  />
);
```

- [ ] **Step 3: Update `src/app/draft/[draftId]/teams/page.tsx`**

Extract the `startingLineup` local variable and pass it to `<RosterTracker>`:

```tsx
const startingLineup = (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[];

const players = await getActiveDraftPlayers({
  draftId,
  bids,
  startingLineup,
  futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
});
```

```tsx
return (
  <RosterTracker
    teams={teams}
    tendencies={tendencies}
    ownerHandle={draft.ownerTeam?.handle ?? null}
    startingLineup={startingLineup}
  />
);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual dev-server smoke check**

**Verified against the live database before writing this step:** the production draft (`id: 1`,
"Cole's Draft 2025") has `teamCount: 12`, `budget: 1000`, `rosterSize: 30`, but **`startingLineup:
null` and `scoringSettings: null`** — both pages already fall back to `DEFAULT_STARTING_LINEUP` /
`DEFAULT_SCORING_SETTINGS` at render time (the `?? DEFAULT_...` pattern already in each page). Since
`DEFAULT_SCORING_SETTINGS` has `pprTE === pprWR === 1` and `teFDBonus === wrFDBonus === 0`,
`hasTePremium(DEFAULT_SCORING_SETTINGS)` is `false`.

**This means the value-sheet caption's `TE Premium` segment will disappear for the live draft after
this change** — this is not a regression to chase down, it is the bug this ticket exists to fix: the
old hardcoded caption always claimed `TE Premium` regardless of whether the draft's scoring actually
grants one, and this draft's recorded scoring settings do not. (Per `CLAUDE.md`, this league's TE
advantage is expressed through the ETR seed-value pipeline's legacy 1.18 TE multiplier, not through
`scoringSettings` — those two mechanisms are independent, and this ticket only makes the
`scoringSettings`-derived label truthful.) If you believe the live league's `scoringSettings` should
actually encode a raw TE premium (so the label reappears correctly), that is a data-fix in the
`Draft` row, not a change to this plan or its code.

Run: `pnpm dev` (in the background), then in a browser visit `/draft/1`, `/draft/1/budget`, and
`/draft/1/teams`. Confirm each caption reads:

- Value sheet: `12-Team · Superflex · $1,000 Budget · 30-Man Rosters` (no `TE Premium` segment)
- Budget page: `12-Team · Superflex · $1,000 Budget · Live Threat`
- Teams page: `12-Team · Superflex · Manager Scouting`

Stop the dev server afterward.

- [ ] **Step 6: Commit**

```bash
git add "src/app/draft/[draftId]/page.tsx" "src/app/draft/[draftId]/budget/page.tsx" "src/app/draft/[draftId]/teams/page.tsx"
git commit -m "HARD-016: pass real draft settings into the value-sheet/budget/teams pages"
```

---

### Task 7: Generic global metadata

**Files:**

- Modify: `src/app/layout.tsx`

**Interfaces:** none — this is a static string change only.

- [ ] **Step 1: Edit the metadata description**

In `src/app/layout.tsx`, replace:

```tsx
export const metadata: Metadata = {
  title: 'DraftOps | Dynasty Auction Tool',
  description: '12-team Superflex dynasty auction tracker with live budget management',
};
```

with:

```tsx
export const metadata: Metadata = {
  title: 'DraftOps | Dynasty Auction Tool',
  description: 'Fantasy football dynasty auction draft tracker with live budget management',
};
```

- [ ] **Step 2: Verify no other file references the old string**

Run: `grep -rn "12-team Superflex" src`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "HARD-016: make global page metadata generic across league settings"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck, lint, format check**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm format:check`
Expected: all clean.

- [ ] **Step 2: Full unit test suite**

Run: `pnpm test`
Expected: all suites pass (baseline was 94 suites / 855 tests before this branch's changes; expect
that count plus the new tests added in Tasks 1-5).

- [ ] **Step 3: Grep sweep for any remaining hardcoded league-default strings**

Run: `grep -rn '12-Team\|12-team\|30-Man\|\$1,000 Budget' src --include="*.tsx" --include="*.ts" | grep -v __tests__`
Expected: no matches outside test fixtures (the only remaining `$1,000`/`12-Team`/`30-Man` occurrences
should be inside `src/__tests__/**`, asserting the _default-props_ case, not literal component copy).

- [ ] **Step 4: Confirm no stray files**

Run: `git status`
Expected: only the files touched by Tasks 1-7, plus this plan document if kept.

No commit in this task — it is verification only. If this plan document should not be committed per
the project's "don't commit trivial superpowers docs" rule, decide at the end of `finishing-a-
development-branch` whether this plan is worth keeping (it documents a non-obvious `Superflex`/`1QB`/
`2QB` derivation rule, so it is reasonable to keep).

---

## Explicitly Out of Scope

The audit's implementation direction step 3 for HARD-016 ("Display active value source/projection
date and completed/read-only status") is **not** implemented by this plan:

- Completed/read-only status is already handled by the `DraftReadOnlyBanner` shipped in HARD-001 —
  it is a distinct, already-satisfied requirement, not a gap this ticket needs to close.
- Surfacing the active projection source/date on these captions is a UX addition, not a truthfulness
  fix — none of HARD-016's acceptance criteria (1QB/Superflex/$200/$1,000 fixtures; no league-default
  string in a reusable caption) require it. Adding it would mean threading
  `DraftProjectionValueSet` activation metadata through three more server components, which is a
  larger, separable change. Flag it as a follow-up if the reviewer wants it folded in here instead of
  a future ticket.
