# HARD-022 Draft Form Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the new-draft form into focused state, type/helper, style, and rendering modules while preserving every current user-visible behavior.

**Architecture:** `useDraftFormState` retains every current state transition, import effect, validation path, and submit effect. Section components receive explicit values/callbacks and move existing markup/styles verbatim. The route page stays responsible only for shell, form placement, error display, and composition.

**Tech Stack:** Next.js 16 App Router, React 19 hooks, strict TypeScript, Zod `draftInputSchema`, Jest + React Testing Library.

## Global Constraints

- Structural only: no functionality, copy, visual design, inline style value, validation, server/API/database, accessibility, URL, or existing stable-test-ID changes.
- Keep render-time clamped team resizing; do not move it to an effect.
- Only add/update lineup interactions sort; imports keep supplied order.
- Keep import outside `<form>`, ranking warning independent, and the two transitions separate.
- Preserve current error strings and best-effort client-error capture.
- New/touched tests use `data-testid` or `id`; only team-row controls may receive new inert IDs.
- Test integrated behavior/payloads only; no hook/component-boundary tests.
- Run targeted Jest after each task and `make check` before final review.

### Task 1: Characterize contracts and extract primitives

**Files:** Create `src/app/drafts/new/draftFormTypes.ts`, `src/app/drafts/new/draftFormStyles.ts`; modify `src/__tests__/drafts-new-form.test.tsx`.

**Interfaces:** `TeamRow`, `ImportState`, `defaultTeams(count)`, and `sortStartingLineup(slots)` are exported. Style objects retain every existing CSS-property value.

- [ ] **Step 1: Isolate mocks and add integrated characterization**

Reset `mockImportFromSleeper`, `mockGetRankingSummary`, `createDraft`, and observability mocks in
root `beforeEach` before setting default resolutions. Add a domain-consistent eight-team import
fixture with nonzero owner index, changed scoring values, and a deliberately noncanonical lineup.
Assert team count/rows, selected owner, scoring, and exact imported lineup. Add one exact
successful `createDraft` payload assertion. Replace touched team display-value queries with IDs.

```tsx
expect(screen.getAllByTestId(/^lineup-slot-/).map((slot) => slot.value)).toEqual(
  importedLeague.startingLineup,
);
expect(screen.getByTestId('team-mine-3')).toBeChecked();
```

- [ ] **Step 2: Run characterization on existing behavior**

Run: `pnpm exec jest src/__tests__/drafts-new-form.test.tsx --runInBand`

Expected: PASS; this is a behavior baseline before moving implementation.

- [ ] **Step 3: Extract types, helpers, and styles verbatim**

```ts
export function sortStartingLineup(slots: StartingSlot[]): StartingSlot[] {
  const options: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];
  return [...slots].sort((left, right) => options.indexOf(left) - options.indexOf(right));
}
```

Do not call this helper for imported values. Move existing inline style objects without value edits.

- [ ] **Step 4: Verify and commit**

Run: `pnpm exec jest src/__tests__/drafts-new-form.test.tsx --runInBand`

Expected: PASS.

```bash
git add src/app/drafts/new/draftFormTypes.ts src/app/drafts/new/draftFormStyles.ts src/__tests__/drafts-new-form.test.tsx
git commit -m "refactor: extract draft form primitives"
```

### Task 2: Extract the single form-state hook

**Files:** Create `src/app/drafts/new/useDraftFormState.ts`; modify `src/app/drafts/new/page.tsx`.

**Interfaces:** `useDraftFormState(): DraftFormState` returns every field value, error/import/ranking state, both pending flags, all section callbacks, `handleImport`, and `handleSubmit`.

- [ ] **Step 1: Run current page-level form coverage**

Run: `pnpm exec jest src/__tests__/drafts-new-form.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 2: Move state/effects unchanged into the hook**

```ts
export function useDraftFormState(): DraftFormState {
  const teamCountField = useNumericField(12);
  const [teams, setTeams] = useState<TeamRow[]>(() => defaultTeams(12));
  const [syncedTeamCount, setSyncedTeamCount] = useState(12);
  const [isPending, startTransition] = useTransition();
  const [isImporting, startImportTransition] = useTransition();
}
```

Retain render-time `safeTeamCount` state synchronization in the hook body. Retain separate
transitions. Assign `data.startingLineup` directly during import. Preserve candidate construction,
`draftInputSchema.safeParse`, typed result mapping, navigation, and observability catch.

- [ ] **Step 3: Keep page shell/form boundary while wiring hook values**

Keep `<main>`, title/cancel controls, import-before-form placement, `<form>`, inline error, and
submit controls. Do not move markup into section components yet.

- [ ] **Step 4: Verify and commit**

Run: `pnpm exec jest src/__tests__/drafts-new-form.test.tsx --runInBand && pnpm tsc --noEmit && pnpm lint`

Expected: PASS.

```bash
git add src/app/drafts/new/useDraftFormState.ts src/app/drafts/new/page.tsx
git commit -m "refactor: extract draft form state"
```

### Task 3: Extract rendering sections and validate

**Files:** Create `DraftImportSection.tsx`, `DraftSettingsSection.tsx`, `PlayerSourceSection.tsx`, `RosterSettingsSection.tsx`, `StartingLineupSection.tsx`, `ScoringSection.tsx`, `FuturePicksSection.tsx`, and `TeamRosterSection.tsx`; modify `page.tsx` and only necessary stable-selector tests.

**Interfaces:** Each section accepts only its rendered values/callbacks. `DraftImportSection` is rendered before `<form>`; all other input sections remain in the current form sequence.

- [ ] **Step 1: Run form coverage before markup movement**

Run: `pnpm exec jest src/__tests__/drafts-new-form.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 2: Move existing section JSX and style references verbatim**

```tsx
interface StartingLineupSectionProps {
  startingLineup: StartingSlot[];
  onAddSlot: () => void;
  onRemoveSlot: (index: number) => void;
  onUpdateSlot: (index: number, slot: StartingSlot) => void;
}
```

Retain text, control order, attributes, test IDs, disabled state, and native form nesting. Add only
`data-testid={`team-handle-${index}`}` and `data-testid={`team-mine-${index}`}` to existing team controls.

- [ ] **Step 3: Compose original structure and verify**

Keep ranking warning behavior, current error display, and submit transition. Run:

```bash
pnpm exec jest src/__tests__/drafts-new-form.test.tsx src/__tests__/criticalRouteAccessibility.test.tsx src/__tests__/criticalRouteLandmarks.test.tsx --runInBand
pnpm tsc --noEmit
pnpm lint
pnpm format:check
make check
```

Expected: every command passes; correct extraction rather than weakening assertions.

- [ ] **Step 4: Commit**

```bash
git add src/app/drafts/new src/__tests__/drafts-new-form.test.tsx
git commit -m "refactor: decompose draft creation form"
```

## Plan self-review

- Tasks cover characterization, pure primitives, state ownership, sections, composition, and full verification.
- Explicit constraints protect team resizing, import ordering, transitions, form placement, presentation, and recovery.
- Added tests cover import and payload contracts only, not extraction mechanics.
