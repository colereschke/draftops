# Decision Records

Why things are built the way they are — extracted from `docs/superpowers/specs/` and
`docs/superpowers/plans/` as each feature/hardening item wraps up, per the Global Rules in
`CLAUDE.md`/`AGENTS.md`. This file is the permanent record; the source spec/plan is deleted once
its decision is captured here (recoverable via git history if it was ever committed).

This is not a changelog and not a restatement of current architecture — `CLAUDE.md`'s "What's
Built" already covers the _what_. Only add an entry when a future reader would otherwise have to
reconstruct _why_ a non-obvious choice was made: a rejected alternative, a constraint that shaped
the design, a deliberate deferral, or a tradeoff that isn't visible from reading the code.

## Format

Each entry:

```
### <Title> (<PR/roadmap ref>, <date>)
**Decision:** What was chosen.
**Why:** The reasoning — constraint, incident, or tradeoff that drove it.
**Alternatives considered:** What was rejected and why, if applicable.
**Status:** Active | Superseded by [[link]] | Flagged for revisit | Deferred
```

Group entries under the subsystem headings below. Add a new heading if a decision doesn't fit an
existing one. Keep entries short — a paragraph, not a re-derivation of the whole spec.

---

## Valuation & Player Values

### Value adjustment algorithm split into phases (#5b, 2026-07-06)

**Decision:** Pull the entire value-adjustment algorithm out of the league-settings plumbing PR
into its own separate PR, then within that PR ship position-level adjustment (scoring/scarcity/
concentration multipliers) as Phase 1, independent of per-player projection data. Defer Mike Clay
projection dual-scoring, first-down historical rates, and VOR-based concentration to Phase 2.

**Why:** The settings-plumbing PR needed review on its own merits; bundling a new pricing algorithm
into it would have made both harder to review and revert independently — flagged explicitly as "the
highest-risk piece" deserving its own cycle. Within the algorithm PR itself, the projection ETL and
Sleeper-identity matching pipeline (needed for per-player projection joins) wasn't ready yet, and
position-level adjustment alone was enough to fix the biggest known distortion (TE premium
concentration).

**Alternatives considered:** Waiting to ship a single combined algorithm once projections were
available — rejected because it coupled two independently-valuable pieces of work and delayed the
simpler win.

**Status:** Active (Phase 1 shipped and live; Phase 2 not yet scheduled).

### Active auction value anchors to fallback, not raw projection/VOR dollars (2026-07-10)

**Decision:** `activeAuctionValue` always derives from `fallbackAuctionValue` (the ETR/custom
ranking-derived value); projection data only applies a relative scoring lift within
position/value buckets. It never surfaces `projectionAuctionValue` (raw VOR-derived dollars)
directly as the target.

**Why:** Raw VOR dollars are denominated in a different, less battle-tested economy than the
dynasty-market-calibrated fallback values, and swinging the surfaced number straight to VOR would
produce large, hard-to-explain jumps whenever a new projection source is applied. Anchoring to
fallback and using projections only as a directional shaping signal keeps the number trustworthy
during a live auction, where a sudden unexplained value swing erodes confidence in the tool.

**Alternatives considered:** Surfacing `projectionAuctionValue` directly as `activeAuctionValue` —
rejected as too volatile and too hard to sanity-check live.

**Status:** Active.

### Peer-normalized scoring lift instead of a flat per-position multiplier (2026-07-10)

**Decision:** TE premium (and other scoring-setting effects) lift each player relative to a
market-value-bucketed peer group's average lift, not as one flat position-wide multiplier.

**Why:** A flat multiplier would help all TEs equally; the actual goal is for high-reception/
first-down-profile TEs (e.g. Kelce, McBride) to gain more than efficiency-driven TEs (e.g. Kittle)
under TE premium settings. That differentiation requires normalizing within peer tiers bucketed by
fallback dynasty value, not by projection rank.

**Status:** Active.

### Rookie projections can raise active value but never lower it below fallback (2026-07-06 to 2026-07-10)

**Decision:** For rookies specifically, projection-shaped adjustment is asymmetric: a strong
rookie projection can lift active value above the fallback (dynasty-market) value, but a weak one
can never push it below fallback. First shipped as a hard `max(fallback, projection)` in the
projection-aware VOR engine, later refined into the peer-normalized asymmetric lift described
above.

**Why:** Year-one seasonal projections systematically under-project rookies — blocked or ramping
roles, no NFL track record yet — while dynasty auction value already prices in long-term talent.
Treating a suppressed year-one projection as a value cut would misrepresent a player's real
long-horizon dynasty price.

**Status:** Active.

### Projection matching uses only exact/normalized identity, no fuzzy matching (2026-07-06)

**Decision:** The Mike Clay → Sleeper projection matcher uses only exact/normalized name+team+
position matches plus a small manual alias list. Ambiguous or low-confidence candidates are left
unmatched (flowing into a separate `unmatched_players.csv` for manual review) rather than guessed.

**Why:** A wrong player match silently corrupts valuation data, which is a worse failure mode than
an unmatched row that's visibly flagged for review.

**Alternatives considered:** Fuzzy/similarity matching — explicitly deferred, not ruled out
permanently, "unless the candidate set is small and confidence is high."

**Status:** Active.

### Strategy lens removed rather than repaired (2026-07-10)

**Decision:** The prior draft-board "strategy lens" (rebuild/balanced/contender), which blended
dynasty market dollars toward one-year projection VOR dollars, was removed rather than fixed when
projection-shaped market values shipped.

**Why:** Dynasty startup prices are convex at the top of the board while projection VOR dollars are
spread more evenly across the pool — blending two differently-shaped curves can make elite win-now
players look artificially worse in "contender" mode for structural reasons unrelated to real
valuation.

