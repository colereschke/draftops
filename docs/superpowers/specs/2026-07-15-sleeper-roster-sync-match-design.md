# Sleeper Roster Sync — Auto-Match Design

## Purpose

The Sleeper roster catch-up dialog (9b) requires every Sleeper roster to be mapped to a DraftOps
team before it can reconcile anything. Today that mapping step is unusable: the configuration view
invents synthetic labels (`Sleeper roster 1`, `Sleeper roster 2`, …) instead of showing which real
Sleeper manager owns each roster, so the user is asked to blind-match numbers to teams with no
identifying information. The dialog already fetches `/league/{id}/users` during save and discards
the result without using it.

This redesign surfaces each roster's real Sleeper identity and auto-suggests a team for it,
leaving only genuinely ambiguous rosters for manual selection. It changes the **configuration UI
and its supporting fetch/match logic only** — the reconciliation scan, batch logging, and the
new-draft Sleeper import wizard are unchanged and out of scope.

## Scope and decisions

- Auto-matching is a **display convenience for the mapping step**, not a reconciliation key. The
  catch-up scan itself continues to key exclusively off `Team.sleeperRosterId` /
  `Player.sleeperId`, per the existing invariant in the 9b design ("handles and display names are
  never used for reconciliation"). Nothing here changes that — matching by handle only decides what
  a dropdown is _pre-filled with_; the user still explicitly saves the mapping.
- `Team.handle` is the manager's literal Sleeper username for every team seeded via
  `LEAGUE_TEAMS` or the Sleeper import wizard, so exact case-insensitive comparison against
  `SleeperUser.display_name` is a reliable, false-positive-free auto-match signal. No fuzzy
  matching.
- When repairing an already-partially-mapped draft, rosters/teams with a working saved
  `sleeperRosterId` keep that mapping and are shown as already-matched. Auto-match by handle only
  runs against whatever teams and rosters are left unclaimed after existing mappings are honored.
  This avoids a coincidental handle collision silently moving a mapping that already works.
- The league ID input is pre-filled from `draft.sleeperLeagueId` whenever it's already set (it is
  never threaded through today, so repairing a mapping currently forces re-typing the league ID
  from memory). If a league ID is already present when the dialog opens into configuration, the
  sync fetch runs automatically instead of waiting for a manual button click.
- Nothing is persisted by the sync/match fetch. `draft.sleeperLeagueId` and each team's
  `sleeperRosterId` are still written together, atomically, only when the user clicks "Save
  mapping and preview" — unchanged from current behavior.

## Matching function

New pure function `matchSleeperRostersToTeams(rosters, users, teams)` in `src/lib/sleeper.ts`,
alongside the existing `mapSleeperLeague`. Two-pass, non-conflicting assignment:

1. **Existing mapping** — for each team with a non-null `sleeperRosterId`, if a roster with that
   `roster_id` is present in the current Sleeper response, that roster/team pair is claimed with
   `matchSource: 'existing'`.
2. **Handle match** — among rosters and teams not claimed in pass 1, resolve each remaining
   roster's owner (`roster.owner_id` → `SleeperUser`) and claim a pairing where
   `team.handle.toLowerCase() === owner.display_name.toLowerCase()`, `matchSource: 'handle'`.
3. Anything left unclaimed on either side gets `suggestedTeamId: null`, `matchSource: 'none'`.

Output shape:

```ts
interface SleeperRosterCandidate {
  sleeperRosterId: number;
  ownerDisplayName: string | null; // null when roster.owner_id has no resolvable user
  ownerTeamName: string | null; // SleeperUser.metadata.team_name, if set
  suggestedTeamId: number | null;
  matchSource: 'existing' | 'handle' | 'none';
}
```

Ordered by `roster_id` ascending, same convention as `mapSleeperLeague`.

## Server action

New action `previewSleeperRosterMatch({ draftId, leagueId })` in `sleeper-roster-actions.ts`.
Read-only — fetches from Sleeper and returns candidates; persists nothing.

