# UX Papercuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four independent UX papercuts: numeric inputs on `/drafts/new` that can't be cleanly edited, a starting-lineup builder that doesn't regroup slots by position, a hardcoded value-sheet caption that ignores the draft's actual scoring settings, and misaligned per-position summaries on the Team Rosters page.

**Architecture:** A new shared `useNumericField` hook (`src/lib/useNumericField.ts`) replaces the `parseInt(...) || default` pattern at every numeric input on `/drafts/new` (Tasks 1-3). A pure sort function fixes lineup-slot grouping (Task 4). A new pure caption-formatting function plus prop-threading fixes the value-sheet caption (Task 5). A single Tailwind class fixes the roster-summary alignment (Task 6). No two tasks touch the same file region simultaneously except Tasks 2/3/4, which are sequenced (2 → 3 → 4) since all three edit `src/app/drafts/new/page.tsx`.

**Tech Stack:** Next.js 16 App Router (client components for interactive forms, server components for data-fetching pages), React 19 hooks, Jest + React Testing Library (`renderHook`/`act` for hook tests), Tailwind CSS 4 + inline styles (existing per-file convention), `data-testid` selectors.

## Global Constraints

- Single quotes, trailing commas, 2-space indent, 100-char line width (Prettier).
- No explicit `any`; prefer `interface` over `type` for object shapes.
- Select test elements by `data-testid`, never visible text or CSS class.
- No redesign of `/drafts/new`'s overall layout or decomposition of its 890-line `page.tsx` beyond what Tasks 1-4 require.
- No change to the `2QB rankings scaled 5×` portion of the value-sheet caption — it describes a fixed import-pipeline constant, not a per-draft setting.
- No change to `adjustPlayerValues` or any actual player-valuation math — Task 5 only changes descriptive caption text.
- No generalization of the other hardcoded league-summary line (`AuctionHeader.tsx:29`) — out of scope.
- Run `pnpm tsc --noEmit` and `pnpm lint` before considering any task done; do not commit with `--no-verify`.

---

### Task 1: `useNumericField` hook

**Files:**

- Create: `src/lib/useNumericField.ts`
- Test: `src/__tests__/useNumericField.test.ts`

**Interfaces:**

- Consumes: nothing project-specific (plain React `useState`).
- Produces: `useNumericField(initial: number, options?: { min?: number; max?: number; float?: boolean }): { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; numericValue: number; setNumericValue: (n: number) => void }`, consumed by Tasks 2 and 3.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/useNumericField.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { useNumericField } from '@/lib/useNumericField';

function changeEvent(value: string): ChangeEvent<HTMLInputElement> {
  return { target: { value } } as ChangeEvent<HTMLInputElement>;
}