**Alternatives considered:** A future projection-rank lens, an age/lifecycle lens, or retiring the
draft-board lens concept entirely in favor of post-draft roster VOR analysis — none chosen yet.

**Status:** Deferred (replacement approach not yet decided; superseded in the interim by the
Value Spreads advisory overlay, which never mutates values).

### Two explicit budget-scaling stages instead of one implicit constant (HARD-003, PR #56, 2026-07-16)

**Decision:** Replace an implicit `× 5` scale constant with an explicit two-stage contract: raw
source CSV values are a $200 economy, normalized into a $1,000 DraftOps ranking-source economy
(persisted per `UserRankingSet`/draft), then scaled again by `draftBudget / sourceBudget` into the
configured draft's economy before league multipliers apply.

**Why:** Every non-$1,000 draft was silently inheriting $1,000-economy fallback values because
`adjustPlayerValues` had no notion of source budget vs. draft budget. Making both stages explicit
and persisted is what makes the scaling correct and auditable instead of accidental.

**Status:** Active.

### Existing-draft value backfill recomputes from immutable base values, never rescales the current value (HARD-003, PR #56, 2026-07-16)

**Decision:** The operational backfill CLI always recomputes proposed values from
`Player.baseBudget/baseCeiling/baseFloor` (the untouched source values), never by re-scaling
whatever `Player.budget` currently holds. It defaults to dry-run with a mandatory pre-mutation
JSON snapshot (no permanent DB table) before any `--apply`.

**Why:** Recomputing from an already-scaled current value would compound the scale on a second run;
sourcing from the immutable base fields makes the backfill idempotent and safely rerunnable. The
snapshot-before-write ordering exists because this tool fixes already-live drafts, where a mistake
has real cost.

**Alternatives considered:** A permanent snapshot table — rejected as unnecessary for a one-off
operational tool rather than a recurring feature.

**Status:** Active.

## Draft Lifecycle & Data Integrity

### PICK/PKG assets reduce budget but never consume roster slots (HARD-004, PR #57, 2026-07-17)

**Decision:** The canonical team-statistics calculator treats PICK/PKG auction wins as spend that
reduces budget and remains a roster asset, but excludes them from the QB/RB/WR/TE roster-slot
count and from average-roster-age calculations. The same calculator also accepts an optional
per-team net budget delta (zero by default) rather than modeling budget transfers as auction wins.

**Why:** Before this, the nomination API counted PICK/PKG results as roster slots while the
budget/teams views counted only skill positions, so buying power and roster-need advice silently
disagreed depending on which page you were on. Fixing the split required picking one policy and
centralizing it. The optional net-budget-delta parameter was added deliberately unused (always
zero today) to leave a seam for roadmap #10 (budget-for-picks trading) without pulling that
unscoped feature into this fix.

**Alternatives considered:** Counting PICK/PKG toward roster slots — rejected, since a kicker pick
package isn't a lineup slot and inflating roster-need math with it produces wrong nomination
advice.

**Status:** Active.

### Projection-source activation stages a complete candidate, then atomically flips one pointer (HARD-006, PR #70, 2026-07-19)

**Decision:** Replace inferring "the active projection source" from the newest
`DraftPlayerValue.updatedAt` with an explicit `Draft.activeProjectionValueSetId` pointer. A refresh
stages and validates a complete `DraftProjectionValueSet` before atomically archiving the prior set
and flipping the pointer, all under the shared per-draft advisory lock.

**Why:** Batched writes meant a partial failure partway through applying a new projection source
could leave an incomplete set looking "active" by recency, silently pushing the unwritten players
back to fallback values with no visible error. Staging a full candidate and validating it before
the atomic switch means a failed or partial reapplication leaves the previous set fully intact
instead of a half-applied hybrid.

**Alternatives considered:** Making the batch write itself more defensive (retries, smaller
batches) while keeping recency-based inference — rejected because it doesn't remove the fundamental
problem that "most recent row" is not the same claim as "fully applied set."

**Status:** Active.

### Bid mutations serialize through a per-draft advisory lock, not just a unique constraint (HARD-001/002, PR #53, 2026-07-16)

**Decision:** All draft-mutating writes (bids, Sleeper catch-up, completion) run through one shared
`withActiveOwnedDraftMutation` helper that takes a namespaced Postgres advisory transaction lock on
the draft ID, rechecks ownership/`ACTIVE` status, then enforces bid legality (roster capacity and
the one-dollar-per-open-slot budget rule) before writing. The lock namespace is deliberately
distinct from the one used during draft creation, so the two lock families can't collide.

**Why:** A database-level unique constraint on `(draftId, playerId)` only prevents two bids on the
_same player_. It does nothing to stop two concurrent bids from the _same team_ from both passing a
stale budget/roster-capacity check and jointly overspending — only a lock-then-recompute
transaction closes that race.

**Alternatives considered:** Relying on the unique-constraint backstop alone — insufficient for
budget/roster races, which aren't uniqueness violations.

**Status:** Active.

### Concurrency correctness is proven with a real-Postgres forced-rollback test, not mocks (HARD-001/002, PR #53, 2026-07-16)

**Decision:** The integration suite installs a temporary Postgres trigger that raises on nomination
deletion, specifically to prove that a failure partway through the bid transaction actually rolls
back the whole write under real transaction semantics.

**Why:** Mocked Jest tests can assert a function _was called_ but can't prove Postgres itself rolls
back correctly under a genuine mid-transaction failure — worth a dedicated real-DB harness
(`pnpm test:integration`) rather than trusting mocks for a correctness-critical guarantee.

**Status:** Active.

### Draft creation fails loudly, not silently, when projection application can't complete (2026-07-10)

**Decision:** If no `ProjectionSource` exists, or projection application to a new draft writes zero
joined values, `createDraft` throws rather than completing with fallback-only values.

