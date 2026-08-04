# DraftOps Future Roadmap

> **Current tracker:** [`docs/project-timeline.md`](project-timeline.md) is the canonical
> cross-project timeline and ticket tracker. This document contains only future work, active
> initiatives, and unresolved product direction.

Last reconciled: 2026-08-03

## Product goal

Make DraftOps shareable with the Establish The Run dynasty Discord: anyone should be able to sign
in, create a draft, and use the full tool to manage and optimize their own auction strategy.

DraftOps is a single-operator tool. One owner observes the real auction, logs winning bids for all
teams, and uses DraftOps' values, budget pressure, and nomination intelligence to optimize their
own picks. It is not a multi-manager auction coordinator or collaborative editing surface.

## Planning rules

- Use the IDs in `docs/project-timeline.md`; new product work uses `FEAT-###`, and operational work
  uses `OPS-###`.
- Treat completed work as history in the timeline, not as roadmap items.
- Keep durable rationale in `docs/DECISIONS.md` and implementation detail in an active spec or plan.
- Do not start a feature that changes valuation, trade state, or database invariants without
  updating its dependencies and acceptance criteria in the master tracker.
- Prefer small, independently verifiable increments over broad rewrites.

## Active initiatives

### `FEAT-010` — Budget-for-picks trading

**Status:** In progress.

Record trades that exchange auction budget for future picks while keeping buying power, pick
ownership, valuation, and audit history explainable. The single operator logs trades for every
team, just as they log auction wins.

Current work has established trade, pick-asset, and trade-audit models plus budget-delta and pick-
holder seams. Remaining work is the complete mutation and UI flow, including validation, edits,
deletion, restoration, dependent-pick protection, and real-PostgreSQL verification.

Non-negotiable boundaries:

- A trade is not an `AuctionResult` and must not consume roster slots.
- Budget-transfer effects follow the current team holding the budget.
- Pick ownership follows the trade history/current holder.
- Pick valuation remains anchored to the pick's origin team.
- The owner remains the only user who mutates a draft.

See the active design and implementation plan in `docs/superpowers/` and update
`docs/DECISIONS.md` when the feature is complete.

### `FEAT-006` — UI polish follow-up

**Status:** Planned after the active trading work and a round of real user feedback.

Refine DraftOps' existing dark command-center identity without replacing the application shell or
design-token system.

Priorities:

1. Make the value sheet a stronger flagship auction surface with clearer hierarchy around
   remaining budget, target values, and live auction state.
2. Improve sign-in and draft-list first impressions.
3. Reduce table noise and replace emoji-based floor/target/ceiling labels with crisp labels or
   icons.
4. Unify page headers and strengthen the app-shell/draft context treatment.
5. Preserve the accessibility, contrast, reduced-motion, and keyboard guarantees delivered by the
   hardening work.

The former design critique has been distilled into these priorities; no separate active design
brief is maintained until this work is scoped into a focused design spec.

## Near-term follow-ups

### `OPS-002` — Production monitoring and feedback loop

**Status:** Planned once the production domain and traffic are established.

- Add uptime monitoring for `https://<production-domain>/api/health` and alert on non-200 responses.
- Confirm the Vercel/Neon region and connection configuration in a release record.
- Make the Discord feedback path obvious and easy to use.
- Run the documented deployment smoke check against a production or preview deployment.

### Projection strategy lens

**Status:** Deferred.

Projection values currently shape the market target while remaining anchored to dynasty fallback
values. A future strategy lens may expose projected roster strength, but it must preserve the
separation between dynasty market value and one-year projection value. Do not subtract raw VOR
dollars from dynasty values.

### `FEAT-011` — Seasonal projection-source imports

**Status:** Discovery; unscheduled and permission-gated.

Assess a server-side, snapshot-based import for season-long NFL projection data from Sleeper as an
optional DraftOps projection source. The import would retain raw stat projections and recompute
points under each draft's scoring settings; it would not treat a provider's generic fantasy-point
field as authoritative. The existing licensed Mike Clay workflow must remain available as a
fallback and potential explicit source choice.

This is not a commitment to depend on the currently undocumented Sleeper endpoint or to make it
the default source. Before a scoped design session, obtain written confirmation from Sleeper that
DraftOps may fetch, cache, derive values from, and display the projection data, including any
third-party-provider restrictions. If that confirmation is unavailable, the idea remains a
personal/local workflow only and is not a deployed-product feature.

If permission is obtained, scope a separate design around import cadence, immutable source
snapshots, staleness and coverage validation, provenance in the UI, failure/fallback behavior, and
whether source selection belongs at the draft or user level.

### Dynamic pick valuation follow-up

**Status:** Partial baseline shipped; richer signals deferred.

The existing dynamic pick/package model can be revisited after trading stabilizes. Candidate signals
include market-relative overspend, roster age, lineup quality, and pick-heavy roster construction.
Any follow-up must keep origin-team valuation separate from current-holder ownership and must use
conservative caps so pick values do not destabilize nomination scoring.

## Deferred product ideas

These are not scheduled until the active trading and feedback work provide stronger product signals:

- Existing-draft custom-ranking replacement.
- Multiple named custom-ranking sets with explicit versioning.
- Native-auction or automated Sleeper roster polling; current sync is intentionally on-demand and
  additive-only.
- Sleeper seasonal-projection import (`FEAT-011`), pending written data-use permission and a
  focused source-management design.
- First-class future-pick assets for broader post-draft trading and roster operations. The current
  trading feature is intentionally narrower than a general asset-transfer system.
- Rookie-draft and draft-slot asset modeling, including explicit rookie season and unresolved NFL
  team identity.
- 1QB/single-QB valuation support. This requires a source economy appropriate to 1QB leagues, not
  merely a multiplier on the current Superflex source values.

## Dependency view

```text
FEAT-010 budget-for-picks trading ──┐
                                    ├── next active product work
FEAT-006 UI polish ─────────────────┘

OPS-002 monitoring and feedback can proceed independently once production traffic is available.

Projection strategy lens and richer dynamic pick valuation should wait until the trading model and
real-user feedback establish whether they solve a real operator need.
```

## Completion handoff

When an initiative ships:

1. Update its status, PRs, and outcome in `docs/project-timeline.md`.
2. Extract durable rationale into `docs/DECISIONS.md`.
3. Retire its completed spec/plan from `docs/superpowers/` according to `AGENTS.md`.
4. Leave detailed operational procedures in the relevant `docs/operations/` or tool README.
