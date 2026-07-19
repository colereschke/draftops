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
- Anticipating roadmap item #10 (budget-for-picks trading). #10 is a runtime mutation on an existing
  draft (a per-team budget delta, and eventually a first-class pick-asset model separating origin
  team from current holder) — it does not touch draft-creation input shape or the one-time creation
  transaction this workstream restructures. The only point of contact is that `createDraft` adopting
  `DraftMutationResult<T>` here gives #10's future trade-logging action the same typed-outcome
  contract `logBid` already uses; no other hook is added speculatively.

## Validation Schema

New file `src/lib/draftInputSchema.ts` exports:

- `draftInputSchema` (Zod) — validates the full `createDraft` input shape.
- The numeric bounds as named constants (`MIN_TEAMS`, `MAX_TEAMS`, `MAX_BUDGET`, `MAX_ROSTER_SIZE`,
  etc.), so `drafts/new/page.tsx`'s existing team-count clamp and other client-side guards read from
  the same constants instead of duplicating literals.
- `DraftInput` type inferred from the schema.

Constraints (bounds below are a judgment call — flagged for your review in the self-review section):

| Field                   | Rule                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                  | trimmed, 1–100 chars                                                                                                                                                                                                                                                                                                                                                                         |
| `budgetPerTeam`         | positive safe integer, ≤ 1,000,000                                                                                                                                                                                                                                                                                                                                                           |
| `rosterSize`            | positive safe integer, ≤ 100                                                                                                                                                                                                                                                                                                                                                                 |
| `targetRoster`          | keys restricted to QB/RB/WR/TE, values non-negative integers, each ≤ `MAX_ROSTER_SIZE`                                                                                                                                                                                                                                                                                                       |
| `startingLineup`        | valid `StartingSlot` values only, length 1–`rosterSize`, must include ≥1 QB or SUPER_FLEX slot                                                                                                                                                                                                                                                                                               |
| `scoringSettings`       | all fields finite; `passYdsPerPoint` in (0, 200]; PPR fields (`pprRB`/`pprWR`/`pprTE`) in [0, 5]; all other bonus/TD/INT fields in [-20, 20]                                                                                                                                                                                                                                                 |
| `teams`                 | 2–32 entries; `handle` trimmed 1–40 chars, unique **case-insensitively**; `displayName` trimmed ≤60 chars; exactly one `isMine: true`; `sleeperRosterId` (if present) a positive safe integer ≤ 1,000,000 (Postgres `Int` is 32-bit — capping well under `2^31` avoids a raw DB error on write; real Sleeper roster IDs are league-sized, so this is generous), unique among submitted teams |
| `sleeperLeagueId`       | optional, digits only, 5–25 chars                                                                                                                                                                                                                                                                                                                                                            |
| `futurePickAuctionMode` | enum `'packages' \| 'individual' \| 'none'`                                                                                                                                                                                                                                                                                                                                                  |
| `playerSource`          | optional enum `'etr' \| 'custom'`                                                                                                                                                                                                                                                                                                                                                            |

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

The typed result only covers _expected_ outcomes (auth, validation, missing ranking set). Genuinely
unexpected internal failures — most notably `applyProjectionValuesToDraft` throwing a bare `Error`
(`'No projection source found'` / `'No projection values could be applied'`) — are **not** caught and
translated to a code; they continue to propagate and reject the `createDraft` promise, the same
treatment `withActiveOwnedDraftMutation` gives non-`DraftMutationFailure` errors today. This keeps
"typed result" meaning "an outcome the caller should branch on in the UI," not "every possible
failure," and preserves the existing `fails loudly when automatic projection application fails` test
(`rejects.toThrow(...)`) unchanged — it stays in the carry-over list below, not the rewritten set.