**Why:** A failed create is preferable to silently shipping a draft with incomplete valuation data,
for a single-operator product where the operator would otherwise have no visible signal that
something went wrong. Explicitly flagged in the source design as temporary strictness, not a
permanent constraint.

**Alternatives considered:** Softer handling (a visible draft status flag, an admin repair flow) —
noted as the likely path once the product needs production resilience for multi-user usage, not
chosen now.

**Status:** Active — flagged in-doc as revisit-worthy once multi-user resilience matters.

### Same-draft relationship migration aborts on ambiguous legacy data rather than auto-repairing it (HARD-005, PR #67, 2026-07-18)

**Decision:** The guarded migration backfills only unambiguous single-match null player identities;
any zero-match or multi-match case aborts the whole migration rather than guessing or quarantining
the row.

**Why:** Correctness over convenience — silently picking a player identity for a historical bid
could misattribute real auction history.

**Alternatives considered:** Auto-quarantining unmatched rows — explicitly rejected.

**Status:** Active.

### New foreign keys added NOT VALID then validated separately, even on small tables (HARD-005, PR #67, 2026-07-18)

**Decision:** New compound foreign keys are added `NOT VALID` then validated in a separate step,
even though the production audit found table sizes small enough (≤~1,563 players, 280 results) that
an ordinary constraint creation would likely have been fine.

**Why:** A deliberate margin of safety on a live production table rather than optimizing for the
common case.

**Status:** Active.

### Draft-creation transaction's ~250 sequential player upserts are left unbatched (HARD-007, PR #71, 2026-07-19)

**Decision:** Keep the roughly 250 sequential per-player upserts inside `createDraft`'s
transaction, covered only by a measured, justified timeout, rather than batching them as part of
this workstream.

**Why:** Batching is a separable performance change; this workstream's scope was validation and
transaction-boundary correctness, not this write pattern's shape. Flagged during review as a real
gap and explicitly confirmed as a deferral rather than silently dropped scope.

**Alternatives considered:** Folding batching into this ticket — rejected as scope creep; guessing
at a timeout value — rejected in favor of measure-then-set.

**Status:** Deferred — explicit follow-up, not forgotten scope.

### Rankings CSV import rejects malformed or duplicate input rather than reconciling it (HARD-008, PR #74, 2026-07-19)

**Decision:** The CSV parser rejects malformed quoting outright (no best-effort interpretation),
and the importer rejects duplicate normalized player identities and duplicate explicit ranks rather
than silently merging or renumbering them.

**Why:** Correctness/determinism over leniency — a silently "fixed" ranking set could produce wrong
valuations without the user ever noticing.

**Status:** Active.

### Sleeper import warns and continues on unsupported roster positions instead of blocking the import (HARD-009, PR #73, 2026-07-19)

**Decision:** IR/taxi/K/DST/IDP slots and unsupported scoring settings are excluded from the
imported draft config and surfaced once as a non-blocking warning; the import still succeeds.

**Why:** A real Sleeper league config almost always carries settings DraftOps doesn't model, and
failing the whole import over that would be more disruptive than informative.

**Alternatives considered:** Rejecting/blocking the import entirely when unsupported settings are
present — rejected on usability grounds.

**Status:** Active.

### Deleted bids get a bounded 30-minute restore window, not unlimited undo or audit-only history (HARD-011, PR #75, 2026-07-19)

**Decision:** A deleted bid is restorable by the owner for exactly 30 minutes, checked against
database transaction time (not client clock). After that, recovery falls back to Neon
point-in-time recovery via a documented runbook. If a player is rebid after their prior claim was
deleted, the old deleted result is marked superseded and can never be restored, even inside the
window.

**Why:** Recovery is intentionally bounded — durable audit history plus Neon PITR remain the
fallback for older incidents, avoiding a general draft-reopen/unlimited-undo workflow while still
covering the common accidental-delete case. The supersede rule prevents an ambiguous state where
restoring an old bid would conflict with a newer, real claim on the same player.

**Alternatives considered:** Unlimited in-app undo — rejected as unnecessary scope; audit log with
no restore path at all — rejected as insufficient for the common accidental-delete case.

**Status:** Active.

## Security & Hardening

### CSP ships report-only before enforcement (HARD-019, PR #80, 2026-07-28)

**Decision:** Add security headers and a Content-Security-Policy in report-only mode first,
collecting real violation reports (including from OAuth, dialogs, and styling), rather than
shipping an enforced CSP with an upfront nonce strategy.

**Why:** Getting a CSP nonce strategy right on the first try for a stack combining Auth.js OAuth
redirects, Base UI dialogs, and Tailwind is easy to get subtly wrong in ways that only show up in
specific browser flows. Report-only mode surfaces those violations from real usage before anything
can break in production, at the cost of not yet blocking the attacks CSP defends against.

**Alternatives considered:** Shipping enforced CSP immediately — rejected as too high-risk of
silently breaking OAuth or dialog rendering in a way that wouldn't be caught until a user hit it
live.

**Status:** Active — enforcement is a deliberately separate, not-yet-scheduled follow-up.

### Local WOFF2 fonts instead of Google Fonts at build time (HARD-020, PR #81, 2026-07-28)

**Decision:** Replace `next/font/google` with checked-in local WOFF2 assets via `next/font/local`
for all three font families.

**Why:** Production builds depended on downloading fonts from Google at build time, meaning a
network hiccup or Google-side issue could fail deploys for reasons unrelated to the app's own code.
Checking the font files in makes builds reproducible under a documented, controlled set of
dependencies instead of an implicit network one.

**Status:** Active.

### E2E auth injects a real Auth.js JWT cookie rather than adding a test-auth bypass to the app (HARD-012, PR #59/#72, 2026-07-18)

