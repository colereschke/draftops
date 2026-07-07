# UI Redesign — Phase 2: BidModal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `BidModal`'s hand-rolled inline-style backdrop/panel/native-form-controls with shadcn/ui primitives (`Dialog`, `Select`, `Input`, `Label`, `Button`), reusing the token system and Base UI conventions established in Phase 1, without changing `BidModalProps` or any behavior `AuctionSheet` depends on.

**Architecture:** `BidModal` stays a single client component with the same props contract. Its backdrop/panel/Escape-handling `div`s become `Dialog`/`DialogContent`; its native `<select>` becomes shadcn `Select` (Base UI, generic over value type — binds `teamId: number` directly, no string coercion); its native `<input>`/labels become `Input`/`Label`; its five buttons become `Button` with variants (`default`, `outline`, `destructive`) plus one inline-style color override for the teal "Nom" button, consistent with how `--pos-*`/`--age-*` colors are consumed everywhere else in this codebase (inline style, never a Tailwind theme token, since they're the existing runtime-color exception).

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui CLI v4 (`@base-ui/react`), Jest + React Testing Library + `@testing-library/user-event`, pnpm.

## Global Constraints

- **Dark-mode only**, using the existing token system from Phase 1 (`globals.css`) — no new tokens needed.
- **Elevation via borders, not shadows.** `SelectContent` ships with `shadow-md`; it must be stripped (same treatment as `dropdown-menu.tsx` in Phase 1). `DialogContent` ships with no `shadow-*` class — verified via a real `npx shadcn@latest add --dry-run --diff` run against this repo; nothing to strip there.
- **`--pos-*`/`--age-*` colors stay inline styles**, never promoted to Tailwind theme tokens — existing Phase 1 exception, applies here to the Nom/In Auction teal and the error-text red.
- **`BidModalProps` does not change.** `AuctionSheet.tsx:884-894`'s usage is unaffected.
- **Base UI `Select` binds generic values directly** — `value={teamId}` / `onValueChange={(value) => setTeamId(value)}`, `SelectItem value={t.id}` — no `String()` conversion anywhere. Verified against `node_modules/@base-ui/react/select/root/SelectRoot.d.ts`: `Select.Root<Value, Multiple>` is generic, not string-only.
- **`SelectTrigger` renders `role="combobox"`, `SelectItem` renders `role="option"`** — verified against `node_modules/@base-ui/react/select/trigger/SelectTrigger.js` and `.../item/SelectItem.js`. Tests query by these roles.
- Package manager is **pnpm** only.
- Work happens in the existing worktree `worktree-ui-redesign-phase1-foundation` (already isolated; do not create a new one).

---

### Task 1: Add shadcn `dialog`, `select`, `input`, `label` primitives

**Files:**

- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`
- Modify: `src/components/ui/button.tsx` (CLI re-writes this as a registry dependency of `dialog` — confirmed via dry run to be a **formatting-only** change, no functional diff)

**Interfaces:**

- Produces: `Dialog`, `DialogContent`, `DialogTitle` from `@/components/ui/dialog` (also exports `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogOverlay`, `DialogHeader`, `DialogFooter`, `DialogDescription` — unused by this phase but part of the generated file).
- Produces: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `@/components/ui/select` (also exports `SelectGroup`, `SelectLabel`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` — unused here).
- Produces: `Input` from `@/components/ui/input` — thin wrapper over `@base-ui/react/input`, same props as a native `<input>`.
- Produces: `Label` from `@/components/ui/label` — renders a native `<label>` with shadcn's typography classes.

- [ ] **Step 1: Run the CLI**

  Run: `npx shadcn@latest add dialog select input label`

  Expected output: creates `src/components/ui/dialog.tsx`, `src/components/ui/select.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`; overwrites `src/components/ui/button.tsx`.

- [ ] **Step 2: Verify the `button.tsx` overwrite is formatting-only**

  Run: `git diff src/components/ui/button.tsx`
  Expected: no semantic changes — only whitespace/quote/semicolon-style formatting differences, if any. If you see any changed class strings, variant names, or removed/added props, stop and report it — that would mean the CLI's `button` registry entry has changed since Phase 1 and needs review before proceeding.

