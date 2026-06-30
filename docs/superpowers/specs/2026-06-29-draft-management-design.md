# Draft Creation & Management UI — Design Spec

**Date:** 2026-06-29
**Roadmap item:** #4 — Draft Creation & Management UI
**Branch:** feat/multi-draft-3.4-contract (builds on completed items 3.1–3.4)

## Context

Items 1–3 are complete: Postgres migration, Auth.js + Discord auth, and the multi-draft schema (Draft model, draftId scoping, non-nullable draftId, composite uniques). Item 4 is the last piece before the deploy milestone — it makes the app usable for anyone, not just Cole.

**Product model:** single-operator. One owner per draft; that owner logs bids for all teams and uses the tool's intelligence for their own strategy.

**Visual redesign is explicitly deferred** — item 4 uses the current aesthetic. A dedicated redesign pass will happen after this structural work and before deploy.

## Decisions Summary

| Topic                   | Decision                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- |
| URL structure           | `/draft/[draftId]/` prefix for all draft-scoped pages                        |
| Entry point             | Smart redirect at `/` — 1 active draft → go straight in; 0 or 2+ → `/drafts` |
| Draft list URL          | `/drafts` (stable, linkable)                                                 |
| Active draft filter     | Smart redirect counts only ACTIVE drafts, not COMPLETE                       |
| Draft status            | Enum: `ACTIVE \| COMPLETE`                                                   |
| Mark complete           | Inline action on draft list page (no confirmation dialog)                    |
| Create-draft team setup | Full Option A — user enters all team handles/names during creation           |
| Draft switcher          | Dropdown in NavBar showing current draft name + other active drafts          |

## 1. Schema Changes

```prisma
enum DraftStatus {
  ACTIVE
  COMPLETE
}

model Draft {
  id          Int         @id @default(autoincrement())
  name        String
  ownerId     String?                        // @unique removed — multi-draft per user
  ownerTeamId Int?
  status      DraftStatus @default(ACTIVE)   // new field
  createdAt   DateTime    @default(now())
  ...
}
```

**Changes from current schema:**

- Remove `@unique` from `Draft.ownerId` — enables multiple drafts per user
- Add `DraftStatus` enum and `status` field with `ACTIVE` default

**Migration:** `prisma migrate dev --name add-draft-status-multi-owner`

## 2. Route Structure

### Pages

| Before            | After                             |
| ----------------- | --------------------------------- |
| `/` (value sheet) | `/draft/[draftId]/` (value sheet) |
| `/teams`          | `/draft/[draftId]/teams`          |
| `/budget`         | `/draft/[draftId]/budget`         |
| `/nominate`       | `/draft/[draftId]/nominate`       |
| —                 | `/` (smart redirect only)         |
| —                 | `/drafts` (draft list)            |
| —                 | `/drafts/new` (create-draft form) |

### API Routes

| Before                 | After                                                      |
| ---------------------- | ---------------------------------------------------------- |
| `/api/nomination-data` | `/api/draft/[draftId]/nomination-data`                     |
| `/api/nominated`       | `/api/draft/[draftId]/nominated`                           |
| `/api/watchlist`       | `/api/draft/[draftId]/watchlist`                           |
| —                      | `GET /api/drafts` (active drafts list for NavBar switcher) |

`/sign-in` and `/api/auth/[...nextauth]` are unchanged.

### `app/` Directory Tree

```
app/
  page.tsx                              ← smart redirect
  sign-in/page.tsx                      ← unchanged
  error.tsx                             ← unchanged
  globals.css
  layout.tsx                            ← root layout (unchanged)
  drafts/
    page.tsx                            ← draft list
    new/
      page.tsx                          ← create-draft form
  draft/
    [draftId]/
      layout.tsx                        ← auth + ownership guard
      page.tsx                          ← value sheet (moved)
      teams/page.tsx                    ← (moved)
      budget/page.tsx                   ← (moved)
      nominate/page.tsx                 ← (moved)
  api/
    auth/[...nextauth]/                 ← unchanged
    drafts/
      route.ts                          ← GET active drafts for NavBar
    draft/
      [draftId]/
        nomination-data/route.ts        ← (moved)
        nominated/route.ts              ← (moved)
        watchlist/route.ts              ← (moved)
```

## 3. Create-Draft Flow (`/drafts/new`)

A `'use client'` component — the dynamic team table requires local state.

### Form Fields

**Part 1 — Draft settings:**

- Draft name (text, required)
- Number of teams (number, default 12, min 2, max 32) — changing this reactively adds/removes team rows
- Budget per team (number, default 1000)

**Part 2 — Team roster (dynamic table):**
Each row:

- Handle (text, required) — unique within the draft, validated on submit
- Display name (text, optional — defaults to the handle if blank)
- "Mine" radio button — exactly one row must be selected

Defaults: rows pre-populate as `team-1` / `team-2` / ... All fields are editable.

### Submit (server action `createDraft`)

