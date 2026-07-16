# Workstream B — Draft Lifecycle Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a `COMPLETE` draft permanently read-only while preserving all historical read access.

**Architecture:** Create `draftMutationGuard.ts` as the single active-status authorization boundary, then require it in every server action and mutation route. Pass the status already loaded by the draft server pages into client components so their mutation controls are not rendered for completed drafts. Workstream A will extend this guard with payload/player integrity checks; it must not create a second lifecycle helper.

**Tech Stack:** Next.js 16 App Router, Prisma 7, TypeScript 5, Jest and React Testing Library.

## Global Constraints

- Source: `docs/draftops-audit-workstreams.md` Workstream B and `docs/superpowers/specs/2026-07-14-workstream-b-draft-lifecycle-enforcement-design.md`.
- `COMPLETE` is permanent; do not add a reopen action or an implicit transition back to `ACTIVE`.
- Read endpoints and pages continue to use `getDraft`; only mutation paths use `requireActiveDraft`.
- Return `409` for an owned completed draft, `404` for a missing/unowned draft, and preserve the existing `401` authentication response.
- Use `data-testid` or `id` selectors in new component tests; keep fixtures typed with existing source types.
- No new dependencies. Follow the existing error-code style and 100-character Prettier width.
- Workstream A owns its extra validation methods in `src/lib/draftMutationGuard.ts`; reuse `DraftMutationError` and `requireActiveDraft` from this plan.

---

### Task 1: Add the shared active-draft guard

**Files:**

- Create: `src/lib/draftMutationGuard.ts`
- Create: `src/__tests__/draftMutationGuard.test.ts`

**Interfaces:**

- Consumes: `getDraft(userId, draftId)` from `src/lib/draft.ts`.
- Produces: `DraftMutationError(message: string, status: number)` and `requireActiveDraft(userId: string, draftId: number): Promise<DraftWithOwnerTeam>`.

- [ ] **Step 1: Write the failing guard tests**

```ts
import { DraftMutationError, requireActiveDraft } from '@/lib/draftMutationGuard';

const mockGetDraft = jest.fn();
jest.mock('@/lib/draft', () => ({ getDraft: (...args: unknown[]) => mockGetDraft(...args) }));

describe('requireActiveDraft', () => {
  it('returns an owned ACTIVE draft', async () => {
    const draft = { id: 1, status: 'ACTIVE' };
    mockGetDraft.mockResolvedValue(draft);
    await expect(requireActiveDraft('user-1', 1)).resolves.toBe(draft);
  });

  it('rejects a missing or unowned draft as 404', async () => {
    mockGetDraft.mockResolvedValue(null);
    await expect(requireActiveDraft('user-1', 1)).rejects.toMatchObject({
      message: 'No draft found',
      status: 404,
    });
  });

  it('rejects a completed owned draft as 409', async () => {
    mockGetDraft.mockResolvedValue({ id: 1, status: 'COMPLETE' });
    await expect(requireActiveDraft('user-1', 1)).rejects.toEqual(
      new DraftMutationError('Draft is not active', 409),
    );
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm test -- src/**tests**/draftMutationGuard.test.ts --runInBand`

Expected: FAIL with `Cannot find module '@/lib/draftMutationGuard'`.

- [ ] **Step 3: Implement the smallest guard**

```ts
import { getDraft, type DraftWithOwnerTeam } from '@/lib/draft';

export class DraftMutationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'DraftMutationError';
  }
}

export async function requireActiveDraft(
  userId: string,
  draftId: number,
): Promise<DraftWithOwnerTeam> {
  const draft = await getDraft(userId, draftId);
  if (!draft) throw new DraftMutationError('No draft found', 404);
  if (draft.status !== 'ACTIVE') throw new DraftMutationError('Draft is not active', 409);
  return draft;
}
```

- [ ] **Step 4: Verify the guard passes**

Run: `pnpm test -- src/**tests**/draftMutationGuard.test.ts --runInBand`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit the guard**

