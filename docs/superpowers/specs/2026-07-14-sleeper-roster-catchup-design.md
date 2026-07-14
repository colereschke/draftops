# Sleeper Roster Catch-Up Design

## Purpose

DraftOps is the operator's auction record, but a user can miss several wins while away from the
app. Sleeper knows the resulting roster assignment but not the winning auction price. This feature
uses Sleeper's current rosters to identify unlogged wins, prefill their winners, and let the user
enter prices in one resumable batch.

This is roadmap item 9b. It is intentionally an on-demand, additive reconciliation tool, not a
live sync or a source of auction prices.

## Scope and decisions

- Sync is initiated manually from the value sheet through a **Sync with Sleeper** dialog.
- A draft created by importing a Sleeper league is sync-ready: it persists the league ID and each
  imported team's stable Sleeper `roster_id` during creation.
- Manually created and legacy drafts configure the league ID and roster-to-team mapping in the same
  dialog before their first scan.
- Stable IDs are the only reconciliation keys: Sleeper `roster_id` maps to `Team`, Sleeper player
  ID maps to `Player.sleeperId`, and results map through `AuctionResult.playerId`. Handles and
  display names are never used for reconciliation.
- A user may submit any subset of proposed rows. A row needs a positive whole-dollar price to be
  included; blank rows are left for a later sync.
- A Sleeper player absent from the DraftOps player pool is reported as unresolved and cannot be
  added or bid from this flow.
- Sync never removes, edits, or otherwise reconciles away an existing DraftOps result.

## Persistent data

Add the following nullable fields:

| Model   | Field                     | Meaning                                                  |
| ------- | ------------------------- | -------------------------------------------------------- |
| `Draft` | `sleeperLeagueId String?` | League used to fetch current Sleeper rosters.            |
| `Team`  | `sleeperRosterId Int?`    | Sleeper's stable roster identity for this DraftOps team. |

`Team` has a composite uniqueness constraint on `(draftId, sleeperRosterId)`. Postgres permits
multiple nulls, so unmapped teams remain valid. The database also enforces a unique
`(draftId, playerId)` result identity for non-null `playerId` values. All current bid writes
already require a player ID; this replaces the reverted name-based uniqueness constraint and makes
manual logging and sync share the correct identity invariant.

The Sleeper import result carries the requested league ID and each ordered roster's `roster_id`.
`createDraft` accepts that optional import metadata and writes it with its Draft and Team rows. The
manual team list remains unchanged for non-Sleeper drafts.

## Configuration and mapping

The value sheet exposes **Sync with Sleeper**.

For an imported draft with a stored league ID and complete unique roster mapping, selecting it
starts the scan immediately.

Otherwise, the dialog begins with configuration:

1. The user enters or replaces a Sleeper league ID.
2. The server fetches `league`, `users`, and `rosters`. It validates that the league has rosters
   and surfaces Sleeper's roster name/primary owner to make mapping legible.
3. The dialog presents each Sleeper roster once and lets the user select one DraftOps team for it.
   A DraftOps team cannot be selected twice. Unmatched Sleeper rosters and DraftOps teams are
   allowed, but only mapped rosters participate in catch-up.
4. Saving validates ownership, league access/shape, roster IDs, and mapping uniqueness, then
   persists the league ID and chosen team mappings. It does not write auction results.

Changing the league ID intentionally requires remapping; old `sleeperRosterId` values are cleared
in the same transaction before the new mapping is saved.

## Reconciliation preview

A server-side reconciliation module performs a read-only scan:

1. Fetch `GET /league/{leagueId}/rosters` through the existing Sleeper client. `SleeperRoster` is
   extended with its `players: string[] | null` response field.
2. Load the draft's teams, players with `sleeperId`, and existing `AuctionResult.playerId` values.
3. For every player ID on a mapped Sleeper roster, resolve Sleeper ID → DraftOps `Player` →
   DraftOps `Team`.
4. Exclude every resolved player with an existing result for the draft. This is the rule that keeps
   already logged bids out of every later catch-up scan.
5. Group remaining results into a typed preview:
   - **actionable**: mapped team, known DraftOps player, no result;
   - **unresolved**: player present in Sleeper but absent from this DraftOps player pool; and
   - **diagnostics**: unmatched roster, duplicate/invalid mapping, or counts of already logged
     player IDs.

The UI shows actionable rows with player identity, position/NFL team, auction target, a locked
Sleeper-assigned winner, and an empty price field. Unresolved rows are visually separate, have no
price field, and never block a valid partial import. A zero-actionable result shows an
already-reconciled state with counts.

## Batch logging

The dialog submits only rows with valid positive integer prices as
`{ playerId, teamId, price }[]`. The server action:

1. authenticates and loads the owned draft;
2. rejects malformed input, a team outside the draft, a player outside the draft, a player without
   a matching current Sleeper roster assignment, or a team that disagrees with that assignment;
3. reloads existing results inside one transaction and excludes late conflicts;
4. creates the still-valid results, including the denormalized player fields used by current bid
   views, and clears matching `NominatedPlayer` rows; and
5. revalidates the draft route and returns per-row created/conflict results.

The database unique identity is the final retry/concurrent-tab guard. A uniqueness collision is
reported as **already logged** instead of failing or overwriting an existing bid. The dialog keeps
unsubmitted blanks and conflicted rows visible after the mutation so the user can rescan or close
without losing context.

## Errors

No scan or write mutates data until explicit configuration save or batch submission.

- No configured league: show configuration.
- Sleeper 404: “League not found. Check your Sleeper league ID.”
- Other Sleeper failures: “Couldn't reach Sleeper — try again.”
- No mapped team for a returned roster: report it in diagnostics and exclude it from imports.
- A stored roster ID no longer exists in the league, or mapping is duplicate: require mapping
  repair before scanning.
- A player is no longer on the expected Sleeper roster between preview and submit: return that row
  as a conflict; do not log it.

Existing DraftOps results remain authoritative for this feature even when Sleeper no longer shows
the player. Deletions, ownership corrections, and historical bid edits keep using the existing bid
tools.

## Tests

Unit tests cover the reconciliation module for:

- stable player and roster-ID joins;
- exclusion of every player with an existing `AuctionResult.playerId`;
- unrecognized Sleeper players, unmapped rosters, empty/null roster players, and malformed mapping;
- no actionable gaps and accurate diagnostics.

Server-action tests cover authorization, draft scoping, configuration validation, whole-dollar and
partial submission behavior, atomic creation of the valid subset, nomination clearing, stale
Sleeper-assignment rejection, and duplicate/conflict reporting.

Component tests cover first-use configuration, imported-draft direct scan, actionable rows,
unresolved rows, blank-price omission, validation messages, loading/error states, and successful
partial batch feedback. They use `data-testid` or `id` selectors per repository conventions.

## Out of scope

- Automatic polling or real-time Sleeper native-auction sync.
- Fetching or estimating auction prices from Sleeper.
- Creating unranked player records from a Sleeper roster.
- Removing or modifying DraftOps results because Sleeper disagrees.
- General-purpose draft settings beyond the focused first-use configuration included here.
