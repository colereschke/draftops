# HARD-017 Client Payload and Background Work Design

## Goal

Reduce avoidable client payload, rendering work, request overlap, and repeated lookup work without
changing DraftOps auction workflows or replacing the accessible player table.

## Scope

HARD-017 addresses the current value sheet, rankings matching, nomination polling, budget polling,
and verification of player/result join complexity. It does not introduce a client data-cache
library, change the player table's interaction model, or add a production Speed Insights dependency.

## Measurement First

The implementation starts by recording a repeatable baseline before changing rendering behavior.
The benchmark uses the disposable Playwright database, a draft with the representative 267-player
pool, a ranking set with at least one unmatched row, Chromium at a 390 by 844 viewport, and 4x CPU
throttling. It uses client-side navigation to capture React Server Component response bytes for both
the value sheet and rankings page, records the bounded search response bytes, counts value-sheet
player rows and descendant DOM nodes, and measures the time from a filter or sort interaction until
the correct result is painted. Each timing measurement runs 20 times after five warm-up runs and
reports the 75th percentile.

The benchmark is exposed as one explicitly named `pnpm` command and writes its environment, command,
fixture counts, raw samples, and summary to `docs/performance/hard-017.md`. The same benchmark runs
after the other HARD-017 changes. It is a diagnostic command with committed results, not a
timing-sensitive CI test. Deterministic behavior and payload bounds are enforced in automated tests.

The value-sheet interaction budget is 200 ms or less at the 75th percentile for both filter and sort
under the throttled profile. The post-change RSC payload and DOM-node counts must not grow by more
than 5% without an explained, reviewed cause, and no second full-player payload may be introduced.
The 200 ms limit aligns with the published
[good INP threshold](https://web.dev/articles/optimize-inp). If the baseline already meets those
budgets, HARD-017 makes no speculative rendering change.

`content-visibility` will not be applied directly to table rows: rows are internal table boxes, where
the containment required by `content-visibility` does not apply according to
[CSS Containment Level 2](https://www.w3.org/TR/css-contain-2/). If the baseline exceeds the
interaction budget, implementation pauses for a focused design amendment before introducing
virtualization or changing table semantics. This keeps the measurement gate meaningful instead of
preselecting an optimization that cannot provide the intended row-level containment.

## Rankings Sleeper Search

The rankings page will no longer query and serialize every `SleeperPlayer` merely because one ranking
row is unmatched. Its ranking-set query selects only the fields needed for the summary, coverage,
and unmatched rows. The unmatched-list client component receives only those unmatched ranking rows.

An authenticated `GET /api/rankings/sleeper-search` endpoint accepts `q` and `position` query
parameters. `q` is trimmed and normalized with the existing `normalizeName` function; the resulting
normalized query must contain between 2 and 80 characters. `position` must be exactly one of `QB`,
`RB`, `WR`, or `TE`; `PICK` and `PKG` never resolve to a Sleeper player. Invalid input returns
`{ error: string }` with status 400, an absent session returns the same shape with status 401, and an
unexpected failure returns `{ error: 'Unable to search players' }` with status 500 without exposing
database details.

The endpoint filters on both normalized name and exact position, orders results by name and ID for
determinism, selects only `id`, `name`, `team`, and `pos`, and uses `take: 8`. Its success response is
`{ results: SleeperPlayerOption[] }` and is never larger than eight records; this record count is the
hard search-payload budget, while the benchmark records actual serialized bytes. The existing
`resolveRankingMatch` server action remains the authority for assigning a selected Sleeper identity
and revalidates position and ownership.

Each unmatched row debounces searches by 250 ms. A new query or component unmount aborts its prior
request, and an abort is silent rather than shown as an error. Results are cleared for empty,
too-short, or failed input; a non-abort failure displays a row-local retryable error. A monotonically
increasing request token prevents a stale response from replacing results for a newer query even if
the transport completes after cancellation.

## Polling

Nomination polling uses a completion-scheduled timeout rather than `setInterval`: the next 30-second
poll is scheduled only after the current poll settles. A scheduled tick is skipped while another load
is in flight. Hiding the document clears the pending timeout and aborts an in-flight polling GET;
the abort does not surface an error. Returning to a visible document performs one immediate load and
then resumes the completion-based cadence. Component unmount and `draftId` changes also abort the
active GET. A mutation-failure resync may explicitly supersede and abort an older polling GET, but
scheduled polls never supersede or overlap each other.

The budget refresher will stop its timer in hidden tabs. Its `router.refresh()` call will run inside
a React transition; manual and scheduled refreshes share one guarded dispatch function, and a refresh
request is coalesced while that transition is pending. Returning to a visible tab dispatches once if
no refresh is pending and restarts its elapsed counter. Manual refresh remains available and
continues to announce the refresh dispatch through the existing live region. Unmount clears both
the polling timer and the delayed live-region announcement.

## Lookup Efficiency

Repository inspection confirms that `computeDraftTeamStats` already constructs `playersById` once
and that `AuctionSheet` and `WatchlistSidebar` already memoize claim, nomination, watchlist, and player
maps/sets used during repeated rendering. HARD-017 preserves those constant-time joins and adds a
focused regression assertion where useful; it does not replace intentional one-pass filters or
12-team lookups with extra maps merely to satisfy stale audit wording. Any newly introduced join must
use the existing numeric `player.id`, with the established name fallback only where the public
`Player` shape permits an absent ID.

## Error Handling and Tests

Route tests will cover authentication, query-length validation, rejection of non-player positions,
the exact database filter/select/order/take contract, deterministic response shape, and the eight
result cap. A rankings-page test will prove the page no longer queries or passes the entire
`SleeperPlayer` table. Client tests will use fake timers and controllable fetch promises to prove
debounce, abortion, stale-response resistance, row-local failures, hidden-tab pausing, visible-tab
refresh, cleanup, and no concurrent poll/refresh dispatches. Existing match-resolution, manual
refresh, and table behavior tests stay green.

The implementation is complete when the automated checks pass, the before/after measurement record
contains the exact command and environment, Sleeper search never returns more than eight records,
hidden tabs dispatch no recurring work, and the throttled value-sheet interactions meet the 200 ms
75th-percentile budget.

## Non-goals

- Virtualized rows or an alternate non-table player-list UI without a separately reviewed design
  amendment justified by the baseline measurement.
- Changes to ranking-match authorization or assignment semantics.
- Changes to auction valuation, nomination scoring, or data schema.
- Vercel Speed Insights installation/configuration; the local measurement budget provides a stable
  foundation for later production telemetry work.