- [ ] **Step 3: Strip `shadow-md` from `src/components/ui/select.tsx`**

  In `SelectContent`, find:

  ```tsx
  className={cn(
    "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
    className
  )}
  ```

  Remove ` shadow-md` (right after `text-popover-foreground`), leaving the rest unchanged. `ring-1 ring-foreground/10` stays — same treatment as `dropdown-menu.tsx` in Phase 1.

- [ ] **Step 4: Verify `dialog.tsx` needs no shadow stripping**

  Run: `grep -n "shadow-" src/components/ui/dialog.tsx`
  Expected: no matches. (`DialogContent` uses `ring-1 ring-foreground/10` only, confirmed via the Phase 2 spec's dry-run check.) If this returns a match, strip it the same way as Step 3 before continuing.

- [ ] **Step 5: Verify**

  Run: `pnpm tsc --noEmit`
  Expected: no errors.

  Run: `pnpm lint`
  Expected: only the 4 pre-existing `react-hooks/exhaustive-deps` warnings in `AuctionSheet.tsx`/`NominationHelper.tsx` — zero new warnings.

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/ui/dialog.tsx src/components/ui/select.tsx src/components/ui/input.tsx src/components/ui/label.tsx src/components/ui/button.tsx
  git commit -m "feat: add shadcn Dialog, Select, Input, Label primitives"
  ```

---

### Task 2: Rebuild `BidModal.tsx` on shadcn primitives

**Files:**

- Modify: `src/components/BidModal/BidModal.tsx`

**Interfaces:**

- Consumes: `Dialog`, `DialogContent`, `DialogTitle` from `@/components/ui/dialog`; `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `@/components/ui/select`; `Input` from `@/components/ui/input`; `Label` from `@/components/ui/label`; `Button` from `@/components/ui/button` (all Task 1).
- Produces: `BidModal` — **same props as today**: `{ player: Player; teams: LeagueTeam[]; existingBid?: ClaimedBid; onClose: () => void; onSubmit: (data: { price: number; teamId: number }) => void; onDelete?: () => void; onNominate?: () => void; isNominated?: boolean; serverError?: string }`. Consumed unchanged by `src/components/AuctionSheet/AuctionSheet.tsx:884-894`.

- [ ] **Step 1: Replace `src/components/BidModal/BidModal.tsx`**

  ```tsx
  'use client';

  import { useState } from 'react';
  import type { Player, ClaimedBid, LeagueTeam } from '@/types';
  import { Button } from '@/components/ui/button';
  import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';

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
    const isEdit = !!existingBid;
    const [price, setPrice] = useState<string>(existingBid ? String(existingBid.price) : '');
    const [teamId, setTeamId] = useState<number>(existingBid?.teamId ?? teams[0]?.id ?? 0);
    const [error, setError] = useState<string>('');

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

    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent showCloseButton={false} className="w-[360px] flex flex-col">
          <DialogTitle className="sr-only">{isEdit ? 'Edit Bid' : 'Log Bid'}</DialogTitle>

          {/* Header */}
          <div>
            <div className="font-label text-label-xs text-muted-foreground mb-1 font-bold tracking-wide uppercase">
              {isEdit ? 'Edit Bid' : 'Log Bid'}
            </div>
            <div className="text-body-lg text-foreground font-bold">{player.player}</div>
            <div className="text-body-sm text-muted-foreground mt-0.5">
              <span style={{ color: 'var(--text-secondary)' }}>{player.pos}</span>
              {' · '}
              {player.team}
              {' · '}
              Target: <span className="font-mono">${player.budget}</span>
            </div>
          </div>

          {/* Price */}
          <div className="gap-xs flex flex-col">
            <Label
              htmlFor="bid-price"
              className="font-label text-label-xs text-muted-foreground font-bold tracking-wide uppercase"
            >
              Price
            </Label>
            <Input
              id="bid-price"
              aria-label="Price"
              type="number"
              min={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              autoFocus
              className="font-mono text-body-lg font-bold"
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
            <Select value={teamId} onValueChange={(value) => setTeamId(value)}>
              <SelectTrigger id="bid-team" aria-label="Won By" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.displayName ?? t.handle} ({t.handle})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(error || serverError) && (
            <div className="text-body-sm" style={{ color: 'var(--age-old)' }}>
              {error || serverError}
            </div>
          )}

          {/* Actions */}
          <div className="gap-sm flex items-center justify-end">
            <div className="mr-auto flex items-center gap-2">
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
            <Button size="sm" onClick={handleSubmit}>
              {isEdit ? 'Update Bid' : 'Log Bid'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  ```

  Notes on choices an implementer might question:
  - `Dialog open onOpenChange={(open) => !open && onClose()}`: `AuctionSheet` only mounts `<BidModal />` when a player is selected, so `open` is always `true` while mounted. Base UI calls `onOpenChange(false, ...)` on Escape, backdrop click, or (if ever added) an internal close trigger — routing all three through the existing `onClose` prop replaces the old manual `keydown` `useEffect` entirely.
  - `showCloseButton={false}` on `DialogContent`: the existing Cancel button already covers dismissal; the default top-right X would be redundant.
  - `DialogTitle className="sr-only"`: Base UI's `Dialog` requires an accessible title. The visible "Edit Bid"/"Log Bid" eyebrow `div` right below it is kept as plain markup (not `DialogTitle`) since shadcn's default `DialogTitle` typography (`text-base font-medium`) doesn't match this app's uppercase-label eyebrow convention — duplicating the text as an `sr-only` title avoids a second visible element while still satisfying the accessibility requirement.
  - `DialogHeader`/`DialogFooter` are skipped entirely — their shipped styling (a `bg-muted/50` bordered footer bar) doesn't match this modal's flat single-surface look. Plain `div`s reproduce the original layout.
  - `className="w-[360px]"` on `DialogContent`: an arbitrary-value override of the default `sm:max-w-sm` (384px) to match the original modal's fixed width. Arbitrary bracket values already have precedent in this codebase's shadcn output (`dropdown-menu.tsx`'s `min-w-[96px]` on `DropdownMenuSubContent`, untouched from Phase 1's generation). The default `gap-4`/`p-4` spacing from `DialogContent` is intentionally left as-is rather than overridden with this app's named spacing tokens (`gap-md`, `p-lg`, etc.) — `cn()`'s `tailwind-merge` isn't configured with this project's custom `@theme inline` spacing scale (only `src/lib/utils.ts`'s plain `twMerge()`, no `extendTailwindMerge`), so passing both `gap-4` (from the component default) and a custom `gap-md` in the same `className` string would not reliably dedupe — accepting the 16px default is simpler and safer than fighting it.
  - `<span style={{ color: 'var(--text-secondary)' }}>{player.pos}</span>`, the error text, and the Nom button/In Auction label all use inline `style`, not Tailwind classes — consistent with the existing project-wide convention that `--pos-*`/`--age-*` colors (and, here, the closely related `--text-secondary` which was never wired into the Tailwind theme in Phase 1) are consumed via inline style, not promoted to theme tokens.
  - `Select value={teamId} onValueChange={(value) => setTeamId(value)}`: no `String()` conversion — see Global Constraints above.

- [ ] **Step 2: Verify**

  Run: `pnpm tsc --noEmit`
  Expected: no errors. If `Select`'s generic inference produces a type error on `onValueChange`, check that `value={teamId}` and `SelectItem value={t.id}` are both present — the generic `Value` type is inferred from these, and omitting one can cause it to fall back to `unknown`.

  Run: `pnpm lint`
  Expected: same baseline as Task 1 (4 pre-existing warnings, 0 new).

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/BidModal/BidModal.tsx
  git commit -m "refactor: rebuild BidModal on shadcn Dialog, Select, Input, Label, Button"
  ```

---

### Task 3: Rewrite `BidModal.test.tsx` for the new primitives

**Files:**

- Modify: `src/__tests__/BidModal.test.tsx`

**Interfaces:**

- Consumes: `BidModal` from `@/components/BidModal/BidModal` (Task 2) — same props as the existing test fixtures already use (`mockPlayer`, `mockTeams`, `mockExistingBid` are unchanged, since `Player`/`LeagueTeam`/`ClaimedBid` types didn't change).

- [ ] **Step 1: Replace `src/__tests__/BidModal.test.tsx`**

  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import BidModal from '@/components/BidModal/BidModal';
  import type { Player, ClaimedBid, LeagueTeam } from '@/types';

  const mockPlayer: Player = {
    player: 'Josh Allen',
    team: 'BUF',
    pos: 'QB',
    age: 28,
    sfRank: 1,
    budget: 120,
    ceiling: 138,
    floor: 104,
    notes: '',
  };

  const mockTeams: LeagueTeam[] = [
    { id: 1, handle: 'coreschke', displayName: 'Cole' },
    { id: 2, handle: 'chappy72', displayName: null },
  ];

  const mockExistingBid: ClaimedBid = {
    id: 10,
    player: 'Josh Allen',
    position: 'QB',
    price: 115,
    teamId: 1,
    teamHandle: 'coreschke',
  };

  describe('BidModal — add mode', () => {
    it('displays the player name and position', () => {
      render(
        <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
      );

      expect(screen.getByText('Josh Allen')).toBeInTheDocument();
      expect(screen.getByText('QB')).toBeInTheDocument();
    });

    it('calls onSubmit with price and teamId when submitted', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn();
      render(
        <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={onSubmit} />,
      );

      await user.clear(screen.getByLabelText('Price'));
      await user.type(screen.getByLabelText('Price'), '110');

      const trigger = screen.getByRole('combobox', { name: /won by/i });
      await user.click(trigger);
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
      await user.click(screen.getByRole('option', { name: /chappy72/i }));

      await user.click(screen.getByRole('button', { name: /log bid/i }));

      expect(onSubmit).toHaveBeenCalledWith({ price: 110, teamId: 2 });
    });

    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(
        <BidModal player={mockPlayer} teams={mockTeams} onClose={onClose} onSubmit={jest.fn()} />,
      );

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape is pressed', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(
        <BidModal player={mockPlayer} teams={mockTeams} onClose={onClose} onSubmit={jest.fn()} />,
      );

      await user.keyboard('{Escape}');

      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('does not show a Remove button in add mode', () => {
      render(
        <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
      );

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });
  });

  describe('BidModal — edit mode', () => {
    it('pre-fills price from existingBid', () => {
      render(
        <BidModal
          player={mockPlayer}
          teams={mockTeams}
          existingBid={mockExistingBid}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
        />,
      );

      expect(screen.getByLabelText<HTMLInputElement>('Price').value).toBe('115');
    });

    it('shows a Remove button in edit mode', () => {
      render(
        <BidModal
          player={mockPlayer}
          teams={mockTeams}
          existingBid={mockExistingBid}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
          onDelete={jest.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    });

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

    it('shows "Update Bid" as the submit label in edit mode', () => {
      render(
        <BidModal
          player={mockPlayer}
          teams={mockTeams}
          existingBid={mockExistingBid}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: /update bid/i })).toBeInTheDocument();
    });
  });

  describe('BidModal — nomination', () => {
    it('shows a Nom button when onNominate is provided and isNominated is false', () => {
      render(
        <BidModal
          player={mockPlayer}
          teams={mockTeams}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
          onNominate={jest.fn()}
          isNominated={false}
        />,
      );
      expect(screen.getByRole('button', { name: /^nom$/i })).toBeInTheDocument();
    });

    it('calls onNominate and onClose when Nom is clicked', async () => {
      const user = userEvent.setup();
      const onNominate = jest.fn();
      const onClose = jest.fn();
      render(
        <BidModal
          player={mockPlayer}
          teams={mockTeams}
          onClose={onClose}
          onSubmit={jest.fn()}
          onNominate={onNominate}
          isNominated={false}
        />,
      );
      await user.click(screen.getByRole('button', { name: /^nom$/i }));
      expect(onNominate).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('shows "In Auction" and no Nom button when isNominated is true', () => {
      render(
        <BidModal
          player={mockPlayer}
          teams={mockTeams}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
          onNominate={jest.fn()}
          isNominated={true}
        />,
      );
      expect(screen.queryByRole('button', { name: /^nom$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/in auction/i)).toBeInTheDocument();
    });

    it('shows neither Nom button nor In Auction label when onNominate is not provided', () => {
      render(
        <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
      );
      expect(screen.queryByRole('button', { name: /^nom$/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/in auction/i)).not.toBeInTheDocument();
    });
  });

  describe('BidModal — team select', () => {
    it('opens the Won By select and lists both teams as options', async () => {
      const user = userEvent.setup();
      render(
        <BidModal player={mockPlayer} teams={mockTeams} onClose={jest.fn()} onSubmit={jest.fn()} />,
      );

      const trigger = screen.getByRole('combobox', { name: /won by/i });
      await user.click(trigger);
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));

      expect(screen.getByRole('option', { name: /coreschke/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /chappy72/i })).toBeInTheDocument();
    });
  });
  ```

  Changes from the original test file:
  - Every interaction (`click`, typing into Price) now goes through `userEvent` instead of `fireEvent`, matching Phase 1's `NavLinks.test.tsx` convention.
  - "Won By" selection is now: click the `combobox`-role trigger, `waitFor` its `aria-expanded="true"` (Base UI commits the open state asynchronously — same pattern Phase 1 established for `DropdownMenu`), then click the matching `option`-role item.
  - Escape-to-close is now asserted with `waitFor` since `Dialog`'s close routing is no longer a synchronous `document.addEventListener` callback.
  - Added one new test (`BidModal — team select`) covering that both teams render as selectable options — the original suite only exercised the select via a single `fireEvent.change`, which no longer applies; this replaces that coverage with an explicit assertion that the popup content is correct.

- [ ] **Step 2: Run the test file**

  Run: `pnpm test BidModal.test.tsx`
  Expected: all tests pass. If any `waitFor` times out on `aria-expanded`, check `jest.setup.ts` still has the `PointerEvent`/pointer-capture polyfills from Phase 1 (Task 1's `select`/`dialog` additions are also Base UI components and depend on the same polyfills).

- [ ] **Step 3: Commit**

  ```bash
  git add src/__tests__/BidModal.test.tsx
  git commit -m "test: rewrite BidModal tests for shadcn Dialog/Select interaction model"
  ```

---

### Task 4: Full verification pass

**Files:** none (verification only; fixes if anything surfaces)

- [ ] **Step 1: Run the full quality gate**

  Run: `make check`
  Expected: typecheck, lint, format, and test all pass (same 4 pre-existing lint warnings, 0 new).

- [ ] **Step 2: Production build sanity check**

  Run: `pnpm build`
  Expected: builds successfully, no Tailwind/CSS errors.

- [ ] **Step 3: Manual QA**

  Run: `pnpm dev`, then on `/draft/[id]` (the value sheet, where `BidModal` is used via `AuctionSheet`):
  - Click a player row to open the bid dialog (add mode) — confirm player name/pos/team/target render, Price is focused, Won By defaults to the first team
  - Type a price, open Won By, pick a different team, click "Log Bid" — dialog closes, bid appears logged
  - Re-open that same player's row — now in edit mode: Price is pre-filled, a red "Remove" button appears
  - Click "Remove" — bid is deleted
  - Open a fresh player, click "Nom" — dialog closes and the player is marked nominated; re-open it — "In Auction" now shows in teal instead of the Nom button
  - Press `Escape` while the dialog is open — it closes
  - Click the backdrop (outside the dialog panel) — it closes
  - Trigger a validation error (submit with an empty/zero price) — error text renders in red
  - Tab through Price → Won By → action buttons with keyboard only — focus rings visible throughout; arrow keys move through Won By's options once opened

- [ ] **Step 4: Fix anything found, otherwise done**

  If Steps 1–3 surface an issue, fix it and re-run the relevant check before proceeding. If everything passes clean, this task requires no commit — Tasks 1–3 already committed the actual changes.