```bash
git add src/lib/draftMutationGuard.ts src/**tests**/draftMutationGuard.test.ts
git commit -m "feat: guard mutations on active drafts"
```

### Task 2: Reject completed drafts from bid mutations

**Files:**

- Modify: `src/lib/actions.ts:6-91`
- Modify: `src/**tests**/actions.test.ts`

**Interfaces:**

- Consumes: `requireActiveDraft` from Task 1 after authenticating with `auth()`.
- Produces: `logBid`, `updateBid`, and `deleteBid` that throw `DraftMutationError('Draft is not active', 409)` before team or auction-result writes.

- [ ] **Step 1: Write failing action tests**

Mock the guard in `src/**tests**/actions.test.ts` and set it to reject a completed draft:

```ts
const mockRequireActiveDraft = jest.fn();
jest.mock('@/lib/draftMutationGuard', () => ({
requireActiveDraft: (...args: unknown[]) => mockRequireActiveDraft(...args),
}));

it.each([
['logBid', () => logBid(BID_DATA)],
['updateBid', () => updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })],
['deleteBid', () => deleteBid({ id: 7, draftId: 1 })],
])('%s rejects a completed draft before writing', async (\_name, mutate) => {
mockRequireActiveDraft.mockRejectedValueOnce(new Error('Draft is not active'));
await expect(mutate()).rejects.toThrow('Draft is not active');
expect(mockCreate).not.toHaveBeenCalled();
expect(mockUpdateMany).not.toHaveBeenCalled();
expect(mockDeleteMany).not.toHaveBeenCalled();
});
```

