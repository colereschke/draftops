# League Settings & Player Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable league settings to `Draft`, create a per-draft `Player` table seeded from ETR base values, update the draft creation form, and wire all pages to read players from the DB instead of the static `players.ts` import.

**Architecture:** Three-PR arc — schema migration, form + player seeding, page wiring. Player values are seeded 1:1 from base ETR data with no algorithm adjustment yet (#5b slots in after this lands). The JSON settings fields (`startingLineup`, `scoringSettings`, `targetRoster`) are nullable in the schema; consumers fall back to typed defaults for pre-existing rows.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 strict, Prisma 7 + PostgreSQL (`@prisma/adapter-pg`), pnpm 11, Jest + React Testing Library.

## Global Constraints

- pnpm only — no npm or yarn
- All commits must pass pre-commit hook: `pnpm tsc --noEmit` + `pnpm lint-staged` (Husky enforces — never use `--no-verify`)
- `pnpm test` must pass after every task before committing
- Prisma migrations: `pnpm prisma migrate dev --name <desc>` only — never `db push` in dev
- `pnpm prisma generate` must be re-run after any schema change before TypeScript will see new types
- Import alias `@/*` maps to `src/*`
- DB field names: `name` / `nflTeam` in `Player` model → map to `player` / `team` in the `Player` TypeScript interface at every query site
- Tests: select by `data-testid` or `id`; typed fixtures using types from `src/types/`
- Server actions live in `'use server'` files; client components need `'use client'`
- No author attribution in commit messages

---

## File Map

### PR A — Schema + Types

- Modify: `src/types/index.ts`
- Modify: `prisma/schema.prisma`
- Auto-generated: `prisma/migrations/<ts>_league_settings_and_player_table/migration.sql`

### PR B — Form + Seeding

- Modify: `src/app/drafts/new/page.tsx`
- Modify: `src/lib/actions.ts`
- Modify: `src/__tests__/createDraft.test.ts`
- New: `prisma/seed-players.ts`

### PR C — Page Wiring

- Modify: `src/lib/computeTeamStats.ts`
- Modify: `src/__tests__/computeTeamStats.test.ts`
- Modify: `src/app/draft/[draftId]/teams/page.tsx`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/__tests__/AuctionSheet.claimed.test.tsx`
- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Modify: `src/app/draft/[draftId]/nominate/page.tsx`

---

## Task 1: TypeScript Types

**Files:**

- Modify: `src/types/index.ts`

**Interfaces:**

- Produces: `StartingSlot`, `ScoringSettings`, `DEFAULT_STARTING_LINEUP`, `DEFAULT_SCORING_SETTINGS`, `DEFAULT_TARGET_ROSTER` — consumed by Tasks 3, 4, 5, 6, and all PR C tasks

- [ ] **Step 1: Add types and defaults to `src/types/index.ts`**

Append after the existing exports:

```typescript
export type StartingSlot = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'SUPER_FLEX';

// Must be `type` (not `interface`) — Prisma's InputJsonValue requires an implicit
// string index signature, which TypeScript only infers on type aliases, not interfaces.
export type ScoringSettings = {
  // Passing
  passYdsPerPoint: number; // yards per point, e.g. 25 = 1pt per 25 passing yards
  passTD: number; // passing TD points
  passInt: number; // points per interception (stored negative)

  // Rushing — position-agnostic; mobile QBs benefit proportionally
  rushAtt: number; // bonus per rush attempt
  rushFD: number; // bonus per rushing first down

  // Receiving — effective PPR per position
  pprRB: number; // points per RB reception
  pprWR: number; // points per WR reception
  pprTE: number; // points per TE reception

  // Receiving first down bonuses — base applies to all, position adds on top
  recFD: number; // base per receiving first down, all positions
  rbFDBonus: number; // extra per RB receiving first down
  wrFDBonus: number; // extra per WR receiving first down
  teFDBonus: number; // extra per TE receiving first down
};

export const DEFAULT_STARTING_LINEUP: StartingSlot[] = [
  'QB',
  'RB',
  'RB',
  'WR',
  'WR',
  'TE',
  'FLEX',
  'FLEX',
  'FLEX',
  'SUPER_FLEX',
];

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  passYdsPerPoint: 25,
  passTD: 4,
  passInt: -2,
  rushAtt: 0,
  rushFD: 0,
  pprRB: 1,
  pprWR: 1,
  pprTE: 1,
  recFD: 0,
  rbFDBonus: 0,
  wrFDBonus: 0,
  teFDBonus: 0,
};

