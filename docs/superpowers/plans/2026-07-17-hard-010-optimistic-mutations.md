# HARD-010: Resilient and Accessible Optimistic Mutations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every optimistic bid/watchlist/nomination mutation in `AuctionSheet`, `BidModal`, and
`NominationHelper` resilient to thrown network errors and non-2xx responses, block duplicate
submissions while a mutation is in flight, make bid logging a real keyboard-submittable form, confirm
the destructive bid-removal action, and announce mutation outcomes through an `aria-live` region —
closing out HARD-010 from `docs/draftops-audit-workstreams.md`.

**Architecture:** No new dependencies. Add one small shared `MutationStatus` component (a visually
hidden `aria-live="polite"` region) reused by `AuctionSheet` and `NominationHelper`. `BidModal`
becomes a semantic `<form>` and gains a two-step delete confirmation. `AuctionSheet` starts using the
`isPending` flag `useTransition` already returns (currently discarded) to disable the bid form and
calls `router.refresh()` on any rejected mutation so the page re-syncs to canonical server state after
a conflict. `NominationHelper`'s four fetch-based mutation handlers (`addToWatchlist`,
`removeFromWatchlist`, `nominatePlayer`, `unNominatePlayer`) are rewritten on top of one shared
`runPlayerMutation` helper that wraps every request in `try/catch/finally`, tracks a per-player
`pendingIds` set to block duplicate clicks, restores the prior snapshot on failure, and re-fetches
canonical nomination data (`fetchData`, extracted from the polling `useEffect`) after a conflict
instead of trusting a possibly-stale snapshot.

**Tech Stack:** Next.js 16 App Router, React 19 (`useOptimistic`, `useTransition`), TypeScript 5
strict mode, Jest + React Testing Library, Tailwind CSS 4, shadcn/base-ui `Button`/`Input`/`Select`.

## Global Constraints

- Single quotes, trailing commas, 2-space indent, 100 char line width (Prettier) — matches
  `CLAUDE.md`.
- No explicit `any`; no unused vars.
- Select test targets by `data-testid`, `role`, or accessible name — never brittle CSS classes.
- Every async call must propagate to a rendered error state or be caught with a visible fallback —
  no unhandled promise rejections (`CLAUDE.md` Code Quality Rules).
- Run `pnpm tsc --noEmit` and `pnpm lint` before any review, per `CLAUDE.md`.
- `make check` (typecheck + lint + format + test) must pass before this branch is considered done.
- This worktree is `.claude/worktrees/hard-010-optimistic-mutations` on branch
  `worktree-hard-010-optimistic-mutations`, already branched from a freshly pulled `main`.

---

### Task 1: Shared `aria-live` mutation-status component

**Files:**

- Create: `src/components/MutationStatus.tsx`
- Test: `src/__tests__/MutationStatus.test.tsx`

**Interfaces:**