Set `mockRequireActiveDraft.mockResolvedValue(MOCK_DRAFT)` in `beforeEach`, remove the `getDraft` mock, and update existing missing-draft tests to have the guard reject `new Error('No draft found')`.

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm test -- src/**tests**/actions.test.ts --runInBand`

Expected: FAIL because the actions still call `getDraft` and mutation mocks are reached.

- [ ] **Step 3: Route all three actions through the guard**

In `src/lib/actions.ts`, replace the `getDraft` import with:

```ts
import { requireActiveDraft } from '@/lib/draftMutationGuard';
```

In each action, retain the auth check and replace the two-line `getDraft`/not-found branch with:

```ts
const draft = await requireActiveDraft(session.user.id, data.draftId);
```

Do not change `createDraft` or `completeDraft`; neither mutates an existing completed draft.

- [ ] **Step 4: Verify the action suite passes**

Run: `pnpm test -- src/**tests**/actions.test.ts --runInBand`

Expected: PASS, including all three completed-draft cases.

- [ ] **Step 5: Commit the action boundary**

```bash
git add src/lib/actions.ts src/**tests**/actions.test.ts
git commit -m "fix: reject bid mutations on completed drafts"
```

### Task 3: Return conflicts from nomination and watchlist mutation routes

**Files:**

- Modify: `src/app/api/draft/[draftId]/nominated/route.ts`
- Modify: `src/app/api/draft/[draftId]/watchlist/route.ts`
- Modify: `src/**tests**/api/nominated.test.ts`
- Modify: `src/**tests**/api/watchlist.test.ts`

**Interfaces:**

- Consumes: `auth()`, `requireActiveDraft`, and `DraftMutationError` from Task 1.
- Produces: POST and DELETE routes that return `{ error: 'Draft is not active' }` with status `409` before calling `upsert` or `delete`.

- [ ] **Step 1: Write four failing route tests**

In both route test files, mock the guard and make it resolve to the existing `MOCK_DRAFT` by default. Add this test under each POST and DELETE describe block:

```ts
it('returns 409 without writing when the draft is COMPLETE', async () => {
  mockRequireActiveDraft.mockRejectedValueOnce(new DraftMutationError('Draft is not active', 409));
  const res = await POST(makeRequest({ playerName: 'Josh Allen' }), MOCK_PARAMS);
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({ error: 'Draft is not active' });
  expect(mockUpsert).not.toHaveBeenCalled();
});
```

For DELETE, call `DELETE(...)` and assert `mockDelete` was not called. Replace the legacy `mockGetDraft` mocks and 404 tests with guard-based equivalents.

- [ ] **Step 2: Verify route tests fail**

Run: `pnpm test -- src/**tests**/api/nominated.test.ts src/**tests**/api/watchlist.test.ts --runInBand`

Expected: FAIL because the routes still use `getDraft` and do not catch typed lifecycle errors.

- [ ] **Step 3: Add typed-error mapping**

Import:

```ts
import { DraftMutationError, requireActiveDraft } from '@/lib/draftMutationGuard';
```

Replace the `getDraft` lookup with `requireActiveDraft` inside each handler's `try` block. Map a typed error once per handler:

```ts
try {
  const draft = await requireActiveDraft(session.user.id, draftId);
  // existing body validation and database mutation using draft.id
} catch (error) {
  if (error instanceof DraftMutationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
```

Keep idempotent `P2025` delete handling intact; only unexpected database errors return `500`.

- [ ] **Step 4: Verify route tests pass**

Run: `pnpm test -- src/**tests**/api/nominated.test.ts src/**tests**/api/watchlist.test.ts --runInBand`

Expected: PASS, including all four completed-draft cases.

- [ ] **Step 5: Commit the route protection**

```bash
git add src/app/api/draft/[draftId]/nominated/route.ts src/app/api/draft/[draftId]/watchlist/route.ts src/**tests**/api/nominated.test.ts src/**tests**/api/watchlist.test.ts
git commit -m "fix: make draft auxiliary routes read-only when complete"
```

### Task 4: Render the value sheet read-only for completed drafts

**Files:**

- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/components/AuctionSheet/PlayerTable.tsx`
- Modify: `src/**tests**/AuctionSheet.claimed.test.tsx`

**Interfaces:**

- Consumes: `draft.status` from the server page.
- Produces: `AuctionSheet` prop `isReadOnly: boolean`; completed sheets retain all player and bid data but do not open a bid modal or issue a nomination request.

- [ ] **Step 1: Write the failing sheet test**

Add `isReadOnly={false}` to `renderSheet` defaults, then add:

```ts
it('keeps completed drafts readable without opening bid controls', async () => {
  const user = userEvent.setup();
  renderSheet({ claimedBids: [mockClaim], isReadOnly: true });

  expect(screen.getByText('Josh Allen')).toBeInTheDocument();
  await user.click(screen.getAllByText('Josh Allen')[0]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm test -- src/**tests**/AuctionSheet.claimed.test.tsx --runInBand`

Expected: FAIL because `isReadOnly` does not exist and the click opens the modal.

- [ ] **Step 3: Pass and enforce the lifecycle prop**

In the draft page:

```tsx
<AuctionSheet
  // existing props
  isReadOnly={draft.status === 'COMPLETE'}
/>
```

Add `isReadOnly: boolean` to `AuctionSheetProps`. Replace `onRowClick={setModalPlayer}` with:

```tsx
onRowClick={isReadOnly ? undefined : setModalPlayer}
```

Update `PlayerTableProps.onRowClick` to optional and only attach its row click handler when supplied, preserving normal active-draft behavior.

- [ ] **Step 4: Verify the sheet test passes**

Run: `pnpm test -- src/**tests**/AuctionSheet.claimed.test.tsx --runInBand`

Expected: PASS; active-sheet modal and Nom tests remain green.

- [ ] **Step 5: Commit the read-only sheet**

```bash
git add src/app/draft/[draftId]/page.tsx src/components/AuctionSheet/AuctionSheet.tsx src/components/AuctionSheet/PlayerTable.tsx src/**tests**/AuctionSheet.claimed.test.tsx
git commit -m "feat: render completed auction sheets read-only"
```

### Task 5: Render the nomination workspace read-only for completed drafts

**Files:**

- Modify: `src/app/draft/[draftId]/nominate/page.tsx`
- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Modify: `src/components/NominationHelper/NominationTable.tsx`
- Modify: `src/components/NominationHelper/WatchlistSidebar.tsx`
- Modify: `src/**tests**/NominationHelper.ui.test.tsx`
- Modify: `src/**tests**/WatchlistSidebar.test.tsx` if it contains standalone sidebar mutation-control coverage

**Interfaces:**

- Consumes: `draft.status` from the nomination server page.
- Produces: `isReadOnly` through `NominationHelper`, `NominationTable`, and `WatchlistSidebar`; existing lists remain visible while all watchlist/nominations mutations and inputs are absent.

- [ ] **Step 1: Write failing completed-workspace tests**

Make the mocked nomination-data response include one watchlist and one nominated name, and render with `isReadOnly`:

```ts
it('shows historical nomination data without mutation controls when complete', async () => {
render(<NominationHelper draftId={1} players={PLAYERS} isReadOnly />);
await waitFor(() => expect(screen.getByText('Josh Allen')).toBeInTheDocument());

expect(screen.getByTestId('completed-draft-notice')).toHaveTextContent('Draft complete');
expect(screen.queryByRole('button', { name: /watch/i })).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: /nominate/i })).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: /remove .\* watchlist/i })).not.toBeInTheDocument();
expect(screen.queryByPlaceholderText('Add player I want...')).not.toBeInTheDocument();
});
```

Also add an active-state test that sees Watch and Nominate after returning non-empty `auctionResults` from the fetch mock.

- [ ] **Step 2: Verify the UI tests fail**

Run: `pnpm test -- src/**tests**/NominationHelper.ui.test.tsx src/**tests**/WatchlistSidebar.test.tsx --runInBand`

Expected: FAIL because `isReadOnly` and `completed-draft-notice` do not exist and controls are still rendered.

- [ ] **Step 3: Thread the prop and conditionally omit controls**

Pass `isReadOnly={draft.status === 'COMPLETE'}` from the page. Add `isReadOnly: boolean` to the helper and child prop interfaces. Render this notice above the helper metrics when true:

```tsx
<div data-testid="completed-draft-notice" className="text-[11px] text-muted-foreground">
  Draft complete — historical view only.
</div>
```

In `NominationTable`, omit the two action cells and use `colSpan={5}` for the empty state while read-only. In `WatchlistSidebar`, continue rendering existing entries, but omit the search-to-add `Command`, the in-auction remove button, and each watchlist remove button. Do not call mutation handlers from read-only controls because no such controls are rendered.

- [ ] **Step 4: Verify completed and active UI behavior**

Run: `pnpm test -- src/**tests**/NominationHelper.ui.test.tsx src/**tests**/WatchlistSidebar.test.tsx --runInBand`

Expected: PASS; completed data is readable with no mutation controls, while active controls remain present.

- [ ] **Step 5: Commit the nomination read-only UI**

```bash
git add src/app/draft/[draftId]/nominate/page.tsx src/components/NominationHelper src/**tests**/NominationHelper.ui.test.tsx src/**tests**/WatchlistSidebar.test.tsx
git commit -m "feat: make completed nomination workspaces read-only"
```

### Task 6: Run the lifecycle regression gate

**Files:**

- Verify only; do not modify files.

**Interfaces:**

- Verifies the guard, all mutation paths, and both read-only UI surfaces added by Tasks 1–5.

- [ ] **Step 1: Run focused lifecycle tests**

Run:

```bash
pnpm test -- src/**tests**/draftMutationGuard.test.ts src/**tests**/actions.test.ts src/**tests**/api/nominated.test.ts src/**tests**/api/watchlist.test.ts src/**tests**/AuctionSheet.claimed.test.tsx src/**tests**/NominationHelper.ui.test.tsx src/**tests**/WatchlistSidebar.test.tsx --runInBand
```

Expected: PASS, 0 failures.

- [ ] **Step 2: Run the full quality gate**

Run: `make check`

Expected: typecheck, lint, format check, and Jest all pass. If an unrelated failure appears, report its command and output; do not weaken the lifecycle checks to make it pass.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check HEAD~5..HEAD && git status --short`

Expected: no whitespace errors and no unrelated files staged by this workstream.