export const DEFAULT_TARGET_ROSTER: Partial<Record<Position, number>> = {
  QB: 4,
  RB: 9,
  WR: 11,
  TE: 3,
};
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add StartingSlot, ScoringSettings types and defaults"
```

---

## Task 2: Schema Migration

**Files:**

- Modify: `prisma/schema.prisma`
- Auto-generated: migration SQL

**Interfaces:**

- Produces: `Draft` with new fields; `Player` model — consumed by Tasks 5, 6, 7, 8, 9

- [ ] **Step 1: Add new fields to `Draft` and add `Player` model in `prisma/schema.prisma`**

In the `Draft` model, after the existing `createdAt` field, add:

```prisma
teamCount       Int    @default(12)
rosterSize      Int    @default(30)
budget          Int    @default(1000)
startingLineup  Json?
scoringSettings Json?
targetRoster    Json?
players         Player[]
```

Add the new `Player` model after the `NominatedPlayer` model:

```prisma
model Player {
  id      Int    @id @default(autoincrement())
  name    String
  nflTeam String
  pos     String
  age     Float?  // Float not Int — players.ts stores decimal ages (e.g. 23.8, 30.1)
  sfRank  Int
  budget  Int
  ceiling Int
  floor   Int
  notes   String @default("")
  draftId Int
  draft   Draft  @relation(fields: [draftId], references: [id])

  @@unique([name, draftId])
}
```

- [ ] **Step 2: Run migration**

```bash
pnpm prisma migrate dev --name league_settings_and_player_table
```

Expected output: `The following migration(s) have been applied: ...league_settings_and_player_table`

- [ ] **Step 3: Regenerate Prisma client**

```bash
pnpm prisma generate
```

- [ ] **Step 4: Verify TypeScript still compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors. If you see `Property 'player' does not exist on type 'PrismaClient'`, the generate step didn't complete — re-run it.

- [ ] **Step 5: Run tests to confirm nothing broken**

```bash
pnpm test
```

Expected: all existing tests pass. (The migration only adds nullable fields and a new table; no existing queries break.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add league settings fields and Player model to schema"
```

---

## Task 3: Form — Roster Settings + Starting Lineup

**Files:**

- Modify: `src/app/drafts/new/page.tsx`

**Interfaces:**

- Consumes: `StartingSlot`, `DEFAULT_STARTING_LINEUP`, `DEFAULT_TARGET_ROSTER` from `src/types/index.ts`
- Produces: form UI for rosterSize, targetRoster, startingLineup — wired into submit in Task 5

- [ ] **Step 1: Add new state and handler functions to `NewDraftPage`**

Add these imports at the top of `src/app/drafts/new/page.tsx`:

```typescript
import type { StartingSlot } from '@/types';
import { DEFAULT_STARTING_LINEUP, DEFAULT_TARGET_ROSTER } from '@/types';
```

Add these state declarations inside `NewDraftPage` (after the existing `useState` calls):

```typescript
const [rosterSize, setRosterSize] = useState(30);
const [targetRoster, setTargetRoster] = useState<Record<'QB' | 'RB' | 'WR' | 'TE', number>>({
  QB: DEFAULT_TARGET_ROSTER.QB ?? 4,
  RB: DEFAULT_TARGET_ROSTER.RB ?? 9,
  WR: DEFAULT_TARGET_ROSTER.WR ?? 11,
  TE: DEFAULT_TARGET_ROSTER.TE ?? 3,
});
const [startingLineup, setStartingLineup] = useState<StartingSlot[]>([...DEFAULT_STARTING_LINEUP]);
```

Add these handler functions inside `NewDraftPage` (after `updateTeam`):

```typescript
const SLOT_OPTIONS: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];

function addSlot() {
  setStartingLineup((prev) => [...prev, 'FLEX']);
}

function removeSlot(index: number) {
  setStartingLineup((prev) => prev.filter((_, i) => i !== index));
}

function updateSlot(index: number, slot: StartingSlot) {
  setStartingLineup((prev) => prev.map((s, i) => (i === index ? slot : s)));
}
```

- [ ] **Step 2: Add Roster Settings card to the form JSX**

Insert this card after the existing Draft Info card (after the `</div>` that closes the Draft name/teams/budget section), before the Team Roster Table card:

```tsx
{
  /* --- Roster Settings --- */
}
<div
  style={{
    background: 'var(--bg-surface)',
    borderRadius: '6px',
    padding: '1.25rem',
    marginBottom: '1rem',
  }}
>
  <div style={sectionHeaderStyle}>Roster Settings</div>
  <label style={{ ...labelStyle, maxWidth: '160px', marginBottom: '0.75rem' }}>
    Roster size
    <input
      data-testid="roster-size-input"
      type="number"
      min={10}
      max={60}
      value={rosterSize}
      onChange={(e) => setRosterSize(parseInt(e.target.value, 10) || 30)}
      style={inputStyle}
    />
  </label>
  <div style={colHeaderStyle}>Target roster slots</div>
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '0.5rem',
      marginTop: '0.4rem',
    }}
  >
    {(['QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
      <label key={pos} style={labelStyle}>
        {pos}
        <input
          data-testid={`target-roster-${pos}`}
          type="number"
          min={0}
          value={targetRoster[pos]}
          onChange={(e) =>
            setTargetRoster((prev) => ({ ...prev, [pos]: parseInt(e.target.value, 10) || 0 }))
          }
          style={inputStyle}
        />
      </label>
    ))}
  </div>
</div>;

{
  /* --- Starting Lineup --- */
}
<div
  style={{
    background: 'var(--bg-surface)',
    borderRadius: '6px',
    padding: '1.25rem',
    marginBottom: '1rem',
  }}
>
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '0.5rem',
    }}
  >
    <div style={sectionHeaderStyle}>Starting Lineup</div>
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
      }}
    >
      {startingLineup.length} slots
    </span>
  </div>

  {startingLineup.map((slot, i) => (
    <div
      key={i}
      style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}
    >
      <select
        data-testid={`lineup-slot-${i}`}
        value={slot}
        onChange={(e) => updateSlot(i, e.target.value as StartingSlot)}
        style={{ ...inputStyle, flex: 1 }}
      >
        {SLOT_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-testid={`remove-lineup-slot-${i}`}
        onClick={() => removeSlot(i)}
        disabled={startingLineup.length <= 1}
        style={{
          background: 'none',
          border: '1px solid #3a3f50',
          color: 'var(--text-secondary)',
          borderRadius: '4px',
          padding: '0.2rem 0.5rem',
          cursor: startingLineup.length <= 1 ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem',
        }}
      >
        ×
      </button>
    </div>
  ))}

  <button
    type="button"
    data-testid="add-lineup-slot"
    onClick={addSlot}
    style={{
      marginTop: '0.4rem',
      background: 'none',
      border: '1px solid #3a3f50',
      color: 'var(--text-secondary)',
      borderRadius: '4px',
      padding: '0.3rem 0.75rem',
      fontFamily: 'var(--font-barlow)',
      fontSize: '0.8rem',
      cursor: 'pointer',
    }}
  >
    + Add slot
  </button>
</div>;
```

