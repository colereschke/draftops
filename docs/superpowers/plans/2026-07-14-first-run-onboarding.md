# First-Run Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give first-time DraftOps owners a persistent, account-scoped welcome and concise cross-page tour of their first real draft.

**Architecture:** Persist one `OnboardingProgress` record per Discord user. Server pages decide whether onboarding applies; a layout-mounted client controller renders an anchored tour and persists each step while it auto-navigates among draft pages. Existing bid and nomination mutations notify that controller only after their real request succeeds, so the following step teaches reversal of that exact action.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, React, Prisma 7/Postgres, Auth.js v5, Tailwind CSS 4, Jest + React Testing Library.

## Global Constraints

- Preserve the existing `/drafts/new` form and Sleeper import; do not create a setup wizard or demo draft.
- Persist completion by authenticated Discord user ID. Completion/skip must never reappear across browsers or later drafts.
- Do not interrupt users who already own a draft when this feature ships.
- Optional exercises operate on real draft data and immediately show the existing reversal UI.
- Use typed prop interfaces, stable `data-testid`/ `data-onboarding-target` selectors, no explicit `any`, and visible mutation failures.
- Do not stage unrelated worktree files.

---

## File structure

| File                                         | Responsibility                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `prisma/schema.prisma` + generated migration | Progress enums, table, unique user ownership, optional current-draft relation. |
| `src/lib/onboarding.ts`                      | Server-only lookup and first-draft eligibility helpers.                        |
| `src/lib/onboarding-actions.ts`              | Auth-checked begin, advance, and complete mutations.                           |
| `src/components/Onboarding/*`                | Welcome panel, shared context, step map, accessible controller.                |
| `src/app/drafts/page.tsx`                    | First-run welcome eligibility and rendering.                                   |
| `src/lib/actions.ts`                         | Atomic transition to feature-tour state after first draft creation.            |
| `src/app/draft/[draftId]/layout.tsx`         | Mounts the controller only for the progress record’s draft.                    |
| Existing app components                      | Stable targets and successful bid/nomination notifications.                    |
| `src/__tests__/*onboarding*`                 | Lifecycle, controller, and integration tests.                                  |

## Task 1: Persist onboarding progress

**Files:**

- Modify: `prisma/schema.prisma`
- Create: Prisma-generated migration named `add_onboarding_progress`
- Create: `src/lib/onboarding.ts`
- Test: `src/__tests__/lib/onboarding.test.ts`

**Consumes:** Auth.js user IDs and existing Draft ownership.

**Produces:** `OnboardingPhase`, `OnboardingStep`, `OnboardingProgress`, `getOnboardingProgress(userId)`, and `isFirstDraftOnboardingEligible(userId)`.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it('enrolls only an account with no progress and no drafts', async () => {
  mockOnboardingFindUnique.mockResolvedValue(null);
  mockDraftCount.mockResolvedValue(0);

  await expect(isFirstDraftOnboardingEligible('discord-1')).resolves.toBe(true);
});

it('does not enroll an existing owner with a draft', async () => {
  mockOnboardingFindUnique.mockResolvedValue(null);
  mockDraftCount.mockResolvedValue(1);

  await expect(isFirstDraftOnboardingEligible('discord-1')).resolves.toBe(false);
});
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm test -- onboarding.test.ts --runInBand`

Expected: FAIL because `@/lib/onboarding` does not exist.

- [ ] **Step 3: Add the Prisma schema and generate the migration**

```prisma
enum OnboardingPhase {
  DRAFT_SETUP
  FEATURE_TOUR
  COMPLETED
}

enum OnboardingStep {
  VALUE_SHEET_INTRO
  BID_PRACTICE
  BID_UNDO
  BUDGET_PRESSURE
  TEAM_ROSTERS
  NOMINATE_INTRO
  NOMINATE_PRACTICE
  NOMINATE_UNDO
}

model OnboardingProgress {
  id                Int            @id @default(autoincrement())
  userId            String         @unique
  phase             OnboardingPhase
  step              OnboardingStep @default(VALUE_SHEET_INTRO)
  draftId           Int?
  subjectPlayerName String?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  completedAt       DateTime?

  draft Draft? @relation(fields: [draftId], references: [id], onDelete: SetNull)

  @@index([draftId])
}
```

Add `onboardingProgress OnboardingProgress?` to `Draft`. Run `pnpm prisma migrate dev --name add_onboarding_progress`; inspect and retain Prisma’s generated migration.

- [ ] **Step 4: Implement the server-only helpers**

```ts
import 'server-only';
import { prisma } from '@/lib/db';

