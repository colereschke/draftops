# HARD-022 Auction Workspace Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose AuctionSheet and PlayerTable into pure selectors, focused optimistic bid mutation orchestration, and focused table renderers without changing auction behavior.

**Architecture:** `AuctionSheet` remains responsible for URL/view state, nomination state, and modal/Sleeper visibility. `auctionSelectors.ts` owns deterministic derivations, `useAuctionBidMutations.ts` owns optimistic server-action behavior, and `PlayerTableHeader`/`PlayerTableRow` own existing table presentation. DOM, stable selectors, server-action payloads, messages, and refresh recovery remain unchanged.

**Tech Stack:** Next.js 16, React 19 hooks, TypeScript strict, Jest + React Testing Library.

## Global Constraints

- Limit this PR to `src/components/AuctionSheet/` and focused application tests. Do not modify server actions, APIs, schema, legality, or transactions.
- Preserve immediate filtering; only search URL synchronization remains debounced at 400 ms.
- Preserve `data-testid` values, accessibility behavior, read-only controls, DOM structure, and client-facing mutation messages.
- `AuctionSheet` retains nomination, onboarding, and modal visibility. Its create-success callback must clear LIVE state, await `recordBidLogged(player.player)`, then close the modal; a rejection uses current error/refresh recovery.
- Test user-visible rules and interactions only. Do not test file layout, component existence, prop forwarding, hook internals, or incidental mocks.
- Use `data-testid` or `id` in new tests. Follow the repository’s TypeScript and formatting rules.
- Run targeted Jest after each task and `make check` before final review.

## File Structure

| File                        | Responsibility                                                        |
| --------------------------- | --------------------------------------------------------------------- |
| `auctionSelectors.ts`       | Identity, claims/nominations, filtering/sorting, and auction metrics. |
| `useAuctionBidMutations.ts` | Optimistic add/update/delete plus typed failure and refresh recovery. |
| `PlayerTableHeader.tsx`     | Existing sortable table header.                                       |
| `PlayerTableRow.tsx`        | Existing single-player row and accessible action.                     |
| `PlayerTable.tsx`           | Layout and player-to-row mapping.                                     |
| `AuctionSheet.tsx`          | State ownership and composition.                                      |
| `auctionSelectors.test.ts`  | Important pure auction rules not already covered at the UI.           |

### Task 1: Extract and characterize pure auction selectors

**Files:**

- Create: `src/components/AuctionSheet/auctionSelectors.ts`
- Create: `src/__tests__/auctionSelectors.test.ts`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`

**Interfaces:**

- Produces `type AuctionIdentityKey = number | string`.
- Produces `getPlayerIdentityKey(player: Player)`, `getBidIdentityKey(bid: ClaimedBid)`, and `createClaimMap(bids)`.
- Produces `createNominatedSet(nominatedPlayers, extraNominated, clearedNominations)`.
- Produces `selectAuctionPlayers(options)` for all current filters/sorts and `getAuctionMetrics(players, claimMap, teams, ownerHandle)` for header values.

- [ ] **Step 1: Add focused characterization tests**

```ts
it('keeps null spread and claimed prices after valued rows', () => {
  expect(
    selectAuctionPlayers({ ...defaults, sortBy: 'spread', sortDir: 'desc' }).map(
      (player) => player.player,
    ),
  ).toEqual(['Valued Player', 'No Spread']);
  expect(
    selectAuctionPlayers({ ...defaults, sortBy: 'claimedPrice', sortDir: 'asc' }).map(
      (player) => player.player,
    ),
  ).toEqual(['Claimed Player', 'Unclaimed Player']);
});

it('retains generic null ordering and excludes claimed/pick assets from metrics', () => {
  expect(
    selectAuctionPlayers({ ...defaults, sortBy: 'age', sortDir: 'desc' }).map(
      (player) => player.player,
    ),
  ).toEqual(['No Age', 'Known Age']);
  expect(getAuctionMetrics(players, claimMap, TEAMS, 'cole')).toMatchObject({
    mySpent: 110,
    totalPlayerCount: 2,
    posStats: { QB: { count: 0, total: 0 } },
  });
});
```

- [ ] **Step 2: Verify the new test fails before implementation**

Run: `pnpm exec jest src/__tests__/auctionSelectors.test.ts --runInBand`

Expected: FAIL because `auctionSelectors.ts` does not exist.

- [ ] **Step 3: Implement and adopt selectors without changing rules**

```ts
export function getPlayerIdentityKey(player: Player): AuctionIdentityKey {
  return player.id ?? player.player;
}