Add the `sectionHeaderStyle` constant at the bottom of the file alongside `labelStyle` and `inputStyle`:

```typescript
const sectionHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.75rem',
};
```

- [ ] **Step 3: Verify it compiles**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 4: Write tests for roster settings and lineup interactions**

Create `src/__tests__/drafts-new-form.test.tsx`:

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NewDraftPage from '@/app/drafts/new/page';

jest.mock('@/lib/actions', () => ({
  createDraft: jest.fn(),
}));

describe('NewDraftPage — roster settings and lineup', () => {
  it('renders the roster size input with default 30', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('roster-size-input');
    expect(input.value).toBe('30');
  });

  it('renders target roster inputs for all four positions', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLInputElement>('target-roster-QB').value).toBe('4');
    expect(screen.getByTestId<HTMLInputElement>('target-roster-RB').value).toBe('9');
    expect(screen.getByTestId<HTMLInputElement>('target-roster-WR').value).toBe('11');
    expect(screen.getByTestId<HTMLInputElement>('target-roster-TE').value).toBe('3');
  });

  it('renders 10 starting lineup slots by default', () => {
    render(<NewDraftPage />);
    const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
    expect(slots).toHaveLength(10);
  });

  it('first slot defaults to QB and last slot defaults to SUPER_FLEX', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-0').value).toBe('QB');
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-9').value).toBe('SUPER_FLEX');
  });

  it('adds a FLEX slot when Add slot is clicked', () => {
    render(<NewDraftPage />);
    fireEvent.click(screen.getByTestId('add-lineup-slot'));
    const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
    expect(slots).toHaveLength(11);
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-10').value).toBe('FLEX');
  });

  it('removes the correct slot when × is clicked', () => {
    render(<NewDraftPage />);
    // Remove slot 0 (QB)
    fireEvent.click(screen.getByTestId('remove-lineup-slot-0'));
    const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
    expect(slots).toHaveLength(9);
    // Slot 0 should now be what was previously slot 1 (RB)
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-0').value).toBe('RB');
  });

  it('changes slot type when a different option is selected', () => {
    render(<NewDraftPage />);
    fireEvent.change(screen.getByTestId('lineup-slot-0'), { target: { value: 'SUPER_FLEX' } });
    expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-0').value).toBe('SUPER_FLEX');
  });
});
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
pnpm test drafts-new-form
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/drafts/new/page.tsx src/__tests__/drafts-new-form.test.tsx
git commit -m "feat: add roster settings and starting lineup sections to draft creation form"
```

---

## Task 4: Form — Scoring Section + Lineup Validation

**Files:**

- Modify: `src/app/drafts/new/page.tsx`
- Modify: `src/__tests__/drafts-new-form.test.tsx`

**Interfaces:**

- Consumes: `ScoringSettings`, `DEFAULT_SCORING_SETTINGS` from `src/types/index.ts`
- Produces: complete form UI; `scoringSettings` state; lineup validation — consumed by Task 5

- [ ] **Step 1: Add scoring settings state and updater to `NewDraftPage`**

Add import to `src/app/drafts/new/page.tsx`:

```typescript
import type { ScoringSettings } from '@/types';
import { DEFAULT_SCORING_SETTINGS } from '@/types';
```

Add state inside `NewDraftPage`:

```typescript
const [scoringSettings, setScoringSettings] = useState<ScoringSettings>({
  ...DEFAULT_SCORING_SETTINGS,
});
```

Add updater function:

```typescript
function updateScoring<K extends keyof ScoringSettings>(key: K, value: ScoringSettings[K]) {
  setScoringSettings((prev) => ({ ...prev, [key]: value }));
}
```

- [ ] **Step 2: Add Scoring card to the form JSX**

Insert this card after the Starting Lineup card, before the Team Roster Table card:

```tsx
{
  /* --- Scoring --- */
}
<div
  style={{
    background: 'var(--bg-surface)',
    borderRadius: '6px',
    padding: '1.25rem',
    marginBottom: '1rem',
  }}