- Produces: `export default function MutationStatus({ message }: { message: string })` — a React
  component rendering a `role="status" aria-live="polite"` region, visually hidden via `sr-only`,
  with `data-testid="mutation-status"`. Consumed by Task 4 (`AuctionSheet`) and Task 6
  (`NominationHelper`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/MutationStatus.test.tsx
import { render, screen } from '@testing-library/react';
import MutationStatus from '@/components/MutationStatus';

describe('MutationStatus', () => {
  it('renders the message inside a polite live region', () => {
    render(<MutationStatus message="Saving bid…" />);

    const region = screen.getByTestId('mutation-status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveTextContent('Saving bid…');
  });

  it('renders an empty region when there is no message', () => {
    render(<MutationStatus message="" />);

    expect(screen.getByTestId('mutation-status')).toHaveTextContent('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/MutationStatus.test.tsx`
Expected: FAIL — `Cannot find module '@/components/MutationStatus'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/MutationStatus.tsx
interface MutationStatusProps {
  message: string;
}

export default function MutationStatus({ message }: MutationStatusProps) {
  return (
    <div aria-live="polite" role="status" className="sr-only" data-testid="mutation-status">
      {message}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/MutationStatus.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/MutationStatus.tsx src/__tests__/MutationStatus.test.tsx
git commit -m "feat: add shared aria-live MutationStatus region"
```

---

### Task 2: `BidModal` becomes a semantic form with keyboard submit and a pending-disabled state

**Files:**

- Modify: `src/components/BidModal/BidModal.tsx`
- Test: `src/__tests__/BidModal.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: new optional prop `isSubmitting?: boolean` on `BidModal`. Consumed by Task 4
  (`AuctionSheet` passes `isSubmitting={isPending}`).

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/BidModal.test.tsx`, inside `describe('BidModal — add mode', ...)`:

```tsx
it('submits via Enter key in the price field (keyboard-only logging)', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(
    <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={onSubmit} />,
  );

  await user.clear(screen.getByLabelText('Price'));
  await user.type(screen.getByLabelText('Price'), '110{Enter}');

  expect(onSubmit).toHaveBeenCalledWith({ price: 110, teamId: 1 });
});

it('disables the price field and shows a saving label on the submit button while isSubmitting', () => {
  render(
    <BidModal
      player={mockPlayer}
      teams={mockTeams}
      onClose={jest.fn()}
      onSubmit={jest.fn()}
      isSubmitting
    />,
  );

  expect(screen.getByLabelText('Price')).toBeDisabled();
  expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/__tests__/BidModal.test.tsx`
Expected: FAIL — Enter does not submit (no `<form>` yet); `isSubmitting` prop has no effect and no
"Saving" button label exists.

- [ ] **Step 3: Implement the semantic form and `isSubmitting` handling**

In `src/components/BidModal/BidModal.tsx`, change the import line:

```tsx
import { useState } from 'react';
```

to:

```tsx
import { useState, type FormEvent } from 'react';
```

Replace the props interface and function signature:

```tsx
interface BidModalProps {
  player: Player;
  teams: LeagueTeam[];
  existingBid?: ClaimedBid;
  onClose: () => void;
  onSubmit: (data: { price: number; teamId: number }) => void;
  onDelete?: () => void;
  onNominate?: () => void;
  isNominated?: boolean;
  serverError?: string;
}

export default function BidModal({
  player,
  teams,
  existingBid,
  onClose,
  onSubmit,
  onDelete,
  onNominate,
  isNominated,
  serverError,
}: BidModalProps) {
```

with:

```tsx
interface BidModalProps {
  player: Player;
  teams: LeagueTeam[];
  existingBid?: ClaimedBid;
  onClose: () => void;
  onSubmit: (data: { price: number; teamId: number }) => void;
  onDelete?: () => void;
  onNominate?: () => void;
  isNominated?: boolean;
  serverError?: string;
  isSubmitting?: boolean;
}

export default function BidModal({
  player,
  teams,
  existingBid,
  onClose,
  onSubmit,
  onDelete,
  onNominate,
  isNominated,
  serverError,
  isSubmitting = false,
}: BidModalProps) {
```

Replace `handleSubmit` with a form submit handler:

```tsx
function handleSubmit() {
  const p = Number(price);
  if (!price || isNaN(p) || p <= 0) {
    setError('Enter a valid price.');
    return;
  }
  if (teams.length === 0) {
    setError('No teams available.');
    return;
  }
  setError('');
  onSubmit({ price: p, teamId });
}
```

with:

```tsx
function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (isSubmitting) return;
  const p = Number(price);
  if (!price || isNaN(p) || p <= 0) {
    setError('Enter a valid price.');
    return;
  }
  if (teams.length === 0) {
    setError('No teams available.');
    return;
  }
  setError('');
  onSubmit({ price: p, teamId });
}
```

Wrap the Price field, Won By field, error text, and Actions row in a `<form>`. Replace:

```tsx
{
  /* Price */
}
<div className="gap-xs flex flex-col">
  <Label
    htmlFor="bid-price"
    className="font-label text-label-xs text-muted-foreground font-bold tracking-wide uppercase"
  >
    Price
  </Label>
  <Input
    data-testid="bid-price"
    id="bid-price"
    aria-label="Price"
    type="number"
    min={1}
    value={price}
    onChange={(e) => setPrice(e.target.value)}
    autoFocus
    className="font-mono text-body-lg rounded-md bg-background font-bold focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border"
  />
</div>;

{
  /* Won By */
}
<div className="gap-xs flex flex-col">
  <Label
    htmlFor="bid-team"
    className="font-label text-label-xs text-muted-foreground font-bold tracking-wide uppercase"
  >
    Won By
  </Label>
  <Select
    value={String(teamId)}
    onValueChange={(value) => value != null && setTeamId(Number(value))}
  >
    <SelectTrigger
      id="bid-team"
      aria-label="Won By"
      className="w-full focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border"
    >
      <SelectValue>
        {selectedTeam
          ? `${selectedTeam.displayName ?? selectedTeam.handle} (${selectedTeam.handle})`
          : 'Select team'}
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      {teams.map((t) => (
        <SelectItem key={t.id} value={String(t.id)}>
          {t.displayName ?? t.handle} ({t.handle})
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>;

{
  (error || serverError) && (
    <div
      data-testid="bid-server-error"
      className="text-body-sm"
      style={{ color: 'var(--age-old)' }}
    >
      {error || serverError}
    </div>
  );
}

{
  /* Actions */
}
<div className="gap-sm flex items-center justify-end">
  <div className="mr-auto flex items-center gap-sm">
    {isEdit && onDelete && (
      <Button variant="destructive" size="sm" onClick={onDelete}>
        Remove
      </Button>
    )}
    {onNominate && !isNominated && (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onNominate();
          onClose();
        }}
        style={{ borderColor: 'var(--pos-pick)', color: 'var(--pos-pick)' }}
      >
        Nom
      </Button>
    )}
    {onNominate && isNominated && (
      <span className="text-body-sm" style={{ color: 'var(--pos-pick)' }}>
        In Auction
      </span>
    )}
  </div>

  <Button variant="outline" size="sm" onClick={onClose}>
    Cancel
  </Button>
  <Button data-testid="bid-submit" size="sm" onClick={handleSubmit}>
    {isEdit ? 'Update Bid' : 'Log Bid'}
  </Button>
</div>;
```

with:

```tsx
<form onSubmit={handleFormSubmit} className="contents">
  {/* Price */}
  <div className="gap-xs flex flex-col">
    <Label
      htmlFor="bid-price"
      className="font-label text-label-xs text-muted-foreground font-bold tracking-wide uppercase"
    >
      Price
    </Label>
    <Input
      data-testid="bid-price"
      id="bid-price"
      aria-label="Price"
      type="number"
      min={1}
      value={price}
      onChange={(e) => setPrice(e.target.value)}
      autoFocus
      disabled={isSubmitting}
      className="font-mono text-body-lg rounded-md bg-background font-bold focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border"
    />
  </div>

  {/* Won By */}
  <div className="gap-xs flex flex-col">
    <Label
      htmlFor="bid-team"
      className="font-label text-label-xs text-muted-foreground font-bold tracking-wide uppercase"
    >
      Won By
    </Label>
    <Select
      value={String(teamId)}
      onValueChange={(value) => value != null && setTeamId(Number(value))}
    >
      <SelectTrigger
        id="bid-team"
        aria-label="Won By"
        disabled={isSubmitting}
        className="w-full focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border"
      >
        <SelectValue>
          {selectedTeam
            ? `${selectedTeam.displayName ?? selectedTeam.handle} (${selectedTeam.handle})`
            : 'Select team'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {teams.map((t) => (
          <SelectItem key={t.id} value={String(t.id)}>
            {t.displayName ?? t.handle} ({t.handle})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>

  {(error || serverError) && (
    <div
      data-testid="bid-server-error"
      className="text-body-sm"
      style={{ color: 'var(--age-old)' }}
    >
      {error || serverError}
    </div>
  )}

  {/* Actions */}
  <div className="gap-sm flex items-center justify-end">
    <div className="mr-auto flex items-center gap-sm">
      {isEdit && onDelete && (
        <Button
          variant="destructive"
          size="sm"
          type="button"
          disabled={isSubmitting}
          onClick={onDelete}
        >
          Remove
        </Button>
      )}
      {onNominate && !isNominated && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => {
            onNominate();
            onClose();
          }}
          style={{ borderColor: 'var(--pos-pick)', color: 'var(--pos-pick)' }}
        >
          Nom
        </Button>
      )}
      {onNominate && isNominated && (
        <span className="text-body-sm" style={{ color: 'var(--pos-pick)' }}>
          In Auction
        </span>
      )}
    </div>

    <Button variant="outline" size="sm" type="button" onClick={onClose}>
      Cancel
    </Button>
    <Button data-testid="bid-submit" size="sm" type="submit" disabled={isSubmitting}>
      {isSubmitting ? 'Saving…' : isEdit ? 'Update Bid' : 'Log Bid'}
    </Button>
  </div>
</form>
```

`className="contents"` (Tailwind's `display: contents`) keeps the form invisible to the parent
`DialogContent`'s flex layout, so its children still participate directly in the existing
flex/gap spacing instead of being nested inside an extra flex item.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/__tests__/BidModal.test.tsx`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 5: Commit**

```bash
git add src/components/BidModal/BidModal.tsx src/__tests__/BidModal.test.tsx
git commit -m "feat: make BidModal a semantic form with a pending-disabled submit"
```

---

### Task 3: Two-step confirmation for bid removal

**Files:**

- Modify: `src/components/BidModal/BidModal.tsx`
- Test: `src/__tests__/BidModal.test.tsx`, `src/__tests__/AuctionSheet.claimed.test.tsx`

**Interfaces:**

- Consumes: `isSubmitting` prop from Task 2.
- Produces: no new props — `onDelete` still fires only after a second confirming click.

- [ ] **Step 1: Update the existing Remove test and add new failing tests**

In `src/__tests__/BidModal.test.tsx`, inside `describe('BidModal — edit mode', ...)`, replace:

```tsx
it('calls onDelete when Remove is clicked', async () => {
  const user = userEvent.setup();
  const onDelete = jest.fn();
  render(
    <BidModal
      player={mockPlayer}
      teams={mockTeams}
      existingBid={mockExistingBid}
      onClose={jest.fn()}
      onSubmit={jest.fn()}
      onDelete={onDelete}
    />,
  );

  await user.click(screen.getByRole('button', { name: /remove/i }));

  expect(onDelete).toHaveBeenCalled();
});
```

with:

```tsx
it('arms a confirmation instead of calling onDelete on the first Remove click', async () => {
  const user = userEvent.setup();
  const onDelete = jest.fn();
  render(
    <BidModal
      player={mockPlayer}
      teams={mockTeams}
      existingBid={mockExistingBid}
      onClose={jest.fn()}
      onSubmit={jest.fn()}
      onDelete={onDelete}
    />,
  );

  await user.click(screen.getByRole('button', { name: /^remove$/i }));

  expect(onDelete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /confirm remove/i })).toBeInTheDocument();
});

it('calls onDelete after confirming Remove a second time', async () => {
  const user = userEvent.setup();
  const onDelete = jest.fn();
  render(
    <BidModal
      player={mockPlayer}
      teams={mockTeams}
      existingBid={mockExistingBid}
      onClose={jest.fn()}
      onSubmit={jest.fn()}
      onDelete={onDelete}
    />,
  );

  await user.click(screen.getByRole('button', { name: /^remove$/i }));
  await user.click(screen.getByRole('button', { name: /confirm remove/i }));

  expect(onDelete).toHaveBeenCalledTimes(1);
});

it('does not call onDelete when Keep is clicked after arming Remove', async () => {
  const user = userEvent.setup();
  const onDelete = jest.fn();
  render(
    <BidModal
      player={mockPlayer}
      teams={mockTeams}
      existingBid={mockExistingBid}
      onClose={jest.fn()}
      onSubmit={jest.fn()}
      onDelete={onDelete}
    />,
  );

  await user.click(screen.getByRole('button', { name: /^remove$/i }));
  await user.click(screen.getByRole('button', { name: /^keep$/i }));

  expect(onDelete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
});
```

In `src/__tests__/AuctionSheet.claimed.test.tsx`, the existing stale-page test clicks Remove once and
expects the failure to surface — it needs the confirming second click. Replace:

```tsx
it('shows a stale-page read-only message when the draft completed concurrently', async () => {
  const user = userEvent.setup();
  mockDeleteBid.mockResolvedValue({ ok: false, code: 'DRAFT_COMPLETE' });
  renderSheet({ claimedBids: [mockClaim] });

  await user.click(screen.getAllByText('Josh Allen')[0]);
  await user.click(screen.getByRole('button', { name: /^remove$/i }));

  await waitFor(() => {
    expect(screen.getByText(/draft is complete and now read-only/i)).toBeInTheDocument();
  });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
```

with:

```tsx
it('shows a stale-page read-only message when the draft completed concurrently', async () => {
  const user = userEvent.setup();
  mockDeleteBid.mockResolvedValue({ ok: false, code: 'DRAFT_COMPLETE' });
  renderSheet({ claimedBids: [mockClaim] });

  await user.click(screen.getAllByText('Josh Allen')[0]);
  await user.click(screen.getByRole('button', { name: /^remove$/i }));
  await user.click(screen.getByRole('button', { name: /confirm remove/i }));

  await waitFor(() => {
    expect(screen.getByText(/draft is complete and now read-only/i)).toBeInTheDocument();
  });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/__tests__/BidModal.test.tsx src/__tests__/AuctionSheet.claimed.test.tsx`
Expected: FAIL — Remove still calls `onDelete` immediately; no "Confirm Remove"/"Keep" buttons exist
yet.

- [ ] **Step 3: Implement the two-step confirmation**

In `src/components/BidModal/BidModal.tsx`, add a `deleteArmed` state next to the existing `error`
state. Replace:

```tsx
const [price, setPrice] = useState<string>(existingBid ? String(existingBid.price) : '');
const [teamId, setTeamId] = useState<number>(existingBid?.teamId ?? teams[0]?.id ?? 0);
const [error, setError] = useState<string>('');
```

with:

```tsx
const [price, setPrice] = useState<string>(existingBid ? String(existingBid.price) : '');
const [teamId, setTeamId] = useState<number>(existingBid?.teamId ?? teams[0]?.id ?? 0);
const [error, setError] = useState<string>('');
const [deleteArmed, setDeleteArmed] = useState<boolean>(false);
```

Replace the Remove button block:

```tsx
{
  isEdit && onDelete && (
    <Button
      variant="destructive"
      size="sm"
      type="button"
      disabled={isSubmitting}
      onClick={onDelete}
    >
      Remove
    </Button>
  );
}
```

with:

```tsx
{
  isEdit && onDelete && !deleteArmed && (
    <Button
      variant="destructive"
      size="sm"
      type="button"
      disabled={isSubmitting}
      onClick={() => setDeleteArmed(true)}
    >
      Remove
    </Button>
  );
}
{
  isEdit && onDelete && deleteArmed && (
    <>
      <Button
        variant="ghost"
        size="sm"
        type="button"
        disabled={isSubmitting}
        onClick={() => setDeleteArmed(false)}
      >
        Keep
      </Button>
      <Button
        variant="destructive"
        size="sm"
        type="button"
        disabled={isSubmitting}
        onClick={onDelete}
      >
        Confirm Remove
      </Button>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/__tests__/BidModal.test.tsx src/__tests__/AuctionSheet.claimed.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BidModal/BidModal.tsx src/__tests__/BidModal.test.tsx src/__tests__/AuctionSheet.claimed.test.tsx
git commit -m "feat: require a confirming click before removing a logged bid"
```

---

### Task 4: `AuctionSheet` uses `isPending` to block duplicate bid submits, refreshes canonical state on conflict, and announces bid outcomes

**Files:**

- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Test: `src/__tests__/AuctionSheet.claimed.test.tsx`, `src/__tests__/AuctionSheet.onboarding.test.tsx`,
  `src/__tests__/OnboardingTargets.test.tsx`

**Interfaces:**

- Consumes: `MutationStatus` (Task 1), `BidModal`'s `isSubmitting` prop (Task 2).
- Produces: nothing new consumed elsewhere — internal wiring only.

**Important:** `AuctionSheet` does not currently call `useRouter`, so none of its three test files mock
`next/navigation`. Once this task adds `useRouter`, every test in those files will crash with
`invariant expected app router to be mounted` unless a mock is added first — do this before writing
any new assertions.

- [ ] **Step 1: Add `next/navigation` mocks and write the failing tests**

In `src/__tests__/AuctionSheet.claimed.test.tsx`, add near the top (after the existing `jest.mock('@/lib/actions', ...)` block):

```tsx
const mockRouterRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));
```

Add `mockRouterRefresh.mockClear();` to the existing `beforeEach`:

```tsx
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
  mockLogBid.mockResolvedValue({ ok: true, data: { bidId: 99 } });
  mockUpdateBid.mockResolvedValue({ ok: true, data: { bidId: 1 } });
  mockDeleteBid.mockResolvedValue({ ok: true, data: null });
  mockRouterRefresh.mockClear();
});
```

Add these tests inside `describe('AuctionSheet with claimed bids', ...)`:

```tsx
it('disables the bid submit button while a save is pending, blocking duplicate submissions', async () => {
  const user = userEvent.setup();
  let resolveLogBid: (value: { ok: true; data: { bidId: number } }) => void = () => {};
  mockLogBid.mockReturnValue(
    new Promise((resolve) => {
      resolveLogBid = resolve;
    }),
  );
  renderSheet();

  await user.click(screen.getByText('Josh Allen'));
  await user.type(screen.getByTestId('bid-price'), '110');
  await user.click(screen.getByTestId('bid-submit'));

  await waitFor(() => expect(screen.getByTestId('bid-submit')).toBeDisabled());
  await user.click(screen.getByTestId('bid-submit'));
  expect(mockLogBid).toHaveBeenCalledTimes(1);

  resolveLogBid({ ok: true, data: { bidId: 99 } });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('announces bid save progress and outcome through the mutation status live region', async () => {
  const user = userEvent.setup();
  renderSheet();

  await user.click(screen.getByText('Josh Allen'));
  await user.type(screen.getByTestId('bid-price'), '110');
  await user.click(screen.getByTestId('bid-submit'));

  await waitFor(() =>
    expect(screen.getByTestId('mutation-status')).toHaveTextContent('Bid saved.'),
  );
});

it('refreshes canonical draft state when a bid save is rejected as a conflict', async () => {
  const user = userEvent.setup();
  mockLogBid.mockResolvedValue({ ok: false, code: 'PLAYER_ALREADY_CLAIMED' });
  renderSheet();

  await user.click(screen.getByText('Josh Allen'));
  await user.type(screen.getByTestId('bid-price'), '110');
  await user.click(screen.getByTestId('bid-submit'));

  await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
});
```

In `src/__tests__/AuctionSheet.onboarding.test.tsx`, add a `next/navigation` mock near the other
`jest.mock` calls at the top of the file:

```tsx
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
```

In `src/__tests__/OnboardingTargets.test.tsx`, extend the existing mock's returned router object to
include `refresh`. Replace:

```tsx
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  notFound: jest.fn(),
  redirect: jest.fn(),
}));
```

with:

```tsx
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  notFound: jest.fn(),
  redirect: jest.fn(),
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/__tests__/AuctionSheet.claimed.test.tsx src/__tests__/AuctionSheet.onboarding.test.tsx src/__tests__/OnboardingTargets.test.tsx`
Expected: FAIL on the three new tests (`isPending` is discarded, no `mutation-status` testid exists,
`router.refresh` is never called); the mock additions alone should not change other outcomes.

- [ ] **Step 3: Wire `isPending`, `router.refresh`, and `MutationStatus` into `AuctionSheet`**

In `src/components/AuctionSheet/AuctionSheet.tsx`, update imports. Replace:

```tsx
'use client';

import { useState, useMemo, useOptimistic, useTransition } from 'react';
import dynamic from 'next/dynamic';
import type { Player, Position, ClaimedBid, LeagueTeam, ScoringSettings } from '@/types';
import { logBid, updateBid, deleteBid } from '@/lib/actions';
import BidModal from '@/components/BidModal';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import AuctionHeader from './AuctionHeader';
import FilterControls, { type PositionFilter, type StrategyFilter } from './FilterControls';
import PlayerTable, { type SortKey } from './PlayerTable';
import DraftReadOnlyBanner from '@/components/DraftReadOnlyBanner';
import type { DraftMutationCode } from '@/lib/draftMutation';
```

with:

```tsx
'use client';

import { useState, useMemo, useOptimistic, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Player, Position, ClaimedBid, LeagueTeam, ScoringSettings } from '@/types';
import { logBid, updateBid, deleteBid } from '@/lib/actions';
import BidModal from '@/components/BidModal';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import AuctionHeader from './AuctionHeader';
import FilterControls, { type PositionFilter, type StrategyFilter } from './FilterControls';
import PlayerTable, { type SortKey } from './PlayerTable';
import DraftReadOnlyBanner from '@/components/DraftReadOnlyBanner';
import MutationStatus from '@/components/MutationStatus';
import type { DraftMutationCode } from '@/lib/draftMutation';
```

Replace the top-of-component state block. Replace:

```tsx
const { progress, recordBidLogged } = useOnboarding();
const [posFilter, setPosFilter] = useState<PositionFilter>('ALL');
const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('ALL');
const [search, setSearch] = useState<string>('');
const [sortBy, setSortBy] = useState<SortKey>('budget');
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
const [showNotes, setShowNotes] = useState<boolean>(false);
const [availableOnly, setAvailableOnly] = useState<boolean>(false);
const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
const [modalError, setModalError] = useState<string>('');
const [, startTransition] = useTransition();
const [extraNominated, setExtraNominated] = useState<Array<number | string>>([]);
const [clearedNominations, setClearedNominations] = useState<Set<number | string>>(new Set());
const [showSleeperSync, setShowSleeperSync] = useState<boolean>(false);
```

with:

```tsx
const router = useRouter();
const { progress, recordBidLogged } = useOnboarding();
const [posFilter, setPosFilter] = useState<PositionFilter>('ALL');
const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('ALL');
const [search, setSearch] = useState<string>('');
const [sortBy, setSortBy] = useState<SortKey>('budget');
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
const [showNotes, setShowNotes] = useState<boolean>(false);
const [availableOnly, setAvailableOnly] = useState<boolean>(false);
const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
const [modalError, setModalError] = useState<string>('');
const [mutationStatus, setMutationStatus] = useState<string>('');
const [isPending, startTransition] = useTransition();
const [extraNominated, setExtraNominated] = useState<Array<number | string>>([]);
const [clearedNominations, setClearedNominations] = useState<Set<number | string>>(new Set());
const [showSleeperSync, setShowSleeperSync] = useState<boolean>(false);
```

Replace `handleMutationFailure` to also announce and refresh. Replace:

```tsx
function handleMutationFailure(code: DraftMutationCode) {
  if (code === 'UNAUTHORIZED') {
    window.location.href = '/sign-in';
    return;
  }
  const messages: Partial<Record<DraftMutationCode, string>> = {
    INVALID_INPUT: 'Use positive whole-dollar prices and valid draft records.',
    NOT_FOUND: 'Draft not configured. Please check your setup.',
    DRAFT_COMPLETE: 'This draft is complete and now read-only. Refresh to view final results.',
    TEAM_NOT_FOUND: 'That team is not part of this draft.',
    PLAYER_NOT_FOUND: 'That player is not part of this draft.',
    BID_NOT_FOUND: 'That bid no longer exists. Refresh to see the latest results.',
    PLAYER_ALREADY_CLAIMED: 'That player has already been won by another team.',
    ROSTER_FULL: 'That team has no open roster spots for another player.',
    BID_EXCEEDS_MAX: 'This bid must leave at least $1 for every open roster spot.',
  };
  setModalError(messages[code] ?? 'Unable to save this bid. Please try again.');
}
```

with:

```tsx
function handleMutationFailure(code: DraftMutationCode) {
  if (code === 'UNAUTHORIZED') {
    window.location.href = '/sign-in';
    return;
  }
  const messages: Partial<Record<DraftMutationCode, string>> = {
    INVALID_INPUT: 'Use positive whole-dollar prices and valid draft records.',
    NOT_FOUND: 'Draft not configured. Please check your setup.',
    DRAFT_COMPLETE: 'This draft is complete and now read-only. Refresh to view final results.',
    TEAM_NOT_FOUND: 'That team is not part of this draft.',
    PLAYER_NOT_FOUND: 'That player is not part of this draft.',
    BID_NOT_FOUND: 'That bid no longer exists. Refresh to see the latest results.',
    PLAYER_ALREADY_CLAIMED: 'That player has already been won by another team.',
    ROSTER_FULL: 'That team has no open roster spots for another player.',
    BID_EXCEEDS_MAX: 'This bid must leave at least $1 for every open roster spot.',
  };
  const message = messages[code] ?? 'Unable to save this bid. Please try again.';
  setModalError(message);
  setMutationStatus(message);
  router.refresh();
}
```

Replace `handleModalSubmit` to guard on `isPending` and announce status. Replace:

```tsx
function handleModalSubmit({ price, teamId }: { price: number; teamId: number }) {
  if (!modalPlayer) return;
  const existingBid = claimMap.get(playerIdentityKey(modalPlayer));
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;
  setModalError('');

  if (existingBid) {
    const updated: ClaimedBid = { ...existingBid, price, teamId, teamHandle: team.handle };
    startTransition(async () => {
      dispatchOptimistic({ type: 'update', bid: updated });
      try {
        const result = await updateBid({ id: existingBid.id, price, teamId, draftId });
        if (!result.ok) {
          handleMutationFailure(result.code);
          return;
        }
        setModalPlayer(null);
      } catch {
        setModalError('Failed to save bid. Please try again.');
      }
    });
  } else {
    if (modalPlayer.id === undefined) {
      setModalError('Player identity missing. Please refresh and try again.');
      return;
    }
    const playerId = modalPlayer.id;
    const tempBid: ClaimedBid = {
      id: -Date.now(),
      playerId,
      player: modalPlayer.player,
      position: modalPlayer.pos,
      price,
      teamId,
      teamHandle: team.handle,
    };
    startTransition(async () => {
      dispatchOptimistic({ type: 'add', bid: tempBid });
      try {
        const result = await logBid({
          playerId,
          price,
          teamId,
          draftId,
        });
        if (!result.ok) {
          handleMutationFailure(result.code);
          return;
        }
        setClearedNominations((previous) => new Set(previous).add(playerId));
        setExtraNominated((previous) => previous.filter((nominatedId) => nominatedId !== playerId));
        await recordBidLogged(modalPlayer.player);
        setModalPlayer(null);
      } catch {
        setModalError('Failed to log bid. Please try again.');
      }
    });
  }
}
```

with:

```tsx
function handleModalSubmit({ price, teamId }: { price: number; teamId: number }) {
  if (!modalPlayer || isPending) return;
  const existingBid = claimMap.get(playerIdentityKey(modalPlayer));
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;
  setModalError('');

  if (existingBid) {
    const updated: ClaimedBid = { ...existingBid, price, teamId, teamHandle: team.handle };
    startTransition(async () => {
      dispatchOptimistic({ type: 'update', bid: updated });
      setMutationStatus('Saving bid…');
      try {
        const result = await updateBid({ id: existingBid.id, price, teamId, draftId });
        if (!result.ok) {
          handleMutationFailure(result.code);
          return;
        }
        setMutationStatus('Bid saved.');
        setModalPlayer(null);
      } catch {
        setModalError('Failed to save bid. Please try again.');
        setMutationStatus('Failed to save bid. Please try again.');
        router.refresh();
      }
    });
  } else {
    if (modalPlayer.id === undefined) {
      setModalError('Player identity missing. Please refresh and try again.');
      return;
    }
    const playerId = modalPlayer.id;
    const tempBid: ClaimedBid = {
      id: -Date.now(),
      playerId,
      player: modalPlayer.player,
      position: modalPlayer.pos,
      price,
      teamId,
      teamHandle: team.handle,
    };
    startTransition(async () => {
      dispatchOptimistic({ type: 'add', bid: tempBid });
      setMutationStatus('Saving bid…');
      try {
        const result = await logBid({
          playerId,
          price,
          teamId,
          draftId,
        });
        if (!result.ok) {
          handleMutationFailure(result.code);
          return;
        }
        setMutationStatus('Bid saved.');
        setClearedNominations((previous) => new Set(previous).add(playerId));
        setExtraNominated((previous) => previous.filter((nominatedId) => nominatedId !== playerId));
        await recordBidLogged(modalPlayer.player);
        setModalPlayer(null);
      } catch {
        setModalError('Failed to log bid. Please try again.');
        setMutationStatus('Failed to log bid. Please try again.');
        router.refresh();
      }
    });
  }
}
```

Replace `handleModalDelete` the same way. Replace:

```tsx
function handleModalDelete() {
  if (!modalPlayer) return;
  const existingBid = claimMap.get(playerIdentityKey(modalPlayer));
  if (!existingBid) return;
  setModalError('');
  startTransition(async () => {
    dispatchOptimistic({ type: 'delete', id: existingBid.id });
    try {
      const result = await deleteBid({ id: existingBid.id, draftId });
      if (!result.ok) {
        handleMutationFailure(result.code);
        return;
      }
      setModalPlayer(null);
    } catch {
      setModalError('Failed to remove bid. Please try again.');
    }
  });
}
```

with:

```tsx
function handleModalDelete() {
  if (!modalPlayer || isPending) return;
  const existingBid = claimMap.get(playerIdentityKey(modalPlayer));
  if (!existingBid) return;
  setModalError('');
  startTransition(async () => {
    dispatchOptimistic({ type: 'delete', id: existingBid.id });
    setMutationStatus('Removing bid…');
    try {
      const result = await deleteBid({ id: existingBid.id, draftId });
      if (!result.ok) {
        handleMutationFailure(result.code);
        return;
      }
      setMutationStatus('Bid removed.');
      setModalPlayer(null);
    } catch {
      setModalError('Failed to remove bid. Please try again.');
      setMutationStatus('Failed to remove bid. Please try again.');
      router.refresh();
    }
  });
}
```

Finally, render `MutationStatus` and pass `isSubmitting` to `BidModal`. Replace:

```tsx
  return (
    <div className="min-h-screen bg-background text-foreground">
      {isReadOnly ? <DraftReadOnlyBanner /> : null}
```

with:

```tsx
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MutationStatus message={mutationStatus} />
      {isReadOnly ? <DraftReadOnlyBanner /> : null}
```

And replace:

```tsx
{
  !isReadOnly && modalPlayer ? (
    <BidModal
      player={modalPlayer}
      teams={teams}
      existingBid={claimMap.get(playerIdentityKey(modalPlayer))}
      onClose={() => setModalPlayer(null)}
      onSubmit={handleModalSubmit}
      onDelete={claimMap.has(playerIdentityKey(modalPlayer)) ? handleModalDelete : undefined}
      serverError={modalError}
      isNominated={nominatedSet.has(playerIdentityKey(modalPlayer))}
      onNominate={() => handleNominate(modalPlayer)}
    />
  ) : null;
}
```

with:

```tsx
{
  !isReadOnly && modalPlayer ? (
    <BidModal
      player={modalPlayer}
      teams={teams}
      existingBid={claimMap.get(playerIdentityKey(modalPlayer))}
      onClose={() => setModalPlayer(null)}
      onSubmit={handleModalSubmit}
      onDelete={claimMap.has(playerIdentityKey(modalPlayer)) ? handleModalDelete : undefined}
      serverError={modalError}
      isSubmitting={isPending}
      isNominated={nominatedSet.has(playerIdentityKey(modalPlayer))}
      onNominate={() => handleNominate(modalPlayer)}
    />
  ) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/__tests__/AuctionSheet.claimed.test.tsx src/__tests__/AuctionSheet.onboarding.test.tsx src/__tests__/OnboardingTargets.test.tsx`
Expected: PASS (all tests in all three files)

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/AuctionSheet.claimed.test.tsx src/__tests__/AuctionSheet.onboarding.test.tsx src/__tests__/OnboardingTargets.test.tsx
git commit -m "feat: block duplicate bid submits and refresh canonical state on conflict"
```

---

### Task 5: Harden `AuctionSheet.handleNominate` against thrown errors and duplicate clicks

**Files:**

- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Test: `src/__tests__/AuctionSheet.claimed.test.tsx`

**Interfaces:**

- Consumes: `router` and `setMutationStatus` from Task 4.
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/AuctionSheet.claimed.test.tsx`, inside `describe('AuctionSheet with claimed bids', ...)`:

```tsx
it('rolls back the optimistic LIVE badge and refreshes canonical state when the nomination request throws', async () => {
  const user = userEvent.setup();
  (global.fetch as jest.Mock).mockImplementationOnce(() =>
    Promise.reject(new Error('network down')),
  );
  renderSheet();

  await user.click(screen.getByText('Josh Allen'));
  await user.click(screen.getByRole('button', { name: /^nom$/i }));

  // Don't assert the optimistic LIVE badge synchronously here: the rejected fetch's
  // rollback runs as a microtask that can already have resolved by the time control
  // returns from `await user.click(...)`, making a synchronous `getByText('LIVE')` racy.
  // The rollback (badge absent) and the canonical-refresh call are what this test verifies.
  await waitFor(() => expect(screen.queryByText('LIVE')).not.toBeInTheDocument());
  expect(mockRouterRefresh).toHaveBeenCalled();
});

it('rolls back the optimistic LIVE badge and refreshes canonical state when the nomination request is rejected', async () => {
  const user = userEvent.setup();
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409 } as Response);
  renderSheet();

  await user.click(screen.getByText('Josh Allen'));
  await user.click(screen.getByRole('button', { name: /^nom$/i }));

  await waitFor(() => expect(screen.queryByText('LIVE')).not.toBeInTheDocument());
  expect(mockRouterRefresh).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/__tests__/AuctionSheet.claimed.test.tsx`
Expected: FAIL — the thrown-fetch case produces an unhandled promise rejection instead of rolling
back, and neither case calls `router.refresh()`.

- [ ] **Step 3: Harden `handleNominate`**

In `src/components/AuctionSheet/AuctionSheet.tsx`, add an `isNominating` guard next to the other
state added in Task 4. Replace:

```tsx
const [mutationStatus, setMutationStatus] = useState<string>('');
const [isPending, startTransition] = useTransition();
```

with:

```tsx
const [mutationStatus, setMutationStatus] = useState<string>('');
const [isPending, startTransition] = useTransition();
const [isNominating, setIsNominating] = useState<boolean>(false);
```

Replace `handleNominate`:

```tsx
function handleNominate(player: Player) {
  const key = playerIdentityKey(player);
  if (typeof key !== 'number') return;
  setExtraNominated((prev) => [...prev, key]);
  void fetch(`/api/draft/${draftId}/nominated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: key }),
  }).then((res) => {
    if (res.status === 401) {
      window.location.href = '/sign-in';
      return;
    }
    if (!res.ok) {
      setExtraNominated((prev) => prev.filter((n) => n !== key));
    }
  });
}
```

with:

```tsx
function handleNominate(player: Player) {
  const key = playerIdentityKey(player);
  if (typeof key !== 'number' || isNominating) return;
  setIsNominating(true);
  setExtraNominated((prev) => [...prev, key]);
  setMutationStatus('Nominating player…');
  fetch(`/api/draft/${draftId}/nominated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: key }),
  })
    .then((res) => {
      if (res.status === 401) {
        window.location.href = '/sign-in';
        return;
      }
      if (!res.ok) {
        setExtraNominated((prev) => prev.filter((n) => n !== key));
        setMutationStatus('Failed to nominate player. Please try again.');
        router.refresh();
        return;
      }
      setMutationStatus('Player nominated.');
    })
    .catch(() => {
      setExtraNominated((prev) => prev.filter((n) => n !== key));
      setMutationStatus('Failed to nominate player. Please try again.');
      router.refresh();
    })
    .finally(() => setIsNominating(false));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/__tests__/AuctionSheet.claimed.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/AuctionSheet.claimed.test.tsx
git commit -m "fix: catch thrown nomination request errors and roll back optimistic state"
```

---

### Task 6: Harden `NominationHelper`'s watchlist/nomination handlers with per-player pending guards, rollback, and canonical refetch

**Files:**

- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Modify: `src/components/NominationHelper/NominationTable.tsx`
- Modify: `src/components/NominationHelper/WatchlistSidebar.tsx`
- Test: `src/__tests__/NominationHelper.ui.test.tsx`

**Interfaces:**

- Consumes: `MutationStatus` (Task 1).
- Produces: new optional prop `pendingIds?: Set<number>` on both `NominationTable` and
  `WatchlistSidebar` — disables the Watch/Nominate/remove controls for a player currently mid-mutation.

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/NominationHelper.ui.test.tsx`, update the top-level imports and the
`OnboardingContext` mock so `recordPlayerNominated` calls are assertable, then add a new describe
block. Replace:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import WatchlistSidebar from '@/components/NominationHelper/WatchlistSidebar';
import type { Player } from '@/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    progress: null,
    recordBidLogged: jest.fn(),
    recordPlayerNominated: jest.fn(),
  }),
}));
```

with:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import WatchlistSidebar from '@/components/NominationHelper/WatchlistSidebar';
import type { Player } from '@/types';

const mockRouter = { replace: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRecordPlayerNominated = jest.fn().mockResolvedValue(undefined);

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    progress: null,
    recordBidLogged: jest.fn(),
    recordPlayerNominated: (name: string) => mockRecordPlayerNominated(name),
  }),
}));
```

**Why the router mock changes shape, not just gains a variable:** the original mock's factory
(`useRouter: () => ({ replace: jest.fn() })`) returns a brand-new object on every call. Task 6's
`NominationHelper` rewrite adds `fetchData = useCallback(..., [draftId, router])` — with a
non-identity-stable `router`, `fetchData` is recreated every render, the polling `useEffect`
(`[fetchData]`) re-runs every render, and each resolved fetch triggers `setData` → re-render →
another fetch, in an unbounded loop. Returning the same `mockRouter` object from every `useRouter()`
call keeps `router` referentially stable across renders (matching real Next.js `useRouter()`
behavior, which is stable), so `fetchData` and the effect stop re-running spuriously. Without this
fix, the new exact-fetch-count assertions in this task's tests are non-deterministic.

Add this new describe block at the end of the file:

```tsx
describe('NominationHelper mutations', () => {
  const dataWithAuction = {
    teamStats: [],
    auctionResults: [
      { playerId: 999, player: 'Prior Winner', position: 'RB', price: 50, teamId: 1 },
    ],
    watchlist: [],
    nominated: [],
    ownerHandle: null,
    targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => dataWithAuction,
    } as Response);
    mockRecordPlayerNominated.mockClear();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  async function renderReady() {
    const user = userEvent.setup();
    render(<NominationHelper draftId={1} players={PLAYERS} />);
    await waitFor(() => expect(screen.getByText('Nomination Helper')).toBeInTheDocument());
    return user;
  }

  function watchButtonFor(playerName: string) {
    const row = screen.getByText(playerName).closest('tr');
    if (!row) throw new Error(`row for ${playerName} not found`);
    return within(row).getByRole('button', { name: /^watch$/i });
  }

  function nominateButtonFor(playerName: string) {
    const row = screen.getByText(playerName).closest('tr');
    if (!row) throw new Error(`row for ${playerName} not found`);
    return within(row).getByRole('button', { name: /^nominate$/i });
  }

  it('rolls back an optimistic watchlist add and announces failure when the request throws', async () => {
    const user = await renderReady();
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('network down')),
    );

    await user.click(watchButtonFor('Josh Allen'));

    await waitFor(() =>
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(
        /failed to add josh allen to watchlist/i,
      ),
    );
    expect(
      screen.queryByRole('button', { name: /remove josh allen from watchlist/i }),
    ).not.toBeInTheDocument();
  });

  it('rolls back an optimistic watchlist add and refetches canonical data on a non-2xx response', async () => {
    const user = await renderReady();
    const callsBeforeMutation = (global.fetch as jest.Mock).mock.calls.length;
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409 } as Response);

    await user.click(watchButtonFor('Josh Allen'));

    await waitFor(() =>
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(
        /failed to add josh allen to watchlist/i,
      ),
    );
    // The failed POST plus a follow-up GET to resync canonical state.
    await waitFor(() =>
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBeforeMutation + 2),
    );
  });

  it('blocks a second Watch click for the same player while the first request is pending', async () => {
    const user = await renderReady();
    let resolveFetch: (value: Response) => void = () => {};
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const watchButton = watchButtonFor('Josh Allen');
    const callsBeforeMutation = (global.fetch as jest.Mock).mock.calls.length;

    await user.click(watchButton);
    await waitFor(() => expect(watchButton).toBeDisabled());
    await user.click(watchButton);

    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBeforeMutation + 1);

    resolveFetch({ ok: true, status: 200, json: async () => dataWithAuction } as Response);
    await waitFor(() => expect(watchButton).not.toBeDisabled());
  });

  it('does not record onboarding progress when a nomination request fails', async () => {
    const user = await renderReady();
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 409 } as Response);

    await user.click(nominateButtonFor('Josh Allen'));

    await waitFor(() =>
      expect(screen.getByTestId('mutation-status')).toHaveTextContent(
        /failed to nominate josh allen/i,
      ),
    );
    expect(mockRecordPlayerNominated).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/__tests__/NominationHelper.ui.test.tsx`
Expected: FAIL — no `mutation-status` testid exists, thrown fetches are unhandled in
`addToWatchlist`, and the Watch/Nominate buttons are never disabled.

- [ ] **Step 3: Implement the shared `runPlayerMutation` helper and rewrite the four handlers**

Replace the full contents of `src/components/NominationHelper/NominationHelper.tsx` with:

```tsx
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Player, Position, TeamStats, AuctionResultEntry } from '@/types';
import { computeNominationScores, type ScoredPlayer } from '@/lib/nominationScoring';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import MutationStatus from '@/components/MutationStatus';
import WatchlistSidebar from './WatchlistSidebar';
import NominationTable from './NominationTable';
import DraftReadOnlyBanner from '@/components/DraftReadOnlyBanner';

interface NomData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: number[];
  nominated: number[];
  ownerHandle: string | null;
  targetRoster: Partial<Record<Position, number>>;
}

interface NominationHelperProps {
  draftId: number;
  players: Player[];
  isReadOnly?: boolean;
}

interface PlayerMutationConfig {
  playerId: number;
  pendingLabel: string;
  successLabel: string;
  failureLabel: string;
  applyOptimistic: (prev: NomData) => NomData;
  request: () => Promise<Response>;
}

export default function NominationHelper({
  draftId,
  players,
  isReadOnly = false,
}: NominationHelperProps) {
  const router = useRouter();
  const { progress, recordPlayerNominated } = useOnboarding();
  const [data, setData] = useState<NomData | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [mutationStatus, setMutationStatus] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/draft/${draftId}/nomination-data`);
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      if (res.status === 404) {
        setDraftError('No draft configured');
        return;
      }
      if (!res.ok) {
        setDraftError('Unable to load nomination data');
        return;
      }
      setData(await res.json());
      setDraftError(null);
    } catch {
      setDraftError('Unable to load nomination data');
    }
  }, [draftId, router]);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const wonIds = useMemo(
    () =>
      new Set(
        data?.auctionResults.flatMap((result) =>
          typeof result.playerId === 'number' ? [result.playerId] : [],
        ) ?? [],
      ),
    [data],
  );

  const scored = useMemo<ScoredPlayer[]>(() => {
    if (!data) return [];
    return computeNominationScores(
      players,
      data.teamStats,
      data.auctionResults,
      data.watchlist,
      data.nominated,
      // null ownerHandle → no owner team excluded from rival demand scoring (correct for unclaimed draft)
      data.ownerHandle ?? '',
      data.targetRoster,
    );
  }, [data, players]);

  const runPlayerMutation = useCallback(
    async ({
      playerId,
      pendingLabel,
      successLabel,
      failureLabel,
      applyOptimistic,
      request,
    }: PlayerMutationConfig): Promise<boolean> => {
      if (pendingIds.has(playerId)) return false;
      const snapshot = data;
      setPendingIds((prev) => new Set(prev).add(playerId));
      setData((prev) => (prev ? applyOptimistic(prev) : prev));
      setMutationStatus(pendingLabel);
      try {
        const res = await request();
        if (res.status === 401) {
          router.replace('/sign-in');
          return false;
        }
        if (!res.ok) {
          setData(snapshot);
          setMutationStatus(failureLabel);
          void fetchData();
          return false;
        }
        setMutationStatus(successLabel);
        return true;
      } catch {
        setData(snapshot);
        setMutationStatus(failureLabel);
        void fetchData();
        return false;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
      }
    },
    [pendingIds, data, fetchData, router],
  );

  const addToWatchlist = (player: Player) => {
    const playerId = player.id;
    if (playerId === undefined) return;
    void runPlayerMutation({
      playerId,
      pendingLabel: `Adding ${player.player} to watchlist…`,
      successLabel: `${player.player} added to watchlist.`,
      failureLabel: `Failed to add ${player.player} to watchlist. Please try again.`,
      applyOptimistic: (prev) => ({ ...prev, watchlist: [...prev.watchlist, playerId] }),
      request: () =>
        fetch(`/api/draft/${draftId}/watchlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        }),
    });
  };

  const removeFromWatchlist = (playerId: number) => {
    void runPlayerMutation({
      playerId,
      pendingLabel: 'Removing from watchlist…',
      successLabel: 'Removed from watchlist.',
      failureLabel: 'Failed to remove from watchlist. Please try again.',
      applyOptimistic: (prev) => ({
        ...prev,
        watchlist: prev.watchlist.filter((id) => id !== playerId),
      }),
      request: () =>
        fetch(`/api/draft/${draftId}/watchlist`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        }),
    });
  };

  const nominatePlayer = async (player: Player) => {
    const playerId = player.id;
    if (playerId === undefined) return;
    const ok = await runPlayerMutation({
      playerId,
      pendingLabel: `Nominating ${player.player}…`,
      successLabel: `${player.player} nominated.`,
      failureLabel: `Failed to nominate ${player.player}. Please try again.`,
      applyOptimistic: (prev) => ({ ...prev, nominated: [...prev.nominated, playerId] }),
      request: () =>
        fetch(`/api/draft/${draftId}/nominated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        }),
    });
    if (ok) await recordPlayerNominated(player.player);
  };

  const unNominatePlayer = (playerId: number) => {
    void runPlayerMutation({
      playerId,
      pendingLabel: 'Removing from in auction…',
      successLabel: 'Removed from in auction.',
      failureLabel: 'Failed to remove from in auction. Please try again.',
      applyOptimistic: (prev) => ({
        ...prev,
        nominated: prev.nominated.filter((id) => id !== playerId),
      }),
      request: () =>
        fetch(`/api/draft/${draftId}/nominated`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        }),
    });
  };

  if (!data) {
    return (
      <div
        data-onboarding-nomination-state={draftError ? 'error' : 'loading'}
        data-testid="nomination-helper-state"
        className="flex h-[400px] items-center justify-center text-muted-foreground"
      >
        {draftError ?? 'Loading nomination data...'}
      </div>
    );
  }

  const hasAuctionData = data.auctionResults.length > 0;
  const bestNomination = scored[0] ?? null;
  const maxPressure = scored.reduce(
    (max, player) => Math.max(max, Math.round(player.nominationScore)),
    0,
  );

  return (
    <div
      data-testid="nomination-helper-layout"
      data-onboarding-nomination-state="ready"
      className="flex min-h-screen flex-col bg-background text-foreground md:flex-row"
    >
      <MutationStatus message={mutationStatus} />
      <WatchlistSidebar
        players={players}
        nominated={data.nominated}
        watchlist={data.watchlist}
        wonIds={wonIds}
        pendingIds={pendingIds}
        onAddToWatchlist={addToWatchlist}
        onRemoveFromWatchlist={(playerId) => {
          if (typeof playerId === 'number') removeFromWatchlist(playerId);
        }}
        onUnNominate={(playerId) => {
          if (typeof playerId === 'number') unNominatePlayer(playerId);
        }}
        onboardingSubjectPlayerName={isReadOnly ? null : (progress?.subjectPlayerName ?? null)}
        isReadOnly={isReadOnly}
      />

      <div className="min-w-0 flex-1 overflow-x-auto px-5 pt-4 pb-10">
        {isReadOnly ? <DraftReadOnlyBanner /> : null}
        <div
          data-onboarding-target={isReadOnly ? undefined : 'nominate-intro'}
          className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch"
        >
          <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
            <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
              Live Workbench
            </div>
            <h1 className="font-label m-0 text-2xl leading-none font-bold tracking-tight text-foreground">
              Nomination Helper
            </h1>
            <div className="mt-1.5 text-[11px] text-secondary-fg">
              Find nominations that pull money from rival builds.
            </div>
          </section>

          <section className="grid min-w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[720px]">
            <NominationMetric
              label="Best Nomination"
              value={bestNomination?.player.player ?? '—'}
              detail={
                bestNomination
                  ? `${bestNomination.player.pos} · ${Math.round(
                      bestNomination.nominationScore,
                    ).toLocaleString()} pressure`
                  : undefined
              }
              tone="primary"
            />
            <NominationMetric label="Live Nominations" value={data.nominated.length} />
            <NominationMetric label="Watchlist" value={data.watchlist.length} />
            <NominationMetric
              label="Rival Pressure"
              value={maxPressure.toLocaleString()}
              detail="Top visible score"
            />
          </section>
        </div>

        <NominationTable
          scored={scored}
          posFilter={posFilter}
          onPosFilterChange={setPosFilter}
          hasAuctionData={hasAuctionData}
          pendingIds={pendingIds}
          onWatch={addToWatchlist}
          onNominate={nominatePlayer}
          isReadOnly={isReadOnly}
        />
      </div>
    </div>
  );
}