export function selectAuctionPlayers(options: AuctionPlayerSelectionOptions): Player[] {
  return options.players
    .filter((player) => matchesAuctionFilters(player, options))
    .sort((left, right) => compareAuctionPlayers(left, right, options));
}
```

Move the current case-insensitive player/team search, strategy gating, availability filter, spread
and claimed-price null-last behavior, generic `9999` null behavior, and `sfRank` tie-breaker into
named helpers. `getAuctionMetrics` must exclude claimed QB/RB/WR/TE from position totals and
PICK/PKG from player count. Replace the current AuctionSheet derived `useMemo` blocks only.

- [ ] **Step 4: Verify selectors and existing sheet behavior**

Run: `pnpm exec jest src/__tests__/auctionSelectors.test.ts src/__tests__/AuctionSheet.claimed.test.tsx src/__tests__/AuctionSheet.urlSync.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/auctionSelectors.ts src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/auctionSelectors.test.ts
git commit -m "refactor: extract auction selectors"
```

### Task 2: Characterize edit/delete and extract bid mutation orchestration

**Files:**

- Create: `src/components/AuctionSheet/useAuctionBidMutations.ts`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/__tests__/AuctionSheet.claimed.test.tsx`

**Interfaces:**

- Consumes Task 1’s identity and claim-map utilities.
- Produces `useAuctionBidMutations({ claimedBids, teams, draftId, onCreateSuccess })`.
- The hook result contains `claimMap`, `isPending`, `modalError`, `mutationStatus`, `clearModalError`, `submitBid(player, input)`, and `deleteBidForPlayer(player)`.
- `onCreateSuccess` is `(player: Player) => Promise<void>` and has no nomination/modal setters.

- [ ] **Step 1: Add application-level edit/delete tests**

```tsx
it('updates a claimed player and closes the edit dialog after save succeeds', async () => {
  const user = userEvent.setup();
  renderSheet({ claimedBids: [mockClaim] });
  await user.click(screen.getByTestId('player-row-1'));
  await user.clear(screen.getByTestId('bid-price'));
  await user.type(screen.getByTestId('bid-price'), '125');
  await user.click(screen.getByTestId('bid-submit'));
  await waitFor(() =>
    expect(mockUpdateBid).toHaveBeenCalledWith({ id: 1, price: 125, teamId: 1, draftId: 1 }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByTestId('mutation-status')).toHaveTextContent('Bid saved.');
});

it('removes a claimed player and closes the dialog after confirmation succeeds', async () => {
  const user = userEvent.setup();
  renderSheet({ claimedBids: [mockClaim] });
  await user.click(screen.getByTestId('player-row-1'));
  await user.click(screen.getByRole('button', { name: /^remove$/i }));
  await user.click(screen.getByRole('button', { name: /confirm remove/i }));
  await waitFor(() => expect(mockDeleteBid).toHaveBeenCalledWith({ id: 1, draftId: 1 }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByTestId('mutation-status')).toHaveTextContent('Bid removed.');
});
```

Extend the existing `DRAFT_COMPLETE` deletion test with `expect(mockRouterRefresh).toHaveBeenCalled()`.

- [ ] **Step 2: Run characterization on the current implementation**

Run: `pnpm exec jest src/__tests__/AuctionSheet.claimed.test.tsx --runInBand`

Expected: PASS; these tests document working application behavior before it moves.

- [ ] **Step 3: Implement hook and compose it in AuctionSheet**

```ts
interface UseAuctionBidMutationsOptions {
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  draftId: number;
  onCreateSuccess: (player: Player) => Promise<void>;
}
```

Move the current `useOptimistic` actions, transition state, action payloads, typed messages,
sign-in redirect, and `router.refresh()` recovery unchanged. The hook awaits the callback after a
successful create but never closes the modal or mutates nomination state. In `AuctionSheet`, the
callback clears the nomination, awaits onboarding, then closes the modal.

