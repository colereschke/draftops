# Custom Rankings Upload — Design Spec

**Date:** 2026-07-10
**Feature:** Roadmap #7
**Status:** Approved, ready for implementation planning

---

## What We're Building

A profile-level "custom rankings" feature. A signed-in user uploads an ETR dynasty rankings export (CSV) once; DraftOps parses it, scales values with the existing valuation formula, matches each row to a Sleeper player ID, and stores it as that user's single active ranking set. At draft creation, the user chooses between the bundled ETR default pool (`src/data/players.ts`) or their own uploaded ranking set as the base player pool — both flow through the existing `adjustPlayerValues` (#5b) pipeline unchanged.

This is a reusable, account-level asset — not a per-draft upload. One upload seeds any number of future drafts.

## What's NOT In Scope

- **Replacing an existing draft's player pool.** A ranking set only seeds _new_ drafts. Swapping a live draft's pool would require reconciling `AuctionResult`/`NominatedPlayer`/`PlayerWatchlist` (all keyed by player name string, not FK) and deciding what happens to `DraftPlayerValue` rows FK'd to replaced `Player` ids — real complexity, deliberately deferred.
- **Multiple named ranking sets per user.** One active set, overwritten on re-upload.
- **Flexible column mapping.** Headers are locked to the real ETR export's naming; no arbitrary-CSV mapping UI.
- **Ingesting projection stats from the uploaded CSV.** Rankings are a market/value input, not a projection source (see roadmap's Data Layer Principle) — projections stay on the #5d/#5e pipeline.
- **Pick-package (`PKG_VALUES`) naming, kicker→team assignment, or any per-draft team-assignment UI for pick packages.** That's prerequisite plumbing for roadmap #8 (Dynamic Pick Valuation), which is being worked on separately. This ticket only mechanically splits `PKG_PLAYERS` out of `players.ts` so it can be appended to either player-pool source — the rows themselves are untouched.
- **Live re-sync of the `SleeperPlayer` reference table from Sleeper's API inside the app.** It's synced via a manual script from the already-generated `data/generated/normalized_sleeper_players.csv`, same cadence as today's `etr_sleeper_matches.csv`.

---

## Why a new `SleeperPlayer` table

Matching an uploaded ranking row to a Sleeper ID needs a queryable "who is this player" reference, independent of any draft. Nothing in the schema provides that today:

- `Player` is draft-scoped (`draftId` required) and carries per-draft dollar values (`budget`/`ceiling`/`floor`) — wrong shape for a pre-draft identity lookup, and there's no draft to scope it to at upload time anyway.
- `PlayerProjection` is sleeperId-keyed but has no `name` field — it assumes the ID is already resolved, so it can't be the match _target_ for a raw CSV name string.

A small `SleeperPlayer` table (identity fields only, no valuation) fills that gap and is reusable by #9 (roster sync) later — consistent with the roadmap's existing Data Layer Principle of keeping identity, rankings, projections, and draft state separable.

---

## Schema (additive)

```prisma
model SleeperPlayer {
  id             String   @id // Sleeper's own player_id
  name           String
  normalizedName String
  team           String   // '' if free agent
  pos            String   // QB | RB | WR | TE
  age            Float?
  updatedAt      DateTime @updatedAt

  @@index([normalizedName])
}

model UserRankingSet {
  id         Int      @id @default(autoincrement())
  userId     String   @unique // Auth.js userId — one active set per user
  fileName   String?
  uploadedAt DateTime @default(now())
  players    UserRankingPlayer[]
}

model UserRankingPlayer {
  id           Int      @id @default(autoincrement())
  rankingSetId Int
  rankingSet   UserRankingSet @relation(fields: [rankingSetId], references: [id], onDelete: Cascade)
  name         String
  team         String
  pos          String   // QB | RB | WR | TE | PICK
  age          Float?
  sfRank       Int
  budget       Int
  ceiling      Int
  floor        Int
  notes        String   @default("")
  sleeperId    String?
  matchStatus  String   @default("unmatched") // matched | manual | unmatched | n_a

  @@index([rankingSetId])
}
```

`matchStatus` values: `matched` (auto-matched on upload), `manual` (user picked a match in the resolve UI), `unmatched` (no match, user hasn't resolved), `n_a` (PICK rows — never matched, excluded from the resolve UI).

---

## CSV format

Locked to the real ETR dynasty export header names (verified against `existing_project_docs/auction-tool/src/Dynasty_Rankings.csv`):

| Header        | Required            | Notes                                                                                                                                                                               |
| ------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Player`      | yes                 | non-empty                                                                                                                                                                           |
| `Team`        | yes                 | free text, passed through                                                                                                                                                           |
| `Position`    | yes                 | keep rows where value ∈ `{QB, RB, WR, TE, Pick}`; all other rows (K, DST, etc.) silently dropped; `Pick` is stored as `PICK` (matches the existing `Position` union in `src/types`) |
| `Age`         | yes for QB/RB/WR/TE | numeric; may be blank only for `Pick` rows                                                                                                                                          |
| `2QBAuction`  | yes                 | `$`-prefixed dollar string; strips `$`, parses to a non-negative integer                                                                                                            |
| `SF/TE Prem`  | optional            | see sfRank rule below                                                                                                                                                               |
| `Notes`       | optional            | defaults to `''` if column absent or blank                                                                                                                                          |
| anything else | ignored             | `Status`, `1QB Rank`, `1QB Pos Rk`, `SF/TE Pr Pos Rk`, `1QBAuction` tolerated but unused                                                                                            |

A real ETR export (all 12 columns) works unmodified; a hand-built minimal CSV with just the required columns also works.

**Validation is whole-file, not row-by-row-abort:** missing required headers reject immediately with a clear message. Row-level errors (empty `Player`, unparseable `Age`/`2QBAuction`) are collected across the whole file and shown together — nothing is persisted until the file parses clean.

**`sfRank`:**

- If `SF/TE Prem` is present in the header, every kept row must have a parseable integer value for it (hard validation error otherwise) — used directly as `sfRank`.
- If the column is absent entirely, `sfRank` is derived for the whole file: sort kept rows by scaled `budget` descending, stable sort (ties keep original CSV row order) assigns rank 1..n.
- No partial-column handling — a file can't mix explicit and derived ranks.

**`ceiling`/`floor` are always app-computed, never read from the CSV** (the ETR format has no such columns anyway): `ceiling = round(budget × 1.15)`, `floor = max(5, round(budget × 0.87))`.

**Value scaling** — extracted from `players.ts` into a shared function (`src/lib/scaleRankingValue.ts`) so `toPlayer()` and the upload path share one formula:

```
budget = max(5, round(rawValue × 5))
if pos === 'TE': budget = round(budget × 1.18)
ceiling = round(budget × 1.15)
floor = max(5, round(budget × 0.87))
```

`players.ts`'s `toPlayer()` is refactored to call `scaleRankingValue()` instead of inlining the formula, so both paths are provably identical (covered by the regression test in Testing below).

CSV parsing reuses the quoted-field-aware line parser already written for `prisma/apply-projection-values.ts`, extracted into a shared `src/lib/csv.ts` — no new dependency.

---

## Sleeper matching

`src/lib/sleeperMatch.ts` — a TypeScript port of the existing Python matcher (`scripts/projections/draftops_projections/match_players.py` / `match_etr_values.py`), run once per upload against the full `SleeperPlayer` table (~3,000 rows, small enough to load in memory for one pass):

1. Normalize name (strip accents/punctuation/suffixes/middle initials — same rules as `normalize.py`) and team (same alias map).
2. Try exact normalized name + team + position → unique match.
3. If team is blank (free agent) or the first attempt found no unique match, fall back to normalized name + position → unique match.
4. Manual alias table — same ~10 entries as `aliases.py`'s `MANUAL_ALIASES`, hand-duplicated in TS (not worth a shared-file mechanism at this size).
5. Otherwise `unmatched`.

`Pick` rows skip matching entirely (`matchStatus: 'n_a'`).

**`SleeperPlayer` sync** — new script `prisma/sync-sleeper-players.ts` (mirrors `prisma/sync-players.ts`): reads `data/generated/normalized_sleeper_players.csv`, upserts rows filtered to `active=true` and `position ∈ {QB,RB,WR,TE}`, keyed by Sleeper id. Run manually after each Python pipeline refresh.

---

## Upload + resolve UI — new `/rankings` page

Linked from the profile dropdown in `NavBar` (next to "Log out"). Protected by the existing middleware (all routes except `/sign-in` require auth). States:

1. **No active set** — upload dropzone/file input, short "required columns" help text.
2. **Active set exists** — summary card: `uploadedAt`, `fileName`, total player count, matched/unmatched/n_a breakdown. Re-upload button (wipes and recreates all `UserRankingPlayer` rows for the set in one transaction — matches the single-active-set decision).
3. **Unmatched rows** (`matchStatus: 'unmatched'`, excluding `n_a`) listed with a `cmdk`-based search-and-pick control (server action searches `SleeperPlayer` by normalized name) to assign a `sleeperId` (`matchStatus → 'manual'`), or a "leave unmatched" action that's a no-op (row stays `unmatched`, `sleeperId: null` — fine for fallback valuation, just means no future projection-aware VOR linkage for that player).

Upload is one server action: validate headers → parse rows → collect row errors (abort with a listed summary if any) → scale values → derive/assign `sfRank` → match against `SleeperPlayer` → persist `UserRankingSet` + `UserRankingPlayer[]` in a transaction → redirect back to `/rankings` showing the summary.

---

## Draft-creation wiring

- `src/data/players.ts` splits out `PKG_PLAYERS: Player[]` as its own export alongside the existing `players` (`BASE_PLAYERS`) export. Row contents (kicker names, dollar values) are unchanged — this is purely a mechanical split so the same hardcoded package rows can be appended to either player-pool source.
- `/drafts/new` shows a player-pool source choice ("ETR Default" vs. "My Custom Rankings (`n` players, uploaded `date`)") only when the signed-in user has an active `UserRankingSet`; hidden entirely otherwise. Defaults to ETR.
- `createDraft` gains `playerSource: 'etr' | 'custom'`. When `'custom'`: load the user's `UserRankingPlayer[]`, map to the `Player`-shaped array (`{player: name, team, pos, age, sfRank, budget, ceiling, floor, notes, sleeperId}`), append `PKG_PLAYERS`, feed into the existing `adjustPlayerValues(basePlayers, settings)` unchanged. Seeded `Player.sleeperId` comes straight from `UserRankingPlayer.sleeperId` (today it's hardcoded `null` at creation and backfilled later by `apply-projection-values.ts` — custom-ranking drafts start with sleeperId coverage already in place for matched rows).
- Zero behavior change for users who never upload a custom ranking — the `BASE_PLAYERS` path is untouched.

---

## Testing

- `src/lib/scaleRankingValue.ts` — unit tests for the scaling formula (TE premium, floor clamp), shared with `players.ts`'s existing behavior (regression: `players` export values unchanged).
- `src/lib/csv.ts` — unit tests for the extracted parser (quoted fields, embedded commas) ported from `apply-projection-values.ts`'s existing coverage.
- `src/lib/sleeperMatch.ts` — unit tests mirroring the Python matcher's cases: exact match, team-disambiguated match, alias fallback, ambiguous → unmatched, no match.
- Rankings upload server action — unit tests for: missing required header → rejected before persist; row-level errors collected and reported together; `SF/TE Prem` present-but-partial → rejected; absent → derived rank stable-sorts correctly; `Pick` rows kept with `age: null`, `matchStatus: 'n_a'`; re-upload replaces prior set atomically.
- `createDraft` — test that `playerSource: 'custom'` maps `UserRankingPlayer[]` correctly, appends `PKG_PLAYERS`, and produces the same `Player` row shape as the ETR path.
- `/rankings` page — select unmatched rows by `data-testid`; resolve action updates `matchStatus` to `manual` and persists the chosen `sleeperId`.