interface NominationMetricProps {
  label: string;
  value: number | string;
  detail?: string;
  tone?: 'primary';
}

function NominationMetric({ label, value, detail, tone }: NominationMetricProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-card px-3 py-3">
      <div className="font-label text-[10px] tracking-[1.7px] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className="mt-1 truncate font-mono text-xl font-bold text-foreground tabular-nums"
        style={{ color: tone === 'primary' ? 'var(--primary)' : undefined }}
      >
        {value}
      </div>
      {detail && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}
```

Now update `src/components/NominationHelper/NominationTable.tsx` to accept and use `pendingIds`.
Replace:

```tsx
interface NominationTableProps {
  scored: ScoredPlayer[];
  posFilter: 'ALL' | Position;
  onPosFilterChange: (pos: 'ALL' | Position) => void;
  hasAuctionData: boolean;
  onWatch: (player: Player) => void;
  onNominate: (player: Player) => void;
  isReadOnly?: boolean;
}

export default function NominationTable({
  scored,
  posFilter,
  onPosFilterChange,
  hasAuctionData,
  onWatch,
  onNominate,
  isReadOnly = false,
}: NominationTableProps) {
```

with:

```tsx
interface NominationTableProps {
  scored: ScoredPlayer[];
  posFilter: 'ALL' | Position;
  onPosFilterChange: (pos: 'ALL' | Position) => void;
  hasAuctionData: boolean;
  pendingIds?: Set<number>;
  onWatch: (player: Player) => void;
  onNominate: (player: Player) => void;
  isReadOnly?: boolean;
}

export default function NominationTable({
  scored,
  posFilter,
  onPosFilterChange,
  hasAuctionData,
  pendingIds = new Set<number>(),
  onWatch,
  onNominate,
  isReadOnly = false,
}: NominationTableProps) {
```

Replace the Watch/Nominate action cells:

```tsx
{
  !isReadOnly ? (
    <>
      <TableCell className="text-center">
        <Button
          variant="outline"
          size="xs"
          onClick={() => onWatch(player)}
          className="font-label tracking-wide hover:border-[var(--pos-rb)]"
          style={{ color: 'var(--pos-rb)' }}
        >
          Watch
        </Button>
      </TableCell>
      <TableCell className="text-center">
        <Button
          variant="outline"
          size="xs"
          onClick={() => onNominate(player)}
          data-testid={`nominate-player-${player.player}`}
          data-onboarding-target="nominate-practice"
          className="font-label tracking-wide hover:border-[var(--pos-pick)]"
          style={{ color: 'var(--pos-pick)' }}
        >
          Nominate
        </Button>
      </TableCell>
    </>
  ) : null;
}
```

with:

```tsx
{
  !isReadOnly ? (
    <>
      <TableCell className="text-center">
        <Button
          variant="outline"
          size="xs"
          type="button"
          disabled={player.id !== undefined && pendingIds.has(player.id)}
          onClick={() => onWatch(player)}
          className="font-label tracking-wide hover:border-[var(--pos-rb)]"
          style={{ color: 'var(--pos-rb)' }}
        >
          Watch
        </Button>
      </TableCell>
      <TableCell className="text-center">
        <Button
          variant="outline"
          size="xs"
          type="button"
          disabled={player.id !== undefined && pendingIds.has(player.id)}
          onClick={() => onNominate(player)}
          data-testid={`nominate-player-${player.player}`}
          data-onboarding-target="nominate-practice"
          className="font-label tracking-wide hover:border-[var(--pos-pick)]"
          style={{ color: 'var(--pos-pick)' }}
        >
          Nominate
        </Button>
      </TableCell>
    </>
  ) : null;
}
```

Now update `src/components/NominationHelper/WatchlistSidebar.tsx` to accept and use `pendingIds`.
Replace:

```tsx
interface WatchlistSidebarProps {
  players: Player[];
  nominated: Array<number | string>;
  watchlist: Array<number | string>;
  wonIds?: Set<number>;
  wonNames?: Set<string>;
  onAddToWatchlist: (player: Player) => void;
  onRemoveFromWatchlist: (playerId: number | string) => void;
  onUnNominate: (playerId: number | string) => void;
  onboardingSubjectPlayerName?: string | null;
  isReadOnly?: boolean;
}

export default function WatchlistSidebar({
  players,
  nominated,
  watchlist,
  wonIds = new Set(),
  wonNames = new Set(),
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onUnNominate,
  onboardingSubjectPlayerName,
  isReadOnly = false,
}: WatchlistSidebarProps) {
```

with:

```tsx
interface WatchlistSidebarProps {
  players: Player[];
  nominated: Array<number | string>;
  watchlist: Array<number | string>;
  wonIds?: Set<number>;
  wonNames?: Set<string>;
  pendingIds?: Set<number>;
  onAddToWatchlist: (player: Player) => void;
  onRemoveFromWatchlist: (playerId: number | string) => void;
  onUnNominate: (playerId: number | string) => void;
  onboardingSubjectPlayerName?: string | null;
  isReadOnly?: boolean;
}

export default function WatchlistSidebar({
  players,
  nominated,
  watchlist,
  wonIds = new Set(),
  wonNames = new Set(),
  pendingIds = new Set<number>(),
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onUnNominate,
  onboardingSubjectPlayerName,
  isReadOnly = false,
}: WatchlistSidebarProps) {
```

Replace the "In Auction" remove button:

```tsx
{
  !isReadOnly ? (
    <button
      type="button"
      onClick={() => onUnNominate(playerId)}
      title="Remove from in auction"
      aria-label={`Remove ${name} from in auction`}
      data-testid={
        name === onboardingSubjectPlayerName ? `onboarding-nominate-undo-${name}` : undefined
      }
      data-onboarding-target={name === onboardingSubjectPlayerName ? 'nominate-undo' : undefined}
      className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
    >
      <X className="size-3.5" />
    </button>
  ) : null;
}
```

with:

```tsx
{
  !isReadOnly ? (
    <button
      type="button"
      onClick={() => onUnNominate(playerId)}
      disabled={typeof playerId === 'number' && pendingIds.has(playerId)}
      title="Remove from in auction"
      aria-label={`Remove ${name} from in auction`}
      data-testid={
        name === onboardingSubjectPlayerName ? `onboarding-nominate-undo-${name}` : undefined
      }
      data-onboarding-target={name === onboardingSubjectPlayerName ? 'nominate-undo' : undefined}
      className="shrink-0 text-muted-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-40"
    >
      <X className="size-3.5" />
    </button>
  ) : null;
}
```

Replace the watchlist remove button:

```tsx
{
  !isReadOnly ? (
    <button
      type="button"
      onClick={() => onRemoveFromWatchlist(playerId)}
      title="Remove from watchlist"
      aria-label={`Remove ${name} from watchlist`}
      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
    >
      <X className="size-3.5" />
    </button>
  ) : null;
}
```

with:

```tsx
{
  !isReadOnly ? (
    <button
      type="button"
      onClick={() => onRemoveFromWatchlist(playerId)}
      disabled={typeof playerId === 'number' && pendingIds.has(playerId)}
      title="Remove from watchlist"
      aria-label={`Remove ${name} from watchlist`}
      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
    >
      <X className="size-3.5" />
    </button>
  ) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/__tests__/NominationHelper.ui.test.tsx src/__tests__/NominationHelper.onboarding.test.tsx`
Expected: PASS (all tests in both files — the onboarding test file renders `WatchlistSidebar`
directly and must still pass with the new optional `pendingIds` prop defaulted)

- [ ] **Step 5: Commit**

```bash
git add src/components/NominationHelper/NominationHelper.tsx src/components/NominationHelper/NominationTable.tsx src/components/NominationHelper/WatchlistSidebar.tsx src/__tests__/NominationHelper.ui.test.tsx
git commit -m "fix: catch thrown watchlist/nomination errors, block duplicate clicks, refetch on conflict"
```

---

### Task 7: Full verification and CLAUDE.md update

**Files:**

- Modify: `/home/colereschke/dev/projects/draftops/CLAUDE.md` (the `main`-checkout copy, not the
  worktree's — see Step 3)

- [ ] **Step 1: Run the full quality gate**

Run: `make check`
Expected: typecheck, lint, format check, and the full Jest suite all pass (89+ suites, 757+ tests).

- [ ] **Step 2: Manually sanity-check keyboard-only bid logging and the aria-live announcements**

Run: `make dev`, sign in, open `/draft/<id>`, click a player row, tab to the Price field, type a
price, and press Enter without touching the mouse — the bid should log. Open a browser accessibility
tree inspector (or a screen reader) and confirm the `mutation-status` region updates through
"Saving bid…" → "Bid saved." Stop the dev server when done (`CLAUDE.md`: kill background dev servers
when done).

- [ ] **Step 3: Update `CLAUDE.md`'s "What's Built" section**

This plan lives in a worktree; the merge target is `main`'s `CLAUDE.md`, so make this edit as part of
the PR (not by editing the worktree's stale copy in isolation — the worktree's `CLAUDE.md` is the same
tracked file and will be included in the diff normally). Add a new bullet under **What's Built** in
`CLAUDE.md`, immediately after the Sleeper roster catch-up (#9b) bullet:

```markdown
- **Resilient optimistic mutations (HARD-010)** — `BidModal` is now a semantic `<form>` (Enter submits
  the price field) with a two-step Remove/Confirm Remove destructive-action guard and an
  `isSubmitting`-disabled state. `AuctionSheet` actually consumes the `isPending` flag `useTransition`
  returns to disable the bid form and block duplicate submits, and calls `router.refresh()` on any
  rejected mutation (bid save/remove, nomination) to resync canonical server state after a conflict.
  `NominationHelper`'s watchlist/nomination handlers share one `runPlayerMutation` helper
  (`src/components/NominationHelper/NominationHelper.tsx`) that wraps every request in
  `try/catch/finally`, tracks a per-player `pendingIds` set to block duplicate Watch/Nominate/remove
  clicks, restores the prior snapshot on failure, and refetches canonical nomination data instead of
  trusting a stale snapshot. A shared `MutationStatus` component
  (`src/components/MutationStatus.tsx`) is a visually hidden `aria-live="polite"` region announcing
  pending/success/failure text for both the value sheet and the nomination workbench.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record HARD-010 resilient optimistic mutations in CLAUDE.md"
```

---

## Self-Review

**Spec coverage** (against HARD-010's problem statement and acceptance criteria in
`docs/draftops-audit-workstreams.md`):

- "Some watchlist/nomination requests do not catch thrown network errors" → Task 5 (`handleNominate`)
  and Task 6 (`addToWatchlist`/`removeFromWatchlist`/`nominatePlayer`/`unNominatePlayer` via
  `runPlayerMutation`).
- "Bid transitions ignore `isPending`, allowing duplicate submissions" → Task 4 (`isPending` captured
  and passed to `BidModal`, submit button disabled, handler-level guard).
- "Bid removal is immediate" → Task 3 (two-step confirm).
- "The modal is not a semantic form" → Task 2.
- "Thrown fetches and non-2xx responses both restore state" → Tasks 4–6 tests cover both paths for
  bids, nominations, and watchlist.
- "Double clicks create at most one server mutation" → Task 4 test (bid submit) and Task 6 test
  (Watch button).
- "Keyboard-only bid logging works" → Task 2 Enter-key test.
- "Mutation outcomes are visible and announced" → Task 1 (`MutationStatus`) wired into Task 4 and
  Task 6.
- "Confirm destructive actions or provide a reliable undo window" → Task 3.
- "Refresh canonical server state after conflicts" → Task 4/5 (`router.refresh()`) and Task 6
  (`fetchData()` refetch, which is this component's own canonical source — see Architecture note).

**Placeholder scan:** no TODOs, no "add appropriate handling" — every step shows literal diffs.

**Type consistency:** `MutationStatus({ message: string })` is the same shape everywhere it's
imported (Tasks 4 and 6). `BidModal`'s `isSubmitting?: boolean` (Task 2) is consumed by `AuctionSheet`
exactly as `isSubmitting={isPending}` (Task 4). `NominationTable`/`WatchlistSidebar`'s
`pendingIds?: Set<number>` (Task 6) matches the `Set<number>` state `NominationHelper` passes down.
`PlayerMutationConfig`'s `applyOptimistic: (prev: NomData) => NomData` matches `NomData`'s field names
(`watchlist`, `nominated`) used by all four call sites.