- [ ] **Step 4: Verify mutation and onboarding behavior**

Run: `pnpm exec jest src/__tests__/AuctionSheet.claimed.test.tsx src/__tests__/AuctionSheet.onboarding.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/useAuctionBidMutations.ts src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/AuctionSheet.claimed.test.tsx
git commit -m "refactor: extract auction bid mutations"
```

### Task 3: Split PlayerTable rendering and complete validation

**Files:**

- Create: `src/components/AuctionSheet/PlayerTableHeader.tsx`
- Create: `src/components/AuctionSheet/PlayerTableRow.tsx`
- Modify: `src/components/AuctionSheet/PlayerTable.tsx`
- Modify: `src/__tests__/AuctionSheet.urlSync.test.tsx`

**Interfaces:**

- Produces `PlayerTableHeader({ showNotes, hasClaims, sortBy, sortDir, onSort })`.
- Produces `PlayerTableRow({ player, showNotes, hasClaims, claim, isNominated, onboardingSubjectPlayerName, onRowClick })`.
- `PlayerTable` retains its public props and maps each supplied player to one row.

- [ ] **Step 1: Run existing application-level table tests**

Run: `pnpm exec jest src/__tests__/PlayerTable.test.tsx src/__tests__/PlayerTable.spread.test.tsx src/__tests__/AuctionSheet.onboarding.test.tsx --runInBand`

Expected: PASS. Do not add extraction-only tests.

- [ ] **Step 2: Extract current header and row markup unchanged**

```tsx
interface PlayerTableHeaderProps {
  showNotes: boolean;
  hasClaims: boolean;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortKey) => void;
}

interface PlayerTableRowProps {
  player: Player;
  claim: ClaimedBid | undefined;
  isNominated: boolean;
  onRowClick: ((player: Player) => void) | undefined;
}
```

Move `SORT_COLUMNS` and `SortIcon` with the header. Retain accessible sort-button names,
non-focusable rows, the player-name button, and `onboarding-bid-undo-*`,
`dynamic-pick-value-*`, and `spread-*` selectors. `PlayerTable` remains the player-to-row mapper.

- [ ] **Step 3: Add immediate visible-search behavior test**

```tsx
it('filters visible rows immediately while search URL synchronization is debounced', async () => {
  const user = userEvent.setup();
  renderSheet();
  await user.type(screen.getByLabelText('Search player or team'), 'jeff');
  expect(screen.queryByTestId('player-row-1')).not.toBeInTheDocument();
  expect(screen.getByTestId('player-row-5')).toBeInTheDocument();
});
```

Run: `pnpm exec jest src/__tests__/AuctionSheet.urlSync.test.tsx --runInBand`

Expected: PASS; only the URL write is debounced.

- [ ] **Step 4: Remove only duplicated moved code and run validation**

Keep view state, URL synchronization, `handleSort`, nomination handling, modal/Sleeper rendering,
read-only conditions, footer, and `BidHistoryPanel` in `AuctionSheet`. Selector code must not
import React/router/server-action APIs; the hook must not expose nomination setters/modal state.

```bash
pnpm exec jest src/__tests__/auctionSelectors.test.ts src/__tests__/AuctionSheet.claimed.test.tsx src/__tests__/AuctionSheet.urlSync.test.tsx src/__tests__/AuctionSheet.onboarding.test.tsx src/__tests__/PlayerTable.test.tsx src/__tests__/PlayerTable.spread.test.tsx src/__tests__/criticalRouteAccessibility.test.tsx src/__tests__/criticalRouteLandmarks.test.tsx --runInBand
pnpm tsc --noEmit
pnpm lint
pnpm format:check
make check
```

Expected: every command passes. Preserve application behavior rather than weakening assertions.

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet src/__tests__/auctionSelectors.test.ts src/__tests__/AuctionSheet.claimed.test.tsx src/__tests__/AuctionSheet.urlSync.test.tsx
git commit -m "refactor: decompose auction workspace"
```

## Plan self-review

- Tasks 1–3 implement every approved scope area: selectors, bid mutations, table rendering, and composition.
- Each added test validates a current auction rule or user interaction, never the extraction mechanism.
- Task 1 provides the identity/claim-map types consumed by Task 2; Tasks 2–3 retain public sheet/table contracts.