**Decision:** Playwright's global setup encodes a real Auth.js session cookie directly (using the
same `encode()`/salt Auth.js uses) rather than adding a test-only Credentials provider or an
env-gated bypass to `src/auth.ts`.

**Why:** The app must never be able to distinguish an injected test cookie from a real
Discord-issued session — no test-only code path belongs in production auth.

**Alternatives considered:** A test-only Credentials provider or env-gated bypass — rejected as a
permanent security-relevant branch added to production auth code.

**Status:** Active.

### Playwright CI runs with zero retries, against the CI-common "retry once" default (HARD-012, PR #59/#72, 2026-07-18)

**Decision:** The Playwright config hardcodes `retries: 0` rather than the typical "retry once in
CI" pattern.

**Why:** The bid-logging spec performs a real, non-idempotent database mutation guarded by a unique
constraint. A retry after a first successful write would fail for a confusing, unrelated reason
(duplicate-claim rejection), masking the actual flake instead of surfacing it.

**Status:** Active.

### Client error reporting goes through Sentry's SDK exclusively, replacing the custom ingestion endpoint (HARD-014, PR #78, 2026-07-21)

**Decision:** Remove the unauthenticated `/api/log-error` route and `reportClientError.ts`; browser
errors are reported through Sentry's SDK only.

**Why:** A second unauthenticated, unbounded ingestion endpoint is itself a liability, and Sentry's
SDK keeps working even when Auth.js or the app's own API is failing — nothing is lost by dropping
the custom path.

**Alternatives considered:** Keeping both ingestion paths — rejected as redundant attack surface.

**Status:** Active.

## Draft & League Configuration

### Multi-draft schema migrated in expand/contract stages, not one big-bang change (2026-06-28/29)

**Decision:** Four incremental PRs — additive nullable schema → backfill script → wire all
reads/writes to draft-scoped queries → non-nullable columns with composite uniques — each merging
independently with the app staying functional throughout.

**Why:** A multi-tenant retrofit touching every route/action/query is too large and risky to land
as one PR; expand/contract lets each stage be tested and reverted independently without a
maintenance window.

**Status:** Active — the pattern was reused for the later league-settings rollout ("PR A/B/C").

### Draft ownership is always set explicitly, never auto-claimed (2026-06-28)

**Decision:** Draft lookups filter strictly by `ownerId`; there is no fallback logic that assigns
an unclaimed draft to whoever signs in first. Ownership is always set explicitly, originally via
seed/backfill, later via `createDraft`'s explicit owner-team selection.

**Why:** Auto-claiming is a security footgun in a multi-user auth system — the first person to hit
an unclaimed draft could silently take ownership of someone else's data.

**Status:** Active.

### Bid/watchlist mutations scope by draft using `updateMany`/`deleteMany`, not `update`/`delete` by ID (2026-06-28)

**Decision:** Mutations use `updateMany`/`deleteMany` with a compound `{ id, draftId }` (and
equivalent ownership) where-clause rather than a plain `update`/`delete` by primary key.

**Why:** A plain `update`/`delete` by ID alone would let an authenticated user with a valid session
mutate another user's draft data merely by guessing or iterating IDs, since draft scoping wasn't
otherwise enforced on the write path.

**Status:** Active.

### Draft creation/management: explicit scope cuts (2026-06-29)

**Decision:** No confirmation dialog on "Mark Complete"; full manual team-handle entry at creation
(no guided/partial setup); reopening a completed draft, an `ARCHIVED` status, and a read-only share
link were all considered and explicitly rejected for this pass; visual redesign was deferred out of
this PR entirely.

**Why:** Single-operator product model — the goal was making draft management usable for anyone
running their own draft, not solving multi-operator or archival concerns yet, and keeping this
scoped as "the last piece before the deploy milestone."

**Status:** Active; no reopen/no `ARCHIVED` status still hold per current schema.

### League-settings JSON fields are nullable, not database-defaulted (2026-06-30)

**Decision:** `Draft.startingLineup`, `scoringSettings`, and `targetRoster` are stored as nullable
`Json?` rather than given database-level defaults.

**Why:** Prisma's schema DSL cannot express complex JSON defaults, so nullable-plus-application-
level-fallback (typed constants in `src/types/index.ts`) was the only option for a zero-downtime
migration on existing rows.

**Status:** Active.

### Kicker slots are deliberately excluded from the starting-lineup model (2026-06-30)

**Decision:** `StartingSlot` has no kicker option; the starting-lineup builder cannot add one.

**Why:** In this league, winning a kicker bid nets an entire future draft-pick package — a
different mechanism from a starting lineup slot. Allowing a "kicker" starting slot would conflate
the two and misrepresent what winning a kicker bid actually means.

**Status:** Active.

## Sleeper Integration

### Sleeper league import never persists a username or imports the auction budget (2026-06-30)

**Decision:** The optional "your Sleeper username" field is re-entered per import rather than
saved to a profile, and the imported draft's `budget` always stays at the user's manually-set
default — Sleeper import never touches it.

**Why:** Draft creation is a once-per-user event, so re-typing a username was judged negligible
friction; persisting it was deferred pending live roster sync needing richer Sleeper integration.
Sleeper doesn't expose auction budgets in a format useful to this tool's model.

**Status:** Active for the budget point. The username point was later addressed differently — #9b
maps Sleeper rosters to teams via a saved `Team.sleeperRosterId`/`Draft.sleeperLeagueId`, not a
persisted username.

### Imported team count is truncated to Sleeper's `total_rosters`, not the raw user list (2026-06-30)

**Decision:** `mapSleeperLeague` caps the mapped teams array at `teamCount`, discarding extra users
beyond that.

**Why:** Real leagues can have co-owners (a documented case: 13 users for 12 rosters), and
Sleeper's `/users` endpoint returns one row per person, not per roster — without truncation, import
would silently create more teams than roster slots exist.

**Status:** Active.