As defense in depth, a `P2002` uniqueness violation from the batched `team.createManyAndReturn`
(against `@@unique([handle, draftId])` or `@@unique([draftId, sleeperRosterId])`) is translated to a
new `DUPLICATE_TEAM` code rather than left to escape as a raw Prisma error, mirroring how
`bidMutation.ts` translates `P2002` to `PLAYER_ALREADY_CLAIMED`. In practice the shared Zod schema's
case-insensitive handle check and per-submission `sleeperRosterId` uniqueness check make this
unreachable in normal use — it only fires if a crafted request bypasses client validation.

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
4. **Inside `prisma.$transaction(..., { timeout: <measured value, see below> })`**: advisory lock on
   the user (unchanged — this serializes the first-draft/onboarding eligibility check, which must
   stay inside the lock) → `ownerDraftCount` read → `draft.create` → `team.createManyAndReturn` (one
   round trip) → `draft.update` (`ownerTeamId`) → `player.createMany` → `applyProjectionValuesToDraft`
   → onboarding transition logic (unchanged).

   `createManyAndReturn`'s returned-row order matching input order is not a documented Prisma/Postgres
   guarantee, so the "mine" team's new id is resolved by building a `Map<handle, id>` from the
   returned rows and looking up the "mine" team's (schema-guaranteed-unique) handle — not by
   positional index.

5. Return `{ ok: true, data: { draftId } }`.

Each stage inside the transaction is wrapped with a `performance.now()` delta and a
`console.info('[createDraft] stage=<name> durationMs=<n>')` line — enough to see where time goes in
production logs without building new observability infrastructure (HARD-014).

**Timeout value:** measure first, then set. `applyProjectionValuesToDraft` (called with
`useBatchTransaction: false`) does roughly one `draftPlayerValue.upsert` round trip per player —
around 250 sequential writes — which is the dominant cost inside the transaction, not the single
batched player insert. Before picking a number, capture a real baseline: run `createDraft` against
local WSL2 Postgres (and note the per-stage `console.info` timings from the same run) to see actual
wall time for team insert / player insert / projection application. Batching
`applyProjectionValuesToDraft`'s upserts is explicitly out of scope for this workstream (see
Non-goals) — its 250-round-trip shape is a known cost this spec works around with an explicit
timeout, not one it removes. Pick a timeout that's comfortably above the measured baseline plus
Neon cold-path margin (a starting guess is 15s, but treat that as provisional until the baseline
measurement confirms or revises it), and record the measured baseline in the PR description.

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
new return shape. Two existing tests carry over **unchanged in intent** and must not be silently
dropped in the rewrite: `serializes a user's first-draft eligibility check with an advisory
transaction lock` (the lock ordering assertion) and `fails loudly when automatic projection
application fails` (still `rejects.toThrow(...)` — see the API Contract Change section on why
projection-application errors keep throwing rather than becoming a typed code).

### Integration (`src/__tests__/integration/draft-creation.postgres.test.ts`)

New file, following the existing `draft-integrity.postgres.test.ts` pattern (real Postgres via
`TEST_DATABASE_URL`, `pg.Client` for out-of-band control). Two cases:

1. **Latency-injected timeout compliance** (the acceptance-criteria case): a `BEFORE INSERT ... FOR
EACH STATEMENT` trigger on `"Player"` that calls `pg_sleep(2)`. This must be statement-level, not
   row-level — `player.createMany` emits one multi-row `INSERT`, but a `FOR EACH ROW` trigger (the
   style used elsewhere in `draft-integrity.postgres.test.ts`) would fire once per one of the
   ~270-plus player rows, sleeping for roughly 540s and failing the timeout it's supposed to verify
   compliance with. Assert the full `createDraft` flow still resolves `{ ok: true }`, the total wall
   time is under the chosen timeout, and the draft/teams/players are all present afterward (nothing
   partially committed).
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
- Opus-reviewed 2026-07-17. Findings incorporated above: the `FOR EACH ROW`/`FOR EACH STATEMENT`
  trigger-granularity bug in the latency test (would have failed the sole acceptance-criteria test at
  ~540s instead of ~2s), `createManyAndReturn` order-by-handle instead of position, explicit handling
  of `applyProjectionValuesToDraft`'s thrown errors under the new typed-result contract, the
  measure-before-you-set timeout approach (and correcting which stage actually dominates transaction
  time), the two carry-over tests that were missing from the rewrite list, `targetRoster`'s missing
  upper bound, and `sleeperRosterId`'s Postgres `Int` overflow risk. Confirmed decision: batching
  `applyProjectionValuesToDraft`'s ~250 sequential upserts is deliberately deferred to a follow-up
  rather than folded into this workstream, even though the audit lists that file as a primary
  location — see the Timeout Value discussion above.