1. Auth-gate and load the owned draft (`requireOwnedDraft`, existing pattern).
2. Reject a blank `leagueId`.
3. Fetch `fetchSleeperLeague`, `fetchSleeperLeagueUsers`, `fetchSleeperLeagueRosters` for the
   given `leagueId` (not necessarily the draft's saved one — this runs against whatever the user
   currently has typed, so a wrong ID gets caught before anything is saved).
4. Load the draft's current teams (`id`, `handle`, `displayName`, `sleeperRosterId`).
5. Run `matchSleeperRostersToTeams` and return `{ ok: true; leagueName; rosters:
SleeperRosterCandidate[]; teams: { id, handle, displayName }[] }`.
6. On a Sleeper fetch failure, return the same `not_found` / `sleeper_error` codes the dialog
   already handles.

`saveSleeperRosterMapping` is unchanged — it still independently fetches and validates against
Sleeper at save time and persists league ID + mappings together in one transaction.

## UI flow

`SleeperRosterSyncDialog` gains a new prop, `sleeperLeagueId: string | null`, threaded from
`draft.sleeperLeagueId` through `src/app/draft/[draftId]/page.tsx` → `AuctionSheet` →
`SleeperRosterSyncDialog` (`AuctionSheetProps` gains the same field). It seeds the league ID input
and, if non-null, triggers an immediate match fetch on entering the `configuration` view instead
of waiting for a click.

Configuration view, restructured:

- League ID input (pre-filled per above) with a **"Sync league"** button beside it, usable at any
  time to (re)fetch — e.g. after correcting a wrong ID, or to re-check for new rosters.
- Before any successful fetch: just the input, button, and existing helper copy.
- After a successful fetch: one row per Sleeper roster returned by `previewSleeperRosterMatch`,
  replacing today's synthetic `rosterIds = 1..teams.length` loop entirely:
  - Label shows `ownerDisplayName` (plus `ownerTeamName` in parentheses when set), e.g.
    `chappy72 (Chappy's Chumps)`. A roster with no resolvable owner (`owner_id` null or orphaned)
    renders as `Unclaimed roster {sleeperRosterId}`.
  - A team-picker `<select>` identical in behavior to today's (same "can't pick a team already
    picked elsewhere" disabling), pre-selected to `suggestedTeamId` when present.
  - Rows with `matchSource !== 'none'` show a small "Auto-matched" indicator so the user can see at
    a glance what was inferred versus what still needs a manual pick.
- "Save mapping and preview" keeps its current validation (every roster mapped, no team mapped
  twice) and calls the existing `saveSleeperRosterMapping` action unchanged.

## Errors

Reuses the dialog's existing `responseMessage` mapping for `not_found` / `sleeper_error`. A blank
league ID on "Sync league" shows the same "Enter a league ID…" inline validation style already used
elsewhere in the dialog. A failed sync leaves any previously-fetched candidate rows untouched (an
already-rendered mapping table doesn't disappear on a bad retry) and just surfaces the error.

## Tests

- Unit tests for `matchSleeperRostersToTeams`: existing-mapping precedence over handle match,
  case-insensitive handle matching, orphan rosters (`owner_id` null), unmatched teams, unmatched
  rosters, and no double-claiming when multiple teams could plausibly match.
- Server-action tests for `previewSleeperRosterMatch`: auth/ownership gating, blank league ID
  rejection, Sleeper fetch failure mapping, and correct candidate shape returned.
- Component tests for the redesigned configuration view: auto-sync on open when
  `sleeperLeagueId` prop is present, manual sync button flow, pre-filled auto-matched dropdowns,
  manual override of a suggested match, and the existing duplicate-team-selection guard still
  holding. Use `data-testid`/`id` selectors per repository conventions.

## Out of scope

- Fuzzy/similarity matching beyond exact case-insensitive handle comparison.
- Persisting the league ID before the final mapping save.
- Changes to `reconcileSleeperRosters`, `logSleeperRosterCatchUp`, or the reconciliation
  preview/catch-up screen.
- Changes to the new-draft Sleeper import wizard (`sleeper-actions.ts`, `mapSleeperLeague`), which
  already resolves real Sleeper identities correctly for brand-new teams.
- Multi-owner (`co_owners`) auto-matching — co-owned rosters without a matching primary-owner
  handle fall through to manual selection like any other unmatched roster.