### Sleeper catch-up batch writes bypass the single-row bid action (2026-07-14)

**Decision:** `logSleeperRosterCatchUp` re-implements bid-row creation directly in one transaction
rather than calling the existing `logBid` action in a loop.

**Why:** `logBid`'s independent per-call transactions would let a batch import partially succeed
with no atomicity guarantee, and would trigger redundant revalidation per row.

**Status:** Active.

### Sleeper catch-up is on-demand and additive-only; names are never a reconciliation key (2026-07-14)

**Decision:** The reconciliation tool only adds unlogged results from a manual scan. It never
edits, removes, or infers auction prices from Sleeper, and Sleeper display names/handles are never
used as reconciliation keys — only `Player.sleeperId`/`Team.sleeperRosterId`/
`AuctionResult.playerId`.

**Why:** DraftOps' own auction log is the source of truth for price; Sleeper only proves _who_ won,
not what they paid, and display names are unstable identity.

**Status:** Active.

### Roster auto-match to teams is exact-handle-only and never overrides a working saved mapping (2026-07-15)

**Decision:** `matchSleeperRostersToTeams` only suggests a team via exact, case-insensitive
`Team.handle` ↔ Sleeper `display_name` comparison — no fuzzy matching. A roster/team pair with an
already-saved, still-valid mapping always wins over a coincidental handle match, and the match
result only pre-fills a dropdown; nothing persists until the user explicitly saves.

**Why:** `Team.handle` is literally the manager's Sleeper username for every team seeded via league
import, making exact match reliable without similarity scoring. Preferring existing mappings
prevents a manager who renamed their Sleeper username from silently stealing another team's working
mapping. Keeping it UI-only preserves the standing invariant that handles/display names are never
used for reconciliation itself.

**Alternatives considered:** Fuzzy/similarity matching — rejected as unnecessary given the reliable
exact-match signal.

**Status:** Active.

### New draft-independent `SleeperPlayer` identity table, instead of reusing `Player` or `PlayerProjection` (2026-07-10)

**Decision:** Added a small `SleeperPlayer` table (identity fields only, no valuation) as the match
target for uploaded custom-rankings CSV rows.

**Why:** `Player` is draft-scoped and carries per-draft dollar values — the wrong shape, and there's
no draft to scope to at upload time. `PlayerProjection` is keyed by Sleeper ID with no `name`
field, so it can't be a match target for a raw CSV name string. This keeps identity, rankings,
projections, and draft-state separable, and the table is reusable by the later Sleeper roster-sync
feature.

**Status:** Active.

## Nomination & Budget Intelligence

### Secondary pages reject "needs" framing in favor of behavior-vs-money (2026-07-08)

**Decision:** `/teams` and `/budget` were diverged into two different jobs — a Manager Dossier that
reads revealed behavior (lean/appetite/aggression) and a Live Threat Board that reads live money
(`maxBid × appetite`) — instead of continuing to share the same money-column-table framing.

**Why:** In a startup auction you draft for value, not need; a count-vs-target "needs" framing
implies an ideal roster a team should fill toward, which is false for this format. Both pages had
converged on the same Spent/Remaining/Roster/Buying Power columns and only diverged once you
clicked into a team — they didn't actually answer different questions.

**Alternatives considered:** Count-vs-target need-ratio framing (e.g. "team needs 2 more RBs") for
both the roster page and for predicting rival bidding — explicitly rejected.

**Status:** Active.

### Spread is a percentile-rank gap, not a raw-dollar delta (2026-07-14)

**Decision:** `computeSpreads` compares position-relative percentile rank between dynasty value and
projection value, not a dollar-denominated `projectionAuctionValue − dynastyValue`.

**Why:** The VOR→dollar allocator only distributes real dollars to above-replacement players
(zeroing the rest), while dynasty value spreads dollars across the whole pool — a raw-dollar delta
would just re-measure that structural allocation difference, not a genuine per-player signal. Rank
is scale-invariant and immune to it.

**Alternatives considered:** Raw-dollar delta — rejected for the reason above.

**Status:** Active.

### Per-position spread-gate thresholds and surfacing Spread beyond the value sheet are deferred (2026-07-14)

**Decision:** Ship one global age-scaled gate rather than per-position thresholds, and scope Value
Spreads to the value sheet + bid modal only (not `/nominate`, `/teams`, `/budget`).

**Why:** Explicitly flagged to revisit after a live draft rather than guess at per-position
calibration up front.

**Status:** Deferred / Flagged for revisit.

### Dynamic pick values price the origin team's roster, kept as `Player` rows rather than a trade ledger (2026-07-10)

**Decision:** Dynamic future-pick valuation signals (surplus rate, optimized lineup points, VOR,
future-capital posture) are computed from the pick's _origin_ team, independent of whoever
currently holds the pick asset in-draft. Picks stay as origin-team-specific, mode-aware `Player`
rows rather than introducing pick ownership, transfer history, or trade support. Valuing two-
years-out picks, and persisting the dynamic adjustment back into `Player.budget` after every bid,
were both explicitly punted.

**Why:** A trade or resale of a pick shouldn't change what makes it valuable, so origin — not
current holder — is the right basis. The broader goal was better draft-day target pricing, not
turning DraftOps into a full trade ledger; two-years-out signal was judged too noisy, and
persisting the adjustment would make it sticky/volatile instead of recomputed live.

**Alternatives considered:** A first-class asset system (origin, current owner, component picks,
package grouping, transfer history) — explicitly deferred as a long-term extension if DraftOps ever
expands into trades or post-draft ops.

**Status:** Active for the shipped mechanism; ledger/trade-support extension is Deferred.

### Custom-rankings replace flow for an existing draft is deferred (2026-07-10)

**Decision:** No flow exists to replace or re-seed an existing draft's `Player` pool from a
re-uploaded or newly-uploaded ranking set — a ranking set only seeds new drafts.