1. Validate all handles are unique within the submission (client-side + server-side)
2. Coerce: any team with a blank display name gets the handle as its display name (server-side, before insert)
3. `prisma.draft.create({ data: { name, ownerId: session.user.id, status: ACTIVE } })`
4. Create teams individually with `prisma.team.create` (not `createMany` — need the returned `id`s to match the selected "mine" row to its DB id)
5. `prisma.draft.update({ data: { ownerTeamId: <id of the team whose handle matched the selected row> } })`
6. `redirect('/draft/${draftId}/')`

### Auth

Redirect to `/sign-in` if unauthenticated (checked at top of page component).

## 4. Draft List (`/drafts`)

Server component. Fetches all drafts for `session.user.id`.

### Layout

- "Create Draft" button → `/drafts/new`
- ACTIVE drafts listed first, COMPLETE drafts below with a visual separator
- Empty state: prompt to create a draft

### Per Draft (card or row)

- Draft name
- Status badge (ACTIVE / COMPLETE)
- Created date
- Team count
- "Open" button → `/draft/[draftId]/`
- "Mark Complete" button — ACTIVE drafts only, triggers `completeDraft(draftId)`

### Server Action `completeDraft(draftId)`

Validates `draft.ownerId === session.user.id`, then `prisma.draft.update({ data: { status: COMPLETE } })`. Revalidates `/drafts`.

No confirmation dialog. No "reopen draft" UI — deferred to the future draft settings page.

## 5. Layout Guard (`/draft/[draftId]/layout.tsx`)

Server component. Runs before any draft-scoped page renders.

1. `auth()` → no session → `redirect('/sign-in?callbackUrl=/draft/${draftId}/')`
2. Parse and validate `draftId` from params — not a valid integer → `notFound()`
3. `prisma.draft.findFirst({ where: { id: draftId, ownerId: session.user.id } })` → null → `notFound()`
4. Render `{children}`

The layout does **not** pass the draft object to children — pages fetch their own data. The layout's only job is access control.

## 6. Smart Redirect (`/`)

Server component:

```
auth() → no session → redirect('/sign-in')
drafts = getActiveDraftsForUser(session.user.id)
drafts.length === 1 → redirect(`/draft/${drafts[0].id}/`)
otherwise → redirect('/drafts')
```

## 7. NavLinks + NavBar

### Draft Switcher (in NavLinks — `'use client'`)

When `draftId` is present in `useParams()`:

- Fetch active drafts via `GET /api/drafts` on mount (`useEffect` + `useState`)
- Display current draft name as a clickable chip/dropdown trigger
- Dropdown contents:
  - Other active drafts → links to `/draft/[otherId]/`
  - "All Drafts" → `/drafts`
- When `draftId` is absent (on `/drafts`, `/drafts/new`): chip is hidden

### Draft-Scoped Nav Links

Built dynamically from `draftId`:

```ts
const LINKS = draftId
  ? [
      { href: `/draft/${draftId}/`, label: 'Value Sheet' },
      { href: `/draft/${draftId}/teams`, label: 'Team Rosters' },
      { href: `/draft/${draftId}/budget`, label: 'Budget Pressure' },
      { href: `/draft/${draftId}/nominate`, label: 'Nominate' },
    ]
  : [];
```

Hidden entirely when not in a draft context.

### NavBar Server Component

Unchanged — still receives `session` and renders sign-out form.

### `GET /api/drafts`

Returns `{ id, name }[]` of active drafts for the authenticated user. Used only by the NavLinks switcher.

## 8. Server Actions + API Route Updates

### `src/lib/actions.ts`

`logBid`, `updateBid`, `deleteBid` currently call `getDraftForUser(userId)` which does a `findFirst` — breaks with multi-draft. All three are updated to accept an explicit `draftId` parameter:

```ts
const draft = await prisma.draft.findFirst({
  where: { id: draftId, ownerId: session.user.id },
});
if (!draft) throw new Error('Draft not found');
```

Calling components (`BidModal`, `NominationHelper`) pass `draftId` as a prop (they're already rendered inside `/draft/[draftId]/` pages, so the draftId is available).

`revalidatePath` calls updated from `'/'` to `` `/draft/${draftId}/` ``.

### `src/lib/draft.ts`

Replace `getDraftForUser` with two focused helpers:

- `getDraft(userId: string, draftId: number)` — fetches a single draft, validates ownership. Used by draft-scoped pages.
- `getActiveDraftsForUser(userId: string)` — returns all `ACTIVE` drafts for the user. Used by smart redirect and `/api/drafts`.

### API Routes (moved)

Each moved route extracts `draftId` from params and validates session + ownership before any DB access — same pattern as the layout guard, but applied per-route since API routes don't go through the `[draftId]` layout.

### `revalidatePath` Updates

All existing `revalidatePath('/')` calls in actions and API routes update to ``revalidatePath(`/draft/${draftId}/`)`` since the value sheet has moved.

## 9. Seed Update

The seed creates "Cole's Draft 2025" and sets `ownerId` from `OWNER_DISCORD_ID`. With `@unique` removed from `ownerId`, the seed still works identically. No changes needed beyond the schema migration being applied.

## Out of Scope

- Visual redesign (deferred — explicit decision)
- Draft settings page (item 5a)
- Team renaming after creation (item 5b)
- Read-only share link (post-deploy)
- Reopening a COMPLETE draft
- `DraftStatus.ARCHIVED` state
