# HARD-017 Client Payload and Background Work Design

## Goal

Reduce avoidable client payload, rendering work, request overlap, and repeated lookup work without
changing DraftOps auction workflows or replacing the accessible player table.

## Scope

HARD-017 addresses the current value sheet, rankings matching, nomination polling, budget polling,
and repeated player/result joins. It does not introduce a client data-cache library, virtualize the
player table, or add a production Speed Insights dependency.

## Value Sheet Rendering

The value sheet will retain its semantic table and full client-side filter/sort behavior. Player rows
will opt into CSS content visibility with a stable intrinsic block size, allowing browsers to defer
paint and layout for rows outside the viewport while preserving table structure, keyboard navigation,
and test selectors.

Before and after measurements will record:

- serialized player-table input bytes for a representative 267-player fixture;
- rendered player-row count; and
- filter/sort completion time measured around the interaction in a browser test harness or equivalent
  repeatable local measurement.

The regression budget is no new full-player duplicate payload, all visible filtered rows rendered
correctly, and a filter/sort measurement no slower than the recorded baseline by more than 10%.
These numbers are local, versioned verification evidence; production telemetry remains a separate
deployment concern.

## Rankings Sleeper Search

The rankings page will no longer query and serialize every `SleeperPlayer` merely because one ranking
row is unmatched. The unmatched-list client component receives only unmatched ranking rows.

An authenticated GET endpoint accepts a normalized query and required position. It rejects too-short
queries, performs a bounded database search using the existing normalized-name field, and returns at
most eight identity-safe option records (`id`, `name`, `team`, and `pos`). The server action remains
the authority for assigning a selected Sleeper identity.

Each unmatched row debounces searches by 250 ms. A new query or component unmount aborts its prior
request, and an abort is silent rather than shown as an error. Results are cleared for empty or
too-short input and stale responses cannot replace results for a newer query.

## Polling

Nomination data loading will use a single in-flight request at a time. Starting a newer load aborts
the superseded request; aborts do not surface an error. Its timer is active only while the document
is visible, and a visibility change to visible performs one immediate refresh before resuming the
30-second cadence.

The budget refresher will stop its timer in hidden tabs. Its `router.refresh()` call will run inside
a React transition; a scheduled refresh is skipped while that transition is pending. Returning to a
visible tab refreshes once and restarts its elapsed counter. Manual refresh remains available and
continues to announce completion through the existing live region.

## Lookup Efficiency

Affected UI/statistics code will construct maps or sets once per input change for player IDs and
auction results, then consume constant-time lookups while building table rows, rosters, and
watchlist data. Existing semantic identifiers remain unchanged: numeric `player.id` is preferred,
with the established name fallback only where the public `Player` shape permits an absent ID.

## Error Handling and Tests

Tests will cover the server endpoint's authentication, validation, position constraint, and eight
result cap. Client tests will use fake timers and controllable fetch promises to prove debounce,
abortion, stale-response resistance, hidden-tab pausing, visible-tab refresh, and no concurrent
poll/refresh dispatches. Existing match-resolution, manual refresh, and table behavior tests stay
green.

## Non-goals

- Virtualized rows or an alternate non-table player-list UI.
- Changes to ranking-match authorization or assignment semantics.
- Changes to auction valuation, nomination scoring, or data schema.
- Vercel Speed Insights installation/configuration; the local measurement budget provides a stable
  foundation for later production telemetry work.