**Why:** `AuctionResult`/`NominatedPlayer`/`PlayerWatchlist` key player identity by name string, not
foreign key, and `DraftPlayerValue` rows are FK'd to the `Player` ids that would be replaced.
Reconciling all of that is real complexity, deliberately deferred rather than solved.

**Status:** Deferred.

### Ranking-set coverage diff targets the curated ETR pool, not the full Sleeper player table (2026-07-13)

**Decision:** The "missing players" coverage check on an uploaded ranking set compares against
`src/data/players.ts`'s curated ~327-player pool, not the full 600+ row active `SleeperPlayer`
table.

**Why:** The full Sleeper pool would bury the real signal under bench/practice-squad players nobody
would draft. Confirmed during review as realistic startup-pool depth for a 12-team, 25–30 man
dynasty league — not an arbitrary noise-filtering threshold.

**Status:** Active.

## UI/UX & Design System

### Value sheet awaits claimed-bid data instead of streaming it via Suspense (2026-06-23)

**Decision:** `page.tsx` awaits claimed-bid data before rendering rather than streaming it in.

**Why:** Claimed-bid state determines row layout (grayed rows, the Claimed column); streaming would
cause visible layout shift mid-render during a live auction, which is worse than a slightly slower
initial paint.

**Status:** Active.

### Brand color fills shadcn's `--primary` role rather than a new token (2026-07-06)

**Decision:** The brand/interactive color fills shadcn's canonical `--primary`/`--ring` roles
rather than getting an invented token name.

**Why:** shadcn's own `--accent` already means "subtle hover background" (e.g. dropdown-item
focus) — a different concept from "brand CTA color." Reusing `--primary` avoids that collision and
means `Button`'s default variant/focus rings pick it up for free.

**Status:** Active.

### Three-font system (Barlow Condensed / Inter / JetBrains Mono) reconsidered and kept during the UI redesign (2026-07-06)

**Decision:** Kept the existing 3-font system rather than adopting shadcn's auto-injected Geist
font, which was actively reverted after being pulled in by the component generator.

**Why:** Barlow Condensed's condensed-uppercase feel fits a "scoreboard" draft tool, JetBrains Mono
for dollar figures mirrors finance-terminal convention, and Inter as a neutral body face was judged
still correct.

**Status:** Active.

### Design tokens extend before new ones are added (2026-07-06 to 2026-07-07)

**Decision:** Recurring instances across the UI redesign: no shared success/danger token pair was
introduced for financial-status colors (Budget/Spent/Remaining stay literal hex) since no
success/danger concept existed yet in the system; more broadly, existing tokens (`bg-card`,
`border-border-subtle`, `POS_COLORS`, etc.) are used first, with a new token only justified once a
recurring semantic need appears on at least two pages.

**Why:** Prevents token-layer sprawl as each page gets redesigned independently — a one-off need on
a single component isn't reason enough to grow the token vocabulary.

**Status:** Active.

### `BidModal`'s dialog keeps shadcn's default spacing instead of the app's custom spacing tokens (2026-07-06)

**Decision:** `DialogContent` keeps shadcn's default `gap-4`/`p-4` instead of the app's named
spacing scale (`gap-md`, `p-lg`, etc.).

**Why:** `cn()`'s `twMerge()` isn't configured with `extendTailwindMerge` for this project's custom
`@theme inline` spacing scale, so mixing a default utility class with a custom-scale class in the
same string wouldn't reliably dedupe. Accepting the default was simpler/safer than fighting the
merge config in that PR.

**Status:** Flagged for revisit — technical debt (a `tailwind-merge` config gap), not a deliberate
long-term choice.

### URL-state sync always uses `history.replaceState`, never `pushState`, for every synced field (HARD-018, PR #97, 2026-07-30)

**Decision:** The shared `useUrlQuerySync` hook mirrors filter/sort/search/selection state into the
URL via `replaceState` for every field it manages — not just the debounced search box — rather than
pushing a new history entry per change.

**Why:** A live draft session can generate dozens of filter/sort clicks; if each pushed a new
history entry, the back button would step through that entire click history one click at a time
before ever leaving the page, which is worse than not syncing state to the URL at all.

**Alternatives considered:** `pushState` per change, or `pushState` only for "major" changes and
`replaceState` for others — rejected as inconsistent and still vulnerable to history pollution from
rapid filter clicks.

**Tradeoff accepted:** Back/forward restores state across _page_ navigations (leave the value
sheet with filters set, come back, filters are still there) rather than stepping through each
individual in-page filter change — this is the reading of HARD-018's "shared URLs reproduce the
view" and "back/forward restores meaningful state" criteria that was implemented.

**Status:** Active.

### Market-weight-by-position bar reflects the full player pool, not the active filter (2026-07-07)

**Decision:** `AuctionHeader`'s market-weight stats are computed from all players, unaffected by
position/search/Available-Only filters.

**Why:** Treated as a standing reference stat ("what does the market look like"), not a view of
currently filtered results — a deliberate choice that could otherwise read as a bug (numbers not
moving when you filter).

**Status:** Active.

### Watchlist dropdown visibility is tied to search-text state, dropping a minor refocus nicety (2026-07-07)

**Decision:** The rebuilt `WatchlistSidebar` ties dropdown visibility directly to whether the
search input has text, rather than tracking a separate open/closed boolean. An outside click now
closes the dropdown by clearing the search text (losing the typed query), where the original
preserved it for refocus.

**Why:** Explicit simplification during the shadcn rebuild — one less piece of state to manage, at
the cost of a minor UX nicety (resuming a search after an accidental outside click).

**Status:** Active.

### Team roster split view uses a JS-driven breakpoint (`useMediaQuery`), not the app's usual CSS-only convention (2026-07-10)