export async function getOnboardingProgress(userId: string) {
  return prisma.onboardingProgress.findUnique({ where: { userId } });
}

export async function isFirstDraftOnboardingEligible(userId: string): Promise<boolean> {
  const [progress, draftCount] = await Promise.all([
    getOnboardingProgress(userId),
    prisma.draft.count({ where: { ownerId: userId } }),
  ]);
  return progress === null && draftCount === 0;
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm test -- onboarding.test.ts --runInBand && pnpm tsc --noEmit`

Expected: PASS.

```bash
git add prisma/schema.prisma prisma/migrations src/lib/onboarding.ts src/__tests__/lib/onboarding.test.ts
git commit -m "feat: add onboarding progress model"
```

## Task 2: Add authorized lifecycle actions and transition on first draft

**Files:**

- Create: `src/lib/onboarding-actions.ts`
- Modify: `src/lib/actions.ts`
- Test: `src/__tests__/onboarding-actions.test.ts`
- Modify: `src/__tests__/createDraft.test.ts`

**Consumes:** Task 1 model and existing `createDraft` transaction.

**Produces:** `beginOnboarding()`, `advanceOnboardingStep(input)`, `completeOnboarding()`, and atomic first-draft enrollment.

- [ ] **Step 1: Write failing action tests**

```ts
await expect(beginOnboarding()).rejects.toThrow('Unauthorized');

await beginOnboarding();
expect(mockOnboardingUpsert).toHaveBeenCalledWith({
  where: { userId: '123456789' },
  create: { userId: '123456789', phase: 'DRAFT_SETUP' },
  update: {},
});

await advanceOnboardingStep({
  draftId: 5,
  step: 'BID_UNDO',
  subjectPlayerName: 'Josh Allen',
});
expect(mockOnboardingUpdateMany).toHaveBeenCalledWith({
  where: { userId: '123456789', phase: 'FEATURE_TOUR', draftId: 5 },
  data: { step: 'BID_UNDO', subjectPlayerName: 'Josh Allen' },
});
```

Add a `createDraft` test where `tx.draft.count` is zero and `tx.onboardingProgress.upsert` receives `FEATURE_TOUR`, draft `5`, and `VALUE_SHEET_INTRO`.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- onboarding-actions.test.ts createDraft.test.ts --runInBand`

Expected: FAIL because the actions and transaction calls do not exist.

- [ ] **Step 3: Implement server actions and transaction change**

```ts
export interface AdvanceOnboardingInput {
  draftId: number;
  step: OnboardingStep;
  subjectPlayerName?: string;
}

export async function completeOnboarding(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  await prisma.onboardingProgress.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, phase: 'COMPLETED', completedAt: new Date() },
    update: {
      phase: 'COMPLETED',
      completedAt: new Date(),
      draftId: null,
      subjectPlayerName: null,
    },
  });
}
```

`beginOnboarding` must only create a missing record and never overwrite `COMPLETED`. `advanceOnboardingStep` uses `updateMany` scoped to user, `FEATURE_TOUR`, and supplied draft, then throws `Onboarding not found` when the count is zero. Revalidate `/drafts` for begin/complete and `/draft/${draftId}` for advancement.

Inside the existing `createDraft` transaction, count this owner’s drafts before creating one. After player/projection work succeeds, upsert `FEATURE_TOUR` only for the user’s first draft and only if no completed row exists. Keep it inside the transaction so a projection failure leaves neither draft nor tour state.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- onboarding-actions.test.ts createDraft.test.ts --runInBand && pnpm tsc --noEmit && pnpm lint`

Expected: PASS.

```bash
git add src/lib/onboarding-actions.ts src/lib/actions.ts src/__tests__/onboarding-actions.test.ts src/__tests__/createDraft.test.ts
git commit -m "feat: persist first-draft onboarding lifecycle"
```

## Task 3: Render the welcome without replacing draft creation

**Files:**

- Create: `src/components/Onboarding/FirstRunWelcome.tsx`
- Modify: `src/app/drafts/page.tsx`
- Test: `src/__tests__/FirstRunWelcome.test.tsx`

**Consumes:** Task 2 actions and Task 1 eligibility helper.

**Produces:** A dismissible welcome panel that starts setup or permanently skips onboarding.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<FirstRunWelcome eligible />);
await user.click(screen.getByTestId('first-run-create-draft'));
expect(mockBeginOnboarding).toHaveBeenCalled();
expect(mockPush).toHaveBeenCalledWith('/drafts/new');

await user.click(screen.getByTestId('first-run-skip'));
expect(mockCompleteOnboarding).toHaveBeenCalled();
expect(screen.queryByTestId('first-run-welcome')).not.toBeInTheDocument();
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- FirstRunWelcome.test.tsx --runInBand`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement page and panel**

```tsx
interface FirstRunWelcomeProps {
  eligible: boolean;
}

export default function FirstRunWelcome({ eligible }: FirstRunWelcomeProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(eligible);
  if (!visible) return null;
  // Create awaits beginOnboarding(), then router.push('/drafts/new').
  // Skip awaits completeOnboarding(), then setVisible(false).
}
```

Use `first-run-welcome`, `first-run-create-draft`, and `first-run-skip` test IDs. In `/drafts`, query drafts and eligibility concurrently after authentication and render the panel before the existing list. Preserve the current empty-state Create Draft link for people who skip.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- FirstRunWelcome.test.tsx drafts-new-form.test.tsx --runInBand`

Expected: PASS.

```bash
git add src/components/Onboarding/FirstRunWelcome.tsx src/app/drafts/page.tsx src/__tests__/FirstRunWelcome.test.tsx
git commit -m "feat: welcome first-time draft owners"
```

## Task 4: Build the persistent accessible controller

**Files:**

- Create: `src/components/Onboarding/types.ts`
- Create: `src/components/Onboarding/tourSteps.ts`
- Create: `src/components/Onboarding/OnboardingContext.tsx`
- Create: `src/components/Onboarding/OnboardingTour.tsx`
- Create: `src/components/Onboarding/index.ts`
- Test: `src/__tests__/OnboardingTour.test.tsx`

**Consumes:** Task 2 actions.

**Produces:** `useOnboarding()` and a controller that persists steps, auto-navigates, supports Escape/Skip, restores focus, and bypasses missing targets.

- [ ] **Step 1: Write failing controller tests**

```tsx
render(<OnboardingTour progress={FEATURE_TOUR_PROGRESS} />);
expect(screen.getByTestId('onboarding-tour')).toHaveTextContent('Your market board');

await user.click(screen.getByTestId('onboarding-next'));
expect(mockAdvanceOnboardingStep).toHaveBeenCalledWith({
  draftId: 5,
  step: 'BUDGET_PRESSURE',
});
expect(mockPush).toHaveBeenCalledWith('/draft/5/budget');

await user.keyboard('{Escape}');
expect(mockCompleteOnboarding).toHaveBeenCalled();
```

Also test a missing `[data-onboarding-target]` automatically advances to the next defined step rather than leaving an invisible blocking overlay.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- OnboardingTour.test.tsx --runInBand`

Expected: FAIL because the controller and context do not exist.

- [ ] **Step 3: Define contracts and all steps**

```ts
export interface TourProgress {
  draftId: number;
  step: OnboardingStep;
  subjectPlayerName: string | null;
}

export interface OnboardingContextValue {
  progress: TourProgress | null;
  recordBidLogged: (playerName: string) => Promise<void>;
  recordPlayerNominated: (playerName: string) => Promise<void>;
}
```

The declarative map must define all eight persisted steps: `VALUE_SHEET_INTRO`, `BID_PRACTICE`, `BID_UNDO`, `BUDGET_PRESSURE`, `TEAM_ROSTERS`, `NOMINATE_INTRO`, `NOMINATE_PRACTICE`, and `NOMINATE_UNDO`. Each entry has route, target attribute value, title, copy, next step/route, and whether it waits for an optional action. Practice steps display a `Continue without trying it` control. Undo copy includes `subjectPlayerName`.

- [ ] **Step 4: Implement controller behavior**

Render a fixed `role="dialog"`, `aria-modal="false"` popover. Locate the anchor with `document.querySelector`, derive placement from `getBoundingClientRect()`, and clamp top/left to a 16px viewport margin on scroll and resize. Focus the popover after step changes and restore the previous focused element after skip/complete. Escape invokes exactly the Skip completion path.

Ordinary Next awaits `advanceOnboardingStep`, updates local progress, then `router.push(nextRoute)`. Successful mutation context events persist `BID_UNDO`/ `NOMINATE_UNDO` and their player name before updating local progress. Persistence errors display: `Unable to save tour progress. You can keep using DraftOps or skip the tour.` and keep the current step.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test -- OnboardingTour.test.tsx --runInBand && pnpm tsc --noEmit`

Expected: PASS.

```bash
git add src/components/Onboarding src/__tests__/OnboardingTour.test.tsx
git commit -m "feat: add persistent onboarding tour controller"
```

## Task 5: Mount the tour and add informational anchors

**Files:**

- Modify: `src/app/draft/[draftId]/layout.tsx`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/components/AuctionSheet/FilterControls.tsx`
- Modify: `src/components/BudgetPressure/BudgetPressureView.tsx`
- Modify: `src/components/RosterTracker/RosterTracker.tsx`
- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Test: `src/__tests__/OnboardingTargets.test.tsx`

**Consumes:** Tasks 1 and 4.

**Produces:** A layout controller only for the active tour draft plus one stable anchor per informational page.

- [ ] **Step 1: Write failing mount/anchor tests**

```tsx
mockProgress.mockResolvedValue({ ...FEATURE_TOUR_PROGRESS, draftId: 5 });
render(await DraftLayout({ children: <div />, params: Promise.resolve({ draftId: '5' }) }));
expect(screen.getByTestId('onboarding-tour')).toBeInTheDocument();

mockProgress.mockResolvedValue({ ...FEATURE_TOUR_PROGRESS, draftId: 6 });
render(await DraftLayout({ children: <div />, params: Promise.resolve({ draftId: '5' }) }));
expect(screen.queryByTestId('onboarding-tour')).not.toBeInTheDocument();
```

Add component assertions for `value-sheet`, `budget-pressure`, `team-rosters`, and `nominate-intro` target attributes.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- OnboardingTargets.test.tsx --runInBand`

Expected: FAIL because no layout mount or targets exist.

- [ ] **Step 3: Implement layout and targets**

In the layout, fetch the owned draft and progress in parallel after authentication. Keep children unchanged and render:

```tsx
{
  progress?.phase === 'FEATURE_TOUR' && progress.draftId === draftId ? (
    <OnboardingTour
      progress={{
        draftId,
        step: progress.step,
        subjectPlayerName: progress.subjectPlayerName,
      }}
    />
  ) : null;
}
```

Add these target attributes to existing semantic containers: `value-sheet` on Value Sheet header/filter wrapper; `bid-practice` on its player-table wrapper; `budget-pressure` on buying-power summary; `team-rosters` on roster summary/table; `nominate-intro` on Nomination Helper header/metrics.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- OnboardingTargets.test.tsx components/BudgetPressureView.test.tsx --runInBand`

Expected: PASS.

```bash
git add 'src/app/draft/[draftId]/layout.tsx' src/components/AuctionSheet src/components/BudgetPressure/BudgetPressureView.tsx src/components/RosterTracker/RosterTracker.tsx src/components/NominationHelper/NominationHelper.tsx src/__tests__/OnboardingTargets.test.tsx
git commit -m "feat: mount onboarding tour across draft pages"
```

## Task 6: Connect the optional bid exercise and exact undo target

**Files:**

- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/components/AuctionSheet/PlayerTable.tsx`
- Test: `src/__tests__/AuctionSheet.onboarding.test.tsx`

**Consumes:** `useOnboarding().recordBidLogged` from Task 4.

**Produces:** A success-only bid event and anchor on the exact logged player row.

- [ ] **Step 1: Write failing integration tests**

```tsx
await user.click(screen.getByTestId('player-row-1'));
await user.click(screen.getByRole('button', { name: /log bid/i }));
await waitFor(() => expect(mockRecordBidLogged).toHaveBeenCalledWith('Josh Allen'));

render(<PlayerTable {...props} onboardingSubjectPlayerName="Josh Allen" />);
expect(screen.getByTestId('onboarding-bid-undo-Josh Allen')).toHaveAttribute(
  'data-onboarding-target',
  'bid-undo',
);
```

Mock a rejected `logBid` and assert no context notification occurs while the existing visible error remains.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- AuctionSheet.onboarding.test.tsx --runInBand`

Expected: FAIL because the context event and undo target do not exist.

- [ ] **Step 3: Implement success-only notification**

After `await logBid(...)` resolves in the new-bid branch, call `recordBidLogged(modalPlayer.player)`; do not call it for edits, deletes, or failures. Pass `progress?.subjectPlayerName` to `PlayerTable`. Only the matching claimed row receives:

```tsx
data-testid={`onboarding-bid-undo-undefined`}
data-onboarding-target="bid-undo"
```

The undo tooltip instructs the owner to reopen this player and use the existing **Remove** button in `BidModal`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- AuctionSheet.onboarding.test.tsx AuctionSheet.claimed.test.tsx BidModal.test.tsx --runInBand`

Expected: PASS.

```bash
git add src/components/AuctionSheet/AuctionSheet.tsx src/components/AuctionSheet/PlayerTable.tsx src/__tests__/AuctionSheet.onboarding.test.tsx
git commit -m "feat: guide onboarding bid reversal"
```

## Task 7: Connect nomination practice and exact un-nominate target

**Files:**

- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Modify: `src/components/NominationHelper/NominationTable.tsx`
- Modify: `src/components/NominationHelper/WatchlistSidebar.tsx`
- Test: `src/__tests__/NominationHelper.onboarding.test.tsx`

**Consumes:** `useOnboarding().recordPlayerNominated` from Task 4.

**Produces:** A success-only nomination event, practice target, and live-rail remove target for that player.

- [ ] **Step 1: Write failing integration tests**

```tsx
await user.click(screen.getByTestId('nominate-player-Josh Allen'));
await waitFor(() => expect(mockRecordPlayerNominated).toHaveBeenCalledWith('Josh Allen'));

render(<WatchlistSidebar {...props} onboardingSubjectPlayerName="Josh Allen" />);
expect(screen.getByTestId('onboarding-nominate-undo-Josh Allen')).toHaveAttribute(
  'data-onboarding-target',
  'nominate-undo',
);
```

Reject the POST request and assert the context event is not called and optimistic state is restored.

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- NominationHelper.onboarding.test.tsx --runInBand`

Expected: FAIL because tour wiring does not exist.

- [ ] **Step 3: Implement nomination wiring**

Add `data-testid={\`nominate-player-undefined\`}`and`data-onboarding-target="nominate-practice"`to current NominationTable action buttons. Call`recordPlayerNominated(playerName)`only after a successful POST. Pass the context subject to`WatchlistSidebar`; its matching existing In Auction removal button receives:

```tsx
data-testid={`onboarding-nominate-undo-${name}`}
data-onboarding-target="nominate-undo"
```

Keep its existing accessible name, `Remove ${name} from in auction`; the undo tooltip tells the owner to use it.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- NominationHelper.onboarding.test.tsx NominationHelper.ui.test.tsx liveNomination.test.ts --runInBand`

Expected: PASS.

```bash
git add src/components/NominationHelper src/__tests__/NominationHelper.onboarding.test.tsx
git commit -m "feat: guide onboarding nomination reversal"
```

## Task 8: Verify the complete first-run experience

**Files:**

- Modify only focused Task 1–7 files if verification exposes a defect.
- Test: all new onboarding tests and affected existing suites.

**Consumes:** Completed tasks.

**Produces:** A release-ready onboarding flow with no regressions in draft creation, bid logging, or nomination state.

- [ ] **Step 1: Run the quality gate**

Run: `make check`

Expected: typecheck, lint, formatting, and all Jest tests PASS.

- [ ] **Step 2: Perform the browser acceptance pass**

Run: `make dev`, then use the browser to verify:

1. A new account with no drafts sees Welcome; Create Draft opens the unchanged form.
2. Creating its first draft opens the Value Sheet at `VALUE_SHEET_INTRO`.
3. Next auto-navigates Value Sheet → Budget → Teams → Nominate.
4. A real bid advances to that player’s Remove guidance; a failed bid remains at practice with its visible error.
5. A real nomination advances to its In Auction remove control; a failed nomination remains at practice.
6. Refresh resumes the persisted informational/action step.
7. Escape and Skip suppress onboarding after sign-out/sign-in and on a later draft.
8. Tab focus and popover placement work on desktop and at 375px width.
