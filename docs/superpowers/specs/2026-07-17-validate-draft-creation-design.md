# HARD-007 Validate Draft Creation and Shorten Its Transaction Design

**Date:** 2026-07-17
**Workstream:** HARD-007

## Purpose

`createDraft` (`src/lib/actions.ts`) accepts a large, weakly-validated input shape and performs
almost all of its work — team creation, ~270+ player rows, projection application — inside one
interactive Prisma transaction with the default timeout. It permits empty names, multiple or zero
"mine" teams, non-finite or out-of-range settings, and case-insensitive handle collisions. It also
throws plain `Error(message)` strings and calls `redirect()` itself, which predates the typed
`DraftMutationResult` contract `src/lib/draftMutation.ts` introduced for every other draft mutation
(HARD-001/HARD-002).

HARD-007 gives draft creation one shared validation schema, a typed result contract consistent with
the rest of the mutation surface, and a transaction that only contains the writes that must be
serialized together.

## Goals

- One Zod schema is the single source of truth for draft-input shape and range constraints, used by
  both the client form and the server action.
- Reject empty names, non-finite/out-of-range numeric settings, a starting lineup with no
  QB/SUPER_FLEX slot, case-insensitive duplicate handles, zero or multiple "mine" teams, and duplicate
  Sleeper roster IDs — all before any database write.
- `createDraft` returns `DraftMutationResult<{ draftId: number }>` instead of throwing strings and
  redirecting internally, matching `logBid`/`updateBid`/`deleteBid`/`completeDraft`.
- Only serialize what must be serialized: move pure calculations and read-only lookups outside the
  transaction, batch team creation into one round trip, and give the transaction an explicit,
  justified timeout.
- Draft creation remains all-or-nothing: a failure at any write stage leaves no partial draft.

## Non-goals

- Changing valuation formulas, projection application semantics, or future-pick generation — those
  are HARD-003/HARD-006 territory.
- Adding database-level composite foreign keys or cross-draft constraints — that is HARD-005.
- Structured observability/log shipping — that is HARD-014. Stage timing here is a `console.info`
  line, not a new logging pipeline.
- Changing what counts toward roster capacity — that policy lives in `src/lib/draftMutation.ts` /
  `src/lib/bidMutation.ts` (HARD-004) and is untouched here.
- A rich per-field error contract on `DraftMutationResult`. The shared schema means the client never
  submits invalid data in normal use; the server-side check is defense in depth and only needs to
  distinguish a small number of codes (see below), not surface every Zod issue individually.

## Validation Schema

New file `src/lib/draftInputSchema.ts` exports:

- `draftInputSchema` (Zod) — validates the full `createDraft` input shape.
- The numeric bounds as named constants (`MIN_TEAMS`, `MAX_TEAMS`, `MAX_BUDGET`, `MAX_ROSTER_SIZE`,
  etc.), so `drafts/new/page.tsx`'s existing team-count clamp and other client-side guards read from
  the same constants instead of duplicating literals.
- `DraftInput` type inferred from the schema.

Constraints (bounds below are a judgment call — flagged for your review in the self-review section):

| Field                   | Rule                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                  | trimmed, 1–100 chars                                                                                                                                                                                                        |
| `budgetPerTeam`         | positive safe integer, ≤ 1,000,000                                                                                                                                                                                          |
| `rosterSize`            | positive safe integer, ≤ 100                                                                                                                                                                                                |
| `targetRoster`          | keys restricted to QB/RB/WR/TE, values non-negative integers                                                                                                                                                                |
| `startingLineup`        | valid `StartingSlot` values only, length 1–`rosterSize`, must include ≥1 QB or SUPER_FLEX slot                                                                                                                              |
| `scoringSettings`       | all fields finite; `passYdsPerPoint` in (0, 200]; PPR fields (`pprRB`/`pprWR`/`pprTE`) in [0, 5]; all other bonus/TD/INT fields in [-20, 20]                                                                                |
| `teams`                 | 2–32 entries; `handle` trimmed 1–40 chars, unique **case-insensitively**; `displayName` trimmed ≤60 chars; exactly one `isMine: true`; `sleeperRosterId` (if present) a positive safe integer, unique among submitted teams |
| `sleeperLeagueId`       | optional, digits only, 5–25 chars                                                                                                                                                                                           |
| `futurePickAuctionMode` | enum `'packages' \| 'individual' \| 'none'`                                                                                                                                                                                 |
| `playerSource`          | optional enum `'etr' \| 'custom'`                                                                                                                                                                                           |

The case-insensitive handle check and the "exactly one `isMine`" check are expressed as
`superRefine` steps on the schema, so both client and server reject them identically — this closes
the two business-rule gaps called out in the audit without touching the database schema (the
existing `@@unique([handle, draftId])` constraint stays case-sensitive; HARD-005 owns DB-level
constraint hardening).

## API Contract Change

`createDraft` changes from `Promise<void>` (throws + self-`redirect()`s) to:

```ts
function createDraft(data: DraftInput): Promise<DraftMutationResult<{ draftId: number }>>;
```

Two additions to `DraftMutationCode` in `src/lib/draftMutation.ts`:

- `INVALID_INPUT` (already exists) — now returned when `draftInputSchema.safeParse` fails.
- `NO_RANKING_SET` (new) — replaces `throw new Error('No custom ranking set found')` for the
  `playerSource: 'custom'` path when the user has no active `UserRankingSet`.