describe('useNumericField', () => {
  it('starts with the initial value as a string and number', () => {
    const { result } = renderHook(() => useNumericField(30));
    expect(result.current.value).toBe('30');
    expect(result.current.numericValue).toBe(30);
  });

  it('allows clearing to an empty string without forcing a default back into the field', () => {
    const { result } = renderHook(() => useNumericField(30, { min: 10, max: 60 }));
    act(() => result.current.onChange(changeEvent('')));
    expect(result.current.value).toBe('');
    expect(result.current.numericValue).toBe(30); // falls back to initial while empty
  });

  it('allows a lone minus sign as an intermediate typing state', () => {
    const { result } = renderHook(() => useNumericField(-2, { max: 0, float: true }));
    act(() => result.current.onChange(changeEvent('-')));
    expect(result.current.value).toBe('-'); // displayed value is never coerced away
    expect(result.current.numericValue).toBe(-2); // "-" doesn't parse, falls back to initial
  });

  it('clamps numericValue to min/max without altering the displayed string', () => {
    const { result } = renderHook(() => useNumericField(30, { min: 10, max: 60 }));
    act(() => result.current.onChange(changeEvent('5')));
    expect(result.current.value).toBe('5');
    expect(result.current.numericValue).toBe(10); // clamped to min
  });

  it('uses parseInt by default and parseFloat when float is set', () => {
    const intField = renderHook(() => useNumericField(0));
    act(() => intField.result.current.onChange(changeEvent('3.7')));
    expect(intField.result.current.numericValue).toBe(3); // parseInt truncates

    const floatField = renderHook(() => useNumericField(0, { float: true }));
    act(() => floatField.result.current.onChange(changeEvent('3.7')));
    expect(floatField.result.current.numericValue).toBe(3.7);
  });

  it('setNumericValue updates both the displayed value and numericValue imperatively', () => {
    const { result } = renderHook(() => useNumericField(30, { min: 10, max: 60 }));
    act(() => result.current.setNumericValue(45));
    expect(result.current.value).toBe('45');
    expect(result.current.numericValue).toBe(45);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- useNumericField.test.ts`
Expected: FAIL — `Cannot find module '@/lib/useNumericField'`

- [ ] **Step 3: Implement the hook**

Create `src/lib/useNumericField.ts`:

```ts
'use client';

import { useState } from 'react';
import type { ChangeEvent } from 'react';

export interface UseNumericFieldOptions {
  min?: number;
  max?: number;
  float?: boolean;
}

export interface UseNumericField {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  numericValue: number;
  setNumericValue: (n: number) => void;
}

export function useNumericField(
  initial: number,
  options: UseNumericFieldOptions = {},
): UseNumericField {
  const { min, max, float = false } = options;
  const [value, setValue] = useState(String(initial));

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
  }

  function setNumericValue(n: number) {
    setValue(String(n));
  }

  const parsed = float ? parseFloat(value) : parseInt(value, 10);
  let numericValue = Number.isFinite(parsed) ? parsed : initial;
  if (min !== undefined) numericValue = Math.max(min, numericValue);
  if (max !== undefined) numericValue = Math.min(max, numericValue);

  return { value, onChange, numericValue, setNumericValue };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- useNumericField.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/useNumericField.ts src/__tests__/useNumericField.test.ts
git commit -m "feat: add useNumericField hook for editable numeric inputs"
```

---

### Task 2: Apply `useNumericField` to team count, budget, roster size, target roster

**Files:**

- Modify: `src/app/drafts/new/page.tsx`
- Test: `src/__tests__/drafts-new-form.test.tsx`

**Interfaces:**

- Consumes: `useNumericField` from `@/lib/useNumericField` (Task 1).
- Produces: `teamCountField`, `budgetField`, `rosterSizeField`, `targetRosterFields` (a `Record<'QB'|'RB'|'WR'|'TE', UseNumericField>`) — local to `page.tsx`, not consumed by other files. `data-testid="team-count-input"` and `data-testid="budget-input"` are new (these fields had no testid before).

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/drafts-new-form.test.tsx`, inside `describe('NewDraftPage — roster settings and lineup', ...)`:

```tsx
it('allows clearing the roster size field to empty while retyping', () => {
  render(<NewDraftPage />);
  const input = screen.getByTestId<HTMLInputElement>('roster-size-input');
  fireEvent.change(input, { target: { value: '' } });
  expect(input.value).toBe('');
  fireEvent.change(input, { target: { value: '25' } });
  expect(input.value).toBe('25');
});

it('allows clearing the team count field to empty while retyping', () => {
  render(<NewDraftPage />);
  const input = screen.getByTestId<HTMLInputElement>('team-count-input');
  fireEvent.change(input, { target: { value: '' } });
  expect(input.value).toBe('');
  fireEvent.change(input, { target: { value: '8' } });
  expect(input.value).toBe('8');
});

it('allows clearing the budget field to empty while retyping', () => {
  render(<NewDraftPage />);
  const input = screen.getByTestId<HTMLInputElement>('budget-input');
  fireEvent.change(input, { target: { value: '' } });
  expect(input.value).toBe('');
  fireEvent.change(input, { target: { value: '500' } });
  expect(input.value).toBe('500');
});

it('allows clearing a target roster field to empty while retyping', () => {
  render(<NewDraftPage />);
  const input = screen.getByTestId<HTMLInputElement>('target-roster-QB');
  fireEvent.change(input, { target: { value: '' } });
  expect(input.value).toBe('');
  fireEvent.change(input, { target: { value: '6' } });
  expect(input.value).toBe('6');
});

it('resizes the team roster table when team count changes', () => {
  render(<NewDraftPage />);
  const input = screen.getByTestId<HTMLInputElement>('team-count-input');
  fireEvent.change(input, { target: { value: '14' } });
  // Team handle inputs render as plain text inputs inside the roster table;
  // there are 14 team rows once team count is 14, plus the fixed-count
  // Yds/point etc. number inputs elsewhere — assert via the roster-size
  // default-value pattern already used above instead of counting all inputs.
  expect(screen.getAllByDisplayValue(/^team-\d+$/)).toHaveLength(14);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- drafts-new-form.test.tsx`
Expected: FAIL — `team-count-input` and `budget-input` testids don't exist yet; the "clearing" tests fail because the field currently snaps back to a default instead of showing an empty string.

- [ ] **Step 3: Replace the plain `useState` declarations**

In `src/app/drafts/new/page.tsx`, add the import:

```tsx
import { useNumericField } from '@/lib/useNumericField';
```

Remove these three lines from the top of `NewDraftPage`:

```tsx
const [teamCount, setTeamCount] = useState(12);
const [budget, setBudget] = useState(1000);
```

and:

```tsx
const [rosterSize, setRosterSize] = useState(30);
```

and the `targetRoster` state block:

```tsx
const [targetRoster, setTargetRoster] = useState<Record<'QB' | 'RB' | 'WR' | 'TE', number>>({
  QB: DEFAULT_TARGET_ROSTER.QB ?? 4,
  RB: DEFAULT_TARGET_ROSTER.RB ?? 9,
  WR: DEFAULT_TARGET_ROSTER.WR ?? 11,
  TE: DEFAULT_TARGET_ROSTER.TE ?? 3,
});
```

Replace all four with:

```tsx
const teamCountField = useNumericField(12, { min: 2, max: 32 });
const budgetField = useNumericField(1000, { min: 1 });
const rosterSizeField = useNumericField(30, { min: 10, max: 60 });
const targetRosterQBField = useNumericField(DEFAULT_TARGET_ROSTER.QB ?? 4, { min: 0 });
const targetRosterRBField = useNumericField(DEFAULT_TARGET_ROSTER.RB ?? 9, { min: 0 });
const targetRosterWRField = useNumericField(DEFAULT_TARGET_ROSTER.WR ?? 11, { min: 0 });
const targetRosterTEField = useNumericField(DEFAULT_TARGET_ROSTER.TE ?? 3, { min: 0 });
const targetRosterFields = {
  QB: targetRosterQBField,
  RB: targetRosterRBField,
  WR: targetRosterWRField,
  TE: targetRosterTEField,
} as const;
```

- [ ] **Step 4: Replace `handleTeamCountChange` with a resize effect**

Remove the `handleTeamCountChange` function entirely:

```tsx
function handleTeamCountChange(newCount: number) {
  const clamped = Math.max(2, Math.min(32, newCount));
  setTeamCount(clamped);
  setTeams((prev) => {
    if (clamped > prev.length) {
      const added = Array.from({ length: clamped - prev.length }, (_, i) => ({
        handle: `team-${prev.length + i + 1}`,
        displayName: '',
        isMine: false,
      }));
      return [...prev, ...added];
    }
    return prev.slice(0, clamped);
  });
}
```

Replace it with a `useEffect` that reacts to the field's numeric value, placed near the other hooks (after the `useEffect` that loads the ranking summary):

```tsx
useEffect(() => {
  const clamped = teamCountField.numericValue;
  setTeams((prev) => {
    if (clamped > prev.length) {
      const added = Array.from({ length: clamped - prev.length }, (_, i) => ({
        handle: `team-${prev.length + i + 1}`,
        displayName: '',
        isMine: false,
      }));
      return [...prev, ...added];
    }
    if (clamped < prev.length) return prev.slice(0, clamped);
    return prev;
  });
}, [teamCountField.numericValue]);
```

This also correctly no-ops on Sleeper import (Step 5 below sets `teams` directly to the imported list, which already has `teamCount` entries, so this effect's resize logic finds `clamped === prev.length` and returns `prev` unchanged).

- [ ] **Step 5: Update the Sleeper import handler**

In `handleImport`'s success branch, replace:

```tsx
setTeamCount(data.teamCount);
setRosterSize(data.rosterSize);
```

with:

```tsx
teamCountField.setNumericValue(data.teamCount);
rosterSizeField.setNumericValue(data.rosterSize);
```

- [ ] **Step 6: Update the JSX for team count, budget, roster size, target roster**

Replace the "Teams" input:

```tsx
<input
  type="number"
  min={2}
  max={32}
  value={teamCount}
  onChange={(e) => handleTeamCountChange(parseInt(e.target.value, 10) || 2)}
  style={inputStyle}
/>
```

with:

```tsx
<input
  data-testid="team-count-input"
  type="number"
  min={2}
  max={32}
  value={teamCountField.value}
  onChange={teamCountField.onChange}
  style={inputStyle}
/>
```

Replace the "Budget per team" input:

```tsx
<input
  type="number"
  min={1}
  value={budget}
  onChange={(e) => setBudget(parseInt(e.target.value, 10) || 1000)}
  style={inputStyle}
/>
```

with:

```tsx
<input
  data-testid="budget-input"
  type="number"
  min={1}
  value={budgetField.value}
  onChange={budgetField.onChange}
  style={inputStyle}
/>
```

Replace the "Roster size" input:

```tsx
<input
  data-testid="roster-size-input"
  type="number"
  min={10}
  max={60}
  value={rosterSize}
  onChange={(e) => setRosterSize(parseInt(e.target.value, 10) || 30)}
  style={inputStyle}
/>
```

with:

```tsx
<input
  data-testid="roster-size-input"
  type="number"
  min={10}
  max={60}
  value={rosterSizeField.value}
  onChange={rosterSizeField.onChange}
  style={inputStyle}
/>
```

Replace the target-roster grid's input:

```tsx
<input
  data-testid={`target-roster-${pos}`}
  type="number"
  min={0}
  value={targetRoster[pos]}
  onChange={(e) =>
    setTargetRoster((prev) => ({
      ...prev,
      [pos]: parseInt(e.target.value, 10) || 0,
    }))
  }
  style={inputStyle}
/>
```

with:

```tsx
<input
  data-testid={`target-roster-${pos}`}
  type="number"
  min={0}
  value={targetRosterFields[pos].value}
  onChange={targetRosterFields[pos].onChange}
  style={inputStyle}
/>
```

- [ ] **Step 7: Update `handleSubmit`'s `createDraft` call**

In `handleSubmit`, replace:

```tsx
await createDraft({
  name: name.trim(),
  budgetPerTeam: budget,
  rosterSize,
  futurePickAuctionMode,
  targetRoster,
  startingLineup,
  scoringSettings,
  teams,
  playerSource,
});
```

with (the `scoringSettings` field stays exactly as-is here — it's untouched until Task 3):

```tsx
await createDraft({
  name: name.trim(),
  budgetPerTeam: budgetField.numericValue,
  rosterSize: rosterSizeField.numericValue,
  futurePickAuctionMode,
  targetRoster: {
    QB: targetRosterFields.QB.numericValue,
    RB: targetRosterFields.RB.numericValue,
    WR: targetRosterFields.WR.numericValue,
    TE: targetRosterFields.TE.numericValue,
  },
  startingLineup,
  scoringSettings,
  teams,
  playerSource,
});
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test -- drafts-new-form.test.tsx`
Expected: PASS (all tests in the file, including the 5 new ones)

- [ ] **Step 9: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors — this step will surface it if `targetRoster`, `teamCount`, `budget`, or `rosterSize` are referenced anywhere else in the file that Step 3-7 missed.

- [ ] **Step 10: Commit**

```bash
git add src/app/drafts/new/page.tsx src/__tests__/drafts-new-form.test.tsx
git commit -m "feat: apply useNumericField to team count, budget, roster size, target roster"
```

---

### Task 3: Apply `useNumericField` to scoring settings

**Files:**

- Modify: `src/app/drafts/new/page.tsx`
- Test: `src/__tests__/drafts-new-form.test.tsx`

**Interfaces:**

- Consumes: `useNumericField` from `@/lib/useNumericField` (Task 1); `targetRosterFields`/`budgetField`/etc. from Task 2 (unaffected, this task only touches scoring).
- Produces: 12 scoring-field hook instances, local to `page.tsx`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/drafts-new-form.test.tsx`, inside `describe('NewDraftPage — scoring settings', ...)`:

```tsx
it('allows clearing a scoring field to empty while retyping', () => {
  render(<NewDraftPage />);
  const input = screen.getByTestId<HTMLInputElement>('scoring-passYdsPerPoint');
  fireEvent.change(input, { target: { value: '' } });
  expect(input.value).toBe('');
  fireEvent.change(input, { target: { value: '20' } });
  expect(input.value).toBe('20');
});

it('allows a decimal scoring field to be edited without snapping back', () => {
  render(<NewDraftPage />);
  const input = screen.getByTestId<HTMLInputElement>('scoring-pprTE');
  fireEvent.change(input, { target: { value: '' } });
  expect(input.value).toBe('');
  fireEvent.change(input, { target: { value: '1.5' } });
  expect(input.value).toBe('1.5');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- drafts-new-form.test.tsx`
Expected: FAIL — clearing `scoring-passYdsPerPoint` currently snaps back to `25` instead of showing an empty string.

- [ ] **Step 3: Replace the `scoringSettings` state and `updateScoring` helper**

Remove:

```tsx
const [scoringSettings, setScoringSettings] = useState<ScoringSettings>({
  ...DEFAULT_SCORING_SETTINGS,
});
```

and:

```tsx
function updateScoring<K extends keyof ScoringSettings>(key: K, value: ScoringSettings[K]) {
  setScoringSettings((prev) => ({ ...prev, [key]: value }));
}
```

Replace with 12 individual hooks, placed where `scoringSettings` used to be declared:

```tsx
const passYdsPerPointField = useNumericField(DEFAULT_SCORING_SETTINGS.passYdsPerPoint, {
  min: 1,
  float: true,
});
const passTDField = useNumericField(DEFAULT_SCORING_SETTINGS.passTD, { min: 0, float: true });
const passIntField = useNumericField(DEFAULT_SCORING_SETTINGS.passInt, { max: 0, float: true });
const rushAttField = useNumericField(DEFAULT_SCORING_SETTINGS.rushAtt, { min: 0, float: true });
const rushFDField = useNumericField(DEFAULT_SCORING_SETTINGS.rushFD, { min: 0, float: true });
const pprRBField = useNumericField(DEFAULT_SCORING_SETTINGS.pprRB, { min: 0, float: true });
const pprWRField = useNumericField(DEFAULT_SCORING_SETTINGS.pprWR, { min: 0, float: true });
const pprTEField = useNumericField(DEFAULT_SCORING_SETTINGS.pprTE, { min: 0, float: true });
const recFDField = useNumericField(DEFAULT_SCORING_SETTINGS.recFD, { min: 0, float: true });
const rbFDBonusField = useNumericField(DEFAULT_SCORING_SETTINGS.rbFDBonus, {
  min: 0,
  float: true,
});
const wrFDBonusField = useNumericField(DEFAULT_SCORING_SETTINGS.wrFDBonus, {
  min: 0,
  float: true,
});
const teFDBonusField = useNumericField(DEFAULT_SCORING_SETTINGS.teFDBonus, {
  min: 0,
  float: true,
});
const pprFields = { pprRB: pprRBField, pprWR: pprWRField, pprTE: pprTEField } as const;
const fdBonusFields = {
  recFD: recFDField,
  rbFDBonus: rbFDBonusField,
  wrFDBonus: wrFDBonusField,
  teFDBonus: teFDBonusField,
} as const;
```

`ScoringSettings` and `DEFAULT_SCORING_SETTINGS` stay imported from `@/types` (already imported) — `ScoringSettings` is still used as the type of the reconstructed object in Step 6.

- [ ] **Step 4: Update the Sleeper import handler**

Replace:

```tsx
setScoringSettings(data.scoringSettings);
```

with:

```tsx
passYdsPerPointField.setNumericValue(data.scoringSettings.passYdsPerPoint);
passTDField.setNumericValue(data.scoringSettings.passTD);
passIntField.setNumericValue(data.scoringSettings.passInt);
rushAttField.setNumericValue(data.scoringSettings.rushAtt);
rushFDField.setNumericValue(data.scoringSettings.rushFD);
pprRBField.setNumericValue(data.scoringSettings.pprRB);
pprWRField.setNumericValue(data.scoringSettings.pprWR);
pprTEField.setNumericValue(data.scoringSettings.pprTE);
recFDField.setNumericValue(data.scoringSettings.recFD);
rbFDBonusField.setNumericValue(data.scoringSettings.rbFDBonus);
wrFDBonusField.setNumericValue(data.scoringSettings.wrFDBonus);
teFDBonusField.setNumericValue(data.scoringSettings.teFDBonus);
```

- [ ] **Step 5: Update the JSX for the five individually-rendered scoring inputs**

Replace each `value={scoringSettings.X}` / `onChange={...}` pair with the corresponding field. For `passYdsPerPoint`:

```tsx
<input
  data-testid="scoring-passYdsPerPoint"
  type="number"
  min={1}
  step="any"
  value={passYdsPerPointField.value}
  onChange={passYdsPerPointField.onChange}
  style={inputStyle}
/>
```

For `passTD` (this one previously had bespoke NaN-check logic — now just uses the hook like the rest):

```tsx
<input
  data-testid="scoring-passTD"
  type="number"
  min={0}
  step="any"
  value={passTDField.value}
  onChange={passTDField.onChange}
  style={inputStyle}
/>
```

For `passInt`:

```tsx
<input
  data-testid="scoring-passInt"
  type="number"
  max={0}
  step="any"
  value={passIntField.value}
  onChange={passIntField.onChange}
  style={inputStyle}
/>
```

For `rushAtt`:

```tsx
<input
  data-testid="scoring-rushAtt"
  type="number"
  min={0}
  step="any"
  value={rushAttField.value}
  onChange={rushAttField.onChange}
  style={inputStyle}
/>
```

For `rushFD`:

```tsx
<input
  data-testid="scoring-rushFD"
  type="number"
  min={0}
  step="any"
  value={rushFDField.value}
  onChange={rushFDField.onChange}
  style={inputStyle}
/>
```

- [ ] **Step 6: Update the JSX for the two `.map()`-rendered scoring groups**

Replace the PPR grid's `.map()` body:

```tsx
<label key={pos} style={labelStyle}>
  {pos}
  <input
    data-testid={`scoring-${key}`}
    type="number"
    min={0}
    step="any"
    value={scoringSettings[key]}
    onChange={(e) => updateScoring(key, parseFloat(e.target.value) || 0)}
    style={inputStyle}
  />
</label>
```

with:

```tsx
<label key={pos} style={labelStyle}>
  {pos}
  <input
    data-testid={`scoring-${key}`}
    type="number"
    min={0}
    step="any"
    value={pprFields[key].value}
    onChange={pprFields[key].onChange}
    style={inputStyle}
  />
</label>
```

Replace the first-down-bonus grid's `.map()` body (same shape, different lookup object):

```tsx
<label key={key} style={labelStyle}>
  {label}
  <input
    data-testid={`scoring-${key}`}
    type="number"
    min={0}
    step="any"
    value={scoringSettings[key]}
    onChange={(e) => updateScoring(key, parseFloat(e.target.value) || 0)}
    style={inputStyle}
  />
</label>
```

with:

```tsx
<label key={key} style={labelStyle}>
  {label}
  <input
    data-testid={`scoring-${key}`}
    type="number"
    min={0}
    step="any"
    value={fdBonusFields[key].value}
    onChange={fdBonusFields[key].onChange}
    style={inputStyle}
  />
</label>
```

- [ ] **Step 7: Update `handleSubmit`'s `createDraft` call**

Replace the `scoringSettings` field (still a bare variable reference from Task 2's edit) with a reconstructed object:

```tsx
          scoringSettings,
```

becomes:

```tsx
          scoringSettings: {
            passYdsPerPoint: passYdsPerPointField.numericValue,
            passTD: passTDField.numericValue,
            passInt: passIntField.numericValue,
            rushAtt: rushAttField.numericValue,
            rushFD: rushFDField.numericValue,
            pprRB: pprRBField.numericValue,
            pprWR: pprWRField.numericValue,
            pprTE: pprTEField.numericValue,
            recFD: recFDField.numericValue,
            rbFDBonus: rbFDBonusField.numericValue,
            wrFDBonus: wrFDBonusField.numericValue,
            teFDBonus: teFDBonusField.numericValue,
          } satisfies ScoringSettings,
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test -- drafts-new-form.test.tsx`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 9: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors — this will catch any remaining reference to the removed `scoringSettings` variable or `updateScoring` function.

- [ ] **Step 10: Commit**

```bash
git add src/app/drafts/new/page.tsx src/__tests__/drafts-new-form.test.tsx
git commit -m "feat: apply useNumericField to scoring settings fields"
```

---

### Task 4: Starting-lineup slot ordering

**Files:**

- Modify: `src/app/drafts/new/page.tsx`
- Test: `src/__tests__/drafts-new-form.test.tsx`

**Interfaces:**

- Consumes: `StartingSlot` type from `@/types` (already imported).
- Produces: nothing consumed by other tasks.

This task is independent of Tasks 2/3's numeric-field changes (different functions in the same file) but is sequenced after them to avoid the implementer working from a stale copy of a file two other tasks are actively rewriting.

- [ ] **Step 1: Update the two existing tests whose expectations change under sorting**

In `src/__tests__/drafts-new-form.test.tsx`, replace:

```tsx
it('adds a FLEX slot when Add slot is clicked', () => {
  render(<NewDraftPage />);
  fireEvent.click(screen.getByTestId('add-lineup-slot'));
  const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
  expect(slots).toHaveLength(11);
  expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-10').value).toBe('FLEX');
});
```

with (the new slot is sorted into the FLEX group, ahead of the trailing SUPER_FLEX, landing at index 9 rather than 10):

```tsx
it('adds a FLEX slot when Add slot is clicked, sorted into the FLEX group', () => {
  render(<NewDraftPage />);
  fireEvent.click(screen.getByTestId('add-lineup-slot'));
  const slots = screen.getAllByTestId(/^lineup-slot-\d+$/);
  expect(slots).toHaveLength(11);
  expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-9').value).toBe('FLEX');
  expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-10').value).toBe('SUPER_FLEX');
});
```

Replace:

```tsx
it('changes slot type when a different option is selected', () => {
  render(<NewDraftPage />);
  fireEvent.change(screen.getByTestId('lineup-slot-0'), { target: { value: 'SUPER_FLEX' } });
  expect(screen.getByTestId<HTMLSelectElement>('lineup-slot-0').value).toBe('SUPER_FLEX');
});
```

with (changing slot 0 from `QB` to `SUPER_FLEX` reorders the whole lineup: the default `[QB,RB,RB,WR,WR,TE,FLEX,FLEX,FLEX,SUPER_FLEX]` becomes `[RB,RB,WR,WR,TE,FLEX,FLEX,FLEX,SUPER_FLEX,SUPER_FLEX]` — the changed slot now sits at index 8, ahead of the original SUPER_FLEX at index 9, since sort is stable and it was earlier in array-index order before the sort ran):

```tsx
it('changes slot type and re-sorts the lineup into canonical order', () => {
  render(<NewDraftPage />);
  fireEvent.change(screen.getByTestId('lineup-slot-0'), { target: { value: 'SUPER_FLEX' } });
  const slots = screen.getAllByTestId<HTMLSelectElement>(/^lineup-slot-\d+$/);
  expect(slots.map((s) => s.value)).toEqual([
    'RB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'FLEX',
    'FLEX',
    'SUPER_FLEX',
    'SUPER_FLEX',
  ]);
});
```

Add a new test for the reported bug directly — adding a slot and changing it to `RB` groups it with the other RBs, not at the end:

```tsx
it('groups a newly-added slot with same-position slots once its type is chosen', () => {
  render(<NewDraftPage />);
  fireEvent.click(screen.getByTestId('add-lineup-slot')); // appends FLEX, sorts to index 9
  fireEvent.change(screen.getByTestId('lineup-slot-9'), { target: { value: 'RB' } });
  const slots = screen.getAllByTestId<HTMLSelectElement>(/^lineup-slot-\d+$/);
  // Default lineup's RBs are at indices 1-2; the newly-added RB should land at index 3,
  // immediately after them — not at the end.
  expect(slots.map((s) => s.value)).toEqual([
    'QB',
    'RB',
    'RB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'FLEX',
    'FLEX',
    'SUPER_FLEX',
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- drafts-new-form.test.tsx`
Expected: FAIL on the three tests just added/changed — current `addSlot`/`updateSlot` don't sort.

- [ ] **Step 3: Implement the sort**

In `src/app/drafts/new/page.tsx`, replace:

```tsx
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

with:

```tsx
const SLOT_OPTIONS: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];

function sortSlots(slots: StartingSlot[]): StartingSlot[] {
  return [...slots].sort((a, b) => SLOT_OPTIONS.indexOf(a) - SLOT_OPTIONS.indexOf(b));
}

function addSlot() {
  setStartingLineup((prev) => sortSlots([...prev, 'FLEX']));
}

function removeSlot(index: number) {
  setStartingLineup((prev) => prev.filter((_, i) => i !== index));
}

function updateSlot(index: number, slot: StartingSlot) {
  setStartingLineup((prev) => sortSlots(prev.map((s, i) => (i === index ? slot : s))));
}
```

Note: `SLOT_OPTIONS` is already declared as `['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']` immediately above and is exactly the canonical order needed — reuse it directly as the sort key source instead of declaring a second, separately-named constant.

`Array.prototype.sort` is stable in all engines Node 20+ / evergreen browsers use, so slots sharing a position keep their relative order.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- drafts-new-form.test.tsx`
Expected: PASS (full file)

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/drafts/new/page.tsx src/__tests__/drafts-new-form.test.tsx
git commit -m "fix: sort starting lineup slots into canonical position order"
```

---

### Task 5: Dynamic value-sheet caption

**Files:**

- Modify: `src/components/AuctionSheet/AuctionHeader.tsx`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/app/draft/[draftId]/page.tsx`
- Test: `src/__tests__/AuctionHeader.test.tsx`

**Interfaces:**

- Consumes: `ScoringSettings` type and `DEFAULT_SCORING_SETTINGS` from `@/types`.
- Produces: `teCaptionClause(scoringSettings: ScoringSettings): string`, a new required `scoringSettings: ScoringSettings` prop on both `AuctionHeader` and `AuctionSheet`.

- [ ] **Step 1: Write the failing tests**

`src/__tests__/AuctionHeader.test.tsx` currently doesn't pass `scoringSettings` to any of its three `render(<AuctionHeader ... />)` calls — once the prop becomes required, `pnpm tsc --noEmit` will fail on this file. Update all three existing render calls to include `scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}`, and add an import:

```tsx
import { DEFAULT_SCORING_SETTINGS } from '@/types';
```

Each of the three existing `<AuctionHeader ... />` calls gets `scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}` added as a prop (alongside `ownerBudget`, `mySpent`, etc.).

Then add a new `describe` block with the caption cases:

```tsx
describe('AuctionHeader — TE caption', () => {
  it('omits the TE clause entirely for default scoring settings', () => {
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
    expect(screen.queryByText(/TE PPR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1st Down/)).not.toBeInTheDocument();
  });

  it('shows only the PPR clause when only pprTE differs from pprWR', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS, pprTE: 2 }}
      />,
    );
    expect(screen.getByText(/TE PPR\+1/)).toBeInTheDocument();
    expect(screen.queryByText(/1st Down/)).not.toBeInTheDocument();
  });

  it('shows only the 1st down clause when only the TE first-down bonus differs', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS, recFD: 0.25 }}
      />,
    );
    expect(screen.queryByText(/TE PPR/)).not.toBeInTheDocument();
    expect(screen.getByText(/TE 1st Down\+0\.25/)).toBeInTheDocument();
  });

  it('shows both clauses joined with a slash when both differ', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
        scoringSettings={{ ...DEFAULT_SCORING_SETTINGS, pprTE: 2, recFD: 0.25 }}
      />,
    );
    expect(screen.getByText(/TE PPR\+1 \/ 1st Down\+0\.25/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- AuctionHeader.test.tsx`
Expected: FAIL — `scoringSettings` prop doesn't exist on `AuctionHeaderProps` yet, and the caption is still the static hardcoded string.

- [ ] **Step 3: Implement `teCaptionClause` and thread the prop through `AuctionHeader`**

In `src/components/AuctionSheet/AuctionHeader.tsx`, add a new type-only import above the existing `import { POS_COLORS } from '@/lib/posColors';` line (that line is unchanged, shown here only for placement context), and add the function below the imports, above the component:

```tsx
import type { ScoringSettings } from '@/types';
import { POS_COLORS } from '@/lib/posColors'; // unchanged, existing line

function teCaptionClause(scoringSettings: ScoringSettings): string {
  const pprDelta = scoringSettings.pprTE - scoringSettings.pprWR;
  const fdDelta = scoringSettings.recFD + scoringSettings.teFDBonus;
  const parts: string[] = [];
  if (pprDelta !== 0) parts.push(`PPR${pprDelta > 0 ? '+' : ''}${pprDelta}`);
  if (fdDelta !== 0) parts.push(`1st Down${fdDelta > 0 ? '+' : ''}${fdDelta}`);
  return parts.length > 0 ? ` · TE ${parts.join(' / ')}` : '';
}
```

Add `scoringSettings: ScoringSettings;` to `AuctionHeaderProps`, and destructure it in the function signature:

```tsx
interface AuctionHeaderProps {
  ownerBudget: number;
  mySpent: number;
  remaining: number;
  posStats: Record<'QB' | 'RB' | 'WR' | 'TE', { count: number; total: number }>;
  grandTotal: number;
  totalPlayerCount: number;
  scoringSettings: ScoringSettings;
}
```

```tsx
export default function AuctionHeader({
  ownerBudget,
  mySpent,
  remaining,
  posStats,
  grandTotal,
  totalPlayerCount,
  scoringSettings,
}: AuctionHeaderProps) {
```

Replace the caption line:

```tsx
<div className="mt-1.5 text-[11px] text-secondary-fg">
  2QB rankings scaled 5× · TE PPR+1 / 1st Down+0.25 applied · {totalPlayerCount} players + pick
  assets
</div>
```

with:

```tsx
<div className="mt-1.5 text-[11px] text-secondary-fg">
  2QB rankings scaled 5×{teCaptionClause(scoringSettings)} · {totalPlayerCount} players + pick
  assets
</div>
```

- [ ] **Step 4: Thread `scoringSettings` through `AuctionSheet`**

In `src/components/AuctionSheet/AuctionSheet.tsx`, add `scoringSettings: ScoringSettings;` to `AuctionSheetProps` (add the import `import type { ScoringSettings } from '@/types';` alongside the existing type import from `@/types`), add it to the destructured props, and pass it to `<AuctionHeader>`:

```tsx
interface AuctionSheetProps {
  players: Player[];
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  nominatedPlayers: string[];
  draftId: number;
  ownerHandle: string | null;
  ownerBudget: number;
  scoringSettings: ScoringSettings;
}

export default function AuctionSheet({
  players,
  claimedBids,
  teams,
  nominatedPlayers,
  draftId,
  ownerHandle,
  ownerBudget,
  scoringSettings,
}: AuctionSheetProps) {
```

```tsx
<AuctionHeader
  ownerBudget={ownerBudget}
  mySpent={mySpent}
  remaining={remaining}
  posStats={posStats}
  grandTotal={grandTotal}
  totalPlayerCount={totalPlayerCount}
  scoringSettings={scoringSettings}
/>
```

- [ ] **Step 5: Pass `draft.scoringSettings` from the draft page**

In `src/app/draft/[draftId]/page.tsx`, add `DEFAULT_SCORING_SETTINGS, type ScoringSettings` to the existing `@/types` import:

```tsx
import {
  DEFAULT_STARTING_LINEUP,
  DEFAULT_SCORING_SETTINGS,
  type StartingSlot,
  type ScoringSettings,
} from '@/types';
```

Add the prop to the `<AuctionSheet>` call, following the same nullable-JSON-field cast pattern already used for `startingLineup` two lines above it:

```tsx
<AuctionSheet
  players={players}
  claimedBids={claimedBids}
  teams={teams as LeagueTeam[]}
  nominatedPlayers={nominatedEntries.map((e) => e.playerName)}
  draftId={draftId}
  ownerHandle={draft.ownerTeam?.handle ?? null}
  ownerBudget={draft.ownerTeam?.budget ?? 1000}
  scoringSettings={(draft.scoringSettings ?? DEFAULT_SCORING_SETTINGS) as ScoringSettings}
/>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- AuctionHeader.test.tsx`
Expected: PASS (all 7 tests — 3 existing + 4 new)

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors — this will catch any other test file constructing `<AuctionSheet>` or `<AuctionHeader>` without the new required prop. If `pnpm tsc --noEmit` surfaces such a file, add `scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}` to its render calls too (search first: `grep -rn "<AuctionSheet" src/__tests__` and `grep -rn "<AuctionHeader" src/__tests__`).

- [ ] **Step 8: Commit**

```bash
git add src/components/AuctionSheet/AuctionHeader.tsx src/components/AuctionSheet/AuctionSheet.tsx "src/app/draft/[draftId]/page.tsx" src/__tests__/AuctionHeader.test.tsx
git commit -m "feat: derive value-sheet TE caption from draft scoring settings"
```

---

### Task 6: Team Rosters summary alignment

**Files:**

- Modify: `src/components/RosterTracker/TeamRosterDetail.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing consumed by other tasks.

No test changes — `src/__tests__/TeamRosterDetail.test.tsx` has no `className`/CSS assertions (confirmed: `grep -n "className\|toHaveClass\|min-w" src/__tests__/TeamRosterDetail.test.tsx` returns nothing), so this is a pure visual fix verified by running the existing suite unchanged plus a manual look.

- [ ] **Step 1: Apply the fixed-width alignment**

In `src/components/RosterTracker/TeamRosterDetail.tsx`, replace:

```tsx
<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
  ${subtotal}
  {deltaTotal !== 0 && (
    <span style={{ color: deltaTotal > 0 ? 'var(--age-old)' : 'var(--age-young)' }}>
      {' '}
      ({deltaTotal > 0 ? '+' : '-'}${Math.abs(deltaTotal)})
    </span>
  )}
</span>
```

with:

```tsx
<span className="min-w-[80px] text-right font-mono text-[11px] text-muted-foreground tabular-nums">
  ${subtotal}
  {deltaTotal !== 0 && (
    <span style={{ color: deltaTotal > 0 ? 'var(--age-old)' : 'var(--age-young)' }}>
      {' '}
      ({deltaTotal > 0 ? '+' : '-'}${Math.abs(deltaTotal)})
    </span>
  )}
</span>
```

(Only the `className` string changes — `min-w-[80px] text-right` added before the existing classes. No other lines in this file change.)

- [ ] **Step 2: Run the existing test suite to confirm no regression**

Run: `pnpm test -- TeamRosterDetail.test.tsx`
Expected: PASS (unchanged — this file has no CSS-class assertions, so the fix doesn't affect any existing expectation)

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 4: Manually verify**

Run: `pnpm dev`
Navigate to `/teams`, expand a team's roster drawer. Confirm every position group's subtotal (`$45`, `$134 (+$12)`, etc.) starts at the same horizontal position regardless of digit count, and compare against a position with a single-digit delta to confirm the reported misalignment is gone. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/components/RosterTracker/TeamRosterDetail.tsx
git commit -m "fix: align team roster per-position summary subtotals"
```