>
  <div style={sectionHeaderStyle}>Scoring</div>

  {/* Passing */}
  <div style={{ marginBottom: '0.875rem' }}>
    <div style={subSectionStyle}>Passing</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
      <label style={labelStyle}>
        Yds / point
        <input
          data-testid="scoring-passYdsPerPoint"
          type="number"
          min={1}
          step={5}
          value={scoringSettings.passYdsPerPoint}
          onChange={(e) => updateScoring('passYdsPerPoint', parseFloat(e.target.value) || 25)}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Passing TD
        <select
          data-testid="scoring-passTD"
          value={scoringSettings.passTD}
          onChange={(e) => updateScoring('passTD', parseFloat(e.target.value))}
          style={inputStyle}
        >
          <option value={4}>4</option>
          <option value={6}>6</option>
        </select>
      </label>
      <label style={labelStyle}>
        Interception
        <input
          data-testid="scoring-passInt"
          type="number"
          max={0}
          step={1}
          value={scoringSettings.passInt}
          onChange={(e) => updateScoring('passInt', parseFloat(e.target.value) || -2)}
          style={inputStyle}
        />
      </label>
    </div>
  </div>

  {/* Rushing */}
  <div style={{ marginBottom: '0.875rem' }}>
    <div style={subSectionStyle}>Rushing (all positions)</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
      <label style={labelStyle}>
        Rush attempt bonus
        <input
          data-testid="scoring-rushAtt"
          type="number"
          min={0}
          step={0.1}
          value={scoringSettings.rushAtt}
          onChange={(e) => updateScoring('rushAtt', parseFloat(e.target.value) || 0)}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Rush 1st down bonus
        <input
          data-testid="scoring-rushFD"
          type="number"
          min={0}
          step={0.25}
          value={scoringSettings.rushFD}
          onChange={(e) => updateScoring('rushFD', parseFloat(e.target.value) || 0)}
          style={inputStyle}
        />
      </label>
    </div>
  </div>

  {/* Reception (PPR) */}
  <div style={{ marginBottom: '0.875rem' }}>
    <div style={subSectionStyle}>Reception (PPR)</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
      {(
        [
          { pos: 'RB', key: 'pprRB', opts: [0, 0.5, 1] },
          { pos: 'WR', key: 'pprWR', opts: [0, 0.5, 1] },
          { pos: 'TE', key: 'pprTE', opts: [0, 0.5, 1, 1.5, 2] },
        ] as const
      ).map(({ pos, key, opts }) => (
        <label key={pos} style={labelStyle}>
          {pos}
          <select
            data-testid={`scoring-${key}`}
            value={scoringSettings[key]}
            onChange={(e) => updateScoring(key, parseFloat(e.target.value))}
            style={inputStyle}
          >
            {opts.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  </div>

  {/* First down bonuses */}
  <div>
    <div style={subSectionStyle}>Receiving 1st down bonus</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
      {(
        [
          { label: 'All', key: 'recFD' },
          { label: 'RB', key: 'rbFDBonus' },
          { label: 'WR', key: 'wrFDBonus' },
          { label: 'TE', key: 'teFDBonus' },
        ] as const
      ).map(({ label, key }) => (
        <label key={key} style={labelStyle}>
          {label}
          <input
            data-testid={`scoring-${key}`}
            type="number"
            min={0}
            step={0.25}
            value={scoringSettings[key]}
            onChange={(e) => updateScoring(key, parseFloat(e.target.value) || 0)}
            style={inputStyle}
          />
        </label>
      ))}
    </div>
  </div>
</div>;
```

Add the `subSectionStyle` constant at the bottom of the file:

```typescript
const subSectionStyle: React.CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: '0.4rem',
};
```

- [ ] **Step 3: Add lineup validation to `handleSubmit`**

In `handleSubmit`, add this check after the existing handle-uniqueness check and before `startTransition`:

```typescript
if (!startingLineup.some((s) => s === 'QB' || s === 'SUPER_FLEX')) {
  setError('Starting lineup must include at least one QB or SUPER_FLEX slot.');
  return;
}
```

Also add `data-testid` to the form element and the draft name input for testability:

```tsx
<form data-testid="new-draft-form" onSubmit={handleSubmit}>
```

```tsx
<input
  data-testid="draft-name-input"
  type="text"
  value={name}
  onChange={(e) => setName(e.target.value)}
  placeholder="e.g. Dynasty 2025"
  required
  style={inputStyle}
/>
```

- [ ] **Step 4: Verify it compiles**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 5: Add scoring and validation tests to `src/__tests__/drafts-new-form.test.tsx`**

Append these test cases to the existing `describe` block:

```typescript
describe('NewDraftPage — scoring settings', () => {
  it('renders passing yards per point input with default 25', () => {
    render(<NewDraftPage />);
    const input = screen.getByTestId<HTMLInputElement>('scoring-passYdsPerPoint');
    expect(input.value).toBe('25');
  });

  it('renders passing TD select with default 4', () => {
    render(<NewDraftPage />);
    const select = screen.getByTestId<HTMLSelectElement>('scoring-passTD');
    expect(select.value).toBe('4');
  });

  it('renders all PPR selects defaulting to 1', () => {
    render(<NewDraftPage />);
    expect(screen.getByTestId<HTMLSelectElement>('scoring-pprRB').value).toBe('1');
    expect(screen.getByTestId<HTMLSelectElement>('scoring-pprWR').value).toBe('1');
    expect(screen.getByTestId<HTMLSelectElement>('scoring-pprTE').value).toBe('1');
  });
});

describe('NewDraftPage — lineup validation', () => {
  it('shows error when submitting with no QB or SUPER_FLEX slot', () => {
    render(<NewDraftPage />);
    // Change slot 0 from QB to RB
    fireEvent.change(screen.getByTestId('lineup-slot-0'), { target: { value: 'RB' } });
    // Change slot 9 from SUPER_FLEX to FLEX
    fireEvent.change(screen.getByTestId('lineup-slot-9'), { target: { value: 'FLEX' } });
    // Provide draft name to pass earlier validations
    fireEvent.change(screen.getByTestId('draft-name-input'), {
      target: { value: 'Test Draft' },
    });
    fireEvent.submit(screen.getByTestId('new-draft-form'));
    expect(
      screen.getByText(/at least one QB or SUPER_FLEX/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run all form tests**

```bash
pnpm test drafts-new-form
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/drafts/new/page.tsx src/__tests__/drafts-new-form.test.tsx
git commit -m "feat: add scoring settings form section and lineup QB/SF validation"
```

---

## Task 5: `createDraft` Action — New Params + Player Seeding

**Files:**

- Modify: `src/lib/actions.ts`
- Modify: `src/__tests__/createDraft.test.ts`

**Interfaces:**

- Consumes: `StartingSlot`, `ScoringSettings` from `src/types/index.ts`; `players` array from `src/data/players`; `Player` Prisma model from Task 2
- Produces: updated `createDraft` signature consumed by the form's `handleSubmit` (Task 4)

- [ ] **Step 1: Update `createDraft` in `src/lib/actions.ts`**

Add imports at the top:

```typescript
import type { Position, StartingSlot, ScoringSettings } from '@/types';
import { players as BASE_PLAYERS } from '@/data/players';
```

Replace the `TeamInput` interface and `createDraft` function entirely:

```typescript
interface TeamInput {
  handle: string;
  displayName: string;
  isMine: boolean;
}

export async function createDraft(data: {
  name: string;
  budgetPerTeam: number;
  rosterSize: number;
  targetRoster: Partial<Record<Position, number>>;
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teams: TeamInput[];
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const handles = data.teams.map((t) => t.handle.trim());
  if (new Set(handles).size !== handles.length) throw new Error('Duplicate handles');
  if (!data.teams.some((t) => t.isMine)) throw new Error('No team marked as mine');

  const coerced = data.teams.map((t) => ({
    handle: t.handle.trim(),
    displayName: t.displayName.trim() || t.handle.trim(),
    isMine: t.isMine,
  }));

  const draftId = await prisma.$transaction(async (tx) => {
    const draft = await tx.draft.create({
      data: {
        name: data.name.trim(),
        ownerId: session.user.id,
        status: 'ACTIVE',
        teamCount: data.teams.length,
        rosterSize: data.rosterSize,
        budget: data.budgetPerTeam,
        startingLineup: data.startingLineup,
        scoringSettings: data.scoringSettings,
        targetRoster: data.targetRoster,
      },
    });

    let ownerTeamId: number | null = null;
    for (const team of coerced) {
      const created = await tx.team.create({
        data: {
          handle: team.handle,
          displayName: team.displayName,
          budget: data.budgetPerTeam,
          draftId: draft.id,
        },
      });
      if (team.isMine) ownerTeamId = created.id;
    }

    await tx.draft.update({ where: { id: draft.id }, data: { ownerTeamId } });

    await tx.player.createMany({
      data: BASE_PLAYERS.map((p) => ({
        name: p.player,
        nflTeam: p.team,
        pos: p.pos,
        age: p.age,
        sfRank: p.sfRank,
        budget: p.budget,
        ceiling: p.ceiling,
        floor: p.floor,
        notes: p.notes,
        draftId: draft.id,
      })),
    });

    return draft.id;
  });

  redirect(`/draft/${draftId}`);
}
```

- [ ] **Step 2: Update the form's `handleSubmit` to pass the new params**

In `src/app/drafts/new/page.tsx`, update the `startTransition` call inside `handleSubmit`:

```typescript
startTransition(async () => {
  try {
    await createDraft({
      name: name.trim(),
      budgetPerTeam: budget,
      rosterSize,
      targetRoster,
      startingLineup,
      scoringSettings,
      teams,
    });
  } catch (err) {
    setError((err as Error).message ?? 'Something went wrong.');
  }
});
```

- [ ] **Step 3: Verify it compiles**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 4: Update `src/__tests__/createDraft.test.ts`**

Add `mockTxPlayerCreateMany` to the mocks:

```typescript
const mockTxPlayerCreateMany = jest.fn().mockResolvedValue({ count: 270 });
```

Update `mockTransaction.mockImplementation` to include the player mock:

```typescript
mockTransaction.mockImplementation((callback) =>
  callback({
    draft: { create: mockTxDraftCreate, update: mockTxDraftUpdate },
    team: { create: mockTxTeamCreate },
    player: { createMany: mockTxPlayerCreateMany },
  }),
);
```

Update `VALID_INPUT` to include the new required fields:

```typescript
const VALID_INPUT = {
  name: "Cole's Draft 2025",
  budgetPerTeam: 1000,
  rosterSize: 30,
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
  startingLineup: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'FLEX', 'SUPER_FLEX'],
  scoringSettings: {
    passYdsPerPoint: 25,
    passTD: 4,
    passInt: -2,
    rushAtt: 0,
    rushFD: 0,
    pprRB: 1,
    pprWR: 1,
    pprTE: 1,
    recFD: 0,
    rbFDBonus: 0,
    wrFDBonus: 0,
    teFDBonus: 0,
  },
  teams: [
    { handle: 'coreschke', displayName: 'Cole', isMine: true },
    { handle: 'team2', displayName: 'Team Two', isMine: false },
  ],
};
```

Update the "creates the draft inside the transaction" test to expect the new fields:

```typescript
it('creates the draft inside the transaction', async () => {
  await createDraft(VALID_INPUT);
  expect(mockTxDraftCreate).toHaveBeenCalledWith({
    data: {
      name: "Cole's Draft 2025",
      ownerId: '123456789',
      status: 'ACTIVE',
      teamCount: 2,
      rosterSize: 30,
      budget: 1000,
      startingLineup: VALID_INPUT.startingLineup,
      scoringSettings: VALID_INPUT.scoringSettings,
      targetRoster: VALID_INPUT.targetRoster,
    },
  });
});
```

Add the new player seeding test:

```typescript
it('seeds players from base ETR data into the Player table', async () => {
  await createDraft(VALID_INPUT);
  expect(mockTxPlayerCreateMany).toHaveBeenCalledTimes(1);
  const { data } = mockTxPlayerCreateMany.mock.calls[0][0] as { data: unknown[] };
  expect(data.length).toBeGreaterThan(200);
  expect(data[0]).toMatchObject({
    nflTeam: expect.any(String),
    pos: expect.any(String),
    draftId: 5,
    budget: expect.any(Number),
    ceiling: expect.any(Number),
    floor: expect.any(Number),
  });
});
```

- [ ] **Step 5: Run the updated tests**

```bash
pnpm test createDraft
```

Expected: all tests pass including the new seeding test.

- [ ] **Step 6: Run full test suite to catch regressions**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions.ts src/app/drafts/new/page.tsx src/__tests__/createDraft.test.ts
git commit -m "feat: update createDraft to store league settings and seed Player table"
```

---

## Task 6: Backfill Script for Existing Drafts

**Files:**

- New: `prisma/seed-players.ts`

**Interfaces:**

- Consumes: `Player` Prisma model (Task 2); `players` from `src/data/players`
- Produces: existing drafts populated with Player rows — required before PR C page wiring

**Note:** This script must be run manually in each environment (local dev, Neon prod) after PR B merges and before PR C deploys. Existing drafts with no Player rows will show empty value sheets until this runs.

- [ ] **Step 1: Create `prisma/seed-players.ts`**

```typescript
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { players as BASE_PLAYERS } from '../src/data/players';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const drafts = await prisma.draft.findMany({ select: { id: true } });
  console.log(`Found ${drafts.length} draft(s).`);

  for (const draft of drafts) {
    const existing = await prisma.player.count({ where: { draftId: draft.id } });
    if (existing > 0) {
      console.log(`  Draft ${draft.id}: already has ${existing} players — skipping.`);
      continue;
    }
    await prisma.player.createMany({
      data: BASE_PLAYERS.map((p) => ({
        name: p.player,
        nflTeam: p.team,
        pos: p.pos,
        age: p.age,
        sfRank: p.sfRank,
        budget: p.budget,
        ceiling: p.ceiling,
        floor: p.floor,
        notes: p.notes,
        draftId: draft.id,
      })),
    });
    console.log(`  Draft ${draft.id}: seeded ${BASE_PLAYERS.length} players.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the backfill against local dev DB**

```bash
pnpm tsx prisma/seed-players.ts
```

Expected output:

```
Found N draft(s).
  Draft 1: seeded 270 players.
```

If you see `Draft 1: already has 270 players — skipping.`, the new `createDraft` action already ran and seeded. That's fine.

- [ ] **Step 3: Verify players were created**

```bash
pnpm prisma studio
```

Open the `Player` table. You should see ~270 rows scoped to your draft ID.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed-players.ts
git commit -m "feat: add player backfill script for existing drafts"
```

---

## Task 7: `computeTeamStats` — Add Players Parameter

**Files:**

- Modify: `src/lib/computeTeamStats.ts`
- Modify: `src/__tests__/computeTeamStats.test.ts`
- Modify: `src/app/draft/[draftId]/teams/page.tsx`

**Interfaces:**

- Consumes: `Player` type from `src/types/index.ts`; `Player` rows queried from DB in teams page
- Produces: `computeTeamStats(teams, players)` — new signature consumed by teams page

- [ ] **Step 1: Update `computeTeamStats.ts` to take `players` as a parameter**

Replace the entire file content:

```typescript
import type { Player, TeamWithRoster, RosterEntry } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';

interface TeamInput {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  results: Array<{
    id: number;
    player: string;
    position: string;
    nflTeam: string;
    price: number;
    sfRank: number | null;
    teamId: number;
  }>;
}

export function computeTeamStats(teams: TeamInput[], players: Player[]): TeamWithRoster[] {
  return teams.map((team) => {
    const spent = team.results.reduce((sum, r) => sum + r.price, 0);
    const remaining = team.budget - spent;
    const rosterCount = team.results.length;
    const rosterRemaining = ROSTER_SIZE - rosterCount;
    const buyingPower = remaining - rosterRemaining;
    const pkgCount = team.results.filter((r) => r.position === 'PKG').length;

    const results: RosterEntry[] = team.results.map((r) => {
      const target = players.find((p) => p.player === r.player);
      const delta = target != null ? r.price - target.budget : null;
      return {
        id: r.id,
        player: r.player,
        position: r.position,
        nflTeam: r.nflTeam,
        price: r.price,
        sfRank: r.sfRank,
        teamId: r.teamId,
        teamHandle: team.handle,
        delta,
      };
    });

    return {
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
      budget: team.budget,
      spent,
      remaining,
      rosterCount,
      rosterRemaining,
      buyingPower,
      pkgCount,
      results,
    };
  });
}
```

- [ ] **Step 2: Update all calls in `computeTeamStats.test.ts`**

Every existing call `computeTeamStats([...])` becomes `computeTeamStats([...], [])` (empty players for tests that don't test delta).

Then add two new tests at the end of the `describe` block:

```typescript
it('computes delta as price minus player budget when player is found', () => {
  const mockPlayers: Player[] = [
    {
      player: 'Patrick Mahomes',
      team: 'KC',
      pos: 'QB',
      age: 30,
      sfRank: 1,
      budget: 150,
      ceiling: 172,
      floor: 130,
      notes: '',
    },
  ];
  const team = makeTeam({ results: [makeResult({ price: 200 })] });
  const [stats] = computeTeamStats([team], mockPlayers);
  expect(stats.results[0].delta).toBe(50); // 200 paid - 150 target
});

it('sets delta to null when player is not in the players list', () => {
  const team = makeTeam({ results: [makeResult({ player: 'Unknown Player' })] });
  const [stats] = computeTeamStats([team], []);
  expect(stats.results[0].delta).toBeNull();
});
```

Add the import at the top of the test file:

```typescript
import type { Player } from '@/types';
```

- [ ] **Step 3: Run the updated unit tests**

```bash
pnpm test computeTeamStats
```

Expected: all tests pass including the two new delta tests.

- [ ] **Step 4: Update `src/app/draft/[draftId]/teams/page.tsx`**

```typescript
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { computeTeamStats } from '@/lib/computeTeamStats';
import RosterTracker from '@/components/RosterTracker';
import type { Player, Position } from '@/types';

export const dynamic = 'force-dynamic';

export default async function TeamsPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [rawTeams, dbPlayers] = await Promise.all([
    prisma.team.findMany({
      where: { draftId },
      include: { results: true },
      orderBy: { handle: 'asc' },
    }),
    prisma.player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } }),
  ]);

  const players: Player[] = dbPlayers.map((p) => ({
    player: p.name,
    team: p.nflTeam,
    pos: p.pos as Position,
    age: p.age,
    sfRank: p.sfRank,
    budget: p.budget,
    ceiling: p.ceiling,
    floor: p.floor,
    notes: p.notes,
  }));

  return (
    <RosterTracker
      teams={computeTeamStats(rawTeams, players)}
      ownerHandle={draft.ownerTeam?.handle ?? null}
    />
  );
}
```

- [ ] **Step 5: Verify full compilation**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/computeTeamStats.ts src/__tests__/computeTeamStats.test.ts src/app/draft/[draftId]/teams/page.tsx
git commit -m "feat: computeTeamStats takes players param; teams page queries player table"
```

---

## Task 8: `AuctionSheet` — Players Prop + Draft Home Page Wiring

**Files:**

- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/__tests__/AuctionSheet.claimed.test.tsx`
- Modify: `src/app/draft/[draftId]/page.tsx`

**Interfaces:**

- Consumes: `Player[]` queried from DB in the draft home page
- Produces: `AuctionSheet` with `players: Player[]` prop — eliminates `@/data/players` import from client bundle

- [ ] **Step 1: Update `AuctionSheet.tsx` — remove static import, add prop**

At the top of `src/components/AuctionSheet/AuctionSheet.tsx`:

Remove:

```typescript
import { players } from '@/data/players';
```

Update `AuctionSheetProps` to add `players`:

```typescript
interface AuctionSheetProps {
  players: Player[];
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  nominatedPlayers: string[];
  draftId: number;
  ownerHandle: string | null;
  ownerBudget: number;
}
```

Update the function signature:

```typescript
export default function AuctionSheet({
  players,
  claimedBids,
  teams,
  nominatedPlayers,
  draftId,
  ownerHandle,
  ownerBudget,
}: AuctionSheetProps) {
```

Change the modal state type (line ~49) from `(typeof players)[0] | null` to `Player | null`:

```typescript
const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
```

No other internal changes — `players` is already used as a plain array throughout.

- [ ] **Step 2: Update `AuctionSheet.claimed.test.tsx`**

Remove the `jest.mock('@/data/players', ...)` block entirely.

Extract the mock player data into a typed constant:

```typescript
import type { Player, ClaimedBid, LeagueTeam } from '@/types';

const MOCK_PLAYERS: Player[] = [
  {
    player: 'Josh Allen',
    team: 'BUF',
    pos: 'QB',
    age: 28,
    sfRank: 1,
    budget: 120,
    ceiling: 138,
    floor: 104,
    notes: '',
  },
  {
    player: 'Justin Jefferson',
    team: 'MIN',
    pos: 'WR',
    age: 25,
    sfRank: 5,
    budget: 95,
    ceiling: 109,
    floor: 83,
    notes: '',
  },
];
```

Add `players={MOCK_PLAYERS}` to every `<AuctionSheet ... />` render call in the test file.

- [ ] **Step 3: Run the updated AuctionSheet tests**

```bash
pnpm test AuctionSheet
```

Expected: all tests pass.

- [ ] **Step 4: Update `src/app/draft/[draftId]/page.tsx`**

```typescript
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam, Player, Position } from '@/types';
import { auth } from '@/auth';
import { getDraft } from '@/lib/draft';

export default async function DraftHomePage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [rawBids, teams, nominatedEntries, dbPlayers] = await Promise.all([
    prisma.auctionResult.findMany({
      where: { draftId },
      select: {
        id: true,
        player: true,
        position: true,
        price: true,
        teamId: true,
        team: { select: { handle: true } },
      },
    }),
    prisma.team.findMany({
      where: { draftId },
      select: { id: true, handle: true, displayName: true },
      orderBy: { handle: 'asc' },
    }),
    prisma.nominatedPlayer.findMany({
      where: { draftId },
      select: { playerName: true },
    }),
    prisma.player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } }),
  ]);

  const claimedBids: ClaimedBid[] = rawBids.map((r) => ({
    id: r.id,
    player: r.player,
    position: r.position,
    price: r.price,
    teamId: r.teamId,
    teamHandle: r.team.handle,
  }));

  const players: Player[] = dbPlayers.map((p) => ({
    player: p.name,
    team: p.nflTeam,
    pos: p.pos as Position,
    age: p.age,
    sfRank: p.sfRank,
    budget: p.budget,
    ceiling: p.ceiling,
    floor: p.floor,
    notes: p.notes,
  }));

  return (
    <AuctionSheet
      players={players}
      claimedBids={claimedBids}
      teams={teams as LeagueTeam[]}
      nominatedPlayers={nominatedEntries.map((e) => e.playerName)}
      draftId={draftId}
      ownerHandle={draft.ownerTeam?.handle ?? null}
      ownerBudget={draft.ownerTeam?.budget ?? 1000}
    />
  );
}
```

- [ ] **Step 5: Verify full compilation**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/AuctionSheet.claimed.test.tsx src/app/draft/[draftId]/page.tsx
git commit -m "feat: AuctionSheet accepts players prop; draft home page queries player table"
```

---

## Task 9: `NominationHelper` — Players Prop + Nominate Page Wiring

**Files:**

- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Modify: `src/app/draft/[draftId]/nominate/page.tsx`

**Interfaces:**

- Consumes: `Player[]` queried from DB in nominate page
- Produces: `NominationHelper` with `players: Player[]` prop — eliminates last `@/data/players` import from client bundle; `players.ts` is now server-only seed data

- [ ] **Step 1: Update `NominationHelper.tsx` — remove static import, add prop**

Remove:

```typescript
import { players } from '@/data/players';
```

Add `Player` to the type imports:

```typescript
import type { Player, Position, TeamStats, AuctionResultEntry } from '@/types';
```

Update the props interface (currently `{ draftId: number }`):

```typescript
export default function NominationHelper({ draftId, players }: { draftId: number; players: Player[] }) {
```

No other changes — `players` is already used as a read-only array throughout. The `useEffect` polling loop continues to fetch `teamStats`, `auctionResults`, `watchlist`, and `nominated` from `/api/draft/${draftId}/nomination-data`; only the player pool now comes from props.

- [ ] **Step 2: Update `src/app/draft/[draftId]/nominate/page.tsx`**

```typescript
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import NominationHelper from '@/components/NominationHelper';
import type { Player, Position } from '@/types';

export const metadata = { title: 'Nominate — DraftOps' };

export default async function NominatePage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const dbPlayers = await prisma.player.findMany({
    where: { draftId },
    orderBy: { sfRank: 'asc' },
  });

  const players: Player[] = dbPlayers.map((p) => ({
    player: p.name,
    team: p.nflTeam,
    pos: p.pos as Position,
    age: p.age,
    sfRank: p.sfRank,
    budget: p.budget,
    ceiling: p.ceiling,
    floor: p.floor,
    notes: p.notes,
  }));

  return <NominationHelper draftId={draftId} players={players} />;
}
```

- [ ] **Step 3: Verify full compilation**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Run the quality gate**

```bash
pnpm check
```

Expected: typecheck + lint + format + tests all pass.

- [ ] **Step 6: Confirm `@/data/players` is no longer imported by any client component**

```bash
grep -rn "from '@/data/players'" src/components src/app --include="*.tsx" --include="*.ts"
```

Expected: no output. (`players.ts` may still be imported by `src/lib/actions.ts` and `prisma/seed-players.ts` — those are server-only and correct.)

- [ ] **Step 7: Commit**

```bash
git add src/components/NominationHelper/NominationHelper.tsx src/app/draft/[draftId]/nominate/page.tsx
git commit -m "feat: NominationHelper accepts players prop; nominate page queries player table"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement                                                                                  | Task                                                 |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `teamCount`, `rosterSize`, `budget`, `startingLineup`, `scoringSettings`, `targetRoster` on Draft | Task 2                                               |
| `Player` model scoped to `draftId`                                                                | Task 2                                               |
| `StartingSlot` type, `ScoringSettings` interface, defaults                                        | Task 1                                               |
| Roster Settings form section (rosterSize, targetRoster)                                           | Task 3                                               |
| Starting Lineup form section (slot builder, add/remove)                                           | Task 3                                               |
| Lineup validation (must have QB or SUPER_FLEX)                                                    | Task 4                                               |
| Scoring Settings form section                                                                     | Task 4                                               |
| `createDraft` stores settings on Draft                                                            | Task 5                                               |
| `createDraft` seeds Player table from base ETR values                                             | Task 5                                               |
| Backfill for existing drafts                                                                      | Task 6                                               |
| JSON fields nullable; consumers fall back to defaults                                             | Task 1 (defaults exported), Task 2 (nullable schema) |
| `computeTeamStats` takes `players` parameter                                                      | Task 7                                               |
| `AuctionSheet` accepts `players` prop                                                             | Task 8                                               |
| `NominationHelper` accepts `players` prop                                                         | Task 9                                               |
| `players.ts` not imported by client components                                                    | Task 9, Step 6 (verified by grep)                    |
| Draft home page queries `Player` table                                                            | Task 8                                               |
| Teams page queries `Player` table                                                                 | Task 7                                               |
| Nominate page becomes real server component, queries `Player` table                               | Task 9                                               |

All spec requirements covered.
