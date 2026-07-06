# UI Redesign — Phase 2: BidModal (roadmap #6)

## Context

Phase 1 (shipped, PR #26) established the token system, shadcn/ui + Base UI setup, and the border-not-shadow / one-accent-color rules, piloted on `NavBar`. Phase 2 applies that foundation to `BidModal` — the bid-logging dialog used from `AuctionSheet` to log, edit, and delete bids, and to nominate/mark-in-auction a player.

Phasing recap:

1. Foundation (done)
2. **BidModal → shadcn Dialog (this spec)**
3. `AuctionSheet` (main value-sheet page)
4. `NominationHelper`, `RosterTracker`, `BudgetPressure`

`BidModal` is currently 100% inline `style={{}}`, a hand-rolled fixed-position backdrop, and a native `<select>`/`<input>`. This spec replaces all of it with shadcn primitives while keeping the component's props contract and behavior identical.

## Goals

- Replace the hand-rolled backdrop/panel/Escape-handler with shadcn `Dialog` (Base UI) — gets focus-trap, Escape, and backdrop-click dismissal for free, removing the manual `useEffect` keydown listener
- Replace the native `<select>` with shadcn `Select`, the native `<input>` with shadcn `Input`, and both labels with shadcn `Label`
- Replace all action buttons with shadcn `Button`, using semantic variants where they exist and one documented one-off override where they don't
- Preserve the existing props contract (`BidModalProps` unchanged) and all existing behavior: add vs. edit mode, delete, nominate/in-auction, server + client error display
- Keep the compact single-surface modal look (360px-ish width, flat card, no separate footer bar) rather than adopting shadcn's default `DialogHeader`/`DialogFooter` styling

## Non-goals

- `AuctionSheet` itself (the page that renders `BidModal`) — Phase 3
- Any new shadcn primitives beyond `Dialog`, `Select`, `Input`, `Label` (all registry-dependency-installed alongside `Button`, already present from Phase 1)
- A reusable "teal outline" `Button` variant — Nom is the only consumer of that color today; a one-off `className` override is enough (see Design decisions)
- `tabular-nums` — no numeric columns here (deferred to Phase 3 per Phase 1 spec)

## Design decisions

**Dialog control:** `AuctionSheet` already conditionally mounts `<BidModal />` only when a player is selected (`{modalPlayer && <BidModal ... />}`), so `Dialog`'s `open` prop is always `true` while mounted. `onOpenChange={(open) => !open && onClose()}` handles Escape and backdrop-click; the existing `onClose` prop is the single exit path, replacing the manual keydown `useEffect`.

**Dialog content structure:** Use `Dialog`, `DialogContent` (with `showCloseButton={false}` — the existing Cancel button already covers this, an extra X would be redundant), and `DialogTitle` (visually hidden via `sr-only` if we don't want it duplicating the existing "Edit Bid"/"Log Bid" eyebrow label — Base UI requires an accessible title on every dialog). Skip `DialogHeader`/`DialogFooter` — their shipped styling (`bg-muted/50` footer bar, border-top) doesn't match the current flat single-surface card. Build header/body/footer sections as plain `div`s with Tailwind spacing tokens (`gap-md`, `p-lg`, etc. from Phase 1), preserving today's visual layout.

**Select data binding:** Corrected after inspecting `@base-ui/react`'s shipped type declarations (`node_modules/@base-ui/react/select/root/SelectRoot.d.ts`): `Select.Root` is generic over `Value` and does **not** require string coercion — `value`/`onValueChange`/`SelectItem`'s `value` all accept the same type. `teamId` (already a `number`) binds directly: `value={teamId}` / `onValueChange={(value) => setTeamId(value)}`, and `SelectItem value={t.id}` (no `String()` conversion needed anywhere).

**Button variants:**

| Button                            | Variant                          | Notes                                                                                                                                                                                                                                                              |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Submit ("Log Bid" / "Update Bid") | `default`                        | Picks up `--primary` (violet) automatically                                                                                                                                                                                                                        |
| Cancel                            | `outline`                        | Neutral                                                                                                                                                                                                                                                            |
| Remove (edit mode only)           | `destructive`                    | Picks up `--destructive` (`--age-old` red) automatically                                                                                                                                                                                                           |
| Nom (nominate)                    | `outline` + `className` override | Teal (`--pos-pick`) isn't a shadcn semantic — this is a position-accent color reused here, not a new brand concept. One-off override via `className`, same pattern as the existing inline style. Not promoted to a cva variant since there's exactly one consumer. |

**Shadow/ring cleanup:** Per Phase 1 precedent, `ring-1 ring-foreground/10` is kept (acts as the border/definition edge for popovers, not a depth shadow) but any `shadow-*` utility class is stripped after `shadcn add`. Verified via `npx shadcn@latest view <name>` (read-only, no files touched):

- `dialog` — `DialogContent` ships with no `shadow-*` class already; nothing to strip
- `select` — `SelectContent` ships with `shadow-md`; strip it (same treatment as `dropdown-menu.tsx` in Phase 1)
- `input`, `label` — no popover surface, nothing to strip

## Testing

`src/__tests__/BidModal.test.tsx` currently drives the native `<select>` via `fireEvent.change` and asserts synchronously. Base UI's `Select` is a listbox (trigger + portal popup + items), not a native form element, so every test touching "Won By" needs to open the trigger, wait for the popup (`waitFor` on `aria-expanded` or the option becoming visible — same pattern established for `DropdownMenu` in Phase 1's `NavLinks.test.tsx`), then click the option via `userEvent`. Tests that don't touch the select (player name/position display, Cancel, Escape, Remove, Nom) are unaffected structurally but should switch to `userEvent` for consistency where they simulate clicks.

No new jsdom polyfills are expected — `jest.setup.ts`'s existing `PointerEvent`/pointer-capture/`ResizeObserver` polyfills (added in Phase 1 for `DropdownMenu`) cover `Select` and `Dialog`, both being Base UI components with the same interaction primitives.

`pnpm tsc --noEmit` and `pnpm lint` must pass (existing pre-commit gate). Manual verification: open dialog (add mode), open dialog (edit mode — pre-filled price, Remove button present), Escape closes, backdrop click closes, Cancel closes, Select opens/selects/closes, Nom button (teal) and In Auction label render correctly, server error and client validation error both display.

## Rollout

Ships as one PR: `npx shadcn@latest add dialog select input label` + full `BidModal.tsx` rewrite + `BidModal.test.tsx` rewrite. No feature flag — internal component swap, `AuctionSheet`'s usage (`src/components/AuctionSheet/AuctionSheet.tsx:884-894`) is unaffected since `BidModalProps` doesn't change.