`src/app/drafts/new/page.tsx` changes its submit handler from `try { await createDraft(...) } catch`
to checking `result.ok`, reading `result.data.draftId` and calling `router.push(`/draft/${draftId}`)`
itself on success (via `useRouter` from `next/navigation`), and mapping `result.code` to the existing
error-message display on failure. The page should also run `draftInputSchema.safeParse` before
calling the action at all, so normal use never round-trips an invalid submission — this replaces the
current hand-rolled `requiredNumericFields`/duplicate-handle/lineup checks in `handleSubmit`.

## Transaction Restructuring

Ordering after this change:

1. `auth()` check → `UNAUTHORIZED` if absent.
2. `draftInputSchema.safeParse(data)` → `INVALID_INPUT` if it fails.
3. **Outside the transaction** (reads and pure computation, unchanged data dependencies from today):
   `resolveEtrSleeperMatches()` (already outside today), the custom `userRankingSet` fetch (moves out
   — currently inside the transaction for no correctness reason: it doesn't need the per-user
   advisory lock, and a ranking-set replace mid-creation is already only weakly protected today),
   `generateFuturePickAssets`, `adjustPlayerValues` → `seededPlayers`. If `playerSource: 'custom'` and
   no ranking set exists, return `NO_RANKING_SET` here, before opening the transaction.
4. **Inside `prisma.$transaction(..., { timeout: 15_000 })`**: advisory lock on the user (unchanged —
   this serializes the first-draft/onboarding eligibility check, which must stay inside the lock) →
   `ownerDraftCount` read → `draft.create` → `team.createManyAndReturn` (one round trip; Prisma 7 on
   Postgres returns created rows, including `id`, in input order, so the "mine" team's new id is still
   resolved by index without an extra query) → `draft.update` (`ownerTeamId`) → `player.createMany` →
   `applyProjectionValuesToDraft` → onboarding transition logic (unchanged).
5. Return `{ ok: true, data: { draftId } }`.

Each stage inside the transaction is wrapped with a `performance.now()` delta and a
`console.info('[createDraft] stage=<name> durationMs=<n>')` line — enough to see where time goes in
production logs without building new observability infrastructure (HARD-014).

**Timeout value:** 15 seconds. The write-only stages remaining in the transaction (batched team
insert, ~270-plus-row player insert, projection application) are the ones that need to commit
atomically; 15s is generous enough to absorb Neon cold-path latency on those specific stages while
still failing fast instead of hanging indefinitely on, e.g., a stuck connection.

## Testing

### Unit (`src/__tests__/createDraft.test.ts`)

Full rewrite, not an incremental patch — the mock shape changes (the `userRankingSet` fetch moves off
`mockTx` onto the top-level `prisma` mock) and assertions change from `rejects.toThrow(...)` /
`mockRedirect` checks to `resolves.toEqual({ ok: true/false, ... })`. New cases needed for every
validation rule in the table above (empty name, out-of-range budget/roster size, lineup with no
QB/SF, out-of-range scoring values, case-insensitive duplicate handles, zero/multiple "mine" teams,
duplicate `sleeperRosterId`, oversized `teams` array), plus a case for `NO_RANKING_SET`. Existing
behavioral assertions (team/player payload shape, TE premium, future-pick seeding, custom ranking
source budget, onboarding transition) carry over with their trigger/assertion style adjusted for the
new return shape.

### Integration (`src/__tests__/integration/draft-creation.postgres.test.ts`)

New file, following the existing `draft-integrity.postgres.test.ts` pattern (real Postgres via
`TEST_DATABASE_URL`, `pg.Client` for out-of-band control). Two cases:

1. **Latency-injected timeout compliance** (the acceptance-criteria case): a `BEFORE INSERT` trigger
   on `"Player"` that calls `pg_sleep(2)` once per statement, simulating Neon cold-path latency during
   the bulk player insert. Assert the full `createDraft` flow still resolves `{ ok: true }`, the
   total wall time is under the 15s timeout, and the draft/teams/players are all present afterward
   (nothing partially committed).
2. **All-or-nothing on late failure**: a trigger that raises on the `applyProjectionValuesToDraft`
   write path (or reuses the existing forced-failure trigger style from `draft-integrity.postgres.
test.ts`) to confirm that when the last stage fails, the earlier `draft`/`team`/`player` rows from
   the same attempt are rolled back — not just that the promise rejects.

### Manual

`make check` (typecheck/lint/format/unit), then `pnpm test:integration` against local WSL2 Postgres.

## Self-Review Notes

- The scoring-settings numeric ranges (PPR 0–5, TD/bonus fields ±20, `passYdsPerPoint` (0, 200]) are
  a judgment call meant to block garbage/malformed input, not to encode "valid fantasy football
  scoring." Please flag if any of these are too tight for a league config you actually want to
  support — DraftOps' own baseline (`DEFAULT_SCORING_SETTINGS`) is well inside all of them.
- `sleeperLeagueId` pattern (5–25 digit chars) is inferred from the one example already in the test
  suite (`'1360707683916734464'`, 19 digits) plus Sleeper's snowflake-ID format; not verified against
  Sleeper's documented ID range.
- This spec does not change `Team.handle`'s stored casing or add a DB-level case-insensitive
  constraint (e.g. `citext`) — only the application-level check is added. A future HARD-005 pass may
  want to reconsider whether the DB constraint itself should become case-insensitive; noted but out
  of scope here.