**Decision:** Desktop split-view vs. mobile grid on `/teams` is chosen via a
`useMediaQuery('(min-width: 1024px)')` hook rather than a pure CSS breakpoint split.

**Why:** The detail pane is inherently data-driven (whichever team is selected), so some JS
branching is unavoidable. Given that, rendering one tree conditionally was judged better than
mounting both the grid and the split view and hiding one with CSS — the CSS approach would mean
duplicating a full list of heavy, stateful, interactive dossier cards just to hide half of them.

**Alternatives considered:** CSS-only dual-render — rejected as too expensive for this component;
the app keeps the CSS approach elsewhere where duplication cost is low.

**Tradeoff accepted:** A JS-driven breakpoint can't know viewport before first paint, so desktop
loads default to the mobile grid and correct to split view post-mount — a one-frame flash, accepted
rather than solved.

**Status:** Active.

### Sign-in accent color corrected to the real `--primary` token instead of a new brand color (2026-07-16)

**Decision:** Early logo/sign-in mockups used a placeholder violet based on a stale memory of an
accent-color decision that was never actually shipped. Self-review caught that `globals.css`'s real
`--primary` is a pale sage/cream, and the design was corrected to use that real token as-is.

**Why:** Introducing a new brand-only color, or changing the shared `--primary` token sitewide to
match the mockups, was judged out of scope for a logo/sign-in task — the fix was to align the
design to reality, not bend the app to the mockup.

**Alternatives considered:** A new brand-only accent color, or a global `--primary` change — both
rejected as scope creep.

**Status:** Active.

### Sign-in ticker data is static/curated, never live or DB-backed (2026-07-16)

**Decision:** `ValueTicker`'s ~50 player entries are hardcoded flavor data, not sourced from
`src/data/players.ts` or a live query.

**Why:** `/sign-in` is pre-auth with no draft/session context; both a built-in seed source and a
live DB query would still show fabricated deltas for a purely decorative element, so a database
round-trip on an unauthenticated page wasn't worth the coupling.

**Status:** Active.

### Contrast fixes stay within the existing token family rather than swapping in generic neutrals (HARD-015, PR #77, 2026-07-21)

**Decision:** The failing `--text-muted` token was retuned to a color one step darker within the
existing muted sage-gray family, rather than a generic neutral gray; `--age-old` became Tailwind's
red-400 with contrast margin to spare, rather than landing right at the 4.5:1 line.

**Why:** Fixes the accessibility failure without introducing a color foreign to the design system,
and avoids a token that barely clears the bar and could regress on a future background change.

**Status:** Active.

### Landmark restructuring beyond the skip-link scope was left out of the accessibility pass (HARD-015, PR #77, 2026-07-21)

**Decision:** No `<nav>`/`<header>` landmark was added to `NavBar`, even though it would plausibly
improve accessibility further.

**Why:** The accessibility workstream's scope was a skip link plus one `<main>` per route; broader
landmark restructuring wasn't requested and was kept out to avoid scope creep in an already-large
hardening pass.

**Status:** Deferred.

### Active projection source/date display was explicitly declined in the truthful-labels pass (HARD-016, PR #76, 2026-07-21)

**Decision:** The original audit's implementation direction called for displaying "active value
source/projection date and completed/read-only status." Only the truthful-settings-label part
shipped; source/date display was not implemented.

**Why:** Completed/read-only status was already handled by HARD-001's read-only banner — not a gap.
Surfacing projection source/date is a UX addition, not a truthfulness fix, and none of HARD-016's
acceptance criteria required it; implementing it would mean threading value-set activation metadata
through three more server components — a separable, larger change.

**Alternatives considered:** Folding it into this ticket anyway — rejected as scope creep, left as
an explicit flag for a follow-up ticket instead.

**Status:** Deferred.

### `content-visibility` rejected for table rows; virtualization gated on measurement, not applied preemptively (HARD-017, PR #79, 2026-07-21)

**Decision:** `content-visibility` is not applied to `<tr>` rows at all, since CSS Containment
Level 2's required containment doesn't apply to internal table boxes. If a measured pre-change
baseline exceeds the interaction-latency budget, the plan pauses for a separate design decision
before virtualizing or changing table semantics — it does not preemptively virtualize.

**Why:** Avoids shipping an optimization that can't actually deliver row-level containment, and
keeps the performance-measurement gate meaningful rather than pre-committing to virtualization
regardless of whether the measured baseline needs it.

**Alternatives considered:** Applying `content-visibility` to rows anyway — rejected, the spec says
it wouldn't work; virtualizing preemptively — rejected as unjustified without measurement.

**Status:** Active.

### Nomination polling reschedules its next tick on completion instead of using `setInterval` (HARD-017, PR #79, 2026-07-21)

**Decision:** Nomination polling schedules its next 30-second tick only after the current poll
settles, rather than using `setInterval`.

**Why:** `setInterval` can queue overlapping in-flight requests if a poll runs long;
completion-scheduling guarantees polls never overlap.

**Status:** Active.

## Onboarding

### Onboarding completion is permanent, per-account, with no restart control (2026-07-14)

**Decision:** Completing or dismissing onboarding (the welcome panel or the feature tour)
permanently marks the authenticated Discord account complete — no restart control exists in beta,
and it never reappears across drafts, browsers, or devices.

**Why:** Keeps the persistence model simple (one authority: the account-scoped record) and avoids
onboarding becoming an annoyance on repeat use. Explicitly scoped as a beta-only decision.

**Status:** Active — beta constraint, may be revisited.

### The feature tour runs on the user's real first draft, not a separate wizard or demo draft (2026-07-14)

**Decision:** Onboarding guides users to the existing draft-creation form (no parallel wizard), and
the feature tour operates entirely on the real draft just created — including optional real
bid/nomination exercises with explicit undo guidance, never synthetic sample data.

