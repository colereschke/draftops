# Sleeper League Import — Design Spec

**Date:** 2026-06-30
**Feature:** Roadmap #5c
**Status:** Approved, ready for implementation planning

---

## What We're Building

A Sleeper league import widget on the draft creation form. User enters a Sleeper league ID (and optionally their Sleeper username), clicks Import, and the form pre-fills with their league's settings — team count, roster size, starting lineup, scoring settings, and team handles/display names. The import is a suggestion: all fields remain editable before submitting.

## What's NOT In Scope

- Persisting Sleeper username on a user profile — friction is negligible (draft creation is a once-per-user event); revisit when #9 (live roster sync) requires richer Sleeper integration
- Sleeper OAuth / authenticated API calls — Sleeper's API is fully public and unauthenticated; no tokens ever
- Live roster sync — #9
- Budget import — Sleeper doesn't expose auction budgets in a useful format; stays at user's default

---

## Architecture

Three-part change:

### 1. `src/lib/sleeper.ts` (new)

Server-only module. Typed fetch wrappers for Sleeper API endpoints and Sleeper response types. No Prisma, no auth. Foundation for all future Sleeper integration (#9).

```typescript
interface SleeperLeague {
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
}

interface SleeperUser {
  user_id: string;
  user_name: string;
  display_name: string;
  metadata?: { team_name?: string };
}

async function fetchSleeperLeague(leagueId: string): Promise<SleeperLeague>;
async function fetchSleeperLeagueUsers(leagueId: string): Promise<SleeperUser[]>;
```

Both functions throw on non-200 responses. Callers handle errors.

### 2. `src/lib/sleeper-actions.ts` (new)

One server action: `importFromSleeper`. Kept separate from `actions.ts` (which handles bid mutations) to keep concerns separated.

```typescript
export interface SleeperImportResult {
  teamCount: number;
  rosterSize: number;
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teams: Array<{ handle: string; displayName: string }>;
  ownerIndex: number | null; // matched team index, null if no match
}

type ImportResponse = { ok: true; data: SleeperImportResult } | { ok: false; error: string };

export async function importFromSleeper(
  leagueId: string,
  ownerUsername?: string,
): Promise<ImportResponse>;
```

Calls `fetchSleeperLeague` and `fetchSleeperLeagueUsers` in parallel. Maps response via `mapSleeperLeague` (imported from `sleeper.ts`). Returns `{ ok: false }` for known error cases (not found, network failure) rather than throwing, so the client can show inline errors without hitting the error boundary.

### 3. `src/app/drafts/new/page.tsx` (modified)

New import banner card at the top of the form. Two new state fields (`leagueId`, `ownerUsername`). Handler calls `importFromSleeper` and hydrates existing state. See UX section for detail.

**Form input changes** (also part of this feature):

- `passTD` — change from `<select>` (4/6 only) to `<input type="number">` with `step={1}`
- `pprRB`, `pprWR`, `pprTE` — change from `<select>` to `<input type="number">` with `step={0.5}`

This removes the need for any clamping of imported values and makes the manual form more flexible.

---

## Pure Mapping Function

```typescript
export function mapSleeperLeague(
  league: SleeperLeague,
  users: SleeperUser[],
  ownerUsername?: string,
): SleeperImportResult;
```

Lives in `src/lib/sleeper.ts` alongside the Sleeper types, imported by `sleeper-actions.ts`. Keeping it out of the `'use server'` file means tests can import it directly without pulling in server action infrastructure.

### Field Mappings

| Sleeper field                           | DraftOps field     | Notes                                                                           |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| `total_rosters`                         | `teamCount`        | direct                                                                          |
| `roster_positions.length`               | `rosterSize`       | count ALL slots including BN/IR                                                 |
| `roster_positions` filtered             | `startingLineup`   | exclude BN, IR, K; map remainder 1:1 to `StartingSlot`; skip unrecognized types |
| `1 / scoring_settings.pass_yd`          | `passYdsPerPoint`  | invert pts/yd → yds/pt; if `pass_yd === 0`, use default 25                      |
| `scoring_settings.pass_td`              | `passTD`           | direct                                                                          |
| `scoring_settings.pass_int`             | `passInt`          | direct (already negative in Sleeper)                                            |
| `scoring_settings.rush_att ?? 0`        | `rushAtt`          | direct                                                                          |
| `scoring_settings.rush_fd ?? 0`         | `rushFD`           | direct                                                                          |
| `rec + (bonus_rec_rb ?? 0)`             | `pprRB`            | where `rec = scoring_settings.rec ?? 0`                                         |
| `rec + (bonus_rec_wr ?? 0)`             | `pprWR`            |                                                                                 |
| `rec + (bonus_rec_te ?? 0)`             | `pprTE`            |                                                                                 |
| `scoring_settings.rec_fd ?? 0`          | `recFD`            | direct                                                                          |
| `scoring_settings.bonus_fd_rb ?? 0`     | `rbFDBonus`        | direct                                                                          |
| `scoring_settings.bonus_fd_wr ?? 0`     | `wrFDBonus`        | direct                                                                          |
| `scoring_settings.bonus_fd_te ?? 0`     | `teFDBonus`        | direct                                                                          |
| `user_name`                             | team `handle`      | from `/users` endpoint; username match is case-insensitive                      |
| `metadata?.team_name \|\| display_name` | team `displayName` | prefer team name if set                                                         |

**`StartingSlot` mapping:** Sleeper's `QB`, `RB`, `WR`, `TE`, `FLEX`, `SUPER_FLEX` map 1:1 to our `StartingSlot` union. Any unrecognized slot type (IDP positions, etc.) is silently skipped — not relevant for dynasty skill-position leagues.

**`budget`** is not imported. Stays at whatever the user has set.

---

## Import Widget UX

New card at the very top of the form, above "Draft name":

```
┌─────────────────────────────────────────────────────┐
│ IMPORT FROM SLEEPER                                  │
│                                                      │
│ League ID          Your Sleeper username (optional)  │
│ [_______________]  [___________________________]     │
│                                                      │
│ [Import]                                             │
└─────────────────────────────────────────────────────┘
```

**States:**

- **Idle** — as above, Import button enabled
- **Loading** — button shows "Importing…", disabled
- **Success** — one-line confirmation above the form: "Imported from Sleeper · 12 teams · 10 starting slots". Form below is pre-filled. League ID and username inputs stay visible for re-import.
- **Success + username not matched** — same confirmation line, plus a warning: "Couldn't match '<username>' to a team in this league — select yours manually." Mine defaults to team 1.
- **Error** — error message below the Import button; button re-enables. Form is untouched.

**Username match behavior:**

- Username entered + match found → that team's "Mine" radio is selected, no message
- Username entered + no match → warning shown, Mine defaults to team 1
- No username entered → Mine defaults to team 1, no message

---

## Error Handling

Both failure cases return `{ ok: false; error: string }` from the server action:

- **League not found / invalid ID** — Sleeper returns 404 or empty body → `"League not found. Check your Sleeper league ID."`
- **Network / unexpected error** — fetch fails or response is malformed → `"Couldn't reach Sleeper — try again."`

Shown inline below the Import button. Form is untouched. No automatic retry — one attempt per click.

---

## Testing

**`src/__tests__/sleeper-import.test.ts`** — unit tests for `mapSleeperLeague`:

- Correct field mappings (passYdsPerPoint inversion, pprTE = rec + bonus_rec_te, etc.)
- `pass_yd === 0` → `passYdsPerPoint` defaults to 25
- BN/IR/K filtered out of `startingLineup`; unrecognized slot types skipped
- `metadata.team_name` preferred over `display_name`; fallback to `display_name` when `team_name` absent
- rosterSize = count of ALL roster_positions including BN/IR
- Username match found (case-insensitive) → correct `ownerIndex`
- Username not found → `ownerIndex: null`
- Missing `scoring_settings` fields default to 0 (all `?? 0` guards)

**`src/__tests__/drafts-new-form.test.tsx`** — additions:

- Import banner renders with league ID input and username input
- Import button calls server action with entered league ID
- Successful import hydrates `teamCount` state
- Username-not-matched warning renders when `ownerIndex` is null and username was provided
- `passTD` and PPR fields accept arbitrary numeric values (not limited to select options)