**Why:** Avoids duplicating the league-setup form and avoids the maintenance burden of a fake demo
draft diverging from real app behavior; teaching on real data means the undo guidance is
immediately actionable rather than hypothetical.

**Status:** Active.

### Users with an existing draft at rollout were not retroactively enrolled in onboarding (2026-07-14)

**Decision:** Users who already had a draft when this feature shipped received no onboarding
record and no interruption.

**Why:** Deliberate beta rollout choice — avoids surprising established users with a first-run flow
that isn't relevant to them.

**Status:** Active (beta scope; no retroactive enrollment planned).

## Infra & Deploy

### SQLite → PostgreSQL migration: native WSL2 Postgres, regenerated migration history, explicit-ID upsert with a mandatory sequence reset (roadmap #1, 2026-06-26)

**Decision:** Local dev uses native WSL2 Postgres (not Docker), one `@prisma/adapter-pg` for both
local and Neon, a wiped-and-regenerated migration history rather than translating SQLite-dialect
migrations, and a one-time idempotent upsert script — explicit IDs preserved, Postgres sequences
reset immediately afterward — rather than `pg_dump`/restore. Before any of this, a copy of the
SQLite DB was taken both inside and outside the repo, and a `sqlite-archive` branch was cut from
pre-migration `main`.

**Why:** Docker Desktop isn't installed in this environment. SQLite-dialect migration SQL isn't
valid Postgres SQL, so translating in place was riskier than a clean `migrate dev --name init`.
Explicit-ID upserts preserve foreign-key relationships across the two databases, but Postgres
`SERIAL` sequences don't know about rows inserted with explicit IDs — skipping the sequence-reset
step causes silent primary-key collisions on the next auto-inserted row, so the script treats it as
mandatory. The double backup plus branch covers two different failure layers: code breaking, and
data getting corrupted or lost.

**Alternatives considered:** Docker Postgres — blocked by the environment; in-place migration-file
translation — rejected as more error-prone than a fresh regenerate.

**Status:** Active.

### `dotenv` stays a permanent dependency after the Postgres migration (2026-06-26)

**Decision:** `dotenv` was kept rather than removed once `prisma.config.ts` needed explicit env
loading.

**Why:** Prisma 7's `prisma.config.ts` does not auto-load `.env.local`, and neither does `tsx`.
`dotenv` is a small, well-understood fix for local CLI env-loading; Vercel injects `DATABASE_URL`
directly in production, so the dependency only matters locally.

**Status:** Active.

## Roadmap / Deferred Decisions

### Budget-for-picks trading uses an immutable ledger and read-time ownership (#10, 2026-08-04)

**Decision:** Shipped budget-for-picks trading as `Trade`, `TradePickAsset`, and
`TradeAuditEvent` records rather than an `AuctionResult` or a general tradeable-asset system.
`budgetTeamId` sends budget and becomes the new pick holder; `pickTeamId` sends the pick and
receives the budget. `resolvePickHolder`/`resolveAllPickHolders` determine each current holder at
read time from the most recent active trade, falling back to an active auction win and then the
origin team. This handles multi-hop re-trades without storing a mutable current-owner field.

`getTradeBudgetDeltaByTeamId` is the sole accounting seam: every remaining-budget, buying-power,
and bid-legality path consumes its active-trade deltas. The same holder-resolved picks feed
`pickCapital.ts`, so a team gaining or divesting capital changes dynamic pick valuation in the
correct direction. UI roster and trade-picker displays therefore show current holders, including
trade-acquired picks, not just origin-team assets.

Trade mutations are active-draft, owner-authorized transactions with ordered `CREATE`, `UPDATE`,
`DELETE`, and `RESTORE` audit snapshots. A delete is soft and can be restored for 30 minutes using
the database transaction clock, provided it does not conflict with a later re-trade, current pick
ownership, or budget legality. The JSON export includes active trades and the ordered trade audit
history. Completion snapshots are schema version 2 and atomically capture the draft, active auction
results, and active trades before the draft becomes `COMPLETE`.

**Why:** The existing budget-delta seam made a narrow ledger the lowest-risk way to make trade
budget effects binding everywhere rather than only in a presentation view. Read-time resolution
keeps the present holder derived from the same durable trade history used for recovery and makes
chain corrections auditable. Round-level assets preserve enough identity for multi-hop trading,
while grouped resolved rounds retain intact-package valuation when the same acquisition event holds
all three rounds.

**Alternatives considered:** A mutable current-owner field on `Player` or a separate ownership
table — rejected because corrections, deletes, and restores could drift from the transaction
record. A general first-class asset/transfer system — rejected because player-for-player and other
asset classes are outside this auction workflow; it would add broad lifecycle rules without making
budget-for-picks safer.

**Status:** Active. Recovery, audit boundaries, and PITR validation are documented in
`docs/operations/bid-recovery.md`.

### Threat-board position-override resync behavior (2026-07-08)

**Decision:** `/budget`'s Live Threat board auto-follows the currently-nominated position, but a
manual click sets an override that persists across the 20s auto-refresh. When a _new_ nomination
diverges from an active override, the board does not auto-snap back — it surfaces a
`● Live: {pos} — jump` pill that clears the override only on click.

**Why:** The right UX for reconciling an operator's manual scouting override against live
nomination changes wasn't obvious from spec work alone; it needed real live-draft usage to
validate. Shipping the pill (never move without a click, but never silently disagree either) was
the safer default, flagged for revisit rather than treated as final.

**Alternatives considered:** Auto-clearing the override the instant `livePosition` changes to a
new value — held back as the fallback pivot if the pill annoys in practice, since it requires
tracking the previous `livePosition` to avoid stomping refreshes of the same nomination.

**Status:** Flagged for revisit — pending observation during a live draft.
